import { config } from "../config/config";

type FeatureExtractor = (
  input: string,
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ data: Float32Array | number[] }>;

let extractorPromise: Promise<FeatureExtractor> | undefined;

/**
 * Produces query vectors compatible with the vectors written by the PDF
 * Ingestion service. That service embeds documents with Nomic's
 * `search_document:` prefix; Nomic requires the matching `search_query:`
 * prefix for retrieval queries.
 */
export class EmbeddingService {
  public async embedRetrievalQuery(query: string): Promise<number[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      throw new Error("A non-empty query is required to create an embedding.");
    }

    const extractor = await this.getExtractor();
    const response = await extractor(this.truncate(`search_query: ${cleanQuery}`), {
      pooling: "mean",
      normalize: true,
    });
    const vector = Array.from(response.data);
    if (vector.length !== config.embedding.expectedDimension) {
      throw new Error(
        `Embedding dimension mismatch: received ${vector.length}, expected ${config.embedding.expectedDimension}. ` +
          "The query model must match the model used to ingest the Qdrant collection."
      );
    }

    if (!vector.every(Number.isFinite)) {
      throw new Error("Embedding provider returned a vector with non-finite values.");
    }

    return vector;
  }

  private async getExtractor(): Promise<FeatureExtractor> {
    if (!extractorPromise) {
      extractorPromise = (async () => {
        // Transformers.js is ESM-only. This dynamic import preserves this
        // service's CommonJS build while loading the local model once per process.
        const transformers = await new Function(
          "specifier",
          "return import(specifier)"
        )("@huggingface/transformers") as {
          env: { cacheDir: string; allowLocalModels: boolean };
          pipeline: (
            task: "feature-extraction",
            model: string,
            options: { dtype: "fp32" }
          ) => Promise<FeatureExtractor>;
        };

        transformers.env.cacheDir = config.embedding.cacheDir;
        transformers.env.allowLocalModels = true;
        return transformers.pipeline("feature-extraction", config.embedding.model, {
          // Use full precision so query vectors are as close as practical to
          // the SentenceTransformer vectors used during ingestion.
          dtype: "fp32",
        });
      })();
    }
    return extractorPromise;
  }

  private truncate(text: string): string {
    // Mirrors the ingestion and Learning Assistant services. It is a safe
    // word-based approximation before tokenization, preventing unexpectedly
    // long note text from exceeding the embedding model's context window.
    const estimatedTokens = Math.ceil(text.split(/\s+/).length * 1.3);
    if (estimatedTokens <= config.embedding.maxTokens) return text;

    const maxWords = Math.floor(config.embedding.maxTokens / 1.3);
    console.warn(`Embedding query truncated to approximately ${maxWords} words.`);
    return text.split(/\s+/).slice(0, maxWords).join(" ");
  }
}

export const embeddingService = new EmbeddingService();
