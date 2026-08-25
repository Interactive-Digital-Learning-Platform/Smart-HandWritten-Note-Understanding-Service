import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/smart-notes-dev",
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  },


  huggingFace: {
    apiKey: process.env.HUGGINGFACE_API_KEY || "",
    ocrModel:
      "microsoft/trocr-base-handwritten",
  },

  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY || "",
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
  },

  curriculumDb: {
    url:
      process.env.CURRICULUM_DB_URL ||
      process.env.DB_URL ||
      "postgresql://neondb_owner:npg_6qliOG7utYab@ep-twilight-mode-apd0prh5-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require",
  },

  gateway: {
    url: process.env.GATEWAY_URL || "http://localhost:8080",
  },
};
