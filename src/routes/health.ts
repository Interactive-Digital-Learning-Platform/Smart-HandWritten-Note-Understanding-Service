import { Router, Request, Response } from "express";
import { config } from "../config/config";

const router = Router();

/**
 * GET /api/health
 * Health check endpoint — confirms server and service status
 */
router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: "Smart HandWritten Note Understanding Service",
    status: "running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    englishCoverageSuggestionsEnabled: config.englishCoverage.suggestionsEnabled,
  });
});

export default router;
