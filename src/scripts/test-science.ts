import { loadCurriculum, findLesson, getLessonsBySubject } from "../curriculum";

async function main() {
  await loadCurriculum();

  console.log("\n==================================================");
  console.log("🧪 Testing Science Grade 10 Lesson 1 Matching");
  console.log("==================================================");

  const scienceLessons = getLessonsBySubject("Science", 10);
  console.log(`\n📚 Total Grade 10 Science Lessons Loaded: ${scienceLessons.length}`);
  scienceLessons.forEach((l) => {
    console.log(`   • ${l.lessonName} (${l.subject} Unit: ${l.unit}) — ${l.concepts.length} concepts`);
  });

  console.log("\n--- Query 1: Exact Match 'Chemical Basis of Life' ---");
  const res1 = findLesson("Science", "Chemical Basis of Life", 10);
  if (res1) {
    console.log(`✅ Matched: "${res1.lesson.lessonName}" (Method: ${res1.matchMethod}, Confidence: ${(res1.confidence * 100).toFixed(0)}%)`);
  } else {
    console.log("❌ No match found");
  }

  console.log("\n--- Query 2: Keyword Match 'monosaccharides benedict test' ---");
  const res2 = findLesson("Science", "monosaccharides benedict test", 10);
  if (res2) {
    console.log(`✅ Matched: "${res2.lesson.lessonName}" (Method: ${res2.matchMethod}, Confidence: ${(res2.confidence * 100).toFixed(0)}%)`);
  } else {
    console.log("❌ No match found");
  }
}

main().catch(console.error);
