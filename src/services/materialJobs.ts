import { randomUUID } from "node:crypto";
import { LearningMaterial, ILearningMaterial, MaterialType } from "../models/LearningMaterial";

export const MATERIAL_TYPES: MaterialType[] = ["structured_notes", "definitions", "flashcards", "mindmap", "revision_summary", "learning_points", "audio"];
const ACTIVE: Array<"queued" | "generating"> = ["queued", "generating"];
const LEASE_MS = 60_000;
const WORK_TIMEOUT_MS = 120_000;
const RETRY_MESSAGE = "We couldn't finish this material. Tap to try again.";
const noteWorkers = new Map<string, Promise<unknown>>();

export async function expireMaterialJobs(noteId: string) {
  await LearningMaterial.updateMany({ noteId, generationStatus: { $in: ACTIVE }, generationExpiresAt: { $lte: new Date() } },
    { $set: { generationStatus: "failed", generationError: RETRY_MESSAGE }, $unset: { generationExpiresAt: 1 } });
}

export function materialOverview(records: Array<Partial<ILearningMaterial>>) {
  const materials = records.filter(record => !!record.generatedAt);
  const generatedTypes = materials.map(record => record.type!);
  const states = MATERIAL_TYPES.map(type => {
    const record = records.find(record => record.type === type);
    return { type, status: record?.generationStatus ?? (record?.generatedAt ? "ready" : "not_requested"),
      available: !!record?.generatedAt, ...(record?.generationError ? { error: record.generationError } : {}) };
  });
  const activeTypes = states.filter(state => ACTIVE.some(status => status === state.status)).map(state => state.type);
  return { generatedCount: generatedTypes.length, generatedTypes,
    missingTypes: MATERIAL_TYPES.filter(type => !generatedTypes.includes(type)),
    missingCount: MATERIAL_TYPES.length - generatedTypes.length,
    activeTypes, hasActiveJobs: activeTypes.length > 0, states, materials };
}

/** Persist before acknowledging work. The unique note/type index deduplicates
 * concurrent requests across processes. Leases make interrupted work terminal;
 * a job token prevents late results resurrecting deleted or superseded work. */
export async function enqueueMaterialJobs(
  noteId: string, userId: string, types: MaterialType[],
  build: (type: MaterialType, generationId: string) => Promise<Partial<ILearningMaterial>>,
  timing: { leaseMs: number; timeoutMs: number; heartbeatMs: number; structuredTimeoutMs?: number } = { leaseMs: LEASE_MS, timeoutMs: WORK_TIMEOUT_MS, heartbeatMs: 15_000, structuredTimeoutMs: 600_000 },
) {
  await expireMaterialJobs(noteId);
  const jobs: Array<{ type: MaterialType; generationId: string }> = [];
  for (const type of [...new Set(types)]) {
    const generationId = randomUUID();
    try {
      const record = await LearningMaterial.findOneAndUpdate(
        { noteId, type, generationStatus: { $nin: ACTIVE } },
        { $set: { userId, generationId, generationStatus: "queued", generationExpiresAt: new Date(Date.now() + timing.leaseMs) },
          $unset: { generationError: 1 } },
        { upsert: true, returnDocument: "after" },
      );
      if (record) jobs.push({ type, generationId });
    } catch (error: any) {
      if (error?.code !== 11000) throw error; // An existing active job owns this type.
    }
  }
  const ids = jobs.map(job => job.generationId);
  const heartbeat = ids.length ? setInterval(() => {
    void LearningMaterial.updateMany({ noteId, generationId: { $in: ids }, generationStatus: { $in: ACTIVE } },
      { $set: { generationExpiresAt: new Date(Date.now() + timing.leaseMs) } })
      .catch(() => { /* Read-side expiry still bounds a lost worker. */ });
  }, timing.heartbeatMs) : undefined;
  heartbeat?.unref();

  const completion = (noteWorkers.get(noteId) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const results = [];
    // A full lesson can take minutes. Make short study tools available first
    // when the student requests several types together; keep all job leases
    // and the acknowledged requested types unchanged.
    const priority = (type: MaterialType) => type === "audio" ? 2 : type === "structured_notes" ? 1 : 0;
    const workOrder = [...jobs].sort((a,b) => priority(a.type) - priority(b.type));
    for (const { type, generationId } of workOrder) {
      const filter = { noteId, type, generationId };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const claimed = await LearningMaterial.updateOne({ ...filter, generationStatus: "queued" },
          { $set: { generationStatus: "generating" } });
        if (!claimed.modifiedCount) continue;
        const content = await Promise.race([
          build(type, generationId),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Material generation timed out")), type === "structured_notes" ? timing.structuredTimeoutMs ?? timing.timeoutMs : timing.timeoutMs); }),
        ]);
        // No upsert: deletion, retry and lease expiry invalidate the old result.
        const saved = await LearningMaterial.updateOne({ ...filter, generationStatus: "generating" },
          { $set: { ...content, generatedAt: new Date(), generationStatus: "ready" },
            $unset: { generationExpiresAt: 1, generationError: 1 } });
        results.push({ type, success: saved.modifiedCount > 0 });
      } catch (error) {
        console.error(`Material ${type} failed for note ${noteId}:`, error instanceof Error ? error.message : "Generation failed");
        await LearningMaterial.updateOne({ ...filter, generationStatus: { $in: ACTIVE } },
          { $set: { generationStatus: "failed", generationError: RETRY_MESSAGE }, $unset: { generationExpiresAt: 1 } });
        results.push({ type, success: false, error: RETRY_MESSAGE });
      } finally { if (timer) clearTimeout(timer); }
    }
    return { noteId, results, succeeded: results.filter(result => result.success).length, failed: results.filter(result => !result.success).length };
  }).finally(() => {
    if (heartbeat) clearInterval(heartbeat);
    if (noteWorkers.get(noteId) === completion) noteWorkers.delete(noteId);
  });
  noteWorkers.set(noteId, completion);
  // Observe errors even if a caller disconnects before attaching its handler.
  void completion.catch(error => console.error(`Material worker failed for note ${noteId}:`, error instanceof Error ? error.message : "Storage unavailable"));
  return { typesQueued: jobs.map(job => job.type), completion };
}
