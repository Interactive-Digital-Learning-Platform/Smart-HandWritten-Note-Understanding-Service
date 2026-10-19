import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { knowledgeBasePdfPages, qdrantCollectionUrl, qdrantRequestOptions } from "../services/knowledgeBaseV2";

async function run() {
  const url = `${qdrantCollectionUrl()}/points/scroll`;
  let offset: string | null = null;
  let historyChunks: any[] = [];

  for (let i = 0; i < 20; i++) {
    const res: any = await axios.post(url, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
    }, qdrantRequestOptions(10000));
    const pts = res.data.result.points || [];
    for (const pt of pts) {
      const raw = pt.payload || {};
      const pdfPages = knowledgeBasePdfPages(raw);
      const payload = {...raw, pages: pdfPages, page_start: pdfPages[0] ?? 0};
      const fn = payload.filename || "";
      if (fn.toLowerCase().includes("history")) {
        historyChunks.push(payload);
      }
    }
    offset = res.data.result.next_page_offset;
    if (!offset) break;
  }

  historyChunks.sort((a, b) => (a.page_start || 0) - (b.page_start || 0));

  for (const c of historyChunks) {
    if (c.page_start >= 8 && c.page_start <= 40) {
      console.log(`\n=== Page ${c.page_start} (Pages: ${JSON.stringify(c.pages)}) ===`);
      console.log(c.text);
    }
  }
}

run().catch(() => {console.error("Knowledge base inspection failed. Check the v2 endpoint and credentials.");process.exitCode=1;});
