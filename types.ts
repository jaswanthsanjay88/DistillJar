
export interface PaperChunk {
  id: string;
  text: string;
  pageNumber: number;
}

export interface ProcessedPaper {
  id: string;
  filename: string;
  fullText: string;
  chunks: PaperChunk[];
  shortformSummary: string;
  compressedContext: string;
  tokenStats: {
    original: number;
    compressed: number;
  };
  timestamp: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export enum AiEngine {
  LLAMA = 'LLAMA_LOCAL'
}

export enum AppState {
  IDLE = 'IDLE',
  PROCESSING_QUEUE = 'PROCESSING_QUEUE',
  READY = 'READY',
  ERROR = 'ERROR'
}

export type JobStatus = 'Queued' | 'Processing' | 'Completed' | 'Error';

export interface ProcessJob {
  id: string;
  file: File;
  status: JobStatus;
  progress: number;
  error?: string;
  result?: ProcessedPaper;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}
