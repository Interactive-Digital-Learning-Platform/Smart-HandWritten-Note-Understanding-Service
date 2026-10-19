import assert from "node:assert/strict";
import { test, mock, beforeEach, after } from "node:test";
import { LearningMaterial } from "../models/LearningMaterial";
import { enqueueMaterialJobs, expireMaterialJobs, materialOverview } from "./materialJobs";

// In-memory persistence with Mongo's unique note/type constraint and conditional
// writes. No vendor calls or student data; tests exercise the actual worker.
const records: any[] = [];
function matches(record: any, filter: any): boolean {
  return Object.entries(filter).every(([key, value]: [string, any]) => {
    if (value?.$in) return value.$in.includes(record[key]);
    if (value?.$nin) return !value.$nin.includes(record[key]);
    if (value?.$lte) return record[key] <= value.$lte;
    return record[key] === value;
  });
}
function apply(record: any, update: any) {
  Object.assign(record, update.$set);
  for (const key of Object.keys(update.$unset ?? {})) delete record[key];
}
mock.method(LearningMaterial, "findOneAndUpdate", async (filter: any, update: any) => {
  let record = records.find(record => matches(record, filter));
  if (!record) {
    if (records.some(record => record.noteId === filter.noteId && record.type === filter.type)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    record = { noteId: filter.noteId, type: filter.type }; records.push(record);
  }
  apply(record, update); return record;
});
mock.method(LearningMaterial, "updateOne", async (filter: any, update: any) => {
  const record = records.find(record => matches(record, filter));
  if (record) apply(record, update);
  return { modifiedCount: record ? 1 : 0 };
});
mock.method(LearningMaterial, "updateMany", async (filter: any, update: any) => {
  records.filter(record => matches(record, filter)).forEach(record => apply(record, update));
  return { modifiedCount: 1 };
});
beforeEach(() => { records.length = 0; });
after(() => mock.restoreAll());
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { resolve, promise }; }
const tick = () => new Promise(resolve => setImmediate(resolve));

test("one legacy summary is ready, six optional tools are idle, not generating", () => {
  const result = materialOverview([{ type: "revision_summary", generatedAt: new Date() }]);
  assert.deepEqual(result.generatedTypes, ["revision_summary"]);
  assert.equal(result.missingCount, 6);
  assert.equal(result.hasActiveJobs, false);
  assert.equal(result.states.filter(state => state.status === "not_requested").length, 6);
});
test("queued records are not downloadable ready content; jobs become ready only after saving", async () => {
  const content = deferred<any>();
  const queued = await enqueueMaterialJobs("note", "owner", ["flashcards", "definitions"], () => content.promise);
  assert.deepEqual(queued.typesQueued, ["flashcards", "definitions"]);
  assert.equal(materialOverview(records).generatedCount, 0);
  assert.equal(materialOverview(records).hasActiveJobs, true);
  await tick();
  assert.equal(records[0].generationStatus, "generating");
  assert.equal(records[1].generationStatus, "queued");
  content.resolve({ textContent: "fixture" }); await queued.completion;
  assert.equal(materialOverview(records).generatedCount, 2);
  assert.equal(materialOverview(records).hasActiveJobs, false);
});
test("duplicates are deduplicated while different requests for the same note are retained", async () => {
  const content = deferred<any>(); let count = 0;
  const first = await enqueueMaterialJobs("note", "owner", ["flashcards", "flashcards"], async () => { count++; return content.promise; });
  const second = await enqueueMaterialJobs("note", "owner", ["flashcards", "mindmap"], async () => { count++; return { textContent: "map" }; });
  assert.deepEqual(second.typesQueued, ["mindmap"]);
  content.resolve({ textContent: "cards" });
  await Promise.all([first.completion, second.completion]);
  assert.equal(count, 2); assert.equal(materialOverview(records).generatedCount, 2);
});
test("a failed regeneration preserves the previous usable version and can be retried", async () => {
  records.push({ noteId: "note", type: "revision_summary", generatedAt: new Date(), textContent: "old" });
  const failed = await enqueueMaterialJobs("note", "owner", ["revision_summary"], async () => { throw new Error("private vendor credentials must not reach students"); });
  assert.equal((await failed.completion).failed, 1);
  const overview = materialOverview(records);
  assert.equal(overview.states.find(state => state.type === "revision_summary")?.status, "failed");
  assert.equal(overview.generatedCount, 1);
  assert.equal(records[0].textContent, "old");
  assert.doesNotMatch(records[0].generationError, /credentials/);
  const retry = await enqueueMaterialJobs("note", "owner", ["revision_summary"], async () => ({ textContent: "new" }));
  await retry.completion;
  assert.equal(records[0].textContent, "new"); assert.equal(records[0].generationError, undefined);
});
test("expired leases become retryable failures and never keep the overview active", async () => {
  records.push({ noteId: "note", type: "flashcards", generationStatus: "generating", generationExpiresAt: new Date(0) });
  await expireMaterialJobs("note");
  assert.equal(records[0].generationStatus, "failed"); assert.equal(materialOverview(records).hasActiveJobs, false);
});
test("timeout is terminal and a late completion cannot overwrite a newer retry", async () => {
  const late = deferred<any>();
  const first = await enqueueMaterialJobs("note", "owner", ["mindmap"], () => late.promise, { leaseMs: 1000, timeoutMs: 10, heartbeatMs: 100 });
  assert.equal((await first.completion).failed, 1);
  const retry = await enqueueMaterialJobs("note", "owner", ["mindmap"], async () => ({ textContent: "new" }));
  await retry.completion; late.resolve({ textContent: "late old" }); await tick();
  assert.equal(records[0].textContent, "new"); assert.equal(records[0].generationStatus, "ready");
});
test("deleting materials during generation prevents the worker recreating them", async () => {
  const content = deferred<any>();
  const queued = await enqueueMaterialJobs("note", "owner", ["definitions"], () => content.promise);
  await tick(); records.length = 0; content.resolve({ textContent: "old context" });
  await queued.completion; assert.equal(records.length, 0);
});

test("short study tools become ready while a full guide from the same request is still generating",async()=>{
  const guide=deferred<any>();const order:string[]=[];
  const queued=await enqueueMaterialJobs("note","owner",["structured_notes","audio","flashcards"],async(type)=>{
    order.push(type);return type==="structured_notes"?guide.promise:{textContent:type};
  });
  try {
    await tick();
    assert.deepEqual(queued.typesQueued,["structured_notes","audio","flashcards"]);
    assert.deepEqual(order,["flashcards","structured_notes"]);
    const states=materialOverview(records).states;
    assert.equal(states.find(s=>s.type==="flashcards")?.status,"ready");
    assert.equal(states.find(s=>s.type==="structured_notes")?.status,"generating");
    assert.equal(states.find(s=>s.type==="audio")?.status,"queued");
  } finally {guide.resolve({textContent:"complete guide"});await queued.completion;}
  assert.deepEqual(order,["flashcards","structured_notes","audio"]);
});
