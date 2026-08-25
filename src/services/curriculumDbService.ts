import { Pool, PoolConfig } from "pg";
import { config } from "../config/config";

export interface CurriculumJob {
  job_id: string;
  user_id: string;
  filename: string;
  minio_object_key: string;
  qdrant_collection: string;
  status: string;
  progress: number;
  current_stage: string | null;
  chunks_created: number | null;
  pages_processed: number | null;
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
}

export interface CurriculumTextbookInfo {
  filename: string;
  job_id: string;
  chunks_created: number;
  pages_processed: number;
  status: string;
  completed_at: string | null;
}

export interface CurriculumDbHealth {
  isConnected: boolean;
  totalJobs: number;
  doneJobs: number;
  database: string;
  error?: string;
}

/**
 * Normalizes Python/SQLAlchemy or standard PostgreSQL connection strings
 * for use with node-postgres (pg).
 */
export function normalizePostgresUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  // Strip sqlalchemy driver prefixes like postgresql+asyncpg:// or postgres+psycopg2://
  url = url.replace(/^postgresql\+[a-zA-Z0-9_-]+:\/\//i, "postgresql://");
  url = url.replace(/^postgres\+[a-zA-Z0-9_-]+:\/\//i, "postgres://");
  return url;
}

export class CurriculumDbService {
  private pool: Pool | null = null;
  private connectionString: string;

  constructor() {
    this.connectionString = normalizePostgresUrl(config.curriculumDb.url);
  }

  /**
   * Returns or initializes the PostgreSQL connection pool.
   */
  private getPool(): Pool {
    if (!this.pool) {
      const isNeonOrRemote =
        this.connectionString.includes("neon.tech") ||
        this.connectionString.includes("aws") ||
        this.connectionString.includes("sslmode=require");

      const poolConfig: PoolConfig = {
        connectionString: this.connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };

      if (isNeonOrRemote) {
        poolConfig.ssl = { rejectUnauthorized: false };
      }

      this.pool = new Pool(poolConfig);

      this.pool.on("error", (err) => {
        console.warn("⚠️ Unexpected error on idle PostgreSQL client:", err.message);
      });
    }

    return this.pool;
  }

  /**
   * Health check for PostgreSQL database connection.
   */
  public async checkDatabaseHealth(): Promise<CurriculumDbHealth> {
    try {
      const pool = this.getPool();
      const countRes = await pool.query(
        `SELECT 
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE status = 'done') as done_count
         FROM jobs`
      );

      const totalJobs = parseInt(countRes.rows[0]?.total_count || "0", 10);
      const doneJobs = parseInt(countRes.rows[0]?.done_count || "0", 10);

      return {
        isConnected: true,
        totalJobs,
        doneJobs,
        database: "PostgreSQL (Neon)",
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn("⚠️ Curriculum PostgreSQL DB connection check failed:", msg);
      return {
        isConnected: false,
        totalJobs: 0,
        doneJobs: 0,
        database: "PostgreSQL (Neon)",
        error: msg,
      };
    }
  }

  /**
   * Retrieves all completed ingestion jobs from PostgreSQL.
   */
  public async getCompletedCurriculumJobs(): Promise<CurriculumJob[]> {
    try {
      const pool = this.getPool();
      const res = await pool.query<CurriculumJob>(
        `SELECT 
          job_id,
          user_id,
          filename,
          minio_object_key,
          qdrant_collection,
          status,
          progress,
          current_stage,
          chunks_created,
          pages_processed,
          error_message,
          started_at,
          completed_at
         FROM jobs
         WHERE status = 'done'
         ORDER BY completed_at DESC NULLS LAST, started_at DESC`
      );

      return res.rows;
    } catch (error) {
      console.warn(
        "⚠️ Failed to fetch completed jobs from PostgreSQL:",
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Retrieves unique ingested textbooks and their latest job statistics directly from PostgreSQL.
   */
  public async getUniqueCurriculumTextbooks(): Promise<CurriculumTextbookInfo[]> {
    try {
      const pool = this.getPool();
      const res = await pool.query(
        `SELECT DISTINCT ON (filename)
          filename,
          job_id,
          COALESCE(chunks_created, 0) as chunks_created,
          COALESCE(pages_processed, 0) as pages_processed,
          status,
          completed_at
         FROM jobs
         WHERE status = 'done'
         ORDER BY filename, completed_at DESC NULLS LAST`
      );

      return res.rows.map((row) => ({
        filename: row.filename,
        job_id: String(row.job_id),
        chunks_created: parseInt(row.chunks_created, 10) || 0,
        pages_processed: parseInt(row.pages_processed, 10) || 0,
        status: row.status,
        completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      }));
    } catch (error) {
      console.warn(
        "⚠️ Failed to fetch unique curriculum textbooks from PostgreSQL:",
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Retrieves a single job by its UUID.
   */
  public async getJobById(jobId: string): Promise<CurriculumJob | null> {
    try {
      const pool = this.getPool();
      const res = await pool.query<CurriculumJob>(
        `SELECT 
          job_id,
          user_id,
          filename,
          minio_object_key,
          qdrant_collection,
          status,
          progress,
          current_stage,
          chunks_created,
          pages_processed,
          error_message,
          started_at,
          completed_at
         FROM jobs
         WHERE job_id = $1`,
        [jobId]
      );

      return res.rows[0] || null;
    } catch (error) {
      console.warn(`⚠️ Failed to fetch job ${jobId} from PostgreSQL:`, error);
      return null;
    }
  }

  /**
   * Closes the connection pool.
   */
  public async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const curriculumDbService = new CurriculumDbService();
