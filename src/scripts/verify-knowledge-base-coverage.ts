import axios from "axios";
import { config } from "../config/config";
import { TEXTBOOK_TOC_REGISTRY } from "../services/curriculumDbService";
import {
  getTextbookStorageSources,
  matchesTextbookFilename,
} from "../services/textbookFilename";

interface StoredPoint {
  payload?: {
    filename?: string;
    page_start?: number;
    pages?: number[];
  };
}

const targetScopes = new Set([
  "Science|10",
  "Science|11",
  "History|10",
  "History|11",
]);

const scrollAllPoints = async (): Promise<StoredPoint[]> => {
  const points: StoredPoint[] = [];
  let offset: string | number | undefined;
  do {
    const body: Record<string, unknown> = {
      limit: 500,
      with_payload: true,
      with_vector: false,
    };
    if (offset !== undefined) body.offset = offset;
    const response = await axios.post(
      `${config.qdrant.url.replace(/\/+$/, "")}/collections/${config.qdrant.collection}/points/scroll`,
      body,
      { timeout: 10000 }
    );
    const result = response.data?.result ?? {};
    points.push(...(result.points ?? []));
    offset = result.next_page_offset;
  } while (offset !== undefined && offset !== null);
  return points;
};

const pointPages = (point: StoredPoint): number[] => {
  const payload = point.payload ?? {};
  const pages = Array.isArray(payload.pages) ? payload.pages.map(Number) : [];
  const start = Number(payload.page_start);
  if (Number.isFinite(start)) pages.push(start);
  return pages.filter((page) => Number.isFinite(page) && page > 0);
};

const main = async (): Promise<void> => {
  const points = await scrollAllPoints();
  const chapters = TEXTBOOK_TOC_REGISTRY.filter((chapter) =>
    targetScopes.has(`${chapter.subject}|${chapter.grade}`)
  );
  const chapterResults = chapters.map((chapter) => {
    const sources = getTextbookStorageSources(chapter.textbookFilename).map(
      (source) => ({
        filename: source.filename,
        minPage: chapter.pdfPageStart + source.pageOffset,
        maxPage: chapter.pdfPageEnd + source.pageOffset,
      })
    );
    const matchedPoints = points.filter((point) => {
      const filename = String(point.payload?.filename ?? "");
      const pages = pointPages(point);
      return sources.some(
        (source) =>
          matchesTextbookFilename(filename, source.filename) &&
          pages.some(
            (page) => page >= source.minPage && page <= source.maxPage
          )
      );
    });
    return {
      subject: chapter.subject,
      grade: chapter.grade,
      unitNumber: chapter.unitNumber,
      unitName: chapter.unitName,
      textbookFilename: chapter.textbookFilename,
      pdfPages: `${chapter.pdfPageStart}-${chapter.pdfPageEnd}`,
      matchingChunks: matchedPoints.length,
    };
  });

  const scopeResults = [...targetScopes].map((scope) => {
    const [subject, gradeText] = scope.split("|");
    const rows = chapterResults.filter(
      (row) => row.subject === subject && row.grade === Number(gradeText)
    );
    return {
      subject,
      grade: Number(gradeText),
      registeredUnits: rows.length,
      groundedUnits: rows.filter((row) => row.matchingChunks > 0).length,
      matchingChunks: rows.reduce((sum, row) => sum + row.matchingChunks, 0),
      missingUnits: rows
        .filter((row) => row.matchingChunks === 0)
        .map((row) => `${row.unitNumber}: ${row.unitName}`),
    };
  });
  const missing = chapterResults.filter((row) => row.matchingChunks === 0);
  const report = {
    checkedAt: new Date().toISOString(),
    collection: config.qdrant.collection,
    collectionPoints: points.length,
    scopes: scopeResults,
    valid: missing.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (missing.length > 0) {
    console.error("Units without bounded textbook chunks:");
    console.error(JSON.stringify(missing, null, 2));
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
