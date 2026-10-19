import { config } from "../config/config";

/** Central auth for every Notes Qdrant reader, including fetch-based references. */
export const qdrantHeaders = (): Record<string, string> =>
  config.qdrant.apiKey ? { "api-key": config.qdrant.apiKey } : {};
export const qdrantRequestOptions = (timeout: number) => ({ timeout, headers: qdrantHeaders() });
export const qdrantCollectionUrl = () =>
  `${config.qdrant.url.replace(/\/+$/, "")}/collections/${encodeURIComponent(config.qdrant.collection)}`;

/** Normalize a declared source convention, never guess from a retrieved page.
 * The verified upstream v2 writer uses one-based PDF pages. */
export function knowledgeBasePdfPages(payload: Record<string, unknown>): number[] {
  const raw = Array.isArray(payload.pages) ? payload.pages : [];
  const pages = [...raw, payload.page_start].filter((page): page is number =>
    typeof page === "number" && Number.isInteger(page) && page >= config.qdrant.payloadPageBase);
  return [...new Set(pages.map(page => page + (config.qdrant.payloadPageBase === 0 ? 1 : 0)))].sort((a, b) => a - b);
}

export function qdrantFailure(operation: string, error: unknown): Error {
  const status = (error as { response?: { status?: number } })?.response?.status;
  // Never propagate Axios config/headers or a provider's raw error to route logs.
  return new Error(`Knowledge base ${operation} failed${status ? ` (HTTP ${status})` : ""}. Check QDRANT_DB_URL, QDRANT_API_KEY and the v2 collection.`);
}
