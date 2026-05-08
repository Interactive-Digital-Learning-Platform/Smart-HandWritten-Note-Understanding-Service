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
    model: "llama-3.3-70b-versatile",
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
};
