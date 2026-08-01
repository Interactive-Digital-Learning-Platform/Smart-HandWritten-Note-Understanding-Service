/**
 * Quick diagnostic script to test a single pipeline stage directly.
 * Run: npx ts-node src/scripts/test-pipeline.ts
 */

import path from "path";
import dotenv from "dotenv";
dotenv.config();

import { loadCurriculum } from "../curriculum";
import { extractTextFromImage } from "../services/ocrService";

const IMAGE_PATH = path.resolve(
  "uploads/note-1785515027062-848308126.jpg"
);

async function main() {
  console.log("=== Pipeline Diagnostic ===\n");

  // Step 1: Check KB loads
  console.log("1. Loading curriculum KB...");
  try {
    await loadCurriculum();
    console.log("   ✅ KB loaded\n");
  } catch (e) {
    console.error("   ❌ KB load failed:", e);
    process.exit(1);
  }

  // Step 2: Test OCR on one image
  console.log(`2. Running OCR on: ${path.basename(IMAGE_PATH)}`);
  try {
    const result = await extractTextFromImage(IMAGE_PATH);
    if (result.success) {
      console.log(`   ✅ OCR success — ${result.text.length} chars`);
      console.log(`   Sample: "${result.text.slice(0, 200)}"\n`);
    } else {
      console.error(`   ❌ OCR failed: ${result.error}\n`);
    }
  } catch (e) {
    console.error("   ❌ OCR threw:", e);
  }

  console.log("=== Done ===");
  process.exit(0);
}

main();
