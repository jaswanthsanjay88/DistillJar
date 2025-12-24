import { PaperChunk, OllamaConfig } from "../types";

/**
 * Generate embeddings using Llama 3.2 via Ollama
 */
export const generateLlamaEmbedding = async (
    text: string,
    config: OllamaConfig
): Promise<number[]> => {
    try {
        const response = await fetch(`${config.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.model,
                prompt: text,
            }),
        });

        if (!response.ok) {
            throw new Error(`Embedding generation failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding;
    } catch (error: any) {
        console.error("Embedding generation error:", error);
        return [];
    }
};

/**
 * Calculate cosine similarity between two vectors
 */
const cosineSimilarity = (a: number[], b: number[]): number => {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
};

/**
 * Vector index for semantic search
 */
export interface VectorIndex {
    embeddings: number[][];
    chunks: PaperChunk[];
}

/**
 * Build vector index from paper chunks
 */
export const buildVectorIndex = async (
    chunks: PaperChunk[],
    config: OllamaConfig,
    onProgress?: (current: number, total: number) => void
): Promise<VectorIndex> => {
    const embeddings: number[][] = [];

    for (let i = 0; i < chunks.length; i++) {
        const embedding = await generateLlamaEmbedding(chunks[i].text, config);
        embeddings.push(embedding);

        if (onProgress) {
            onProgress(i + 1, chunks.length);
        }
    }

    return { embeddings, chunks };
};

/**
 * Retrieve most relevant chunks using semantic similarity
 */
export const retrieveRelevantChunks = (
    queryEmbedding: number[],
    index: VectorIndex,
    topK: number = 10
): PaperChunk[] => {
    if (queryEmbedding.length === 0 || index.embeddings.length === 0) {
        return index.chunks.slice(0, topK);
    }

    // Calculate similarities
    const similarities = index.embeddings.map((emb, idx) => ({
        chunk: index.chunks[idx],
        score: cosineSimilarity(queryEmbedding, emb),
    }));

    // Sort by similarity (descending) and return top K
    return similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => item.chunk);
};
