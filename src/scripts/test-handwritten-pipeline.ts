import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { loadCurriculum } from "../curriculum";
import { runPipeline } from "../pipeline";
import { curriculumDbService } from "../services/curriculumDbService";

async function runTest() {
  console.log("================================================================");
  console.log("🧪 TESTING PIPELINE ON 2 HANDWRITTEN SCIENCE NOTE IMAGES");
  console.log("================================================================\n");

  // 1. Initialize Curriculum KB & PostgreSQL Database
  await loadCurriculum();
  const dbHealth = await curriculumDbService.checkDatabaseHealth();
  console.log(`🐘 Curriculum PostgreSQL DB connected: ${dbHealth.isConnected} (${dbHealth.totalJobs} total jobs, ${dbHealth.doneJobs} done)`);

  const img1 = path.resolve("..", "grade 10 science lesson for testing", "1000329134.jpg");
  const img2 = path.resolve("..", "grade 10 science lesson for testing", "1000329135.jpg");

  console.log(`🖼️ Page 1: ${img1}`);
  console.log(`🖼️ Page 2: ${img2}\n`);

  // 2. Run Pipeline
  const result = await runPipeline(
    {
      noteId: "650000000000000000000001",
      userId: "test-user-dlk",
      imageUrl: img1,
      imageUrls: [img1, img2],
    },
    {
      asyncMaterialGeneration: false, // Run synchronously so we inspect output
    }
  );

  console.log("\n================================================================");
  console.log("📊 COMPLETE PIPELINE EXECUTION SUMMARY");
  console.log("================================================================\n");

  if (!result.success || !result.context) {
    console.error("❌ Pipeline Failed:", result.error);
    return;
  }

  const ctx = result.context;

  console.log("1️⃣ STAGE 1 & 2: OCR EXTRACTION & CLEANING");
  console.log("-----------------------------------------");
  console.log(`Raw OCR Length: ${ctx.rawOcrText?.length || 0} chars`);
  console.log(`Cleaned Text Length: ${ctx.ocrCleaning?.cleanedText.length || 0} chars`);
  console.log(`OCR Confidence Score: ${ctx.ocrCleaning?.confidenceScore}%`);
  console.log(`Quality Note: ${ctx.ocrCleaning?.qualityNote}`);
  console.log(`\n--- EXTRACTED & CLEANED NOTE TEXT ---`);
  console.log(ctx.ocrCleaning?.cleanedText.slice(0, 800) + "...\n");

  console.log("2️⃣ STAGE 3 & 4: SUBJECT, TOPIC & LESSON MATCHING");
  console.log("-----------------------------------------------");
  console.log(`Detected Subject: ${ctx.subjectDetection?.subject}`);
  console.log(`Detected Grade: ${ctx.subjectDetection?.grade}`);
  console.log(`Topic Hint: "${ctx.subjectDetection?.topicHint}"`);
  console.log(`Subject Confidence: ${ctx.subjectDetection?.confidence}%`);
  console.log(`Matched Lesson ID: ${ctx.matchedLessonId}`);
  console.log(`Matched Lesson Name: "${ctx.matchedLesson?.lessonName}" (Unit: ${ctx.matchedLesson?.unit})`);
  console.log(`Match Confidence: ${ctx.lessonMatchConfidence ? (ctx.lessonMatchConfidence * 100).toFixed(0) + "%" : "N/A"}`);
  console.log(`Match Method: ${ctx.lessonMatchMethod}`);
  console.log(`Textbook Reference: ${ctx.matchedLesson?.textbookReference || "N/A"}`);
  console.log(`Textbook Passages Retrieved: ${ctx.textbookPassages?.length || 0}\n`);

  console.log("3️⃣ STAGE 6 & 7: CONCEPT MATCHING & COVERAGE");
  console.log("-----------------------------------------");
  const foundConcepts = (ctx.conceptMatches || []).filter((m) => m.found);
  const missingConcepts = (ctx.conceptMatches || []).filter((m) => !m.found);
  console.log(`Total Concepts Checked: ${ctx.conceptMatches?.length || 0}`);
  console.log(`Found Concepts (${foundConcepts.length}):`);
  foundConcepts.forEach((m) => console.log(`  ✅ [${m.matchMethod}] ${m.concept.name} (wt: ${m.concept.weight}) - Evidence: ${m.evidence || "N/A"}`));
  console.log(`Missing Concepts (${missingConcepts.length}):`);
  missingConcepts.forEach((m) => console.log(`  ❌ ${m.concept.name} (wt: ${m.concept.weight})`));

  console.log(`\nCoverage Scores:`);
  console.log(`  Simple Coverage: ${ctx.coverageScores?.simpleCoverage}%`);
  console.log(`  Weighted Coverage: ${ctx.coverageScores?.weightedCoverage}%`);
  console.log(`  Achieved Points: ${ctx.coverageScores?.achievedWeightedScore} / ${ctx.coverageScores?.maxWeightedScore} pts\n`);

  console.log("4️⃣ STAGE 8: EXPLAINABLE LEARNING GAPS & EXAM READINESS");
  console.log("-----------------------------------------------------");
  console.log(`Exam Readiness Rating: ${ctx.examReadiness?.rating}`);
  console.log(`High-Priority Concept Coverage: ${ctx.examReadiness?.highPriorityConceptsCoverage}%`);
  console.log(`Frequently Examined Missing: ${ctx.examReadiness?.frequentlyExaminedMissing.join(", ") || "None"}`);
  console.log(`Revision Priority: ${ctx.examReadiness?.revisionPriority}`);
  console.log(`\nLearning Outcome Assessments (${ctx.outcomeAssessments?.length || 0}):`);
  ctx.outcomeAssessments?.forEach((oa, idx) => {
    console.log(`  [LO ${idx + 1}] Status: ${oa.status.toUpperCase()} | ${oa.outcome.description}`);
    console.log(`       Evidence: ${oa.evidence}`);
  });
  console.log(`\nExplainable Gaps & Recommendations (${ctx.explainableGaps?.length || 0}):`);
  ctx.explainableGaps?.forEach((g, idx) => {
    console.log(`  [Gap ${idx + 1}] Outcome: ${g.learningOutcome.description}`);
    console.log(`        Missing: ${g.missingConcepts.map((c) => c.name).join(", ")}`);
    console.log(`        Recommendation: ${g.recommendation}`);
  });
  console.log(`\nStrength Areas (${ctx.strengthAreas?.length || 0}):`);
  ctx.strengthAreas?.forEach((s) => console.log(`  ⭐ ${s}`));

  console.log("\n5️⃣ STAGE 9: PERSONALIZED STUDY MATERIAL GENERATION");
  console.log("-------------------------------------------------");
  console.log(`Strategy Rationale: ${ctx.materialPriorities?.rationale}`);
  console.log(`Material Types Generated: ${ctx.materialPriorities?.typesToGenerate.join(", ")}`);
  console.log(`Total Materials Generated: ${ctx.materialsGenerated}`);

  console.log("\n6️⃣ STAGE 10: QUALITY VERIFICATION");
  console.log("---------------------------------");
  console.log(`Quality Checked: ${ctx.qualityChecked}`);
  console.log(`Quality Warnings: ${ctx.qualityWarnings?.length ? ctx.qualityWarnings.join("; ") : "None (All checks passed)"}`);

  await curriculumDbService.closePool();
  console.log("\n================================================================");
  console.log("✨ TEST EXECUTION COMPLETE");
  console.log("================================================================");
}

runTest().catch(console.error);
