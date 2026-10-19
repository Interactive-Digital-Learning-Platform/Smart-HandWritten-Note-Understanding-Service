import test from "node:test";
import assert from "node:assert/strict";
import { validateDeploymentProfile } from "./deploymentProfile";

const ready = {
  NODE_ENV: "production", NOTE_IMAGE_STORAGE: "r2", MONGODB_URI: "mongodb://mongo.internal/notes",
  CURRICULUM_DB_URL: "postgresql://curriculum.internal/ingestion", QDRANT_DB_URL: "http://qdrant:6333",
  QDRANT_API_KEY: "destination-key", QDRANT_COLLECTION: "pdf_knowledge_base_v2", QDRANT_PAYLOAD_PAGE_BASE: "1", GROQ_API_KEY: "test-key",
  R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, R2_BUCKET: "notes-private", R2_ACCESS_KEY_ID: "test-id", R2_SECRET_ACCESS_KEY: "test-secret",
  CLERK_ISSUER_URL: "https://school.clerk.accounts.dev", CLERK_AUTHORIZED_PARTIES: "https://school.edu",
  ENGLISH_COVERAGE_SUGGESTIONS_ENABLED: "true", HISTORY_COVERAGE_REVIEW_ENABLED: "true", ICT_COVERAGE_REVIEW_ENABLED: "false", ANNOTATION_REVIEW_ENABLED: "false", ENGLISH_COVERAGE_REVIEW_ENABLED: "false",
  COVERAGE_BUNDLE_DIR: "/app/coverage-runtime", COVERAGE_PYTHON: "/opt/coverage-python/bin/python",
  EMBEDDING_MODEL: "nomic-ai/nomic-embed-text-v1.5", EMBEDDING_DIMENSION: "768", UPLOAD_DIR: "/app/uploads", EMBEDDING_CACHE_DIR: "/app/.cache/embeddings",
};
test("deployment profile permits managed endpoints and private service DNS without exposing secrets", () => {
  assert.doesNotThrow(() => validateDeploymentProfile(ready));
});
test("deployment rejects accidental local Notes dependencies", () => {
  for (const host of ["localhost", "127.0.0.1", "127.0.0.2", "[::1]", "host.docker.internal"]) {
    assert.throws(() => validateDeploymentProfile({ ...ready, QDRANT_DB_URL: `http://${host}:6333` }), /destination service address/);
    assert.throws(() => validateDeploymentProfile({ ...ready, CURRICULUM_DB_URL: `postgresql://${host}/db` }), /destination service address/);
  }
});
test("deployment rejects old knowledge base, wrong retrieval dimension and local Python paths", () => {
  assert.throws(() => validateDeploymentProfile({ ...ready, QDRANT_COLLECTION: "other" }), /pdf_knowledge_base_v2/);
  assert.throws(() => validateDeploymentProfile({ ...ready, EMBEDDING_DIMENSION: "384" }), /Retrieval model/);
  assert.throws(() => validateDeploymentProfile({ ...ready, HISTORY_COVERAGE_PYTHON: "C:/venv/python.exe" }), /bundled Python/);
});
test("deployment requires R2 and the selected Science and History release scope", () => {
  assert.throws(() => validateDeploymentProfile({ ...ready, NOTE_IMAGE_STORAGE: "local" }), /must be r2/);
  assert.throws(() => validateDeploymentProfile({ ...ready, HISTORY_COVERAGE_REVIEW_ENABLED: "false" }), /must be true/);
  assert.throws(() => validateDeploymentProfile({ ...ready, ANNOTATION_REVIEW_ENABLED: "true" }), /EXPERT_ANNOTATION_KEYS/);
  assert.throws(() => validateDeploymentProfile({ ...ready, ICT_COVERAGE_REVIEW_ENABLED: "true" }), /must be false/);
});
test("deployment frontend origins require deployed HTTPS addresses", () => {
  for (const origin of ["http://localhost:8082", "https://school.edu/path", "http://school.edu"]) {
    assert.throws(() => validateDeploymentProfile({ ...ready, CLERK_AUTHORIZED_PARTIES: origin }));
  }
});
