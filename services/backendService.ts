
import { ProcessedPaper } from "../types";

const BACKEND_URL = 'http://localhost:8000';

export const processViaBackend = async (file: File, query?: string): Promise<{
  paper: Partial<ProcessedPaper>,
  answer?: string
}> => {
  const formData = new FormData();
  formData.append('file', file);
  if (query) formData.append('query', query);

  const response = await fetch(`${BACKEND_URL}/process`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "BACKEND_PROCESSING_FAILED");
  }

  const data = await response.json();
  
  return {
    paper: {
      filename: data.filename,
      compressedContext: data.compressed_context,
      shortformSummary: data.summary,
      tokenStats: {
        original: data.stats.original_chars,
        compressed: data.stats.compressed_chars
      }
    },
    answer: data.answer
  };
};
