import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { loadCurriculum, getLessonById } from "../curriculum";
import { runPipeline } from "../pipeline";
import { CurriculumConcept } from "../curriculum/types";
import { groqPool } from "../services/groqPool";
import { config } from "../config/config";

// ═══════════════════════════════════════════════════════════════════════════
// Automated Research Benchmark & Baseline Evaluation Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Evaluates the Smart Handwritten Note Understanding framework against:
//   1. Baseline 1: Pure Keyword / Lexical Matching
//   2. Baseline 2: Pure Semantic / LLM Matching
//   3. Proposed System: Hybrid (Deterministic Keywords + LLM Paraphrasing + RAG)
//   4. Ablation 1: Unweighted vs. Weighted Syllabus Coverage
//
// Computes Standard Publication Metrics:
//   - Precision (P)
//   - Recall (R)
//   - F1-Score (F1)
//   - Overall Classification Accuracy
//   - Weighted Gap Accuracy
//   - Markdown & LaTeX Summary Tables
// ═══════════════════════════════════════════════════════════════════════════

interface GroundTruthConcept {
  conceptId: string;
  name: string;
  weight: number;
  groundTruth: "present" | "partial" | "missing";
  evidenceNote?: string;
}

interface BenchmarkItem {
  benchmarkId: string;
  noteTitle: string;
  subject: string;
  grade: number;
  unitNumber: number;
  lessonId: string;
  imagePaths: string[];
  ocrLegibilityScore: number;
  annotator: string;
  annotatedAt: string;
  groundTruthConcepts: GroundTruthConcept[];
}

interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  totalWeightCorrect: number;
  totalWeightAll: number;
}

interface EvaluationResult {
  methodName: string;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  weightedGapAccuracy: number;
  confusion: ConfusionMatrix;
}

// ─── Keyword-Only Baseline ──────────────────────────────────────────────────
const runKeywordOnlyBaseline = (
  cleanedText: string,
  concepts: CurriculumConcept[]
): Map<string, boolean> => {
  const textLower = cleanedText.toLowerCase();
  const predictions = new Map<string, boolean>();

  for (const c of concepts) {
    let found = false;
    for (const kw of c.keywords) {
      if (textLower.includes(kw.toLowerCase())) {
        found = true;
        break;
      }
    }
    predictions.set(c.id, found);
  }

  return predictions;
};

// ─── Semantic-Only Baseline (No keyword boost) ──────────────────────────────
const runSemanticOnlyBaseline = async (
  cleanedText: string,
  concepts: CurriculumConcept[]
): Promise<Map<string, boolean>> => {
  const predictions = new Map<string, boolean>();
  if (concepts.length === 0) return predictions;

  const conceptList = concepts
    .map((c, i) => `  ${i + 1}. "${c.name}" (keywords: ${c.keywords.slice(0, 3).join(", ")})`)
    .join("\n");

  const prompt = `You are evaluating a student's notes strictly based on semantic meaning.
Student Notes:
"""
${cleanedText.slice(0, 30000)}
"""

Concepts to check:
${conceptList}

Determine if the student's notes discuss or reference each concept.
Respond ONLY with a JSON array:
[{"index": 1, "found": true}, {"index": 2, "found": false}]`;

  try {
    const response = await groqPool.createChatCompletion({
      model: config.groq.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const text = response.choices[0]?.message?.content || "[]";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    const parsed = arrayMatch ? JSON.parse(arrayMatch[0]) : [];

    for (const item of parsed) {
      const idx = item.index - 1;
      if (idx >= 0 && idx < concepts.length) {
        predictions.set(concepts[idx].id, Boolean(item.found));
      }
    }
  } catch (err) {
    console.warn("⚠️ Semantic baseline error, falling back to false:", err);
  }

  // Fill in any missing keys as false
  for (const c of concepts) {
    if (!predictions.has(c.id)) {
      predictions.set(c.id, false);
    }
  }

  return predictions;
};

// ─── Metric Calculator ──────────────────────────────────────────────────────
const calculateMetrics = (
  methodName: string,
  predictions: Map<string, boolean>,
  groundTruths: GroundTruthConcept[]
): EvaluationResult => {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let totalWeightCorrect = 0;
  let totalWeightAll = 0;

  for (const gt of groundTruths) {
    const predicted = predictions.get(gt.conceptId) ?? false;
    const actualIsPresent = gt.groundTruth === "present" || gt.groundTruth === "partial";
    const weight = gt.weight || 3;

    totalWeightAll += weight;

    if (predicted && actualIsPresent) {
      tp++;
      totalWeightCorrect += weight;
    } else if (!predicted && !actualIsPresent) {
      tn++;
      totalWeightCorrect += weight;
    } else if (predicted && !actualIsPresent) {
      fp++;
    } else if (!predicted && actualIsPresent) {
      fn++;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = tp + tn + fp + fn > 0 ? (tp + tn) / (tp + tn + fp + fn) : 0;
  const weightedGapAccuracy = totalWeightAll > 0 ? totalWeightCorrect / totalWeightAll : 0;

  return {
    methodName,
    precision: Math.round(precision * 1000) / 10,
    recall: Math.round(recall * 1000) / 10,
    f1: Math.round(f1 * 1000) / 10,
    accuracy: Math.round(accuracy * 1000) / 10,
    weightedGapAccuracy: Math.round(weightedGapAccuracy * 1000) / 10,
    confusion: { tp, fp, tn, fn, totalWeightCorrect, totalWeightAll },
  };
};

// ─── Main Benchmark Runner ──────────────────────────────────────────────────
async function runBenchmarks() {
  console.log("══════════════════════════════════════════════════════════════════════════════");
  console.log("🔬 RUNNING SCIENTIFIC GROUND-TRUTH BENCHMARKS & BASELINE EVALUATION");
  console.log("══════════════════════════════════════════════════════════════════════════════\n");

  await loadCurriculum();

  const datasetPath = path.resolve(__dirname, "../../data/benchmarks/ground_truth.json");
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Ground truth dataset not found at: ${datasetPath}`);
    return;
  }

  const rawData = fs.readFileSync(datasetPath, "utf-8");
  const dataset: BenchmarkItem[] = JSON.parse(rawData);

  console.log(`[Dataset] Loaded ${dataset.length} benchmark test note entries.\n`);

  const aggregateKeyword: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0, totalWeightCorrect: 0, totalWeightAll: 0 };
  const aggregateSemantic: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0, totalWeightCorrect: 0, totalWeightAll: 0 };
  const aggregateHybrid: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0, totalWeightCorrect: 0, totalWeightAll: 0 };

  const noteReports: any[] = [];

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i];
    console.log(`\n──────────────────────────────────────────────────────────────────────────────`);
    console.log(`[Eval ${i + 1}/${dataset.length}] Note: ${item.noteTitle}`);
    console.log(`   Subject: ${item.subject} | Grade: ${item.grade} | Lesson: ${item.lessonId}`);
    console.log(`   Ground-truth concepts: ${item.groundTruthConcepts.length}`);

    // Resolve images
    const resolvedImages = item.imagePaths.map((p) => path.resolve(__dirname, "../../", p));
    const firstImage = resolvedImages[0];

    const lesson = getLessonById(item.lessonId);
    const concepts = lesson ? lesson.concepts : [];

    // 1. Run Full Proposed Pipeline (Baseline 3 / Proposed)
    console.log("   [Run] Proposed Hybrid Pipeline...");
    const pipelineResult = await runPipeline(
      {
        noteId: `65000000000000000000000${i + 1}`,
        userId: "eval-research-bot",
        imageUrl: firstImage,
        imageUrls: resolvedImages,
        userSubject: item.subject,
        userGrade: item.grade,
        userLessonId: item.lessonId,
      },
      { asyncMaterialGeneration: true }
    );

    const cleanedText = pipelineResult.context?.ocrCleaning?.cleanedText || pipelineResult.context?.rawOcrText || "";
    const hybridMatches = pipelineResult.context?.conceptMatches || [];

    const hybridPredictions = new Map<string, boolean>();
    for (const m of hybridMatches) {
      hybridPredictions.set(m.concept.id, m.found);
    }

    // 2. Run Baseline 1: Keyword Only
    console.log("   [Run] Baseline 1: Exact Keyword Matching...");
    const keywordPredictions = runKeywordOnlyBaseline(cleanedText, concepts);

    // 3. Run Baseline 2: Semantic Only
    console.log("   [Run] Baseline 2: Dense Semantic / LLM Matching...");
    const semanticPredictions = await runSemanticOnlyBaseline(cleanedText, concepts);

    // Calculate per-note metrics
    const mKeyword = calculateMetrics("Keyword Matching", keywordPredictions, item.groundTruthConcepts);
    const mSemantic = calculateMetrics("Semantic Matching", semanticPredictions, item.groundTruthConcepts);
    const mHybrid = calculateMetrics("Hybrid Proposed", hybridPredictions, item.groundTruthConcepts);

    // Accumulate aggregate confusion matrix
    const addConfusion = (target: ConfusionMatrix, src: ConfusionMatrix) => {
      target.tp += src.tp;
      target.fp += src.fp;
      target.tn += src.tn;
      target.fn += src.fn;
      target.totalWeightCorrect += src.totalWeightCorrect;
      target.totalWeightAll += src.totalWeightAll;
    };

    addConfusion(aggregateKeyword, mKeyword.confusion);
    addConfusion(aggregateSemantic, mSemantic.confusion);
    addConfusion(aggregateHybrid, mHybrid.confusion);

    console.log(`\n   [Metrics] Note Results:`);
    console.log(`      - Keyword Baseline : Precision = ${mKeyword.precision}%, Recall = ${mKeyword.recall}%, F1 = ${mKeyword.f1}%`);
    console.log(`      - Semantic Baseline: Precision = ${mSemantic.precision}%, Recall = ${mSemantic.recall}%, F1 = ${mSemantic.f1}%`);
    console.log(`      - Hybrid Proposed  : Precision = ${mHybrid.precision}%, Recall = ${mHybrid.recall}%, F1 = ${mHybrid.f1}% (Weighted Acc: ${mHybrid.weightedGapAccuracy}%)`);

    noteReports.push({
      benchmarkId: item.benchmarkId,
      noteTitle: item.noteTitle,
      keyword: mKeyword,
      semantic: mSemantic,
      hybrid: mHybrid,
    });
  }

  // ── Compute Final Aggregate Metrics ───────────────────────────────────────
  const finalizeAggregate = (methodName: string, c: ConfusionMatrix): EvaluationResult => {
    const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 0;
    const recall = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const accuracy = c.tp + c.tn + c.fp + c.fn > 0 ? (c.tp + c.tn) / (c.tp + c.tn + c.fp + c.fn) : 0;
    const weightedGapAccuracy = c.totalWeightAll > 0 ? c.totalWeightCorrect / c.totalWeightAll : 0;

    return {
      methodName,
      precision: Math.round(precision * 1000) / 10,
      recall: Math.round(recall * 1000) / 10,
      f1: Math.round(f1 * 1000) / 10,
      accuracy: Math.round(accuracy * 1000) / 10,
      weightedGapAccuracy: Math.round(weightedGapAccuracy * 1000) / 10,
      confusion: c,
    };
  };

  const finalKeyword = finalizeAggregate("Baseline 1: Keyword-Only Matching", aggregateKeyword);
  const finalSemantic = finalizeAggregate("Baseline 2: Semantic-Only Matching", aggregateSemantic);
  const finalHybrid = finalizeAggregate("Proposed: Hybrid Curriculum-Grounded Pipeline", aggregateHybrid);

  // ── Render Formatted Terminal Table ────────────────────────────────────────
  console.log("\n\n╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                     FINAL EVALUATION BENCHMARK RESULTS (ACADEMIC COMPARISON)                         ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣");
  console.log("║ Architecture / Method                  │ Precision │  Recall  │ F1-Score │ Accuracy │ Weighted Acc   ║");
  console.log("╟────────────────────────────────────────┼───────────┼──────────┼──────────┼──────────┼────────────────╢");
  console.log(`║ 1. Keyword-Only Matching               │   ${finalKeyword.precision.toFixed(1).padStart(5)}%  │  ${finalKeyword.recall.toFixed(1).padStart(5)}%  │  ${finalKeyword.f1.toFixed(1).padStart(5)}%  │  ${finalKeyword.accuracy.toFixed(1).padStart(5)}%  │     ${finalKeyword.weightedGapAccuracy.toFixed(1).padStart(5)}%     ║`);
  console.log(`║ 2. Semantic-Only Matching              │   ${finalSemantic.precision.toFixed(1).padStart(5)}%  │  ${finalSemantic.recall.toFixed(1).padStart(5)}%  │  ${finalSemantic.f1.toFixed(1).padStart(5)}%  │  ${finalSemantic.accuracy.toFixed(1).padStart(5)}%  │     ${finalSemantic.weightedGapAccuracy.toFixed(1).padStart(5)}%     ║`);
  console.log(`║ 3. Proposed Hybrid Pipeline (Ours)     │   ${finalHybrid.precision.toFixed(1).padStart(5)}%  │  ${finalHybrid.recall.toFixed(1).padStart(5)}%  │  ${finalHybrid.f1.toFixed(1).padStart(5)}%  │  ${finalHybrid.accuracy.toFixed(1).padStart(5)}%  │     ${finalHybrid.weightedGapAccuracy.toFixed(1).padStart(5)}%     ║`);
  console.log("╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝\n");

  // ── Render LaTeX Table Snippet for Research Papers ────────────────────────
  const latexTable = `
% ── Copy-Paste into LaTeX Research Paper / Thesis ──
\\begin{table}[htbp]
\\centering
\\caption{Comparative Performance of Concept Detection and Gap Identification}
\\label{tab:concept_detection_results}
\\begin{tabular}{lccccc}
\\hline
\\textbf{Method / Architecture} & \\textbf{Precision (\\%)} & \\textbf{Recall (\\%)} & \\textbf{$F_1$-Score (\\%)} & \\textbf{Accuracy (\\%)} & \\textbf{Weighted Acc (\\%)} \\\\
\\hline
Keyword-Only Matching & ${finalKeyword.precision}\\% & ${finalKeyword.recall}\\% & ${finalKeyword.f1}\\% & ${finalKeyword.accuracy}\\% & ${finalKeyword.weightedGapAccuracy}\\% \\\\
Semantic-Only Matching & ${finalSemantic.precision}\\% & ${finalSemantic.recall}\\% & ${finalSemantic.f1}\\% & ${finalSemantic.accuracy}\\% & ${finalSemantic.weightedGapAccuracy}\\% \\\\
\\textbf{Proposed Hybrid Pipeline} & \\textbf{${finalHybrid.precision}\\%} & \\textbf{${finalHybrid.recall}\\%} & \\textbf{${finalHybrid.f1}\\%} & \\textbf{${finalHybrid.accuracy}\\%} & \\textbf{${finalHybrid.weightedGapAccuracy}\\%} \\\\
\\hline
\\end{tabular}
\\end{table}
`;

  // Save output JSON to benchmarks dir
  const outputSummaryPath = path.resolve(__dirname, "../../data/benchmarks/benchmark_results.json");
  fs.writeFileSync(
    outputSummaryPath,
    JSON.stringify(
      {
        evaluatedAt: new Date().toISOString(),
        totalNotes: dataset.length,
        aggregates: {
          keyword: finalKeyword,
          semantic: finalSemantic,
          hybrid: finalHybrid,
        },
        noteReports,
        latexTable,
      },
      null,
      2
    )
  );

  console.log(`💾 Full benchmark results saved to: ${outputSummaryPath}`);

  // Generate and automatically launch visual HTML dashboard
  try {
    const { generateDashboard } = await import("./generate-eval-dashboard");
    generateDashboard();
  } catch (err) {
    console.warn("⚠️ Could not launch dashboard automatically:", err);
  }
}

runBenchmarks().catch((err) => {
  console.error("❌ Fatal Benchmark Error:", err);
});
