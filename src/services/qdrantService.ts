import axios from "axios";
import Groq from "groq-sdk";
import { config } from "../config/config";
import { CurriculumLesson } from "../curriculum/types";
import { curriculumDbService } from "./curriculumDbService";

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

export interface CurriculumRetrievalContext {
  isAvailable: boolean;
  sourceTextbook?: string;
  textbookReference?: string;
  passages: IngestionSearchChunk[];
  combinedContext: string;
  matchedLesson?: CurriculumLesson;
}

const groq = new Groq({ apiKey: config.groq.apiKey });

/**
 * Service to query the Qdrant Vector Knowledge Base (collection: pdf_knowledge_base)
 * and Neon PostgreSQL database directly for ingested textbooks, teacher guides, and syllabi.
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
   * Performs dense/payload search across the ingested PDF knowledge base directly via Qdrant REST.
   */
  public async searchKnowledgeBase(
    query: string,
    limit: number = 8,
    _scoreThreshold?: number,
    filename?: string
  ): Promise<IngestionSearchChunk[]> {
    if (!query || !query.trim()) return [];
    return this.searchByKeywordPayload(query, limit, filename);
  }

  /**
   * Lists all ingested PDF textbook documents by querying the PostgreSQL database directly,
   * with fallback to Qdrant vector storage if database is unreachable.
   */
  public async getIngestedDocuments(): Promise<IngestedDocumentInfo[]> {
    // Strategy 1: Fetch directly from PostgreSQL database (jobs table)
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

    // Strategy 2: Fallback to Qdrant point scroll
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
   * Retrieves textbook passages and compiles curriculum grounding context for a note.
   */
  public async getCurriculumTextbookContext(
    subject: string,
    topic: string,
    textSnippet?: string
  ): Promise<CurriculumRetrievalContext> {
    const s = subject && subject !== "Unknown" ? subject : "";
    const t = topic && topic !== "Unknown Topic" ? topic : "";
    const snippet = textSnippet ? textSnippet.slice(0, 300) : "";
    const query = `${s} ${t} ${snippet}`.trim() || "Science Grade 10 curriculum";
    const passages = await this.searchKnowledgeBase(query, 6);

    if (passages.length === 0) {
      return {
        isAvailable: false,
        passages: [],
        combinedContext: "",
      };
    }

    const primaryDoc = passages[0].filename;
    const allPages = Array.from(
      new Set(passages.flatMap((p) => (p.pages.length ? p.pages : [p.page_start])))
    ).filter((p) => p > 0).sort((a, b) => a - b);

    const textbookReference = primaryDoc
      ? `${primaryDoc}${allPages.length ? ` (Pages ${allPages.join(", ")})` : ""}`
      : undefined;

    const passageBlocks = passages
      .map(
        (p, i) =>
          `[Passage ${i + 1} | Source: ${p.filename || "Curriculum Textbook"} (Pages: ${p.pages.join(", ") || p.page_start || "?"})]\n${p.text}`
      )
      .join("\n\n---\n\n");

    const combinedContext = `=== Ingested Official Curriculum Knowledge Base ===\nTextbook Reference: ${textbookReference || "Official Ingested Textbook"}\n\n${passageBlocks}`;

    return {
      isAvailable: true,
      sourceTextbook: primaryDoc,
      textbookReference,
      passages,
      combinedContext,
    };
  }

  /**
   * Dynamically constructs a structured CurriculumLesson from ingested PDF textbook passages
   * when static JSON curriculum is not present or when deriving ground truth from the real textbook.
   */
  public async extractDynamicLessonFromPassages(
    subject: string,
    topic: string,
    grade: number,
    passages: IngestionSearchChunk[]
  ): Promise<CurriculumLesson | null> {
    if (!passages || passages.length === 0) return null;

    const sourceDoc = passages[0].filename || "Textbook";
    const allPages = Array.from(
      new Set(passages.flatMap((p) => (p.pages.length ? p.pages : [p.page_start])))
    ).filter((p) => p > 0).sort((a, b) => a - b);

    const textbookRef = `${sourceDoc}${allPages.length ? ` (Pages ${allPages.join(", ")})` : ""}`;
    const excerptText = passages.map((p) => p.text).join("\n\n").slice(0, 4000);

    const prompt = `You are a Sri Lankan secondary school curriculum expert.
Extract the structured syllabus elements for the topic "${topic}" (${subject} Grade ${grade || 10})
directly from these official textbook passages:

"""
${excerptText}
"""

Respond ONLY with valid JSON in this exact structure:
{
  "lessonName": "${topic}",
  "unit": "Unit/Chapter Name",
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
  "matchingKeywords": ["${topic.toLowerCase()}", "${subject.toLowerCase()}"]
}

Rules:
- weights: 1-5 (5=critical for exams, 4=very important, 3=standard, 2=supporting, 1=supplementary)
- category: one of definition, process, formula, diagram, fact, law, calculation, experiment
- Extract 5 to 12 core concepts mentioned in the textbook passages.`;

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

      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const lessonId = `pdf-${slug}-${grade || 10}`;

      return {
        lessonId,
        subject,
        grade: grade || 10,
        unit: parsed.unit || topic,
        lessonName: parsed.lessonName || topic,
        textbookReference: textbookRef,
        matchingKeywords: Array.isArray(parsed.matchingKeywords) ? parsed.matchingKeywords : [topic.toLowerCase()],
        learningOutcomes: Array.isArray(parsed.learningOutcomes) ? parsed.learningOutcomes : [],
        concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
        definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [],
        formulae: Array.isArray(parsed.formulae) ? parsed.formulae : [],
        expectedDiagrams: Array.isArray(parsed.expectedDiagrams) ? parsed.expectedDiagrams : [],
        examKeywords: [topic],
      };
    } catch (err) {
      console.warn("⚠️ Dynamic lesson extraction from textbook passages failed:", err);
      return null;
    }
  }

  /**
   * Scrolls points from the Qdrant collection to retrieve ingested document passages.
   */
  public async scrollPoints(
    limit: number = 20,
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
   * Searches the Qdrant knowledge base for passages matching keywords / topic text.
   */
  public async searchByKeywordPayload(
    keyword: string,
    limit: number = 10,
    targetFilename?: string
  ): Promise<IngestionSearchChunk[]> {
    try {
      const scrollResult = await this.scrollPoints(100);
      const lowerKey = keyword.toLowerCase();
      const keywords = lowerKey.split(/\s+/).filter((k) => k.length > 2);

      const matched = scrollResult.points.filter((pt) => {
        const text = (pt.payload.text || "").toLowerCase();
        const filename = (pt.payload.filename || "").toLowerCase();

        if (targetFilename && !filename.includes(targetFilename.toLowerCase())) {
          return false;
        }

        if (text.includes(lowerKey) || filename.includes(lowerKey)) {
          return true;
        }

        // Check keyword intersections
        return keywords.some((k) => text.includes(k));
      });

      return matched.slice(0, limit).map((pt) => ({
        id: String(pt.id),
        score: 0.75,
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
