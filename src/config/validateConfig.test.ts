import test from "node:test";
import assert from "node:assert/strict";
import { validateRuntimeEnvironment } from "./validateConfig";

test("development permits local defaults", () => {
  assert.doesNotThrow(() =>
    validateRuntimeEnvironment({ NODE_ENV: "development" })
  );
});

test("R2 requires complete private credentials and a Cloudflare HTTPS endpoint", () => {
  const ready = { NOTE_IMAGE_STORAGE: "r2", R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, R2_BUCKET: "smart-notes-private",
    R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret" };
  assert.doesNotThrow(() => validateRuntimeEnvironment(ready));
  assert.doesNotThrow(() => validateRuntimeEnvironment({ ...ready, NOTE_IMAGE_STORAGE: "local" }));
  assert.throws(() => validateRuntimeEnvironment({ NOTE_IMAGE_STORAGE: "r2" }), /R2_ENDPOINT.*R2_BUCKET.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY/s);
  assert.throws(() => validateRuntimeEnvironment({ ...ready, NOTE_IMAGE_STORAGE: "other" }), /NOTE_IMAGE_STORAGE/);
  for (const R2_ENDPOINT of ["http://example.com", "https://example.com", `${ready.R2_ENDPOINT}/bucket`, `${ready.R2_ENDPOINT}?secret=yes`]) {
    assert.throws(() => validateRuntimeEnvironment({ ...ready, R2_ENDPOINT }), /R2_ENDPOINT/);
  }
  assert.throws(() => validateRuntimeEnvironment({ ...ready, R2_SECRET_ACCESS_KEY: "your_secret" }), /placeholder/);
  assert.throws(() => validateRuntimeEnvironment({ ...ready, R2_BUCKET: "invalid/bucket" }), /R2_BUCKET/);
});

test("v2 rejects a retired collection and missing or insecure cloud authentication", () => {
  assert.throws(()=>validateRuntimeEnvironment({QDRANT_COLLECTION:"pdf_knowledge_base"}),/v1 collection/);
  assert.throws(()=>validateRuntimeEnvironment({QDRANT_DB_URL:"https://test.cloud.qdrant.io:6333"}),/QDRANT_API_KEY/);
  assert.throws(()=>validateRuntimeEnvironment({QDRANT_DB_URL:"http://test.cloud.qdrant.io:6333",QDRANT_API_KEY:"test-secret"}),/HTTPS/);
  assert.throws(()=>validateRuntimeEnvironment({QDRANT_DB_URL:"https://user:password@test.cloud.qdrant.io:6333",QDRANT_API_KEY:"test-secret"}),/without credentials/);
  assert.doesNotThrow(()=>validateRuntimeEnvironment({QDRANT_DB_URL:"https://test.cloud.qdrant.io:6333",QDRANT_API_KEY:"test-secret",QDRANT_COLLECTION:"pdf_knowledge_base_v2"}));
});

test("production requires MongoDB and a Groq API key", () => {
  assert.throws(
    () => validateRuntimeEnvironment({ NODE_ENV: "production" }),
    /MONGODB_URI is required.*GROQ API key is required/s
  );
});

test("production accepts externally supplied required credentials", () => {
  assert.doesNotThrow(() =>
    validateRuntimeEnvironment({
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://mongo.example/smart-notes",
      GROQ_API_KEY: "test-key-from-a-secret-manager",
    })
  );
});

test("placeholder secrets are rejected", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        NODE_ENV: "development",
        HUGGINGFACE_API_KEY: "your_huggingface_api_key_here",
      }),
    /placeholder value/
  );
});

test("curriculum database URL must use a PostgreSQL scheme", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        NODE_ENV: "development",
        CURRICULUM_DB_URL: "https://database.example",
      }),
    /must be a PostgreSQL connection URL/
  );
});

test("enabled expert annotation requires strong isolated credentials", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        NODE_ENV: "development",
        ANNOTATION_REVIEW_ENABLED: "true",
      }),
    /EXPERT_ANNOTATION_KEYS.*ANNOTATION_PSEUDONYM_SECRET/s
  );
  assert.doesNotThrow(() =>
    validateRuntimeEnvironment({
      NODE_ENV: "development",
      ANNOTATION_REVIEW_ENABLED: "true",
      EXPERT_ANNOTATION_KEYS: "science-expert=0123456789abcdef",
      ANNOTATION_PSEUDONYM_SECRET: "0123456789abcdef0123456789abcdef",
    })
  );
});
