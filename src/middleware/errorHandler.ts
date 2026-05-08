import { Request, Response, NextFunction } from "express";

// ─── API Response helpers ──────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): Response => {
  const response: ApiResponse<T> = { success: true, data, message };
  return res.status(statusCode).json(response);
};

export const sendError = (
  res: Response,
  error: string,
  statusCode = 500
): Response => {
  const response: ApiResponse = { success: false, error };
  return res.status(statusCode).json(response);
};

// ─── Custom error class ────────────────────────────────────────────────────

export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}

// ─── Global error handler middleware ──────────────────────────────────────

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error("❌ Error:", err.message);

  // Multer errors
  if (err.message.includes("Unsupported file type")) {
    sendError(res, err.message, 400);
    return;
  }

  if (err.message.includes("File too large")) {
    sendError(res, "File exceeds maximum allowed size", 400);
    return;
  }

  // App-level errors
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    sendError(res, err.message, 400);
    return;
  }

  // Default
  sendError(res, "Internal server error", 500);
};
