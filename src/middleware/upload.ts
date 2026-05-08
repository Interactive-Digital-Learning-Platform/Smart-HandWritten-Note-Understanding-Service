import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";
import { config } from "../config/config";

// ─── Ensure upload directory exists ────────────────────────────────────────

const uploadDir = path.resolve(config.uploads.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Storage engine ────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `note-${uniqueSuffix}${ext}`);
  },
});

// ─── File filter — images only ─────────────────────────────────────────────

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Only JPEG, PNG, WebP, and HEIC are allowed.`
      )
    );
  }
};

// ─── Multer instance ───────────────────────────────────────────────────────

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.uploads.maxFileSizeMB * 1024 * 1024,
  },
});
