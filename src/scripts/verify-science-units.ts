import dotenv from "dotenv";
dotenv.config();

import { loadCurriculum, getLessonsBySubject } from "../curriculum";
import { curriculumDbService } from "../services/curriculumDbService";

async function verifyScience() {
  await loadCurriculum();
  const scienceChapters = curriculumDbService.getAvailableTextbookChapters("Science", 10);
  console.log(`\n================ REGISTERED GRADE 10 SCIENCE CHAPTERS (${scienceChapters.length}) ================`);
  for (const ch of scienceChapters) {
    console.log(`Unit ${ch.unitNumber}: ${ch.unitName}`);
    console.log(`  Book Pages: ${ch.bookPageStart}–${ch.bookPageEnd} | PDF Pages: ${ch.pdfPageStart}–${ch.pdfPageEnd}`);
    console.log(`  Concepts: ${ch.concepts?.length || 0} | Learning Outcomes: ${ch.learningOutcomes?.length || 0}`);
    console.log(`  Reference: ${ch.textbookReference}\n`);
  }

  const indexedScience = getLessonsBySubject("Science", 10);
  console.log(`Total Indexed Science Lessons in In-Memory Engine: ${indexedScience.length}`);
}

verifyScience();
