import axios from "axios";
import { config } from "../config/config";

export interface QdrantCollectionInfo {
  collection: string;
  totalPoints: number;
  status: string;
  vectorDim?: number;
  distance?: string;
  isAvailable: boolean;
}

export interface QdrantPointPayload {
  text?: string;
  job_id?: string;
  original_chunk_id?: string;
  chunk_index?: number;
  page_number?: number;
  filename?: string;
  subject?: string;
  grade?: number;
  [key: string]: unknown;
}

export interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload: QdrantPointPayload;
}

/**
 * Client service to query the official Qdrant Vector Knowledge Base
 * (collection: pdf_knowledge_base) populated by pdf_ingestion_system.
 */
export class QdrantService {
  private baseUrl: string;
  private collectionName: string;

  constructor() {
    this.baseUrl = config.qdrant.url.replace(/\/+$/, "");
    this.collectionName = config.qdrant.collection;
  }

  /**
   * Fetches status and statistics for the official pdf_knowledge_base collection.
   */
  public async getCollectionStats(): Promise<QdrantCollectionInfo> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/collections/${this.collectionName}`,
        { timeout: 3000 }
      );

      const result = response.data?.result;
      const pointsCount = result?.points_count ?? result?.vectors_count ?? 0;
      const status = result?.status ?? "unknown";

      return {
        collection: this.collectionName,
        totalPoints: pointsCount,
        status,
        vectorDim: result?.config?.params?.vectors?.size,
        distance: result?.config?.params?.vectors?.distance,
        isAvailable: true,
      };
    } catch (error) {
      console.warn(
        `⚠️ Qdrant Knowledge Base (${this.collectionName}) ping failed:`,
        error instanceof Error ? error.message : String(error)
      );
      return {
        collection: this.collectionName,
        totalPoints: 0,
        status: "unreachable",
        isAvailable: false,
      };
    }
  }

  /**
   * Scrolls points from the Qdrant collection to retrieve ingested document passages.
   */
  public async scrollPoints(
    limit: number = 20,
    offset?: string | number
  ): Promise<{ points: QdrantSearchResult[]; nextOffset?: string | number }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/collections/${this.collectionName}/points/scroll`,
        {
          limit,
          offset,
          with_payload: true,
          with_vector: false,
        },
        { timeout: 5000 }
      );

      const result = response.data?.result;
      const points: QdrantSearchResult[] = (result?.points || []).map(
        (pt: any) => ({
          id: pt.id,
          score: 1.0,
          payload: pt.payload || {},
        })
      );

      return {
        points,
        nextOffset: result?.next_page_offset,
      };
    } catch (error) {
      console.warn(
        `⚠️ Qdrant scroll failed for ${this.collectionName}:`,
        error instanceof Error ? error.message : String(error)
      );
      return { points: [] };
    }
  }

  /**
   * Searches the Qdrant knowledge base for passages matching keywords / topic text.
   */
  public async searchByKeywordPayload(
    keyword: string,
    limit: number = 10
  ): Promise<QdrantSearchResult[]> {
    try {
      const scrollResult = await this.scrollPoints(100);
      const lowerKey = keyword.toLowerCase();

      const matched = scrollResult.points.filter((pt) => {
        const text = pt.payload.text?.toLowerCase() || "";
        const filename = pt.payload.filename?.toLowerCase() || "";
        return text.includes(lowerKey) || filename.includes(lowerKey);
      });

      return matched.slice(0, limit);
    } catch (error) {
      console.warn(`⚠️ Qdrant keyword search failed for "${keyword}":`, error);
      return [];
    }
  }
}

export const qdrantService = new QdrantService();
