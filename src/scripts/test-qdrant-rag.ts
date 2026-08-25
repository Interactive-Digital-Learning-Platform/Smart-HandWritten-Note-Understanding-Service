import dotenv from "dotenv";
dotenv.config();

import { qdrantService } from "../services/qdrantService";
import { curriculumDbService } from "../services/curriculumDbService";

async function main() {
  console.log("=== Testing Direct Curriculum Database & Qdrant Integration ===\n");

  // 1. Check Neon PostgreSQL DB Health
  console.log("1. Checking PostgreSQL (Neon) Database...");
  const dbHealth = await curriculumDbService.checkDatabaseHealth();
  console.log(`   Connected: ${dbHealth.isConnected}`);
  console.log(`   Database: ${dbHealth.database}`);
  console.log(`   Total Jobs: ${dbHealth.totalJobs}`);
  console.log(`   Completed Jobs: ${dbHealth.doneJobs}\n`);

  // 2. Check Completed Jobs
  console.log("2. Querying Completed Ingestion Jobs from PostgreSQL...");
  const jobs = await curriculumDbService.getCompletedCurriculumJobs();
  console.log(`   Found ${jobs.length} completed job(s):`);
  jobs.slice(0, 5).forEach((j, i) => {
    console.log(`   ${i + 1}. "${j.filename}" (${j.chunks_created || 0} chunks, ${j.pages_processed || 0} pages) - job_id: ${j.job_id}`);
  });
  console.log("");

  // 3. Check Ingested Documents
  console.log("3. Querying Unique Ingested Textbooks...");
  const docs = await qdrantService.getIngestedDocuments();
  console.log(`   Found ${docs.length} unique textbook(s):`);
  docs.slice(0, 5).forEach((d, i) => {
    console.log(`   ${i + 1}. "${d.filename}" — ${d.total_chunks} chunks, status: ${d.status || "done"}`);
  });
  console.log("");

  // 4. Check Qdrant Stats
  console.log("4. Checking Qdrant Collection Stats...");
  const stats = await qdrantService.getCollectionStats();
  console.log(`   Collection: "${stats.collection}"`);
  console.log(`   Total points: ${stats.totalPoints}`);
  console.log(`   Status: ${stats.status}`);
  console.log(`   Is Available: ${stats.isAvailable}\n`);

  // 5. Test Curriculum Context Retrieval
  console.log("5. Testing Curriculum Textbook Context Compilation...");
  const textbookCtx = await qdrantService.getCurriculumTextbookContext("Science", "Photosynthesis", "light reaction chlorophyll");
  console.log(`   Available: ${textbookCtx.isAvailable}`);
  console.log(`   Reference: ${textbookCtx.textbookReference || "None"}`);
  console.log(`   Passages count: ${textbookCtx.passages.length}\n`);

  await curriculumDbService.closePool();
  console.log("=== Integration Test Complete ===");
}

main().catch(console.error);
