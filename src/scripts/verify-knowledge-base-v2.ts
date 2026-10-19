/** Read-only v2 readiness check. No student notes, ingestion, index creation or AI calls. */
import axios from "axios";
import { config } from "../config/config";
import { validateRuntimeEnvironment } from "../config/validateConfig";
import { qdrantCollectionUrl, qdrantFailure, qdrantRequestOptions } from "../services/knowledgeBaseV2";
import { qdrantService } from "../services/qdrantService";

async function main() {
  validateRuntimeEnvironment();
  const { data } = await axios.get(qdrantCollectionUrl(), qdrantRequestOptions(10000));
  const info = data?.result;
  const dense = info?.config?.params?.vectors?.dense;
  const indexes = ["job_id", "filename", "subject", "chapter", "grade", "chunk_index"];
  const missingIndexes = indexes.filter(field => !info?.payload_schema?.[field]);
  const report: Record<string, unknown> = { collection: config.qdrant.collection,
    denseDimension: dense?.size, denseDistance: dense?.distance, points: info?.points_count,
    hasBm25: !!info?.config?.params?.sparse_vectors?.bm25, missingIndexes, ready: false };
  if (dense?.size !== 768 || dense?.distance !== "Cosine" || !report.hasBm25 || missingIndexes.length || !(info.points_count > 0)) {
    console.log(JSON.stringify(report, null, 2)); process.exitCode = 1; return;
  }
  // Explicit tags exercise only indexed filters. The normal chapter path also
  // supports untagged uploads through its existing filename/page post-checks.
  const rows = await qdrantService.searchKnowledgeBase("Science Grade 10 carbohydrates and reducing sugars", 3, { subject: "Science", grade: 10 });
  report.matches = rows.length;
  report.correctScope = rows.length > 0 && rows.every(row => row.payload?.grade === 10 && row.payload?.subject === "Science");
  report.ready = report.correctScope;
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}
if (require.main === module) main().catch(error => {
  // Do not print Axios request objects or cloud credentials.
  console.error(qdrantFailure("v2 readiness check", error).message); process.exitCode = 1;
});
