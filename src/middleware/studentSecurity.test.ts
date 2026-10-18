import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createStudentAuth, studentAuthConfig } from "./studentAuth";
import { errorHandler } from "./errorHandler";
import notesRouter from "../routes/notes";
import materialsRouter from "../routes/materials";
import analysisRouter from "../routes/analysis";
import profileRouter from "../routes/profile";
import { createPrivateAssets } from "../routes/privateAssets";
import { Note } from "../models/Note";
import { LearningMaterial } from "../models/LearningMaterial";
import {createHistoryCoverageRouter} from '../routes/historyCoverage';
import {HistoryCoverageReviewService} from '../services/historyCoverageReviewService';
import {createScienceCoverageRouter} from '../routes/scienceCoverage';
import {ScienceReviewService} from '../services/scienceNoteChecks';

const issuer = "https://security-test.clerk.accounts.dev";
const origin = "https://school.example";
const owner = "user_security_owner";
const other = "user_security_other";
const noteId = "0123456789abcdef01234567";
const filename = "private-page.png";
let base: string;
let close: () => Promise<void>;
let directory: string;
let sign: (subject: string, extra?: Record<string, any>) => Promise<string>;
let createdOwner: string | undefined;
let listOwner: unknown;

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "notes-private-test-"));
  await writeFile(path.join(directory, filename), "private image fixture");
  await writeFile(path.join(directory, "lesson.txt"), "private audio transcript");
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  sign = (subject, extra = {}) => new SignJWT({ sub: subject, sid: "sess_test", azp: origin, ...extra })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "test" }).setIssuedAt(extra.iat).setNotBefore(extra.nbf ?? "-1s").setExpirationTime(extra.exp ?? "1m").setIssuer(extra.iss ?? issuer).sign(privateKey);
  const auth = createStudentAuth({ issuer, authorizedParties: [origin] }, createLocalJWKSet({ keys: [{ ...jwk, kid: "test" }] }));

  mock.method(Note, "exists", async (filter: any) => {
    const own = filter.userId === owner;
    const match = filter._id === noteId || filter.$or?.some((f: any) => Object.values(f).includes(`/uploads/${filename}`));
    return own && match ? { _id: noteId } : null;
  });
  mock.method(Note, "findById", () => ({ select: async () => ({ _id: noteId, userId: owner, title: "Owned synthetic note" }) }));
  mock.method(Note, "find", (filter: any) => {
    listOwner = filter.userId;
    const query: any = {};
    query.sort = query.skip = query.limit = () => query;
    query.select = async () => [];
    return query;
  });
  mock.method(Note, "countDocuments", async () => 0);
  mock.method(Note, "findOne", async (filter: any) => filter.userId === owner ? {_id:noteId,userId:owner,status:'analyzed'} : null);
  mock.method(Note, "create", async (input: any) => { createdOwner = input.userId; return { ...input, _id: noteId }; });
  mock.method(LearningMaterial, "findOne", (filter: any) => ({ select: async () => filter.userId === owner && filter.audioUrl === "/generated_audio/lesson.txt" ? { noteId } : null }));

  const app = express(); app.use(express.json());
  // Simulate already parsed multipart files without writing an upload or running OCR.
  app.use("/api/notes/upload", auth, (req, _res, next) => { req.files = [{ path: path.join(directory, filename) }] as any; next(); });
  app.use("/api/notes", auth, notesRouter);
  app.use('/api/history-coverage',auth,createHistoryCoverageRouter({enabled:true,service:new HistoryCoverageReviewService(async()=>{throw Error('Inference is not used by ownership tests');})}));
  app.use('/api/science-coverage',auth,createScienceCoverageRouter(new ScienceReviewService(),true));
  app.use("/api/materials", auth, materialsRouter);
  app.use("/api/analyze", auth, analysisRouter);
  app.use("/api/profile", auth, profileRouter);
  app.use("/uploads", auth, createPrivateAssets("uploads", directory));
  app.use("/generated_audio", auth, createPrivateAssets("generated_audio", directory));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  close = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
after(async () => {
  await close?.(); mock.restoreAll();
  if (directory) {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith("notes-private-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});

async function call(url: string, token?: string, method = "GET", body?: unknown) {
  return fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
}

test("auth configuration is mandatory even if an old AUTH_BYPASS variable exists", () => {
  assert.throws(() => studentAuthConfig({ AUTH_BYPASS: "true" }));
  assert.throws(() => studentAuthConfig({ CLERK_ISSUER_URL: "http://evil.example", CLERK_AUTHORIZED_PARTIES: origin }));
});

test("every student resource rejects anonymous requests, including legacy aliases and files", async () => {
  for (const route of [`/api/notes/${noteId}`, "/api/notes", `/api/history-coverage/notes/${noteId}/check`, `/api/science-coverage/notes/${noteId}/check`, `/api/materials/${noteId}`, `/api/analyze/${noteId}`, `/api/profile/${owner}`, `/uploads/${filename}`, "/generated_audio/lesson.txt"]) {
    assert.equal((await call(route)).status, 401, route);
  }
});

test("signature, issuer, expiry, authorized party and pending sessions are verified", async () => {
  const valid = await sign(owner);
  const pieces = valid.split("."); pieces[1] = Buffer.from(JSON.stringify({ sub: other, sid: "sess_test" })).toString("base64url");
  for (const token of [pieces.join("."), "not-a-jwt", await sign(owner, { azp: "https://evil.example" }), await sign(owner, { sts: "pending" }),
    await sign(owner, { iss: "https://other.clerk.accounts.dev" }), await sign(owner, { exp: Math.floor(Date.now() / 1000) - 60 }),
    await sign(owner, { nbf: Math.floor(Date.now() / 1000) + 120 }), await sign(owner, { iat: Math.floor(Date.now() / 1000) + 120 }), await sign(owner, { sid: undefined })]) {
    assert.equal((await call(`/api/notes/${noteId}`, token)).status, 401);
  }
  // Re-sign with valid key but wrong claims; these must fail independently of the signature.
  const { privateKey } = await generateKeyPair("RS256");
  const foreign = await new SignJWT({ sub: owner, sid: "sess_test", azp: origin }).setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "test" }).setIssuedAt().setNotBefore("-1s").setExpirationTime("1m").setIssuer(issuer).sign(privateKey);
  assert.equal((await call(`/api/notes/${noteId}`, foreign)).status, 401);
  assert.equal((await fetch(base + `/api/notes/${noteId}`, { headers: { Authorization: `Bearer ${valid}`, Origin: "https://evil.example" } })).status, 401);
  assert.equal((await call(`/api/notes/${noteId}`, await sign(owner, { azp: undefined }))).status, 200);
});

test("owned notes are readable; another student's read and mutation routes return 404", async () => {
  assert.equal((await call(`/api/notes/${noteId}`, await sign(owner))).status, 200);
  assert.equal((await call(`/api/history-coverage/notes/${noteId}/check`,await sign(owner))).status,200);
  assert.equal((await call(`/api/science-coverage/notes/${noteId}/check`,await sign(owner))).status,200);
  const token = await sign(other);
  for (const [method, route] of [
    ["GET", `/api/notes/${noteId}`], ["DELETE", `/api/notes/${noteId}`],
    ["POST", `/api/notes/${noteId}/process`], ["PATCH", `/api/notes/${noteId}/context`],
    ['GET', `/api/history-coverage/notes/${noteId}/check`], ['POST', `/api/history-coverage/notes/${noteId}/check`],
    ['GET', `/api/science-coverage/notes/${noteId}/check`], ['POST', `/api/science-coverage/notes/${noteId}/check`],
    ["PATCH", `/api/notes/${noteId}/concepts/c1/verification`], ["PATCH", `/api/notes/${noteId}/research-consent`],
    ["GET", `/api/materials/${noteId}`], ["GET", `/api/materials/${noteId}/flashcards`],
    ["POST", `/api/materials/${noteId}/generate`], ["POST", `/api/materials/${noteId}/generate/audio`],
    ["DELETE", `/api/materials/${noteId}/audio`], ["GET", `/api/analyze/${noteId}`], ["POST", `/api/analyze/${noteId}`],
  ]) assert.equal((await call(route, token, method, method === "GET" ? undefined : {})).status, 404, `${method} ${route}`);
  assert.equal((await call("/api/notes/not-an-id", token)).status, 404);
});

test("note lists and uploads use the verified user rather than client supplied IDs", async () => {
  const token = await sign(owner);
  assert.equal((await call("/api/notes", token)).status, 200); assert.equal(listOwner, owner);
  assert.equal((await call(`/api/notes?userId=${other}`, token)).status, 403);
  assert.equal((await call("/api/notes/upload", token, "POST", { title: "Synthetic upload", userId: other })).status, 201);
  assert.equal(createdOwner, owner);
});

test("profile routes cannot select a different student", async () => {
  for (const suffix of ["", "/gaps", "/mastery", "/sessions", "/summary"]) assert.equal((await call(`/api/profile/${other}${suffix}`, await sign(owner))).status, 404);
});

test("private image/audio requests require ownership, never query credentials, and allow owner byte ranges", async () => {
  const token = await sign(owner);
  const image = await call(`/uploads/${filename}`, token);
  assert.equal(image.status, 200); assert.equal(await image.text(), "private image fixture");
  assert.match(image.headers.get("cache-control")!, /no-store/);
  assert.equal((await call(`/uploads/${filename}`, await sign(other))).status, 404);
  assert.equal((await call(`/uploads/${filename}?token=${encodeURIComponent(token)}`)).status, 401);
  assert.equal((await call("/uploads/%2e%2e%5csecret", token)).status, 404);
  assert.equal((await call("/generated_audio/lesson.txt", await sign(other))).status, 404);
  const audio = await fetch(base + "/generated_audio/lesson.txt", { headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-6" } });
  assert.equal(audio.status, 206); assert.equal(await audio.text(), "private");
});
