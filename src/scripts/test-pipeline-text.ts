import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { config } from "../config/config";
import { loadCurriculum } from "../curriculum";
import { runPipeline } from "../pipeline";
import { PipelineContext } from "../pipeline/types";

async function testFullPipeline() {
  console.log("=== Testing Complete 10-Stage Pipeline with PDF Ingestion & Curriculum Integration ===\n");

  await mongoose.connect(config.mongodb.uri);
  console.log("✅ Connected to MongoDB\n");

  await loadCurriculum();


  const mockContext: PipelineContext = {
    noteId: "test-note-rag-101",
    userId: "test-user-dev",
    imageUrl: "https://example.com/sample-note.jpg",
    rawOcrText: `
Grade 10 Science - Unit on Photosynthesis
Date: 12th March 2026

Photosynthesis is the biological process by which autotrophic organisms convert light energy into chemical energy stored in glucose.
Word equation: Carbon dioxide + Water -> Glucose + Oxygen (in presence of Sunlight and Chlorophyll)
Chemical Equation: 6CO2 + 6H2O -> C6H12O6 + 6O2

Site of photosynthesis:
- Takes place in chloroplasts in mesophyll cells.
- Chlorophyll pigment absorbs blue and red wavelengths of visible light, reflecting green.
- Thylakoids contain chlorophyll, arranged in stacks called grana.
- Stroma is the fluid-filled space where dark reactions occur.

Two Main Stages:
1. Light-dependent reactions (Photochemical stage):
   - Occurs in thylakoid membranes.
   - Light energy absorbed by chlorophyll excites electrons.
   - Photolysis of water: 2H2O -> 4H+ + 4e- + O2. Oxygen is released as a byproduct.
   - ATP and NADPH (reduced NADP) are produced.

2. Light-independent reactions (Calvin Cycle / Dark reaction):
   - Occurs in the stroma.
   - CO2 fixation: RuBisCO fixes CO2 with RuBP (ribulose bisphosphate).
   - Reduction phase forms G3P / triose phosphate using ATP and NADPH.
   - Regeneration of RuBP consumes additional ATP.
   - 6 cycles produce 1 molecule of glucose.
    `,
    pipelineVersion: "2.0.0-rag",
    startedAt: new Date(),
    stageResults: [
      {
        stage: "ocr_extraction",
        success: true,
        durationMs: 15,
      },
    ],
  };

  console.log("Executing full pipeline on handwritten notes text...\n");
  const result = await runPipeline(mockContext);

  console.log("\n=======================================================");
  console.log(`Pipeline Result Success: ${result.success}`);
  if (result.context) {
    const ctx = result.context;
    console.log(`Matched Lesson: "${ctx.matchedLesson?.lessonName}" (${ctx.matchedLesson?.subject} G${ctx.matchedLesson?.grade})`);
    console.log(`Match Method: ${ctx.lessonMatchMethod} (Confidence: ${ctx.lessonMatchConfidence})`);
    console.log(`Textbook Reference: ${ctx.matchedLesson?.textbookReference || "N/A"}`);
    console.log(`Concepts Found: ${ctx.coverageScores?.foundConcepts}/${ctx.coverageScores?.totalConcepts}`);
    console.log(`Weighted Coverage: ${ctx.coverageScores?.weightedCoverage?.toFixed(1)}%`);
    console.log(`Revision priority: ${ctx.examReadiness?.revisionPriority}`);
    console.log(`Gaps Detected: ${ctx.explainableGaps?.length}`);
    if (ctx.explainableGaps && ctx.explainableGaps.length > 0) {
      console.log(`Sample Recommendation: "${ctx.explainableGaps[0].recommendation}"`);
    }
  }
  console.log("=======================================================\n");

  await mongoose.disconnect();
}

testFullPipeline().catch(console.error);
