import { Client } from "pg";

async function main() {
  const dbUrl = "postgresql://neondb_owner:npg_6qliOG7utYab@ep-twilight-mode-apd0prh5-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require";
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
