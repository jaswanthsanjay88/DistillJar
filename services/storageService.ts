/**
 * DistillJar High-Capacity Local Vault Storage Service
 * Uses IndexedDB for multi-gigabyte document capacity + in-memory cache,
 * eliminating the 5MB browser localStorage bottleneck.
 */

import { ProcessedPaper } from '../types';

const DB_NAME = 'DistillJarVault';
const DB_VERSION = 1;
const STORE_NAME = 'papers';

// In-memory cache for fast synchronous UI access
let memoryCache: Record<string, ProcessedPaper> = {};
let dbInitialized = false;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Initialize and populate in-memory cache from IndexedDB on startup
 */
export const initStorage = async (): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const papers: ProcessedPaper[] = request.result || [];
        memoryCache = {};
        for (const p of papers) {
          memoryCache[p.id] = p;
        }
        dbInitialized = true;
        resolve();
      };
      request.onerror = () => {
        resolve();
      };
    });
  } catch (e) {
    console.warn('Storage fallback to in-memory only:', e);
  }
};

// Immediate background initialization
initStorage();

export const getPaperFromDB = (filename: string, size?: number): ProcessedPaper | null => {
  // 1. Search in memory cache
  for (const paper of Object.values(memoryCache)) {
    if (paper.filename === filename) {
      return paper;
    }
  }
  return null;
};

export const savePaperToDB = async (paper: ProcessedPaper, size?: number): Promise<void> => {
  memoryCache[paper.id] = paper;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(paper);
  } catch (e) {
    console.warn('Failed to persist paper to IndexedDB:', e);
  }
};

export const getAllPapersFromDB = (): ProcessedPaper[] => {
  return Object.values(memoryCache);
};

export const deletePaperFromDB = async (filename: string): Promise<void> => {
  let targetId: string | null = null;
  for (const [id, paper] of Object.entries(memoryCache)) {
    if (paper.filename === filename) {
      targetId = id;
      delete memoryCache[id];
      break;
    }
  }

  if (targetId) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(targetId);
    } catch (e) {
      console.warn('Failed to delete from IndexedDB:', e);
    }
  }
};

export const getStorageUsage = (): { count: number; estimatedSizeKb: number } => {
  const papers = Object.values(memoryCache);
  const count = papers.length;
  let totalChars = 0;
  for (const p of papers) {
    totalChars += (p.fullText?.length || 0) + (p.compressedContext?.length || 0);
  }
  const estimatedSizeKb = Math.round(totalChars / 1024);
  return { count, estimatedSizeKb };
};

export const clearDB = async (): Promise<void> => {
  memoryCache = {};
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch (e) {
    console.warn('Failed to clear IndexedDB:', e);
  }
};
