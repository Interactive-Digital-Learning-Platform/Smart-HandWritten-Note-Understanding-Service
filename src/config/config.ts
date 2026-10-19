import dotenv from "dotenv";
import { parseExpertKeyList } from "../annotations/expertCredentials";

dotenv.config();

const parseGroqApiKeys = (): string[] => {
  const keys: string[] = [];
  if (process.env.GROQ_API_KEYS) {
    keys.push(
      ...process.env.GROQ_API_KEYS.split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    );
  }
  if (process.env.GROQ_API_KEY && !keys.includes(process.env.GROQ_API_KEY.trim())) {
    keys.unshift(process.env.GROQ_API_KEY.trim());
  }
  if (process.env.GROQ_API_KEY_2 && !keys.includes(process.env.GROQ_API_KEY_2.trim())) {
    keys.push(process.env.GROQ_API_KEY_2.trim());
  }
  if (process.env.GROQ_API_KEY_3 && !keys.includes(process.env.GROQ_API_KEY_3.trim())) {
    keys.push(process.env.GROQ_API_KEY_3.trim());
  }
  return keys;
};

const groqApiKeys = parseGroqApiKeys();

const parseBoolean = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === "true";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/smart-notes-dev",
  },

  groq: {
    apiKey: groqApiKeys[0] || "",
    apiKeys: groqApiKeys,
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    ocrModel: process.env.GROQ_OCR_MODEL?.trim() || "qwen/qwen3.8-27b",
  },


  huggingFace: {
    apiKey: process.env.HUGGINGFACE_API_KEY || "",
    ocrModel:
      "microsoft/trocr-base-handwritten",
  },

  embedding: {
    model: process.env.EMBEDDING_MODEL || "nomic-ai/nomic-embed-text-v1.5",
    provider: process.env.EMBEDDING_PROVIDER || "local-transformers-js",
    expectedDimension: parseInt(process.env.EMBEDDING_DIMENSION || "768", 10),
    maxTokens: parseInt(process.env.EMBEDDING_MAX_TOKENS || "8192", 10),
    cacheDir: process.env.EMBEDDING_CACHE_DIR || ".cache/embeddings",
  },

  uploads: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || "10", 10),
    uploadDir: process.env.UPLOAD_DIR || "uploads",
  },

  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
  },

  qdrant: {
    url: process.env.QDRANT_DB_URL || "http://localhost:6333",
    collection: process.env.QDRANT_COLLECTION || "pdf_knowledge_base",
    // Required by Qdrant Cloud; a local Qdrant accepts requests without it.
    apiKey: process.env.QDRANT_API_KEY?.trim() || "",
    // Named dense vector of hybrid collections (pdf_knowledge_base_v2 has
    // "dense" plus sparse "bm25"). Set empty for a single unnamed vector.
    vectorName: process.env.QDRANT_VECTOR_NAME?.trim() ?? "dense",
  },

  curriculumDb: {
    url:
      process.env.CURRICULUM_DB_URL ||
      process.env.DB_URL ||
      "",
  },

  annotationReview: {
    enabled: parseBoolean(process.env.ANNOTATION_REVIEW_ENABLED),
    expertCredentials: parseExpertKeyList(
      process.env.EXPERT_ANNOTATION_KEYS || ""
    ),
    pseudonymSecret: process.env.ANNOTATION_PSEUDONYM_SECRET || "",
    consentVersion: process.env.RESEARCH_CONSENT_VERSION || "1.0",
    allowedSubjects: (process.env.ANNOTATION_ALLOWED_SUBJECTS || "Science")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  },

  englishCoverage: {
    // User-authorized automatic suggestions; every prediction still requires review.
    suggestionsEnabled: process.env.ENGLISH_COVERAGE_SUGGESTIONS_ENABLED?.trim().toLowerCase() !== "false",
  },

  gateway: {
    url: process.env.GATEWAY_URL || "http://localhost:8080",
  },

};
