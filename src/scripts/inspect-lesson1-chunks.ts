import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

async function run() {
  const url = "http://localhost:6333/collections/pdf_knowledge_base/points/scroll";
  let offset: string | null = null;
  let allLesson1Chunks: any[] = [];

  for (let i = 0; i < 15; i++) {
    const res: any = await axios.post(url, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
    });
    const pts = res.data.result.points || [];
    for (const pt of pts) {
      const payload = pt.payload || {};
      const fn = payload.filename || "";
      const pStart = Number(payload.page_start || 0);
      const pages = (payload.pages || []) as number[];

      if (fn.includes("grade-10-science") && ((pStart >= 1 && pStart <= 40) || pages.some((p: number) => p >= 1 && p <= 40))) {
        allLesson1Chunks.push(payload);
      }
    }
    offset = res.data.result.next_page_offset;
    if (!offset) break;
  }

  console.log(`Found ${allLesson1Chunks.length} chunks for Grade 10 Science in pages 1-40:`);
  // Sort by page_start
  allLesson1Chunks.sort((a, b) => (a.page_start || 0) - (b.page_start || 0));

  for (const c of allLesson1Chunks) {
    console.log(`\n================ Page ${c.page_start} (Pages: ${JSON.stringify(c.pages)}) Chunk Index: ${c.chunk_index} ================`);
    console.log(c.text);
  }
}

run();
