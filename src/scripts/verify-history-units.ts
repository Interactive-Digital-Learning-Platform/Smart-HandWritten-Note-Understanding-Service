import dotenv from "dotenv";
dotenv.config();

import { loadCurriculum, getLessonsBySubject } from "../curriculum";
import { curriculumDbService } from "../services/curriculumDbService";

async function verify() {
  await loadCurriculum();
  const historyChapters = curriculumDbService.getAvailableTextbookChapters("History", 10);
  console.log(`\n================ REGISTERED GRADE 10 HISTORY CHAPTERS (${historyChapters.length}) ================`);
  for (const ch of historyChapters) {
    console.log(`Unit ${ch.unitNumber}: ${ch.unitName}`);
    console.log(`  Book Pages: ${ch.bookPageStart}–${ch.bookPageEnd} | PDF Pages: ${ch.pdfPageStart}–${ch.pdfPageEnd}`);
    console.log(`  Concepts: ${ch.concepts?.length || 0} | Learning Outcomes: ${ch.learningOutcomes?.length || 0}`);
    console.log(`  Reference: ${ch.textbookReference}\n`);
  }

  const indexedLessons = getLessonsBySubject("History", 10);
  console.log(`Total Indexed History Lessons in In-Memory Engine: ${indexedLessons.length}`);
}

verify();
