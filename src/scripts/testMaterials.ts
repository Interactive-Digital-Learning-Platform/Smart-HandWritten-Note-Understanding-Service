/**
 * Seed script: creates a test note with rawText + analysis already set,
 * then generates all 6 text-based materials (skips audio).
 *
 * Run: npx ts-node src/scripts/testMaterials.ts
 */
import "../config/config"; // load env vars
import { connectDB } from "../config/database";
import { Note } from "../models/Note";
import { LearningMaterial } from "../models/LearningMaterial";
import { generateMaterials } from "../services/materialsService";

const RAW_TEXT = `
Photosynthesis
- Plants make their own food using sunlight
- Chlorophyll is the green pigment in chloroplasts that absorbs light
- CO2 enters through stomata on leaves
- Water is absorbed by roots and travels up the stem
- Light reaction: occurs in thylakoid membranes, produces ATP and NADPH, releases O2
- Calvin Cycle (dark reaction): occurs in stroma, uses ATP and NADPH to fix CO2 into glucose
- Overall equation: 6CO2 + 6H2O + light energy → C6H12O6 + 6O2
- Rate of photosynthesis affected by: light intensity, CO2 concentration, temperature
`;

const TEST_USER_ID = "test_seed_user";

async function main() {
  await connectDB();
  console.log("\n🌱 Seed: creating test note...");

  // Clean up previous seed notes
  await Note.deleteMany({ userId: TEST_USER_ID });
  await LearningMaterial.deleteMany({ userId: TEST_USER_ID });

  const note = await Note.create({
    userId: TEST_USER_ID,
    title: "Biology - Photosynthesis (Seed)",
    imageUrl: "/uploads/seed-test.png",
    rawText: RAW_TEXT.trim(),
    status: "analyzed",
    analysis: {
      subject: "Biology",
      topic: "Photosynthesis",
      gradeLevel: "Grade 11 O/L",
      keyConcepts: ["Chlorophyll", "Thylakoid", "Calvin Cycle", "ATP", "NADPH"],
      strengthAreas: ["Basic process understanding", "Location of reactions"],
      missingConcepts: ["Factors affecting rate", "C3 vs C4 plants"],
      learningGaps: [
        { concept: "Rate-limiting factors", severity: "medium", suggestion: "Study light, CO2, temp" },
        { concept: "C3/C4 pathway differences", severity: "low", suggestion: "Read textbook section 4.3" },
      ],
      overallCompleteness: 72,
      analyzedAt: new Date(),
    },
  });

  const noteId = (note._id as unknown as string).toString();
  console.log(`✅ Note created: ${noteId}`);

  // Generate all materials except audio (no ElevenLabs key in dev)
  console.log("\n📚 Generating materials...\n");
  const result = await generateMaterials(noteId, [
    "structured_notes",
    "definitions",
    "flashcards",
    "mindmap",
    "revision_summary",
    "learning_points",
  ]);

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${result.succeeded} succeeded, ${result.failed} failed`);
  result.results.forEach(r => {
    const icon = r.success ? "✅" : "❌";
    console.log(`  ${icon} ${r.type}${r.error ? ` — ${r.error}` : ""}`);
  });

  // Show flashcards as proof
  const fc = await LearningMaterial.findOne({ noteId, type: "flashcards" });
  if (fc?.flashcards?.length) {
    console.log(`\n🃏 Sample flashcards (${fc.flashcards.length} total):`);
    fc.flashcards.slice(0, 3).forEach((c, i) => {
      console.log(`  ${i + 1}. Q: ${c.front}`);
      console.log(`     A: ${c.back}`);
    });
  }

  // Show mind map root
  const mm = await LearningMaterial.findOne({ noteId, type: "mindmap" });
  if (mm?.mindMap) {
    console.log(`\n🗺  Mind map root: "${mm.mindMap.label}" with ${mm.mindMap.children?.length ?? 0} branches`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
