# Vector Retrieval Architecture

The Smart Handwritten Note Understanding Service performs retrieval directly against the Qdrant collection populated by the PDF Ingestion service. It does not change or call the ingestion service.

## Query flow

1. A client calls `GET /api/curriculum/pdf-search?q=...`.
2. `src/services/embeddingService.ts` prefixes the query with `search_query: ` and creates a normalized 768-dimensional embedding locally with `nomic-ai/nomic-embed-text-v1.5` through Transformers.js. The model is loaded once per process and cached locally.
3. `src/services/qdrantService.ts` sends that vector to Qdrant's `/points/query` API. It falls back only to Qdrant's legacy `/points/search` API for older Qdrant versions.
4. Qdrant ranks stored PDF chunks using the collection's configured cosine distance. The service then enforces the authoritative filename and PDF-page bounds from the curriculum database.
5. The ranked passages are supplied to the note-understanding pipeline as curriculum-grounding context.

## Compatibility requirement

The ingestion service embeds each chunk as `search_document: <chunk text>` using the same Nomic model, normalizes the vector, and stores it in Qdrant. The query service therefore uses `search_query: <query text>`, the same model, and expects dimension 768. Startup/configuration errors are returned explicitly; the vector search path does not silently use keyword retrieval.

## Research claim boundary

Once a deployed environment has the shared Qdrant URL, an ingested collection, and enough disk space to cache the model, this is dense vector similarity retrieval and can serve as the retrieval component of a grounded-generation/RAG pipeline. It still requires a separate retrieval evaluation (for example Recall@k and MRR with a held-out set of student queries and relevant textbook chunks) before making effectiveness claims in the research paper.
