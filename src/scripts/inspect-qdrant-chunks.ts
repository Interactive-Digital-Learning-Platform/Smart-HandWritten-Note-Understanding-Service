import dotenv from "dotenv";
dotenv.config();

import { qdrantService } from "../services/qdrantService";

async function run() {
  const stats = await qdrantService.getCollectionStats();
  console.log("Qdrant stats:", stats);

  const scroll = await qdrantService.scrollPoints(20);
  console.log("Total scrolled points:", scroll.points.length);
  for (const pt of scroll.points) {
    console.log("Point page_start:", pt.payload.page_start, "pages:", pt.payload.pages, "filename:", pt.payload.filename);
    console.log("Snippet:", (pt.payload.text || "").slice(0, 120));
  }
}

run();
