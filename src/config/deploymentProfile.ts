import { validateRuntimeEnvironment } from "./validateConfig";

/** Destination configuration check; deliberately separate from local dev startup. */
export function validateDeploymentProfile(env: NodeJS.ProcessEnv): void {
  validateRuntimeEnvironment(env);
  const requireValue = (name: string): string => {
    const value = env[name]?.trim();
    if (!value || /<[^>]+>|replace[-_ ]?me|your[-_]|example\.(?:com|org|invalid)/i.test(value)) {
      throw Error(`${name} must be configured for the destination`);
    }
    return value;
  };
  const remoteEndpoint = (name: string, value: string, protocols: string[]): void => {
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw Error(`${name} must be a valid destination URL`); }
    if (!protocols.includes(parsed.protocol)) throw Error(`${name} has an unsupported connection scheme`);
    if (["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "host.docker.internal"].includes(parsed.hostname)
      || /^127\./.test(parsed.hostname) || parsed.hostname.endsWith(".localhost")) {
      throw Error(`${name} points to a local machine; configure the destination service address`);
    }
  };
  if (env.NODE_ENV !== "production") throw Error("NODE_ENV must be production");
  if (env.NOTE_IMAGE_STORAGE !== "r2") throw Error("NOTE_IMAGE_STORAGE must be r2 for this release");
  for (const name of ["ENGLISH_COVERAGE_SUGGESTIONS_ENABLED", "HISTORY_COVERAGE_REVIEW_ENABLED"]) {
    if (env[name] !== "true") throw Error(`${name} must be true for this release`);
  }
  for (const name of ["ICT_COVERAGE_REVIEW_ENABLED", "ANNOTATION_REVIEW_ENABLED", "ENGLISH_COVERAGE_REVIEW_ENABLED"]) {
    if (env[name] !== "false") throw Error(`${name} must be false for this release`);
  }
  remoteEndpoint("MONGODB_URI", requireValue("MONGODB_URI"), ["mongodb:", "mongodb+srv:"]);
  remoteEndpoint("CURRICULUM_DB_URL", requireValue("CURRICULUM_DB_URL"), ["postgres:", "postgresql:"]);
  remoteEndpoint("QDRANT_DB_URL", requireValue("QDRANT_DB_URL"), ["http:", "https:"]);
  requireValue("QDRANT_API_KEY");
  if (env.QDRANT_COLLECTION !== "pdf_knowledge_base_v2") throw Error("Use the ingested pdf_knowledge_base_v2 collection");
  if (!["0", "1"].includes(env.QDRANT_PAYLOAD_PAGE_BASE || "")) throw Error("Set the verified QDRANT_PAYLOAD_PAGE_BASE explicitly");
  for (const name of ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "CLERK_ISSUER_URL", "CLERK_AUTHORIZED_PARTIES"]) requireValue(name);
  remoteEndpoint("CLERK_ISSUER_URL", env.CLERK_ISSUER_URL!, ["https:"]);
  for (const origin of env.CLERK_AUTHORIZED_PARTIES!.split(",")) {
    const parsed = new URL(origin.trim());
    remoteEndpoint("CLERK_AUTHORIZED_PARTIES", origin.trim(), ["https:"]);
    if (parsed.origin !== origin.trim()) throw Error("CLERK_AUTHORIZED_PARTIES must contain exact frontend origins");
  }
  if (env.COVERAGE_BUNDLE_DIR !== "/app/coverage-runtime" || env.COVERAGE_PYTHON !== "/opt/coverage-python/bin/python") throw Error("Use the model and Python paths bundled in the image");
  for (const name of ["ENGLISH_COVERAGE_PYTHON", "HISTORY_COVERAGE_PYTHON"]) {
    if (env[name] && env[name] !== "/opt/coverage-python/bin/python") throw Error(`${name} must use the bundled Python runtime`);
  }
  if (env.EMBEDDING_MODEL !== "nomic-ai/nomic-embed-text-v1.5" || env.EMBEDDING_DIMENSION !== "768") throw Error("Retrieval model and dimension must match Knowledge Base v2");
  if (env.UPLOAD_DIR !== "/app/uploads" || env.EMBEDDING_CACHE_DIR !== "/app/.cache/embeddings") throw Error("Use the documented writable container paths");
}
