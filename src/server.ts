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
import expertAnnotationsRouter from "./routes/expertAnnotations";
import englishCoverageRouter from "./routes/englishCoverage";
import {createHistoryCoverageRouter} from './routes/historyCoverage';
import {createScienceCoverageRouter} from './routes/scienceCoverage';
import {HistoryCoverageReviewService} from './services/historyCoverageReviewService';
import {createICTCoverageRouter} from './routes/ictCoverage';
import {ICTCoverageReviewService} from './services/ictCoverageReviewService';
import { createStudentAuth, studentAuthConfig } from './middleware/studentAuth';
import { createPrivateAssets } from './routes/privateAssets';

// ─── App setup ──────────────────────────────────────────────────────────────

const app = express();
const studentAuth = createStudentAuth(studentAuthConfig());

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
    allowedHeaders: ["Content-Type", "Authorization", "X-Expert-Id"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Static file serving (uploaded images) ─────────────────────────────────

app.use(
  "/uploads",
  studentAuth, createPrivateAssets("uploads", config.uploads.uploadDir)
);

app.use(
  "/generated_audio",
  studentAuth, createPrivateAssets("generated_audio", path.resolve("generated_audio"))
);

app.use(
  "/expert-annotation",
  express.static(path.resolve("public", "expert-annotation"), {
    index: "index.html",
    fallthrough: false,
  })
);

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use("/english-coverage", express.static(path.resolve("public", "english-coverage"), { index:"index.html", fallthrough:false }));
app.use("/api/english-coverage", englishCoverageRouter);
app.use('/api/science-coverage',studentAuth,createScienceCoverageRouter());
const historyCoverage = new HistoryCoverageReviewService();
app.use('/api/history-coverage', studentAuth, createHistoryCoverageRouter({
  enabled: process.env.HISTORY_COVERAGE_REVIEW_ENABLED?.trim().toLowerCase() === 'true', service: historyCoverage,
}));
process.once('exit', () => historyCoverage.dispose());
const ictCoverage = new ICTCoverageReviewService();
app.use('/api/ict-coverage', studentAuth, createICTCoverageRouter({
  enabled: process.env.ICT_COVERAGE_REVIEW_ENABLED?.trim().toLowerCase() === 'true', service: ictCoverage,
}));
process.once('exit', () => ictCoverage.dispose());

app.use("/api/health", healthRouter);
app.use("/api/notes", studentAuth, notesRouter);
app.use("/api/materials", studentAuth, materialsRouter);
app.use("/api/analyze", studentAuth, analysisRouter);
app.use("/api/curriculum", studentAuth, curriculumRouter);
app.use("/api/profile", studentAuth, profileRouter);
app.use("/api/expert-annotations", expertAnnotationsRouter);

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
      if (config.annotationReview.enabled) {
        console.log(
          `Expert review: http://localhost:${config.port}/expert-annotation/`
        );
      }
      console.log("========================================\n");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
