import axios from "axios";
import { config } from "../config/config";
import { groqPool } from "./groqPool";
import { CurriculumLesson } from "../curriculum/types";
import { curriculumDbService, ChapterPageBounds } from "./curriculumDbService";
import { embeddingService } from "./embeddingService";
import { buildDynamicCurriculumLesson } from "../curriculum/identity";
import { validateLesson } from "../curriculum/validator";
import {
  getTextbookStorageSources,
  matchesTextbookFilename,
} from "./textbookFilename";

export interface QdrantCollectionInfo {
  collection: string;
  totalPoints: number;
  status: string;
  vectorDim?: number;
  distance?: string;
  isAvailable: boolean;
}

export interface IngestedDocumentInfo {
  filename: string;
  job_id: string;
  total_chunks: number;
  page_count: number;
  pages?: number[];
  status?: string;
  completed_at?: string | null;
}

export interface IngestionSearchChunk {
  id: string;
  score: number;
  text: string;
  filename: string;
  pages: number[];
  page_start: number;
  chunk_index: number;
  payload?: Record<string, unknown>;
  retrievalMode?: "vector" | "keyword";
}

export interface SearchPageBounds {
  minPage?: number;
  maxPage?: number;
  filename?: string;
  bookPageStart?: number;
  bookPageEnd?: number;
  unitName?: string;
  textbookReference?: string;
  sources?: Array<{
    filename: string;
    minPage: number;
    maxPage: number;
  }>;
}

export interface CurriculumRetrievalContext {
  isAvailable: boolean;
  sourceTextbook?: string;
  textbookReference?: string;
  chapterBounds?: ChapterPageBounds | null;
  passages: IngestionSearchChunk[];
  combinedContext: string;
  matchedLesson?: CurriculumLesson;
}

// Searches textbook data in Qdrant and PostgreSQL.
export class QdrantService {
  private qdrantBaseUrl: string;
  private collectionName: string;

  constructor() {
    this.qdrantBaseUrl = config.qdrant.url.replace(/\/+$/, "");
    this.collectionName = config.qdrant.collection;
  }

  // Gets the Qdrant collection status and counts.
  public async getCollectionStats(): Promise<QdrantCollectionInfo> {
    try {
      const response = await axios.get(
        `${this.qdrantBaseUrl}/collections/${this.collectionName}`,
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
        isAvailable: pointsCount > 0 || status === "green" || status === "yellow",
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

  // Searches stored vectors and can limit results to a chapter.
  public async searchKnowledgeBase(
    query: string,
    limit: number = 8,
    bounds?: SearchPageBounds
  ): Promise<IngestionSearchChunk[]> {
    if (!query || !query.trim()) return [];
    return this.searchByVectorSimilarity(query, limit, bounds);
  }

  // Embeds the query and ranks matching Qdrant points. This has no keyword fallback.
  public async searchByVectorSimilarity(
    query: string,
    limit: number = 10,
    bounds?: SearchPageBounds
  ): Promise<IngestionSearchChunk[]> {
    const vector = await embeddingService.embedRetrievalQuery(query);
    const collection = await this.getCollectionStats();
    if (!collection.isAvailable) {
      throw new Error(
        `Qdrant collection '${this.collectionName}' is unavailable at the configured QDRANT_DB_URL.`
      );
    }
    if (collection.vectorDim && collection.vectorDim !== vector.length) {
      throw new Error(
        `Qdrant expects ${collection.vectorDim}-dimensional vectors but the embedding model produced ${vector.length}.`
      );
    }
    const candidateLimit = Math.max(limit * 8, 40);
    const requestBody = {
      query: vector,
      limit: candidateLimit,
      with_payload: true,
      with_vector: false,
    };

    let points: any[];
    try {
      const response = await axios.post(
        `${this.qdrantBaseUrl}/collections/${this.collectionName}/points/query`,
        requestBody,
        { timeout: 10000 }
      );
      points = response.data?.result?.points || [];
    } catch (queryError) {
      // Older Qdrant versions use this search endpoint.
      try {
        const legacyResponse = await axios.post(
          `${this.qdrantBaseUrl}/collections/${this.collectionName}/points/search`,
          { ...requestBody, vector },
          { timeout: 10000 }
        );
        points = legacyResponse.data?.result || [];
      } catch {
        throw queryError;
      }
    }

    const rankedChunks = points
      .filter((point) => this.isWithinBounds(point.payload || {}, bounds))
      .map((point) => this.toSearchChunk(point, "vector"));

    // Remove duplicate chunks left by repeated ingestion.
    const seen = new Set<string>();
    return rankedChunks
      .filter((chunk) => {
        const fingerprint = `${chunk.filename}|${chunk.page_start}|${chunk.text.trim()}`;
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      })
      .slice(0, limit);
  }

  // Lists ingested textbooks from PostgreSQL.
  public async getIngestedDocuments(): Promise<IngestedDocumentInfo[]> {
    try {
      const dbDocs = await curriculumDbService.getUniqueCurriculumTextbooks();
      if (dbDocs && dbDocs.length > 0) {
        return dbDocs.map((doc) => ({
          filename: doc.filename,
          job_id: doc.job_id,
          total_chunks: doc.chunks_created,
          page_count: doc.pages_processed,
          pages: [],
          status: doc.status,
          completed_at: doc.completed_at,
        }));
      }
    } catch (dbErr) {
      console.warn(
        "⚠️ Direct PostgreSQL textbook retrieval error, checking Qdrant:",
        dbErr instanceof Error ? dbErr.message : String(dbErr)
      );
    }

    try {
      const scrollRes = await this.scrollPoints(200);
      const docsMap = new Map<string, IngestedDocumentInfo>();

      for (const pt of scrollRes.points) {
        const fn = (pt.payload.filename as string) || "Unknown Document";
        const jobId = (pt.payload.job_id as string) || "";
        const pages = (pt.payload.pages as number[]) || [];

        if (!docsMap.has(fn)) {
          docsMap.set(fn, {
            filename: fn,
            job_id: jobId,
            total_chunks: (pt.payload.total_chunks as number) || 1,
            page_count: 0,
            pages: [],
          });
        }

        const doc = docsMap.get(fn)!;
        pages.forEach((p) => {
          if (!doc.pages?.includes(p)) doc.pages?.push(p);
        });
      }

      for (const doc of docsMap.values()) {
        if (doc.pages) {
          doc.pages.sort((a, b) => a - b);
          doc.page_count = doc.pages.length;
        }
      }

      return Array.from(docsMap.values());
    } catch {
      return [];
    }
  }

  // Gets textbook context from within the chapter page range.
  public async getCurriculumTextbookContext(
    subject: string,
    topic: string,
    textSnippet?: string,
    grade?: number
  ): Promise<CurriculumRetrievalContext> {
    const s = subject && subject !== "Unknown" ? subject : "Science";
    const t = topic && topic !== "Unknown Topic" ? topic : "Lesson 1";
    const g = grade || 10;
    const snippet = textSnippet ? textSnippet.slice(0, 300) : "";

    // Find the chapter page range.
    const chapterBounds = curriculumDbService.getChapterPageBounds(s, g, t);

    const searchBounds: SearchPageBounds | undefined = chapterBounds
      ? {
          minPage: chapterBounds.pdfPageStart,
          maxPage: chapterBounds.pdfPageEnd,
          filename: chapterBounds.textbookFilename,
          bookPageStart: chapterBounds.bookPageStart,
          bookPageEnd: chapterBounds.bookPageEnd,
          unitName: chapterBounds.unitName,
          textbookReference: chapterBounds.textbookReference,
          sources: getTextbookStorageSources(
            chapterBounds.textbookFilename
          ).map((source) => ({
            filename: source.filename,
            minPage: chapterBounds.pdfPageStart + source.pageOffset,
            maxPage: chapterBounds.pdfPageEnd + source.pageOffset,
          })),
        }
      : undefined;

    const query = `${s} ${t} ${snippet}`.trim();
    const passages = await this.searchKnowledgeBase(query, 6, searchBounds);

    const textbookReference =
      chapterBounds?.textbookReference ||
      (passages.length > 0 && passages[0].filename
        ? `${passages[0].filename} (Pages ${Array.from(new Set(passages.flatMap((p) => p.pages))).join(", ")})`
        : undefined);

    if (passages.length === 0) {
      return {
        isAvailable: Boolean(chapterBounds),
        sourceTextbook: chapterBounds?.textbookFilename,
        textbookReference,
        chapterBounds,
        passages: [],
        combinedContext: chapterBounds
          ? `=== Official Curriculum Textbook: ${chapterBounds.subject} Grade ${chapterBounds.grade} ===\nUnit: ${chapterBounds.unitName}\nReference: ${chapterBounds.textbookReference}`
          : "",
      };
    }

    const passageBlocks = passages
      .map(
        (p, i) =>
          `[Passage ${i + 1} | Source: ${p.filename} (PDF Page: ${p.pages.join(", ") || p.page_start})]\n${p.text}`
      )
      .join("\n\n---\n\n");

    const combinedContext = `=== Ingested Official Curriculum Knowledge Base ===\nTextbook Reference: ${textbookReference || "Official Ingested Textbook"}\n\n${passageBlocks}`;

    return {
      isAvailable: true,
      sourceTextbook: passages[0].filename,
      textbookReference,
      chapterBounds,
      passages,
      combinedContext,
    };
  }

  // Builds a lesson from stored textbook passages.
  public async extractDynamicLessonFromPassages(
    subject: string,
    topic: string,
    grade: number,
    passages: IngestionSearchChunk[],
    chapterBounds?: ChapterPageBounds | null
  ): Promise<CurriculumLesson | null> {
    const effectiveSubject = chapterBounds?.subject || subject || "Science";
    const effectiveTopic = chapterBounds?.unitName || topic || "Lesson";
    const effectiveGrade = chapterBounds?.grade || grade || 10;
    const textbookRef =
      chapterBounds?.textbookReference ||
      (passages.length > 0
        ? `${passages[0].filename} (PDF Pages: ${Array.from(new Set(passages.flatMap((p) => p.pages))).join(", ")})`
        : `${effectiveSubject} Grade ${effectiveGrade} Textbook`);

    const excerptText =
      passages.length > 0
        ? passages.map((p) => p.text).join("\n\n").slice(0, 4000)
        : `Unit: ${effectiveTopic} (${effectiveSubject} Grade ${effectiveGrade})`;

    const prompt = `You are a Sri Lankan secondary school curriculum expert.
Extract the structured syllabus elements for the topic "${effectiveTopic}" (${effectiveSubject} Grade ${effectiveGrade})
based on these official textbook passages and curriculum specifications:

"""
${excerptText}
"""

Respond ONLY with valid JSON in this exact structure:
{
  "lessonName": "${effectiveTopic}",
  "unit": "${effectiveTopic}",
  "learningOutcomes": [
    {
      "id": "lo-01",
      "description": "Clear description of learning outcome",
      "requiredConcepts": ["concept-01", "concept-02"]
    }
  ],
  "concepts": [
    {
      "id": "concept-01",
      "name": "Concept name",
      "weight": 5,
      "isFrequentlyTested": true,
      "category": "definition",
      "keywords": ["keyword1", "keyword2", "synonym"]
    }
  ],
  "definitions": [
    { "term": "Term", "definition": "Textbook definition" }
  ],
  "formulae": [],
  "expectedDiagrams": [],
  "matchingKeywords": ["${effectiveTopic.toLowerCase()}", "${effectiveSubject.toLowerCase()}"]
}

Rules:
- weights: 1-5 (5=critical for exams, 4=very important, 3=standard, 2=supporting, 1=supplementary)
- category: one of definition, process, formula, diagram, fact, law, calculation, experiment
- Extract 5 to 15 core concepts for this chapter.`;

    try {
      const completion = await groqPool.createChatCompletion({
        model: config.groq.model,
        temperature: 0.1,
        max_tokens: 3500,
        messages: [{ role: "user", content: prompt }],
      });

      let raw = completion.choices[0]?.message?.content || "";
      raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      const stripped = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : stripped;

      const lesson = buildDynamicCurriculumLesson({
        subject: effectiveSubject,
        grade: effectiveGrade,
        topic: effectiveTopic,
        textbookReference: textbookRef,
        generated: JSON.parse(jsonStr),
      });
      if (!lesson) {
        console.warn("⚠️ Dynamic lesson extraction produced no usable concepts.");
        return null;
      }

      const validation = validateLesson(lesson, `dynamic:${lesson.lessonId}`);
      if (!validation.valid) {
        console.warn(
          "⚠️ Dynamic lesson extraction failed schema validation:",
          validation.errors.map((error) => `${error.field}: ${error.message}`)
        );
        return null;
      }

      return lesson;
    } catch (err) {
      console.warn("⚠️ Dynamic lesson extraction from database passages failed:", err);
      return null;
    }
  }

  // Reads document passages from Qdrant.
  public async scrollPoints(
    limit: number = 50,
    offset?: string | number
  ): Promise<{ points: any[]; nextOffset?: string | number }> {
    try {
      const response = await axios.post(
        `${this.qdrantBaseUrl}/collections/${this.collectionName}/points/scroll`,
        {
          limit,
          offset,
          with_payload: true,
          with_vector: false,
        },
        { timeout: 5000 }
      );

      const result = response.data?.result;
      const points = (result?.points || []).map((pt: any) => ({
        id: pt.id,
        score: 1.0,
        payload: pt.payload || {},
      }));

      return {
        points,
        nextOffset: result?.next_page_offset,
      };
    } catch (error) {
      return { points: [] };
    }
  }

  // Finds keyword matches within the chapter page range.
  public async searchByKeywordPayload(
    keyword: string,
    limit: number = 10,
    bounds?: SearchPageBounds
  ): Promise<IngestionSearchChunk[]> {
    try {
      const scrollResult = await this.scrollPoints(200);
      const lowerKey = keyword.toLowerCase();
      const keywords = lowerKey.split(/\s+/).filter((k) => k.length > 2);

      const matched = scrollResult.points.filter((pt) => {
        const payload = pt.payload || {};
        const text = (payload.text || "").toLowerCase();
        const filename = (payload.filename || "").toLowerCase();

        // Accept only the selected textbook and page range.
        if (!this.isWithinBounds(payload, bounds)) {
          return false;
        }

        // Check the passage text and filename.
        if (text.includes(lowerKey) || filename.includes(lowerKey)) {
          return true;
        }

        return keywords.some((k) => text.includes(k));
      });

      return matched.slice(0, limit).map((pt) => ({
        id: String(pt.id),
        score: 0.85,
        text: pt.payload.text || "",
        filename: pt.payload.filename || "",
        pages: pt.payload.pages || [],
        page_start: pt.payload.page_start || 0,
        chunk_index: pt.payload.chunk_index || 0,
        payload: pt.payload || {},
        retrievalMode: "keyword",
      }));
    } catch {
      return [];
    }
  }

  private isWithinBounds(
    payload: Record<string, unknown>,
    bounds?: SearchPageBounds
  ): boolean {
    if (!bounds) return true;

    const filename = String(payload.filename || "").toLowerCase();
    const pageStart = Number(payload.page_start || 0);
    const pages = Array.isArray(payload.pages)
      ? payload.pages.map(Number).filter(Number.isFinite)
      : [];
    const overlaps = (minPage: number, maxPage: number): boolean =>
      (pageStart >= minPage && pageStart <= maxPage) ||
      pages.some((page) => page >= minPage && page <= maxPage);

    if (bounds.sources && bounds.sources.length > 0) {
      return bounds.sources.some(
        (source) =>
          matchesTextbookFilename(filename, source.filename) &&
          overlaps(source.minPage, source.maxPage)
      );
    }

    if (
      bounds.filename &&
      !matchesTextbookFilename(filename, bounds.filename)
    ) {
      return false;
    }

    if (bounds.minPage === undefined || bounds.maxPage === undefined) {
      return true;
    }

    return overlaps(bounds.minPage, bounds.maxPage);
  }

  private toSearchChunk(
    point: { id: string | number; score?: number; payload?: Record<string, unknown> },
    retrievalMode: "vector" | "keyword"
  ): IngestionSearchChunk {
    const payload = point.payload || {};
    return {
      id: String(point.id),
      score: Number(point.score || 0),
      text: String(payload.text || ""),
      filename: String(payload.filename || ""),
      pages: Array.isArray(payload.pages)
        ? payload.pages.map(Number).filter(Number.isFinite)
        : [],
      page_start: Number(payload.page_start || 0),
      chunk_index: Number(payload.chunk_index || 0),
      payload,
      retrievalMode,
    };
  }
}

export const qdrantService = new QdrantService();
