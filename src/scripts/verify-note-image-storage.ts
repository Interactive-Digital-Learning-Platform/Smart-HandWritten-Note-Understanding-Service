import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../config/config";
import { validateRuntimeEnvironment } from "../config/validateConfig";
import { NoteImageStorage } from "../services/noteImageStorage";

// Sends only this synthetic one-pixel image. No student notes or database reads.
async function verify() {
  validateRuntimeEnvironment();
  if (!config.noteImages.endpoint || !config.noteImages.bucket) throw Error("Configure R2 credentials in the Notes .env first.");
  const storage = new NoteImageStorage({ ...config.noteImages, provider: "r2" });
  const directory = await mkdtemp(path.join(os.tmpdir(), "notes-r2-probe-"));
  const file = path.join(directory, "probe.png");
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=", "base64");
  let url: string | undefined;
  try {
    await writeFile(file, bytes);
    [url] = await storage.withUploadedImages([{ path: file }], async urls => urls);
    assert.deepEqual(await storage.read(path.basename(url)), bytes);
    await storage.remove(url);
    const deletedUrl = url; url = undefined;
    await assert.rejects(storage.read(path.basename(deletedUrl)), (error: any) => error.statusCode === 404);
    console.log("R2 synthetic image upload, private read, byte comparison and deletion passed. No student notes were used.");
  } finally {
    if (url) await storage.remove(url);
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith("notes-r2-probe-"));
    await rm(directory, { recursive: true, force: true });
  }
}
verify().catch(error => {
  console.error(error instanceof Error ? error.message : "R2 verification failed"); process.exitCode = 1;
});
