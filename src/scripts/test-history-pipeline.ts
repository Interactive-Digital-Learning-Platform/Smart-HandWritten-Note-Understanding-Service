import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import path from "path";
import { runPipeline } from "../pipeline";
import { loadCurriculum } from "../curriculum";
import { curriculumDbService } from "../services/curriculumDbService";
import { config } from "../config/config";

async function main() {
  console.log("================================================================");
  console.log("🧪 TESTING PIPELINE ON HANDWRITTEN HISTORY NOTE IMAGES");
  console.log("================================================================\n");

  await mongoose.connect(config.mongodb.uri);
  await loadCurriculum();

  const dbHealth = await curriculumDbService.checkDatabaseHealth();
  console.log(`🐘 Curriculum PostgreSQL DB connected: ${dbHealth.isConnected} (${dbHealth.totalJobs} total jobs, ${dbHealth.doneJobs} done)`);

  const imagePaths = [
    path.join(__dirname, "../../uploads/note-1787721026694-838121742.jpeg"),
    path.join(__dirname, "../../uploads/note-1787721026695-362865255.jpeg"),
    path.join(__dirname, "../../uploads/note-1787721026696-937551198.jpeg"),
    path.join(__dirname, "../../uploads/note-1787721026782-987514176.jpeg"),
  ];

  console.log(`🖼️ Testing with ${imagePaths.length} pages of History notes:\n`, imagePaths);

  const testNoteId = "6a8e75420730c18b1aeaf13e";
  const testUserId = "650000000000000000000002";

  const result = await runPipeline(
    {
      noteId: testNoteId,
      userId: testUserId,
      imageUrl: imagePaths[0],
      imageUrls: imagePaths,
    },
    {
      asyncMaterialGeneration: false,
    }
  );

  console.log("\n================================================================");
  console.log("📊 PIPELINE EXECUTION SUMMARY FOR HISTORY NOTE");
  console.log("================================================================\n");

  if (!result.success || !result.context) {
    console.error("❌ Pipeline Failed:", result.error);
    await mongoose.disconnect();
    return;
  }

  const ctx = result.context;

  console.log("1️⃣ STAGE 3 & 4: SUBJECT & LESSON IDENTIFICATION");
  console.log(`Detected Subject: ${ctx.subjectDetection?.subject}`);
  console.log(`Detected Grade: ${ctx.subjectDetection?.grade}`);
  console.log(`Detected Topic: "${ctx.subjectDetection?.topicHint}"`);
  console.log(`Subject Confidence: ${ctx.subjectDetection?.confidence}%`);
  console.log(`Matched Lesson ID: ${ctx.matchedLessonId}`);
  console.log(`Matched Lesson Name: "${ctx.matchedLesson?.lessonName}"`);
  console.log(`Textbook Reference: ${ctx.matchedLesson?.textbookReference}`);

  console.log("\n2️⃣ STAGE 6 & 7: CONCEPT MATCHING & COVERAGE");
  const found = (ctx.conceptMatches || []).filter((m) => m.found);
  const missing = (ctx.conceptMatches || []).filter((m) => !m.found);
  console.log(`Total Concepts Checked: ${ctx.conceptMatches?.length || 0}`);
  console.log(`Found Concepts (${found.length}):`);
  for (const c of found) {
    console.log(`  ✅ [${c.matchMethod}] ${c.concept.name} (wt: ${c.concept.weight})`);
  }
  console.log(`Missing Concepts (${missing.length}):`);
  for (const c of missing) {
    console.log(`  ❌ ${c.concept.name} (wt: ${c.concept.weight})`);
  }
  console.log(`Coverage Scores: Simple: ${ctx.coverageScores?.simpleCoverage}% | Weighted: ${ctx.coverageScores?.weightedCoverage}%`);

  console.log("\n3️⃣ STAGE 8: LEARNING GAPS & RECOMMENDATIONS");
  console.log(`Exam Readiness: ${ctx.examReadiness?.rating}`);
  const gaps = ctx.explainableGaps || [];
  for (const g of gaps) {
    console.log(`  [Gap] Outcome: ${g.learningOutcome.description}`);
    console.log(`        Missing: ${g.missingConcepts.map((c) => c.name).join(", ")}`);
    console.log(`        Recommendation: ${g.recommendation}`);
  }

  await mongoose.disconnect();
  console.log("\n✨ TEST COMPLETE");
}

main().catch((err) => {
  console.error("❌ Pipeline test failed:", err);
  process.exit(1);
});
