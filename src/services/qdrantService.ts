import axios from "axios";
import Groq from "groq-sdk";
import { config } from "../config/config";
import { CurriculumLesson } from "../curriculum/types";
import { curriculumDbService, ChapterPageBounds } from "./curriculumDbService";

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
}

export interface SearchPageBounds {
  minPage?: number;
  maxPage?: number;
  filename?: string;
  bookPageStart?: number;
  bookPageEnd?: number;
  unitName?: string;
  textbookReference?: string;
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

const groq = new Groq({ apiKey: config.groq.apiKey });

/**
 * Service to query the Qdrant Vector Knowledge Base and Neon PostgreSQL database
 * directly with chapter-bounded search and dual-grounded page citations.
 */
export class QdrantService {
  private qdrantBaseUrl: string;
  private collectionName: string;

  constructor() {
    this.qdrantBaseUrl = config.qdrant.url.replace(/\/+$/, "");
    this.collectionName = config.qdrant.collection;
  }

  /**
   * Fetches status and statistics for the official pdf_knowledge_base collection in Qdrant.
   */
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

  /**
   * Performs dense/payload search across the ingested PDF knowledge base directly via Qdrant REST
   * with optional chapter page bounding.
   */
  public async searchKnowledgeBase(
    query: string,
    limit: number = 8,
    bounds?: SearchPageBounds
  ): Promise<IngestionSearchChunk[]> {
    if (!query || !query.trim()) return [];
    return this.searchByKeywordPayload(query, limit, bounds);
  }

  /**
   * Lists all ingested PDF textbook documents by querying the PostgreSQL database directly.
   */
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

  /**
   * Retrieves textbook passages and compiles curriculum grounding context for a note,
   * strictly bounded to the chapter's PDF and Book page ranges.
   */
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

    // 1. Look up authoritative Table of Contents chapter boundaries
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
      sourceTextbook: chapterBounds?.textbookFilename || passages[0].filename,
      textbookReference,
      chapterBounds,
      passages,
      combinedContext,
    };
  }

  /**
   * Dynamically constructs a structured CurriculumLesson from ingested PDF textbook passages
   * and chapter boundaries directly from the database knowledge base.
   */
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
      const completion = await groq.chat.completions.create({
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

      const parsed = JSON.parse(jsonStr);
      const slug = effectiveTopic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const lessonId = `db-${slug}-${effectiveGrade}`;

      return {
        lessonId,
        subject: effectiveSubject,
        grade: effectiveGrade,
        unit: parsed.unit || effectiveTopic,
        lessonName: parsed.lessonName || effectiveTopic,
        textbookReference: textbookRef,
        matchingKeywords: Array.isArray(parsed.matchingKeywords) ? parsed.matchingKeywords : [effectiveTopic.toLowerCase()],
        learningOutcomes: Array.isArray(parsed.learningOutcomes) ? parsed.learningOutcomes : [],
        concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
        definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [],
        formulae: Array.isArray(parsed.formulae) ? parsed.formulae : [],
        expectedDiagrams: Array.isArray(parsed.expectedDiagrams) ? parsed.expectedDiagrams : [],
        examKeywords: [effectiveTopic],
      };
    } catch (err) {
      console.warn("⚠️ Dynamic lesson extraction from database passages failed:", err);
      return null;
    }
  }

  /**
   * Scrolls points from the Qdrant collection to retrieve ingested document passages.
   */
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

  /**
   * Searches the Qdrant knowledge base for passages matching keywords / topic text,
   * strictly filtering within the provided chapter page boundaries.
   */
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
        const pageStart = Number(payload.page_start || 0);
        const pages = (payload.pages || []) as number[];

        // 1. Filename filter
        if (bounds?.filename && !filename.includes(bounds.filename.toLowerCase().replace(/\.pdf$/i, ""))) {
          return false;
        }

        // 2. Strict Chapter Page Range Bounding (PDF Pages)
        if (bounds?.minPage !== undefined && bounds?.maxPage !== undefined) {
          const isWithinBounds =
            (pageStart >= bounds.minPage && pageStart <= bounds.maxPage) ||
            pages.some((p) => p >= bounds.minPage! && p <= bounds.maxPage!);

          if (!isWithinBounds) {
            return false; // Reject chunks outside chapter range
          }
        }

        // 3. Keyword / text match
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
      }));
    } catch {
      return [];
    }
  }
}

export const qdrantService = new QdrantService();
