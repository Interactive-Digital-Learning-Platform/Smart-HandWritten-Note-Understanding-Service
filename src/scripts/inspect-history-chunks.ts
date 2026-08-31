import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

async function run() {
  const url = "http://localhost:6333/collections/pdf_knowledge_base/points/scroll";
  let offset: string | null = null;
  let historyChunks: any[] = [];

  for (let i = 0; i < 20; i++) {
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
      if (fn.toLowerCase().includes("history")) {
        historyChunks.push(payload);
      }
    }
    offset = res.data.result.next_page_offset;
    if (!offset) break;
  }

  console.log(`Found ${historyChunks.length} History chunks in Qdrant!`);
  historyChunks.sort((a, b) => (a.page_start || 0) - (b.page_start || 0));

  for (const c of historyChunks.slice(0, 15)) {
    console.log(`\n=== Page ${c.page_start} (Pages: ${JSON.stringify(c.pages)}) ===`);
    console.log(c.text.slice(0, 300) + "...\n");
  }
}

run();
