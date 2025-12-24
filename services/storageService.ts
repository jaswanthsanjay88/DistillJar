
import { ProcessedPaper } from '../types';

const DB_KEY = 'MONORESEARCH_KNOWLEDGE_BASE';

export const getPaperFromDB = (filename: string, size: number): ProcessedPaper | null => {
  const db = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  const id = `${filename}_${size}`;
  return db[id] || null;
};

export const savePaperToDB = (paper: ProcessedPaper, size: number) => {
  const db = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  const id = `${paper.filename}_${size}`;
  db[id] = paper;
  localStorage.setItem(DB_KEY, JSON.stringify(db));
};

export const clearDB = () => {
  localStorage.removeItem(DB_KEY);
};
