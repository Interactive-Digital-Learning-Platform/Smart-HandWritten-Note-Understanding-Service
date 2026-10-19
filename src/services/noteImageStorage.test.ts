import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NoteImageStorage, isR2Image } from "./noteImageStorage";
import { AppError } from "../middleware/errorHandler";

const settings = { provider: "r2", endpoint: "https://example.invalid", bucket: "synthetic-notes", accessKeyId: "fixture", secretAccessKey: "fixture" };
const payload = Buffer.from("synthetic student image fixture");
async function fixture(run: (directory: string, file: { path: string }) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "notes-r2-test-"));
  const file = { path: path.join(directory, "note-fixture.png") };
  try { await writeFile(file.path, payload); await run(directory, file); }
  finally {
    assert.ok(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith("notes-r2-test-"));
    await rm(directory, { recursive: true, force: true });
  }
}
function fakeStorage(directory: string, override?: (command: any) => void) {
  const objects = new Map<string, Buffer>();
  const calls: any[] = [];
  const storage = new NoteImageStorage(settings, directory, { send: async (command: any) => {
    calls.push(command); override?.(command);
    const key = command.input.Key;
    if (command instanceof PutObjectCommand) {
      const chunks: Buffer[] = [];
      for await (const chunk of command.input.Body as Readable) chunks.push(Buffer.from(chunk));
      objects.set(key, Buffer.concat(chunks)); return {};
    }
    if (command instanceof GetObjectCommand) {
      if (!objects.has(key)) throw Object.assign(new Error("sensitive-provider-detail"), { name: "NoSuchKey" });
      return { Body: Readable.from([objects.get(key)!]) };
    }
    if (command instanceof DeleteObjectCommand) { objects.delete(key); return {}; }
    throw Error("Unexpected storage operation");
  } } as any);
  return { storage, objects, calls };
}

test("R2 upload commits private URLs, removes staging, reads exact bytes and deletes the object", async () => fixture(async (directory, file) => {
  const { storage, objects, calls } = fakeStorage(directory);
  const urls = await storage.withUploadedImages([file], async urls => {
    assert.equal(objects.size, 1, "save metadata only after object storage succeeds");
    assert.deepEqual(await readFile(file.path), payload, "staging survives until metadata is saved");
    return urls;
  });
  const filename = path.basename(urls[0]);
  assert.match(urls[0], /^\/uploads\/r2-/); assert.ok(isR2Image(filename));
  assert.deepEqual(await storage.read(filename), payload);
  assert.equal(calls[0].input.ContentType, "image/png");
  assert.equal(calls[0].input.CacheControl, "private, no-store");
  assert.equal(calls[0].input.ACL, undefined, "do not enable public reads");
  await assert.rejects(access(file.path));
  await storage.remove(urls[0]); assert.equal(objects.size, 0);
}));

test("a database failure rolls back the remote object and local staging", async () => fixture(async (directory, file) => {
  const { storage, objects } = fakeStorage(directory);
  await assert.rejects(storage.withUploadedImages([file], async () => { throw Error("database unavailable"); }), /database unavailable/);
  assert.equal(objects.size, 0); await assert.rejects(access(file.path));
}));

test("a failed second page rolls back every attempted write without saving a partial notebook", async () => fixture(async (directory, file) => {
  const second = { path: path.join(directory, "note-second.png") }; await writeFile(second.path, payload);
  let writes = 0, saved = false;
  const { storage, objects, calls } = fakeStorage(directory, command => {
    if (command instanceof PutObjectCommand && ++writes === 2) throw Error("private credentials and endpoint details");
  });
  await assert.rejects(storage.withUploadedImages([file, second], async () => { saved = true; }), (error: any) => error.statusCode === 503 && !error.message.includes("credentials"));
  assert.equal(saved, false); assert.equal(objects.size, 0);
  assert.equal(calls.filter(call => call instanceof DeleteObjectCommand).length, 2);
  await assert.rejects(access(file.path)); await assert.rejects(access(second.path));
}));

test("existing local images remain readable with R2 enabled and missing objects do not fall back to disk", async () => fixture(async (directory, file) => {
  const { storage } = fakeStorage(directory);
  assert.deepEqual(await storage.read(path.basename(file.path)), payload);
  const remoteName = "r2-00000000-0000-4000-8000-000000000000.png";
  await writeFile(path.join(directory, remoteName), "stale local bytes");
  await assert.rejects(storage.read(remoteName), (error: any) => error instanceof AppError && error.statusCode === 404);
  await assert.rejects(storage.read("../private.env"), (error: any) => error.statusCode === 404);
}));

test("storage outages and streamed read failures give safe errors", async () => fixture(async (directory) => {
  const name = "r2-00000000-0000-4000-8000-000000000000.png";
  const broken = new NoteImageStorage(settings, directory, { send: async () => { throw Error("secret-key-provider-error"); } } as any);
  await assert.rejects(broken.read(name), (error: any) => error.statusCode === 503 && !error.message.includes("secret-key"));
  const stream = new NoteImageStorage(settings, directory, { send: async () => ({ Body: Readable.from((async function* () { throw Error("secret-key"); })()) }) } as any);
  await assert.rejects(stream.read(name), (error: any) => error.statusCode === 503 && !error.message.includes("secret-key"));
}));

test("local mode preserves successful files and rolls back failed uploads", async () => fixture(async (directory, file) => {
  const storage = new NoteImageStorage({ ...settings, provider: "local" }, directory);
  assert.deepEqual(await storage.withUploadedImages([file], async urls => urls), ["/uploads/note-fixture.png"]);
  assert.deepEqual(await readFile(file.path), payload);
  await assert.rejects(storage.withUploadedImages([file], async () => { throw Error("database error"); }));
  await assert.rejects(access(file.path));
}));
