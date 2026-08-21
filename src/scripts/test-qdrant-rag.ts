import dotenv from "dotenv";
dotenv.config();

import { qdrantService } from "../services/qdrantService";

async function main() {
  console.log("=== Testing PDF Ingestion & Qdrant Knowledge Base Integration ===\n");

  // 1. Check stats
  console.log("1. Checking Qdrant Collection Stats...");
  const stats = await qdrantService.getCollectionStats();
  console.log(`   Collection: "${stats.collection}"`);
  console.log(`   Total points: ${stats.totalPoints}`);
  console.log(`   Status: ${stats.status}`);
  console.log(`   Is Available: ${stats.isAvailable}\n`);

  // 2. Check Ingested Documents
  console.log("2. Checking Ingested Documents...");
  const docs = await qdrantService.getIngestedDocuments();
  console.log(`   Found ${docs.length} ingested document(s):`);
  docs.forEach((d, i) => {
    console.log(`   ${i + 1}. "${d.filename}" — ${d.total_chunks} chunks, pages: ${d.pages.join(", ")}`);
  });
  console.log("");

  // 3. Test Semantic Search
  const query = "photosynthesis light reaction chlorophyll plant cell";
  console.log(`3. Testing Semantic Search for: "${query}"...`);
  const passages = await qdrantService.searchKnowledgeBase(query, 3);
  console.log(`   Retrieved ${passages.length} passage(s):`);
  passages.forEach((p, i) => {
    console.log(`   [Passage ${i + 1}] Score: ${p.score.toFixed(3)} | Doc: ${p.filename} (Page ${p.pages.join(", ") || p.page_start})`);
    console.log(`   Snippet: "${p.text.slice(0, 150)}..."\n`);
  });

  // 4. Test Curriculum Textbook Context
  console.log("4. Testing Curriculum Textbook Context compilation...");
  const textbookCtx = await qdrantService.getCurriculumTextbookContext("Biology", "Photosynthesis", "light reaction ATP glucose");
  console.log(`   Available: ${textbookCtx.isAvailable}`);
  console.log(`   Reference: ${textbookCtx.textbookReference}`);
  console.log(`   Passages count: ${textbookCtx.passages.length}\n`);

  console.log("=== Integration Test Complete ===");
}

main().catch(console.error);
