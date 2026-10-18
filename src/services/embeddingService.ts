import { config } from "../config/config";

type FeatureExtractor = (
  input: string | string[],
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ data: Float32Array | number[]; dims?: number[] }>;

let extractorPromise: Promise<FeatureExtractor> | undefined;

// Creates Nomic query vectors that match the stored document vectors.
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

  // Creates vectors for concept classification without the search prefix.
  public async embedClassificationBatch(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) return [];
    if (inputs.some((input) => !input.trim())) {
      throw new Error("Classification embedding inputs must be non-empty.");
    }

    const extractor = await this.getExtractor();
    const prepared = inputs.map((input) =>
      this.truncate(`classification: ${input.trim()}`)
    );
    const response = await extractor(prepared, {
      pooling: "mean",
      normalize: true,
    });
    const flattened = Array.from(response.data);
    const dimension = config.embedding.expectedDimension;
    if (flattened.length !== inputs.length * dimension) {
      throw new Error(
        `Classification embedding shape mismatch: received ${flattened.length} values ` +
          `for ${inputs.length} inputs; expected ${inputs.length * dimension}.`
      );
    }
    if (!flattened.every(Number.isFinite)) {
      throw new Error("Classification embedding contains non-finite values.");
    }

    return inputs.map((_, index) =>
      flattened.slice(index * dimension, (index + 1) * dimension)
    );
  }

  private async getExtractor(): Promise<FeatureExtractor> {
    if (!extractorPromise) {
      extractorPromise = (async () => {
        // Loads the ESM-only model once in this CommonJS service.
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
          // Matches the precision used for stored vectors.
          dtype: "fp32",
        });
      })();
    }
    return extractorPromise;
  }

  private truncate(text: string): string {
    // Keeps long text within the model's input limit.
    const estimatedTokens = Math.ceil(text.split(/\s+/).length * 1.3);
    if (estimatedTokens <= config.embedding.maxTokens) return text;

    const maxWords = Math.floor(config.embedding.maxTokens / 1.3);
    console.warn(`Embedding query truncated to approximately ${maxWords} words.`);
    return text.split(/\s+/).slice(0, maxWords).join(" ");
  }
}

export const embeddingService = new EmbeddingService();
