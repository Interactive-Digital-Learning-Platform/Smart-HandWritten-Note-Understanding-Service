import { Client } from "pg";
import { config } from "../config/config";

async function main() {
  const dbUrl = config.curriculumDb.url;
  if (!dbUrl) {
    throw new Error("CURRICULUM_DB_URL or DB_URL must be set before inspecting the curriculum database.");
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const res = await client.query("SELECT job_id, filename, qdrant_collection, status, chunks_created, pages_processed FROM jobs WHERE status = 'done' ORDER BY started_at DESC");
    console.log("Done jobs count:", res.rows.length);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
