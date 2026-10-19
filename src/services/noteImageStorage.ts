import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../config/config";
import { AppError } from "../middleware/errorHandler";

type Settings = typeof config.noteImages;
type Transport = Pick<S3Client, "send">;
type UploadFile = { path: string };

// This marker persists the storage location in the existing private image URL.
// Legacy /uploads/note-* images always remain local, even after enabling R2.
export const isR2Image = (filename: string): boolean => /^r2-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp|heic|heif)$/.test(filename);
const validFilename = (filename: string): boolean => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(filename) && !filename.includes("..");
const storageUnavailable = () => new AppError("Note image storage is temporarily unavailable. Please try again later.", 503);
const missingImage = () => new AppError("Note image not found", 404);

export function noteImageMime(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    case ".heic": return "image/heic";
    case ".heif": return "image/heif";
    default: return "image/jpeg";
  }
}

export class NoteImageStorage {
  private client?: Transport;
  constructor(
    private readonly settings: Settings,
    private readonly directory = config.uploads.uploadDir,
    client?: Transport,
  ) { this.client = client; }

  private remote(): Transport {
    const settings = this.settings;
    if (!settings.endpoint || !settings.bucket || !settings.accessKeyId || !settings.secretAccessKey) throw storageUnavailable();
    return this.client ??= new S3Client({
      endpoint: settings.endpoint, region: "auto",
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
      maxAttempts: 2,
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  private async command(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<any> {
    try {
      return await this.remote().send(command as any, { abortSignal: AbortSignal.timeout(20_000) });
    } catch (error: any) {
      if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
        // A missing bucket is configuration failure, not a missing student page.
        if (error?.name !== "NoSuchBucket") throw missingImage();
      }
      // Never publish provider details, bucket configuration or credentials.
      throw storageUnavailable();
    }
  }

  /** Only server-generated basenames are accepted. Never fetch a database URL. */
  async read(filename: string, directory = this.directory): Promise<Buffer> {
    if (!validFilename(filename)) throw missingImage();
    if (isR2Image(filename)) {
      const result = await this.command(new GetObjectCommand({ Bucket: this.settings.bucket, Key: `notes/${filename}` }));
      if (!result.Body) throw storageUnavailable();
      try {
        const chunks: Buffer[] = []; let length = 0;
        for await (const chunk of result.Body) {
          const bytes = Buffer.from(chunk); length += bytes.length;
          if (length > config.uploads.maxFileSizeMB * 1024 * 1024) {
            result.Body.destroy?.(); throw storageUnavailable();
          }
          chunks.push(bytes);
        }
        return Buffer.concat(chunks);
      } catch { throw storageUnavailable(); }
    }
    try { return await fs.readFile(path.join(path.resolve(directory), filename)); }
    catch (error: any) { if (error?.code === "ENOENT") throw missingImage(); throw storageUnavailable(); }
  }

  async remove(storedUrl: string): Promise<void> {
    const filename = path.basename(storedUrl.split("?")[0]);
    if (!validFilename(filename)) throw missingImage();
    if (isR2Image(filename)) {
      await this.command(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: `notes/${filename}` }));
    } else {
      try { await fs.unlink(path.join(path.resolve(this.directory), filename)); }
      catch (error: any) { if (error?.code !== "ENOENT") throw storageUnavailable(); }
    }
  }

  /** Upload first, then save metadata. Roll back files if either step fails. */
  async withUploadedImages<T>(files: UploadFile[], save: (urls: string[]) => Promise<T>): Promise<T> {
    const remote = this.settings.provider === "r2";
    if (!remote && this.settings.provider !== "local") throw storageUnavailable();
    const attempted: string[] = [];
    const urls: string[] = [];
    const cleanStaging = async () => {
      for (const file of files) {
        try { await fs.unlink(file.path); }
        catch (error: any) { if (error?.code !== "ENOENT") console.warn("Could not remove a staged Notes upload."); }
      }
    };
    let result: T;
    try {
      for (const file of files) {
        if (remote) {
          const ext = path.extname(file.path).toLowerCase();
          const filename = `r2-${randomUUID()}${ext}`;
          if (!isR2Image(filename)) throw new AppError("Unsupported note image extension", 400);
          const url = `/uploads/${filename}`;
          // Include an attempted PUT: a timed-out write may still have succeeded.
          attempted.push(url);
          const { size } = await fs.stat(file.path);
          const body = createReadStream(file.path);
          try {
            await this.command(new PutObjectCommand({ Bucket: this.settings.bucket, Key: `notes/${filename}`,
              Body: body, ContentLength: size, ContentType: noteImageMime(filename), CacheControl: "private, no-store" }));
          } finally { body.destroy(); }
          urls.push(url);
        } else {
          const filename = path.basename(file.path);
          if (!validFilename(filename) || isR2Image(filename)) throw new AppError("Invalid note image filename", 400);
          urls.push(`/uploads/${filename}`);
        }
      }
      result = await save(urls);
    } catch (error) {
      for (const url of attempted) {
        try { await this.remove(url); }
        catch { console.warn("An incomplete Notes upload needs storage cleanup."); }
      }
      await cleanStaging();
      throw error;
    }
    if (remote) await cleanStaging();
    return result;
  }
}

export const noteImageStorage = new NoteImageStorage(config.noteImages);
