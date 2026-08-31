import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { config } from "./config/config";
import { validateRuntimeEnvironment } from "./config/validateConfig";
import { connectDB } from "./config/database";
import { errorHandler } from "./middleware/errorHandler";
import { loadCurriculum } from "./curriculum";
import { curriculumDbService } from "./services/curriculumDbService";

// ─── Route imports ──────────────────────────────────────────────────────────
import healthRouter from "./routes/health";
import notesRouter from "./routes/notes";
import materialsRouter from "./routes/materials";
import analysisRouter from "./routes/analysis";
import curriculumRouter from "./routes/curriculum";
import profileRouter from "./routes/profile";

// ─── App setup ──────────────────────────────────────────────────────────────

const app = express();

// ─── Security & parsing middleware ─────────────────────────────────────────

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow image serving
  })
);

app.use(
  cors({
    origin: "*", // tighten this in production
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Static file serving (uploaded images) ─────────────────────────────────

app.use(
  "/uploads",
  express.static(path.resolve(config.uploads.uploadDir))
);

app.use(
  "/generated_audio",
  express.static(path.resolve("generated_audio"))
);

// ─── Routes ─────────────────────────────────────────────────────────────────

app.use("/api/health", healthRouter);
app.use("/api/notes", notesRouter);
app.use("/api/materials", materialsRouter);
app.use("/api/analyze", analysisRouter);
app.use("/api/curriculum", curriculumRouter);
app.use("/api/profile", profileRouter);

// ─── 404 handler ────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// ─── Global error handler ────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start server ────────────────────────────────────────────────────────────

const startServer = async (): Promise<void> => {
  try {
    validateRuntimeEnvironment();
    await connectDB();

    // ── Load Curriculum Knowledge Base ────────────────────────────────────
    await loadCurriculum();

    // ── Verify Neon PostgreSQL Curriculum DB Connection ──────────────────
    if (curriculumDbService.isConfigured()) {
      const dbHealth = await curriculumDbService.checkDatabaseHealth();
      if (dbHealth.isConnected) {
        console.log(`🐘 Curriculum PostgreSQL DB connected (${dbHealth.totalJobs} jobs, ${dbHealth.doneJobs} completed)`);
      } else {
        console.warn(`⚠️ Curriculum PostgreSQL DB unreachable: ${dbHealth.error || "unknown"}`);
      }
    } else {
      console.warn("⚠️ CURRICULUM_DB_URL is not configured; using the local curriculum registry only.");
    }

    app.listen(config.port, () => {
      console.log("\n========================================");
      console.log("🚀 Smart Note Understanding Service");
      console.log(`📡 Running on: http://localhost:${config.port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`❤️  Health: http://localhost:${config.port}/api/health`);
      console.log(`📚 Curriculum: http://localhost:${config.port}/api/curriculum/stats`);
      console.log("========================================\n");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
