import { PaperChunk } from '../types';

declare const pdfjsLib: any;

const setupPdfWorker = () => {
  if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
};

try {
  setupPdfWorker();
} catch (e) {
  // Gracefully ignored on initial module evaluation
}

/**
 * Checks whether buffer starts with '%PDF' signature [0x25, 0x50, 0x44, 0x46]
 */
const isPdfBinary = (buffer: ArrayBuffer): boolean => {
  if (buffer.byteLength < 4) return false;
  const header = new Uint8Array(buffer.slice(0, 4));
  return header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
};

/**
 * Extracts readable plain text from HTML content (stripping tags, scripts, styles).
 */
const extractTextFromHtml = (htmlString: string): string => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    doc.querySelectorAll('script, style, noscript, nav, header, footer, svg, iframe').forEach(el => el.remove());
    const mainContent = doc.querySelector('main, article, #content, .content, #main') || doc.body;
    return (mainContent?.textContent || doc.body?.textContent || htmlString)
      .replace(/\s\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  } catch {
    return htmlString.replace(/<[^>]*>?/gm, ' ').replace(/\s\s+/g, ' ').trim();
  }
};

/**
 * Implements a dynamic sliding window recursive splitting strategy.
 */
const adaptiveRecursiveSplit = (text: string, totalPages: number): string[] => {
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
      if ((currentChunk + separator + part).length <= chunkSize) {
        currentChunk += (currentChunk === "" ? "" : separator) + part;
      } else {
        if (currentChunk !== "") {
          finalChunks.push(currentChunk);
          const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - overlap));
          currentChunk = overlapText + (currentChunk === "" ? "" : separator) + part;
        } else {
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

  // 1. Check if the file is actually a valid PDF binary
  const isPdf = isPdfBinary(arrayBuffer);

  if (!isPdf) {
    // Decode as text/HTML
    const decoder = new TextDecoder('utf-8');
    const rawText = decoder.decode(arrayBuffer);
    const cleanText = (rawText.includes('<html') || rawText.includes('<!DOCTYPE') || rawText.includes('<body'))
      ? extractTextFromHtml(rawText)
      : rawText.trim();

    const rawChunks = adaptiveRecursiveSplit(cleanText, 1);
    const chunks: PaperChunk[] = rawChunks.map((t, idx) => ({
      id: `chunk-${idx}`,
      text: t.trim(),
      pageNumber: Math.floor(idx / 2) + 1
    }));

    if (onProgress) onProgress(100);
    return { fullText: cleanText, chunks };
  }

  // 2. Valid PDF binary parsing via PDF.js
  if (typeof pdfjsLib === 'undefined' || !pdfjsLib.getDocument) {
    throw new Error("PDF.js engine is initializing. Please re-try in a moment.");
  }

  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages || 1;
    
    let fullText = "";
    const pageMap: { start: number, page: number }[] = [];

    // Phase 1: Stream ingestion
    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => (item as any).str || "");
        const pageText = strings.join(" ");
        
        pageMap.push({ start: fullText.length, page: i });
        fullText += pageText + "\n";
      } catch (pageErr) {
        console.warn(`Error reading page ${i}:`, pageErr);
      }

      if (onProgress) {
        onProgress(Math.round((i / numPages) * 40));
      }
    }

    // Phase 2: Adaptive Semantic Chunking
    const rawChunks = adaptiveRecursiveSplit(fullText, numPages);
    const chunks: PaperChunk[] = [];
    
    let currentPos = 0;
    rawChunks.forEach((text, idx) => {
      const pageInfo = pageMap.find((m, i) => {
        const next = pageMap[i + 1];
        return currentPos >= m.start && (!next || currentPos < next.start);
      });

      chunks.push({
        id: `chunk-${idx}`,
        text: text.trim(),
        pageNumber: pageInfo ? pageInfo.page : Math.floor(idx / 3) + 1
      });
      
      currentPos += text.length;

      if (onProgress) {
        const chunkProgress = Math.round((idx / rawChunks.length) * 60);
        onProgress(40 + chunkProgress);
      }
    });

    return { fullText, chunks };
  } catch (pdfErr: any) {
    console.warn("PDF.js parse failed, falling back to direct text extraction:", pdfErr);
    const decoder = new TextDecoder('utf-8');
    const fallbackText = decoder.decode(arrayBuffer).replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    const rawChunks = adaptiveRecursiveSplit(fallbackText, 1);
    const chunks: PaperChunk[] = rawChunks.map((t, idx) => ({
      id: `chunk-${idx}`,
      text: t.trim(),
      pageNumber: Math.floor(idx / 2) + 1
    }));
    return { fullText: fallbackText, chunks };
  }
};
