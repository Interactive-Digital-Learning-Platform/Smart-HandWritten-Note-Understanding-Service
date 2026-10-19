import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { knowledgeBasePdfPages, qdrantCollectionUrl, qdrantRequestOptions } from "../services/knowledgeBaseV2";

async function run() {
  const url = `${qdrantCollectionUrl()}/points/scroll`;
  let offset: string | null = null;

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
      const text = (payload.text || "").toLowerCase();
      if (text.includes("evolution of political power") || text.includes("prince vijaya") || text.includes("political power")) {
        console.log(`\n=== Found Match in: ${payload.filename} (Page: ${payload.page_start}, Pages: ${JSON.stringify(payload.pages)}) ===`);
        console.log(payload.text.slice(0, 400));
      }
    }
    offset = res.data.result.next_page_offset;
    if (!offset) break;
  }
}

run().catch(() => {console.error("Knowledge base inspection failed. Check the v2 endpoint and credentials.");process.exitCode=1;});
