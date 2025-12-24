
import { PaperChunk } from '../types';

declare const pdfjsLib: any;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/**
 * Implements a dynamic sliding window recursive splitting strategy.
 * Adjusts chunk size and overlap based on document scale to maintain context for LLM processing.
 */
const adaptiveRecursiveSplit = (text: string, totalPages: number): string[] => {
  // Config scaling based on document depth
  const isLargeDoc = totalPages > 100;
  const chunkSize = isLargeDoc ? 4000 : 2500;
  const overlap = isLargeDoc ? 800 : 400;
  
  const separators = ["\n\n", "\n", ". ", "? ", "! ", " ", ""];
  const finalChunks: string[] = [];
  
  const splitRecursively = (content: string, separatorIdx: number) => {
    if (content.length <= chunkSize) {
      finalChunks.push(content);
      return;
    }

    if (separatorIdx >= separators.length) {
      // Hard split as last resort with sliding window overlap
      for (let i = 0; i < content.length; i += (chunkSize - overlap)) {
        finalChunks.push(content.substring(i, Math.min(i + chunkSize, content.length)));
      }
      return;
    }

    const separator = separators[separatorIdx];
    const parts = content.split(separator);
    let currentChunk = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      // Check if adding this part exceeds chunk size
      if ((currentChunk + separator + part).length <= chunkSize) {
        currentChunk += (currentChunk === "" ? "" : separator) + part;
      } else {
        if (currentChunk !== "") {
          finalChunks.push(currentChunk);
          
          // Implementation of sliding window: 
          // Re-seed the next chunk with a portion of the previous one for context
          const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - overlap));
          currentChunk = overlapText + (currentChunk === "" ? "" : separator) + part;
        } else {
          // If a single part is larger than chunkSize, recurse deeper
          splitRecursively(part, separatorIdx + 1);
        }
      }
    }
    if (currentChunk !== "") finalChunks.push(currentChunk);
  };

  splitRecursively(text, 0);
  return finalChunks;
};

export const parsePdf = async (file: File, onProgress?: (p: number) => void): Promise<{ fullText: string, chunks: PaperChunk[] }> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  
  let fullText = "";
  const pageMap: { start: number, page: number }[] = [];

  // Phase 1: Stream ingestion
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => (item as any).str);
    const pageText = strings.join(" ");
    
    pageMap.push({ start: fullText.length, page: i });
    fullText += pageText + " ";

    if (onProgress) {
      onProgress(Math.round((i / numPages) * 40));
    }
  }

  // Phase 2: Adaptive Semantic Chunking
  const rawChunks = adaptiveRecursiveSplit(fullText, numPages);
  const chunks: PaperChunk[] = [];
  
  let currentPos = 0;
  rawChunks.forEach((text, idx) => {
    // Determine page number by searching the nearest start index in pageMap
    const pageInfo = pageMap.find((m, i) => {
      const next = pageMap[i + 1];
      return currentPos >= m.start && (!next || currentPos < next.start);
    });

    chunks.push({
      id: `chunk-${idx}`,
      text: text.trim(),
      pageNumber: pageInfo ? pageInfo.page : 1
    });
    
    // We increment by a factor that accounts for overlap in the search logic, 
    // but for simple mapping we use raw text length
    currentPos += text.length;

    if (onProgress) {
      const chunkProgress = Math.round((idx / rawChunks.length) * 60);
      onProgress(40 + chunkProgress);
    }
  });

  return { fullText, chunks };
};
