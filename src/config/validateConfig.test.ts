import test from "node:test";
import assert from "node:assert/strict";
import { validateRuntimeEnvironment } from "./validateConfig";

test("development permits local defaults", () => {
  assert.doesNotThrow(() =>
    validateRuntimeEnvironment({ NODE_ENV: "development" })
  );
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
