
import { extractDenseFacts, mergeToSection, finalizeCompressedPaper } from './ollamaService';
import { OllamaConfig } from '../types';

export interface CompressionProgress {
  stage: string;
  current: number;
  total: number;
}

/**
 * Optimizes the summarization hierarchy based on Llama 3.2 (8B) context capabilities.
 * Dynamically adjusts resolution to prevent information loss in high-density technical docs.
 */
export const compressDocument = async (
  fullText: string,
  config: OllamaConfig,
  onProgress: (p: CompressionProgress) => void
): Promise<string> => {
  const charCount = fullText.length;
  // Estimate tokens (approx 4 chars per token)
  const estTokens = charCount / 4;

  // DYNAMIC CONFIGURATION SCALING
  let blockSize: number;
  let groupSize: number;

  if (estTokens > 500000) {
    // Massive documents: 1000+ pages
    blockSize = 18000;
    groupSize = 6;
  } else if (estTokens > 100000) {
    // Medium-Large documents: 100-500 pages
    blockSize = 10000;
    groupSize = 4;
  } else if (estTokens > 20000) {
    // Standard papers
    blockSize = 5000;
    groupSize = 3;
  } else {
    // Short papers: High resolution mode
    blockSize = 2500;
    groupSize = 2;
  }

  const blocks: string[] = [];
  for (let i = 0; i < fullText.length; i += blockSize) {
    blocks.push(fullText.substring(i, Math.min(i + blockSize, fullText.length)));
  }

  // STAGE 1: ATOMIC FACT EXTRACTION (PARALLEL MAP-REDUCE)
  onProgress({ stage: 'Atomic Extraction (Parallel)', current: 0, total: blocks.length });

  // CONCURRENCY CONTROL: Limit parallel usage to prevent OOM/Crash
  const CONCURRENCY_LIMIT = 3;
  const atomicFacts: string[] = new Array(blocks.length).fill("");
  let completed = 0;

  const processBlock = async (index: number) => {
    try {
      // Enhanced prompt with strict fact-focus
      const summary = await extractDenseFacts(blocks[index], config);
      atomicFacts[index] = summary;
    } catch (e) {
      console.error("Compression block fault at index:", index, e);
      atomicFacts[index] = blocks[index].substring(0, 500) + " [TRUNCATED_ERROR]";
    } finally {
      completed++;
      onProgress({ stage: 'Atomic Extraction', current: completed, total: blocks.length });
    }
  };

  // Execution Queue
  const queue = blocks.map((_, i) => i);
  const workers = Array(CONCURRENCY_LIMIT).fill(Promise.resolve());

  // Distribute work to workers
  await Promise.all(
    workers.map(async () => {
      while (queue.length > 0) {
        const index = queue.shift();
        if (index !== undefined) await processBlock(index);
      }
    })
  );

  // STAGE 2: HIERARCHICAL CONSOLIDATION
  let currentLayer = atomicFacts;
  let layerDepth = 1;

  // Continue merging until we reach a dense target (approx 15k-20k chars)
  // or we've consolidated enough to represent the core matrix
  while (currentLayer.length > 2 && currentLayer.join(" ").length > 18000) {
    const nextLayer: string[] = [];
    for (let i = 0; i < currentLayer.length; i += groupSize) {
      const group = currentLayer.slice(i, i + groupSize);
      if (group.length === 1) {
        nextLayer.push(group[0]);
        continue;
      }
      const merged = await mergeToSection(group, config);
      nextLayer.push(merged);
    }

    currentLayer = nextLayer;
    layerDepth++;
    onProgress({
      stage: `Layer ${layerDepth} Synthesis`,
      current: atomicFacts.length - currentLayer.length,
      total: atomicFacts.length
    });
  }

  // STAGE 3: GLOBAL FINALIZATION
  onProgress({ stage: 'Finalizing Synthetic Matrix', current: 0, total: 1 });
  const finalCompressedContext = await finalizeCompressedPaper(currentLayer, config);
  onProgress({ stage: 'Finalizing Synthetic Matrix', current: 1, total: 1 });

  return finalCompressedContext;
};
