import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessedPaper, ChatMessage, ProcessJob, OllamaConfig } from './types';
import { parsePdf } from './services/pdfService';
import { llamaRagQuery, checkOllamaStatus } from './services/ollamaService';
import { compressDocument } from './services/compressionService';
import { initStorage, getPaperFromDB, savePaperToDB, getAllPapersFromDB, deletePaperFromDB, getStorageUsage, clearDB } from './services/storageService';
import { searchExternal, SearXNGResult } from './services/searxngService';
import { buildVectorIndex, VectorIndex } from './services/llamaVectorService';
import showdown from 'showdown';

// --- AUTHENTIC LOGO & SF SYMBOLS ---
const DistillJarLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(20,20)">
      <rect x="0" y="0" width="34" height="34" fill="#EDEDEA" />
      <rect x="0" y="40" width="34" height="34" fill="#8A8A85" />
      <rect x="0" y="80" width="34" height="34" fill="#EDEDEA" />
      <rect x="0" y="120" width="34" height="34" fill="#8A8A85" />
      <rect x="0" y="160" width="34" height="34" fill="#EDEDEA" />

      <rect x="40" y="0" width="34" height="34" fill="#8A8A85" />
      <rect x="80" y="0" width="34" height="34" fill="#EDEDEA" />
      <rect x="120" y="20" width="34" height="34" fill="#8A8A85" />
      <rect x="140" y="60" width="34" height="34" fill="#EDEDEA" />
      <rect x="140" y="100" width="34" height="34" fill="#8A8A85" />
      <rect x="120" y="140" width="34" height="34" fill="#EDEDEA" />
      <rect x="80" y="160" width="34" height="34" fill="#8A8A85" />
      <rect x="40" y="160" width="34" height="34" fill="#EDEDEA" />

      <g transform="translate(60,72) rotate(45)">
        <rect x="0" y="0" width="30" height="30" fill="#3A3A38" />
      </g>
    </g>
  </svg>
);

const ChevronRight = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronLeft = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const BookIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
    <path d="M6 6h10" />
    <path d="M6 10h10" />
  </svg>
);

const BubbleIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

const DocIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const GearIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const SendArrow = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const SearchIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const PlusIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CopyIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="13" height="13" x="9" y="9" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const SunIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const GlobeIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const DownloadIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// --- HELPER: PARSE ARXIV / DOI IDS ---
const parseArxivId = (input: string): string | null => {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
  if (urlMatch) return urlMatch[1];

  const doiMatch = trimmed.match(/10\.48550\/arXiv\.([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
  if (doiMatch) return doiMatch[1];

  const directMatch = trimmed.match(/^([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)$/i);
  if (directMatch) return directMatch[1];

  return null;
};

// --- SPOTLIGHT-STYLE COMMAND PALETTE (⌘K / Ctrl+K) ---
const CommandPalette: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  papers: ProcessedPaper[];
  onSelectPaper: (p: ProcessedPaper) => void;
  onUploadClick: () => void;
  onOpenSettings: () => void;
  onSwitchView: (mode: 'synthesis' | 'matrix' | 'chunks') => void;
  onArxivIngest: (arxivId: string) => void;
  theme: 'dark' | 'light';
}> = ({ isOpen, onClose, papers, onSelectPaper, onUploadClick, onOpenSettings, onSwitchView, onArxivIngest, theme }) => {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const detectedArxiv = parseArxivId(search);
  const filtered = papers.filter(p => p.filename.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-20 bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} />
      <div
        className={`relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border ${
          theme === 'dark' ? 'bg-[#1C1C1E] border-[#38383A] text-white' : 'bg-white border-[#E5E5EA] text-black'
        }`}
      >
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-[#38383A]/30 flex items-center gap-3">
          <SearchIcon className="w-5 h-5 text-[#007AFF] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter') {
                if (detectedArxiv) {
                  onArxivIngest(detectedArxiv);
                  onClose();
                } else if (filtered.length > 0) {
                  onSelectPaper(filtered[0]);
                  onClose();
                }
              }
            }}
            placeholder="Search papers, arXiv URL/ID, actions... (ESC to exit)"
            className="w-full bg-transparent focus:outline-none text-[16px] placeholder:text-[#8E8E93]"
          />
          <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#8E8E93]/20 text-[#8E8E93] shrink-0">ESC</kbd>
        </div>

        {/* Action & Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar text-[14px]">
          {/* 1-Tap arXiv Action */}
          {detectedArxiv && (
            <button
              onClick={() => { onArxivIngest(detectedArxiv); onClose(); }}
              className="w-full text-left p-2.5 rounded-xl bg-[#007AFF] text-white flex items-center justify-between font-medium active:scale-[0.98] transition-all mb-1"
            >
              <span className="flex items-center gap-2">
                <DownloadIcon className="w-4 h-4" />
                <span>1-Tap Ingest arXiv: <strong>{detectedArxiv}</strong></span>
              </span>
              <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-mono">Press ↵</span>
            </button>
          )}

          {/* Quick Actions */}
          <div className="px-3 py-1 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">
            Quick Actions
          </div>
          <button
            onClick={() => { onClose(); onUploadClick(); }}
            className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition-colors"
          >
            <span className="flex items-center gap-2">
              <PlusIcon className="w-4 h-4 text-[#007AFF]" />
              <span>Upload Document</span>
            </span>
            <kbd className="text-[11px] font-mono text-[#8E8E93]">⌘O</kbd>
          </button>

          <button
            onClick={() => { onClose(); onOpenSettings(); }}
            className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition-colors"
          >
            <span className="flex items-center gap-2">
              <GearIcon className="w-4 h-4 text-[#007AFF]" />
              <span>Open Settings</span>
            </span>
            <kbd className="text-[11px] font-mono text-[#8E8E93]">⌘,</kbd>
          </button>

          {/* View Modes */}
          <div className="px-3 py-1 pt-2 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">
            Switch View
          </div>
          <button
            onClick={() => { onClose(); onSwitchView('synthesis'); }}
            className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition-colors"
          >
            <span className="flex items-center gap-2">
              <DocIcon className="w-4 h-4 text-[#007AFF]" />
              <span>Summary View</span>
            </span>
            <kbd className="text-[11px] font-mono text-[#8E8E93]">⌘1</kbd>
          </button>
          <button
            onClick={() => { onClose(); onSwitchView('matrix'); }}
            className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition-colors"
          >
            <span className="flex items-center gap-2">
              <BookIcon className="w-4 h-4 text-[#007AFF]" />
              <span>Knowledge Matrix</span>
            </span>
            <kbd className="text-[11px] font-mono text-[#8E8E93]">⌘2</kbd>
          </button>
          <button
            onClick={() => { onClose(); onSwitchView('chunks'); }}
            className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition-colors"
          >
            <span className="flex items-center gap-2">
              <DocIcon className="w-4 h-4 text-[#007AFF]" />
              <span>Pages & Citations</span>
            </span>
            <kbd className="text-[11px] font-mono text-[#8E8E93]">⌘3</kbd>
          </button>

          {/* Papers in Vault */}
          {papers.length > 0 && (
            <>
              <div className="px-3 py-1 pt-2 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">
                Papers in Vault ({filtered.length})
              </div>
              {filtered.map(paper => (
                <button
                  key={paper.id}
                  onClick={() => { onSelectPaper(paper); onClose(); }}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition-colors"
                >
                  <span className="truncate pr-2">{paper.filename.replace(/\.pdf$/i, '')}</span>
                  <span className="text-[11px] text-[#8E8E93] shrink-0">{paper.chunks.length} pages</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// --- AUTHENTIC APPLE UISWITCH TOGGLE (Apple Green #34C759 / Blue #007AFF) ---
const IOSToggle: React.FC<{ checked: boolean; onChange: () => void; color?: 'green' | 'blue' }> = ({
  checked,
  onChange,
  color = 'green',
}) => {
  const activeBg = color === 'green' ? 'bg-[#34C759]' : 'bg-[#007AFF]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full p-[2px] transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? activeBg : 'bg-[#E9E9EB] dark:bg-[#39393D]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-[20px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
};

// --- APPLE-STYLE NATIVE LAUNCH SPLASH COMPONENT ---
const AppleLaunchSplash: React.FC<{ isExiting: boolean; theme: 'dark' | 'light' }> = ({ isExiting, theme }) => {
  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-all ${
        isExiting ? 'apple-launch-exit pointer-events-none' : 'apple-launch-in'
      } ${
        theme === 'dark' ? 'bg-[#000000]' : 'bg-[#F2F2F7]'
      }`}
    >
      <div className="flex flex-col items-center gap-5 select-none">
        <div className="relative">
          <DistillJarLogo className="w-20 h-20 drop-shadow-[0_8px_30px_rgba(0,122,255,0.25)]" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={`text-[16px] font-semibold tracking-[0.14em] uppercase ${
            theme === 'dark' ? 'text-white' : 'text-black'
          }`}>
            DistillJar
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-ping" />
            <span className="text-[12px] text-[#8E8E93] tracking-wide">
              Local Intelligence Vault
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EnhancedMessage extends ChatMessage {
  sources?: { title: string; uri: string }[];
}

const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('THEME') as 'dark' | 'light') || 'dark';
  });

  const [showSplash, setShowSplash] = useState(true);
  const [isExitingSplash, setIsExitingSplash] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExitingSplash(true);
      setTimeout(() => setShowSplash(false), 220);
    }, 380);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('THEME', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const [queue, setQueue] = useState<ProcessJob[]>([]);
  const [activePaper, setActivePaper] = useState<ProcessedPaper | null>(null);
  const [vectorIndex, setVectorIndex] = useState<VectorIndex | null>(null);
  const [messages, setMessages] = useState<EnhancedMessage[]>([]);
  const [input, setInput] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Mobile Bottom Tab State: 'library' | 'reading' | 'assistant'
  const [mobileTab, setMobileTab] = useState<'library' | 'reading' | 'assistant'>('library');

  const [showConfig, setShowConfig] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [isFetchingArxiv, setIsFetchingArxiv] = useState(false);
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<'synthesis' | 'matrix' | 'chunks'>('synthesis');
  const [chunkSearch, setChunkSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState("");

  const [ollamaConfig, setOllamaConfig] = useState<OllamaConfig>(() => {
    const saved = localStorage.getItem('OLLAMA_CONFIG');
    return saved ? JSON.parse(saved) : { baseUrl: 'http://localhost:11434', model: 'llama3.2:latest' };
  });

  // Global Keyboard Shortcuts (⌘K, ⌘O, ⌘1, ⌘2, ⌘3, ⌘,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K -> Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      // ⌘O or Ctrl+O -> Open File Picker
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      // ⌘, or Ctrl+, -> Open Settings
      else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowConfig(true);
      }
      // ⌘1 -> Summary View
      else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setViewMode('synthesis');
      }
      // ⌘2 -> Matrix View
      else if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setViewMode('matrix');
      }
      // ⌘3 -> Pages View
      else if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        setViewMode('chunks');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Interactive Citation Jump Handler
  const jumpToPage = (pageNum: number) => {
    setViewMode('chunks');
    setMobileTab('reading');
    setHighlightedPage(pageNum);
    setTimeout(() => {
      const el = document.getElementById(`chunk-page-${pageNum}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    setTimeout(() => setHighlightedPage(null), 3000);
  };

  // 1-Tap arXiv Ingest Handler
  const handleArxivIngest = async (arxivId: string) => {
    setIsFetchingArxiv(true);
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    try {
      const resp = await fetch(pdfUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const file = new File([blob], `arxiv_${arxivId}.pdf`, { type: 'application/pdf' });
      const newJob: ProcessJob = {
        id: Math.random().toString(36).substring(2, 9),
        file,
        status: 'Queued',
        progress: 0
      };
      setQueue(prev => [newJob, ...prev]);
      setSidebarFilter("");
      setShowCommandPalette(false);
    } catch (e) {
      console.warn("Direct arXiv download fallback", e);
      alert(`Direct browser download from arXiv was blocked by CORS. You can download and drop ${pdfUrl} into DistillJar.`);
    } finally {
      setIsFetchingArxiv(false);
    }
  };

  const [ollamaStatus, setOllamaStatus] = useState<{ online: boolean; models: string[]; latencyMs?: number; checking?: boolean; error?: string }>({
    online: false,
    models: []
  });

  const [storageInfo, setStorageInfo] = useState(getStorageUsage());

  useEffect(() => {
    initStorage().then(() => {
      const savedPapers = getAllPapersFromDB();
      if (savedPapers.length > 0) {
        const restoredJobs: ProcessJob[] = savedPapers.map(p => ({
          id: p.id,
          file: new File([], p.filename, { type: 'application/pdf' }),
          status: 'Completed',
          progress: 100,
          result: p
        }));
        setQueue(restoredJobs);
        setActivePaper(savedPapers[0]);
        setStorageInfo(getStorageUsage());
      }
    });
    checkHealth();
  }, []);

  const checkHealth = async () => {
    setOllamaStatus(prev => ({ ...prev, checking: true }));
    const status = await checkOllamaStatus(ollamaConfig.baseUrl);
    setOllamaStatus({ ...status, checking: false });
  };

  const converter = useMemo(() => {
    return new showdown.Converter({
      tables: true,
      strikethrough: true,
      tasklists: true,
      simpleLineBreaks: true,
      openLinksInNewWindow: true,
      ghCodeBlocks: true,
    });
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating, isSearching]);

  // Sequential Processing Queue
  useEffect(() => {
    const processNext = async () => {
      const nextJob = queue.find(j => j.status === 'Queued');
      if (!nextJob || queue.some(j => j.status === 'Processing')) return;

      updateJob(nextJob.id, { status: 'Processing', progress: 5 });

      try {
        let result: ProcessedPaper;
        const cached = getPaperFromDB(nextJob.file.name, nextJob.file.size);

        if (cached) {
          result = cached;
          updateJob(nextJob.id, { progress: 100 });
        } else {
          const { fullText, chunks } = await parsePdf(nextJob.file, (p) => {
            updateJob(nextJob.id, { progress: Math.round(p * 0.3) });
          });

          const compressedContext = await compressDocument(fullText, ollamaConfig, (cp) => {
            const baseProgress = 30;
            const compressionStep = Math.round((cp.current / cp.total) * 60);
            updateJob(nextJob.id, { progress: baseProgress + compressionStep });
          });

          result = {
            id: Math.random().toString(36).substring(2, 11),
            filename: nextJob.file.name,
            fullText,
            chunks,
            shortformSummary: "Hierarchical distillation complete. Core technical contributions, theorems, and empirical findings indexed.",
            compressedContext,
            tokenStats: { original: fullText.length, compressed: compressedContext.length },
            timestamp: Date.now()
          };
          savePaperToDB(result, nextJob.file.size);
          setStorageInfo(getStorageUsage());
        }

        if (result.chunks.length > 0) {
          updateJob(nextJob.id, { progress: 95 });
          const index = await buildVectorIndex(result.chunks, ollamaConfig);
          setVectorIndex(index);
        }

        updateJob(nextJob.id, { status: 'Completed', progress: 100, result });
        if (!activePaper) setActivePaper(result);
        setMobileTab('reading');
      } catch (err: any) {
        updateJob(nextJob.id, { status: 'Error', error: err.message });
      }
    };

    processNext();
  }, [queue, activePaper, ollamaConfig]);

  const updateJob = (id: string, updates: Partial<ProcessJob>) => {
    setQueue(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files: File[] = Array.from(fileList);
    const newJobs: ProcessJob[] = files.map(file => ({
      id: Math.random().toString(36).substring(2, 11),
      file,
      status: 'Queued',
      progress: 0
    }));
    setQueue(prev => [...prev, ...newJobs]);
    e.target.value = "";
  };

  const handleDeletePaper = (jobId: string, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deletePaperFromDB(filename);
    setQueue(prev => prev.filter(j => j.id !== jobId));
    if (activePaper?.filename === filename) {
      const remaining = queue.filter(j => j.id !== jobId && j.result);
      setActivePaper(remaining.length > 0 ? remaining[0].result || null : null);
    }
    setStorageInfo(getStorageUsage());
  };

  const handleSendMessage = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const queryText = (customPrompt || input).trim();
    if (!queryText || !activePaper || isGenerating) return;

    setInput("");
    setMessages(prev => [...prev, { role: 'user', content: queryText, timestamp: Date.now() }]);
    setIsGenerating(true);

    let webResults: SearXNGResult[] = [];
    if (searchEnabled) {
      setIsSearching(true);
      webResults = await searchExternal(queryText);
      setIsSearching(false);
    }

    try {
      const responseText = await llamaRagQuery(queryText, activePaper.compressedContext, webResults, ollamaConfig);
      const sources = webResults.map(r => ({ title: r.title, uri: r.url }));

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
        sources: sources.length > 0 ? sources : undefined
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Error**: ${err.message}\n\nPlease check Ollama at \`${ollamaConfig.baseUrl}\`.`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredJobs = queue.filter(j => j.file.name.toLowerCase().includes(sidebarFilter.toLowerCase()));
  const filteredChunks = activePaper?.chunks.filter(c => 
    chunkSearch === "" || 
    c.text.toLowerCase().includes(chunkSearch.toLowerCase()) || 
    `page ${c.pageNumber}`.toLowerCase().includes(chunkSearch.toLowerCase())
  ) || [];

  const compressionRatio = activePaper ? Math.max(0, Math.round((1 - activePaper.tokenStats.compressed / activePaper.tokenStats.original) * 100)) : 0;

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden select-none transition-colors duration-150 ${
      theme === 'dark' ? 'bg-[#000000] text-[#FFFFFF]' : 'bg-[#F2F2F7] text-[#000000]'
    }`}>
      {/* Apple-Style Native Launch Splash */}
      {showSplash && <AppleLaunchSplash isExiting={isExitingSplash} theme={theme} />}

      {/* Spotlight Command Palette (⌘K) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        papers={getAllPapersFromDB()}
        onSelectPaper={(p) => {
          setActivePaper(p);
          setMobileTab('reading');
        }}
        onUploadClick={() => fileInputRef.current?.click()}
        onOpenSettings={() => setShowConfig(true)}
        onSwitchView={(mode) => setViewMode(mode)}
        onArxivIngest={handleArxivIngest}
        theme={theme}
      />
      
      {/* ========================================================================= */}
      {/* DESKTOP / IPAD SPLIT VIEW (md:flex) & MOBILE ROUTING CONTAINER           */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ----------------------------------------------------------------------- */}
        {/* 1. LIBRARY PANE (iOS Inset Grouped List)                                 */}
        {/* ----------------------------------------------------------------------- */}
        <aside className={`w-full md:w-80 border-r flex flex-col shrink-0 z-20 transition-all ${
          mobileTab !== 'library' ? 'hidden md:flex' : 'flex'
        } ${
          theme === 'dark' ? 'bg-[#000000] border-[#38383A]' : 'bg-[#F2F2F7] border-[#C6C6C8]'
        }`}>
          {/* iOS Navigation Bar with Large Title */}
          <div className="pt-4 px-4 pb-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <DistillJarLogo className="w-5 h-5 shrink-0" />
                <span className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wider">
                  DistillJar
                </span>
              </div>
              
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowConfig(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#007AFF] hover:bg-[#007AFF]/10 active:opacity-40 transition-all"
                  title="Settings (⌘,)"
                >
                  <GearIcon className="w-5 h-5" />
                </button>
                <label className="w-8 h-8 rounded-lg flex items-center justify-center text-[#007AFF] hover:bg-[#007AFF]/10 cursor-pointer active:opacity-40 transition-all" title="Add Document (⌘O)">
                  <input ref={fileInputRef} type="file" accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.html" multiple onChange={handleFileUpload} className="hidden" />
                  <PlusIcon className="w-5 h-5" />
                </label>
              </div>
            </div>

            <h1 className="text-[34px] font-bold tracking-tight leading-tight">
              Library
            </h1>
          </div>

          {/* iOS Search Bar & arXiv Ingest Bar */}
          <div className="px-4 py-2 space-y-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[17px] ${
              theme === 'dark' ? 'bg-[#1C1C1E] text-white' : 'bg-[#E5E5EA] text-black'
            }`}>
              <SearchIcon className="w-4 h-4 text-[#8E8E93]" />
              <input
                type="text"
                placeholder="Search or paste arXiv URL/ID..."
                value={sidebarFilter}
                onChange={(e) => setSidebarFilter(e.target.value)}
                className="bg-transparent focus:outline-none w-full text-[15px] placeholder:text-[#8E8E93]"
              />
              <button
                onClick={() => setShowCommandPalette(true)}
                className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#8E8E93]/20 text-[#8E8E93] hover:text-[#007AFF] transition-colors"
                title="Command Palette (⌘K)"
              >
                ⌘K
              </button>
            </div>

            {/* 1-Tap arXiv Ingestion Trigger */}
            {(() => {
              const arxivId = parseArxivId(sidebarFilter);
              if (!arxivId) return null;
              return (
                <button
                  onClick={() => handleArxivIngest(arxivId)}
                  disabled={isFetchingArxiv}
                  className="w-full p-2.5 rounded-xl bg-[#007AFF] text-white text-[13px] font-semibold flex items-center justify-between shadow-sm active:scale-[0.98] transition-all"
                >
                  <span className="flex items-center gap-2 truncate">
                    <DownloadIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{isFetchingArxiv ? 'Fetching arXiv Paper...' : `1-Tap Ingest: ${arxivId}`}</span>
                  </span>
                  <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-mono shrink-0">PDF</span>
                </button>
              );
            })()}
          </div>

          {/* iOS Inset Grouped Table */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 custom-scrollbar">
            {queue.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center gap-3">
                <DocIcon className="w-12 h-12 text-[#8E8E93]/40" />
                <p className="text-[17px] text-[#8E8E93]">No Papers</p>
                <label className="text-[#007AFF] font-medium text-[16px] cursor-pointer active:opacity-60">
                  <input type="file" accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.html" multiple onChange={handleFileUpload} className="hidden" />
                  Upload Document to Begin
                </label>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden shadow-sm divide-y divide-[#38383A]/40 dark:divide-[#38383A]/60">
                {filteredJobs.map(job => {
                  const isActive = activePaper?.filename === job.file.name;
                  return (
                    <div
                      key={job.id}
                      onClick={() => {
                        if (job.result) {
                          setActivePaper(job.result);
                          setMobileTab('reading');
                        }
                      }}
                      className={`group p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                        isActive
                          ? theme === 'dark' ? 'bg-[#2C2C2E]' : 'bg-[#E5E5EA]'
                          : theme === 'dark' ? 'bg-[#1C1C1E] hover:bg-[#2C2C2E]/60' : 'bg-[#FFFFFF] hover:bg-[#F2F2F7]'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[16px] font-medium truncate">
                            {job.file.name.replace(/\.pdf$/i, '')}
                          </span>
                        </div>

                        {job.status === 'Processing' ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 bg-[#8E8E93]/30 h-1 rounded-full overflow-hidden">
                              <div className="bg-[#EDEDEA] dark:bg-[#EDEDEA] h-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
                            </div>
                            <span className="text-[12px] font-mono text-[#8E8E93]">{job.progress}%</span>
                          </div>
                        ) : job.result ? (
                          <div className="mt-0.5 text-[13px] text-[#8E8E93] flex items-center gap-2">
                            <span>{job.result.chunks.length} pages</span>
                            <span>•</span>
                            <span className="text-[#8E8E93]">
                              {Math.round((1 - job.result.tokenStats.compressed / job.result.tokenStats.original) * 100)}% condensed
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 text-[#8E8E93]">
                        <button
                          onClick={(e) => handleDeletePaper(job.id, job.file.name, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-opacity"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-4 h-4 opacity-40" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar Status Footer */}
          <div className="p-3.5 border-t border-[#38383A]/30 flex items-center justify-between text-[13px] text-[#8E8E93]">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${ollamaStatus.online ? 'bg-[#EDEDEA]' : 'bg-zinc-400'}`} />
              <span>{ollamaConfig.model}</span>
            </span>
            <span>{storageInfo.count} Papers</span>
          </div>
        </aside>

        {/* ----------------------------------------------------------------------- */}
        {/* 2. READING & DISTILLATION STUDIO PANE                                   */}
        {/* ----------------------------------------------------------------------- */}
        <main className={`flex-1 flex flex-col overflow-hidden relative transition-all ${
          mobileTab !== 'reading' ? 'hidden md:flex' : 'flex'
        } ${
          theme === 'dark' ? 'bg-[#000000]' : 'bg-[#FFFFFF]'
        }`}>
          {!activePaper ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto">
              <DistillJarLogo className="w-16 h-16 mb-4 drop-shadow-md" />
              <h2 className="text-[22px] font-bold mb-1">No Document Selected</h2>
              <p className="text-[15px] text-[#8E8E93] mb-6">Choose a paper from your library or upload a new PDF.</p>
              <button
                onClick={() => setMobileTab('library')}
                className="md:hidden px-6 py-2.5 rounded-full bg-[#007AFF] text-white font-semibold text-[15px] shadow-sm active:opacity-75"
              >
                Go to Library
              </button>
            </div>
          ) : (
            /* Active Document Studio */
            <>
              {/* iOS Navigation Bar with Inline Title & Segmented Switcher */}
              <header className="ios-blur ios-nav-bg sticky top-0 z-30 px-4 py-2.5 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setMobileTab('library')}
                    className="md:hidden text-[#007AFF] font-medium text-[17px] flex items-center gap-0.5"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    <span>Library</span>
                  </button>

                  <h2 className="text-[17px] font-semibold truncate max-w-[260px] md:max-w-md mx-auto text-center">
                    {activePaper.filename.replace(/\.pdf$/i, '')}
                  </h2>

                  <button
                    onClick={() => copyToClipboard(activePaper.compressedContext, 'top-copy')}
                    className="text-[#007AFF] hover:opacity-80 active:opacity-60 font-medium text-[16px] flex items-center gap-1 transition-opacity"
                  >
                    {copiedId === 'top-copy' ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                    <span>{copiedId === 'top-copy' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* iOS UISegmentedControl */}
                <div className={`p-0.5 rounded-lg flex self-center max-w-md w-full ${
                  theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-[#E5E5EA]'
                }`}>
                  {(['synthesis', 'matrix', 'chunks'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`flex-1 py-1 rounded-[7px] text-[13px] font-medium transition-all ${
                        viewMode === mode
                          ? theme === 'dark'
                            ? 'bg-[#636366] text-white shadow-sm font-semibold'
                            : 'bg-white text-black shadow-sm font-semibold'
                          : 'text-[#8E8E93]'
                      }`}
                    >
                      {mode === 'synthesis' ? 'Summary' : mode === 'matrix' ? 'Matrix' : 'Pages'}
                    </button>
                  ))}
                </div>
              </header>

              {/* Document Reading View */}
              <div className="flex-1 overflow-y-auto px-6 py-6 md:px-12 md:py-8 custom-scrollbar">
                <div className="max-w-2xl mx-auto space-y-6">
                  {/* Paper Header */}
                  <div>
                    <h1 className="text-[28px] md:text-[34px] font-bold tracking-tight leading-tight">
                      {activePaper.filename.replace(/\.pdf$/i, '')}
                    </h1>

                    {/* Metadata Summary Pill */}
                    <div className="mt-2 flex items-center gap-2 text-[13px] text-[#8E8E93]">
                      <span>{Math.round(activePaper.tokenStats.original / 1000)}k chars</span>
                      <span>→</span>
                      <span className="font-semibold text-black dark:text-white">
                        {Math.round(activePaper.tokenStats.compressed / 1000)}k chars
                      </span>
                      <span>•</span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                        {compressionRatio}% condensed
                      </span>
                    </div>
                  </div>

                  {/* VIEW 1: SYNTHESIS */}
                  {viewMode === 'synthesis' && (
                    <article className="space-y-6">
                      <div className={`p-4 rounded-2xl ${
                        theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-[#F2F2F7]'
                      }`}>
                        <p className="text-[12px] font-semibold text-[#8E8E93] uppercase tracking-wider mb-1">
                          Executive Synthesis
                        </p>
                        <p className="text-[17px] leading-relaxed italic text-black dark:text-white">
                          "{activePaper.shortformSummary}"
                        </p>
                      </div>

                      <div
                        className="markdown-content"
                        dangerouslySetInnerHTML={{ __html: converter.makeHtml(activePaper.compressedContext) }}
                      />
                    </article>
                  )}

                  {/* VIEW 2: KNOWLEDGE MATRIX */}
                  {viewMode === 'matrix' && (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-2xl font-mono text-[13px] leading-relaxed whitespace-pre-wrap ${
                        theme === 'dark' ? 'bg-[#1C1C1E] text-zinc-300' : 'bg-[#F2F2F7] text-zinc-800'
                      }`}>
                        {activePaper.compressedContext}
                      </div>
                    </div>
                  )}

                  {/* VIEW 3: PAGES / CHUNKS */}
                  {viewMode === 'chunks' && (
                    <div className="space-y-3">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[15px] mb-4 ${
                        theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-[#E5E5EA]'
                      }`}>
                        <SearchIcon className="w-4 h-4 text-[#8E8E93]" />
                        <input
                          type="text"
                          placeholder="Search pages..."
                          value={chunkSearch}
                          onChange={(e) => setChunkSearch(e.target.value)}
                          className="bg-transparent focus:outline-none w-full text-[15px] placeholder:text-[#8E8E93]"
                        />
                      </div>

                      {filteredChunks.map((chunk, idx) => {
                        const isHighlighted = highlightedPage === chunk.pageNumber;
                        return (
                          <div
                            key={chunk.id || idx}
                            id={`chunk-page-${chunk.pageNumber}`}
                            className={`p-4 rounded-2xl transition-all duration-500 ${
                              isHighlighted
                                ? 'ring-2 ring-[#007AFF] bg-[#007AFF]/15 shadow-xl scale-[1.01]'
                                : theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-[#F2F2F7]'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-[12px] font-semibold uppercase px-2 py-0.5 rounded-full transition-colors ${
                                isHighlighted ? 'bg-[#007AFF] text-white' : 'text-[#8E8E93] bg-[#8E8E93]/10'
                              }`}>
                                Page {chunk.pageNumber}
                              </span>
                              <button
                                onClick={() => copyToClipboard(chunk.text, `chunk-${idx}`)}
                                className="text-[#007AFF] hover:opacity-80 active:opacity-60 text-[13px] font-medium transition-opacity"
                              >
                                {copiedId === `chunk-${idx}` ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <p className="text-[15px] leading-relaxed">{chunk.text}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </main>

        {/* ----------------------------------------------------------------------- */}
        {/* 3. ASSISTANT CHAT PANE                                                  */}
        {/* ----------------------------------------------------------------------- */}
        <aside className={`w-full md:w-96 border-l flex flex-col shrink-0 z-20 transition-all ${
          mobileTab !== 'assistant' ? 'hidden md:flex' : 'flex'
        } ${
          theme === 'dark' ? 'bg-[#000000] border-[#38383A]' : 'bg-[#FFFFFF] border-[#C6C6C8]'
        }`}>
          {/* iOS Chat Header */}
          <div className="ios-blur ios-nav-bg px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileTab('reading')}
                className="md:hidden text-[#007AFF] font-medium flex items-center gap-0.5 text-[17px]"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Paper</span>
              </button>
              <h3 className="text-[17px] font-semibold">Assistant</h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchEnabled(!searchEnabled)}
                className={`text-[12px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                  searchEnabled ? 'bg-[#007AFF] text-white shadow-sm' : 'bg-[#8E8E93]/20 text-[#8E8E93]'
                }`}
              >
                Web
              </button>
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} className="text-[#8E8E93] hover:text-rose-500 p-1">
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Messages Thread (iOS Messages Rhythm) */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8E8E93]">
                <BubbleIcon className="w-12 h-12 mb-2 opacity-40" />
                <p className="text-[17px] font-medium text-black dark:text-white">Ask About This Paper</p>
                <p className="text-[14px] max-w-xs mt-1">Ask questions, verify claims, or extract specific findings.</p>

                {/* Quick Prompts */}
                <div className="w-full space-y-2 mt-6">
                  {[
                    "Summarize key contributions",
                    "What are the main results?",
                    "What are the limitations?"
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(undefined, p)}
                      className={`w-full text-left p-3 rounded-xl text-[14px] flex items-center justify-between ${
                        theme === 'dark' ? 'bg-[#1C1C1E] text-white' : 'bg-[#F2F2F7] text-black'
                      }`}
                    >
                      <span>{p}</span>
                      <ChevronRight className="w-4 h-4 text-[#8E8E93]" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => {
                // Extract cited pages like [Page 4], Page 4, p. 4
                const citedPages = msg.role === 'assistant' ? Array.from(new Set(
                  Array.from(msg.content.matchAll(/(?:\[Page\s*(\d+)\]|Page\s*(\d+)|p\.\s*(\d+))/gi))
                    .map(m => parseInt(m[1] || m[2] || m[3]))
                    .filter(Boolean)
                )) : [];

                return (
                  <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] px-4 py-2.5 rounded-[18px] text-[16px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#007AFF] text-white rounded-br-[4px]'
                        : theme === 'dark'
                          ? 'bg-[#1C1C1E] text-white rounded-bl-[4px]'
                          : 'bg-[#E5E5EA] text-black rounded-bl-[4px]'
                    }`}>
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <div
                          className="markdown-content"
                          dangerouslySetInnerHTML={{ __html: converter.makeHtml(msg.content) }}
                        />
                      )}
                    </div>

                    {/* Interactive Citation Jumps */}
                    {citedPages.length > 0 && (
                      <div className="flex items-center gap-1.5 px-1 py-0.5 flex-wrap max-w-[85%]">
                        <span className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">Citations:</span>
                        {citedPages.map(pageNum => (
                          <button
                            key={pageNum}
                            onClick={() => jumpToPage(pageNum)}
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#007AFF]/15 text-[#007AFF] hover:bg-[#007AFF]/25 active:scale-95 transition-all cursor-pointer flex items-center gap-0.5"
                          >
                            <span>Page {pageNum}</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1 px-1 max-w-[85%]">
                        {msg.sources.slice(0, 2).map((s, si) => (
                          <a
                            key={si}
                            href={s.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] px-2 py-0.5 rounded-full bg-[#8E8E93]/20 text-[#007AFF] truncate max-w-[140px]"
                          >
                            {s.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {isGenerating && (
              <div className="flex items-center gap-1 p-2 text-[14px] text-[#8E8E93]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8E8E93] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#8E8E93] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#8E8E93] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>

          {/* iOS Message Input Bar */}
          <div className="p-3 border-t border-[#38383A]/30">
            <form onSubmit={(e) => handleSendMessage(e)} className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask a question... (⌘Enter to send)"
                disabled={isGenerating}
                className={`w-full rounded-full pl-4 pr-11 py-2.5 text-[15px] focus:outline-none ${
                  theme === 'dark' ? 'bg-[#1C1C1E] text-white placeholder:text-[#8E8E93]' : 'bg-[#E5E5EA] text-black placeholder:text-[#8E8E93]'
                }`}
              />
              <button
                type="submit"
                disabled={!input.trim() || isGenerating}
                className="absolute right-1.5 w-7 h-7 rounded-full bg-[#007AFF] text-white flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform shadow-sm"
              >
                <SendArrow className="w-4 h-4" />
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* ========================================================================= */}
      {/* 4. MOBILE NATIVE iOS BOTTOM TAB BAR                                       */}
      {/* ========================================================================= */}
      <nav className="md:hidden ios-blur ios-tab-bg flex items-center justify-around h-14 pb-safe shrink-0 z-40 border-t border-[#38383A]/30">
        <button
          onClick={() => setMobileTab('library')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors ${
            mobileTab === 'library' ? 'text-[#007AFF]' : 'text-[#8E8E93]'
          }`}
        >
          <DocIcon className="w-6 h-6" />
          <span>Library</span>
        </button>

        <button
          onClick={() => setMobileTab('reading')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors ${
            mobileTab === 'reading' ? 'text-[#007AFF]' : 'text-[#8E8E93]'
          }`}
        >
          <BookIcon className="w-6 h-6" />
          <span>Distill</span>
        </button>

        <button
          onClick={() => setMobileTab('assistant')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors ${
            mobileTab === 'assistant' ? 'text-[#007AFF]' : 'text-[#8E8E93]'
          }`}
        >
          <BubbleIcon className="w-6 h-6" />
          <span>Assistant</span>
        </button>

        <button
          onClick={() => setShowConfig(true)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-[#8E8E93] active:text-[#007AFF] transition-colors"
        >
          <GearIcon className="w-6 h-6" />
          <span>Settings</span>
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* 5. iOS BOTTOM SHEET MODAL (Settings)                                      */}
      {/* ========================================================================= */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-lg mx-auto rounded-t-[28px] p-6 shadow-2xl space-y-6 ${
            theme === 'dark' ? 'bg-[#1C1C1E] text-white' : 'bg-[#F2F2F7] text-black'
          }`}>
            {/* Grabber Bar */}
            <div className="w-9 h-1 rounded-full bg-[#8E8E93]/40 mx-auto -mt-2" />

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <DistillJarLogo className="w-6 h-6 shrink-0" />
                <h3 className="text-[20px] font-bold">Settings</h3>
              </div>
              <button
                onClick={() => setShowConfig(false)}
                className="text-[#007AFF] hover:opacity-80 active:opacity-60 font-semibold text-[17px] transition-opacity"
              >
                Done
              </button>
            </div>

            {/* Inset Grouped Settings Sections */}
            <div className="space-y-4 text-[16px]">
              {/* Appearance Section */}
              <div className={`rounded-2xl overflow-hidden divide-y divide-[#38383A]/30 ${
                theme === 'dark' ? 'bg-[#2C2C2E]' : 'bg-white'
              }`}>
                <div className="p-3.5 flex items-center justify-between">
                  <span>Dark Appearance</span>
                  <IOSToggle
                    checked={theme === 'dark'}
                    onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  />
                </div>
              </div>

              {/* Ollama Section */}
              <div className={`rounded-2xl overflow-hidden divide-y divide-[#38383A]/30 ${
                theme === 'dark' ? 'bg-[#2C2C2E]' : 'bg-white'
              }`}>
                <div className="p-3.5 flex items-center justify-between">
                  <span className="text-[#8E8E93]">Ollama URL</span>
                  <input
                    type="text"
                    value={ollamaConfig.baseUrl}
                    onChange={(e) => setOllamaConfig({ ...ollamaConfig, baseUrl: e.target.value })}
                    className="bg-transparent text-right focus:outline-none text-[15px]"
                  />
                </div>
                <div className="p-3.5 flex items-center justify-between">
                  <span className="text-[#8E8E93]">Model</span>
                  <input
                    type="text"
                    value={ollamaConfig.model}
                    onChange={(e) => setOllamaConfig({ ...ollamaConfig, model: e.target.value })}
                    className="bg-transparent text-right focus:outline-none text-[15px]"
                  />
                </div>
              </div>

              {/* MCP Server Section */}
              <div className={`rounded-2xl overflow-hidden divide-y divide-[#38383A]/30 ${
                theme === 'dark' ? 'bg-[#2C2C2E]' : 'bg-white'
              }`}>
                <div className="p-3.5 flex items-center justify-between">
                  <div>
                    <span className="text-[15px] font-medium block">MCP Server</span>
                    <span className="text-[12px] text-[#8E8E93] block">Claude Desktop, Cursor & Agents</span>
                  </div>
                  <span className="text-[12px] font-mono px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                    ● stdio ready
                  </span>
                </div>
                <div className="p-3.5 flex items-center justify-between">
                  <span className="text-[13px] text-[#8E8E93]">Client Integration</span>
                  <button
                    onClick={() => {
                      const isWin = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
                      const mcpJson = JSON.stringify({
                        mcpServers: {
                          distilljar: {
                            command: isWin ? "py" : "python3",
                            args: ["mcp_server.py"]
                          }
                        }
                      }, null, 2);
                      copyToClipboard(mcpJson, 'mcp-config');
                    }}
                    className="text-[#007AFF] text-[13px] font-medium flex items-center gap-1 active:opacity-60"
                  >
                    {copiedId === 'mcp-config' ? (
                      <>
                        <CheckIcon className="w-3.5 h-3.5" />
                        <span>Copied JSON</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="w-3.5 h-3.5" />
                        <span>Copy MCP Config</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Ingestion Engine Section */}
              <div className={`rounded-2xl overflow-hidden divide-y divide-[#38383A]/30 ${
                theme === 'dark' ? 'bg-[#2C2C2E]' : 'bg-white'
              }`}>
                <div className="p-3.5 flex items-center justify-between">
                  <span className="text-[#8E8E93]">Document Parser</span>
                  <span className="text-[14px] font-medium">Microsoft MarkItDown</span>
                </div>
                <div className="p-3.5 flex items-center justify-between">
                  <span className="text-[#8E8E93]">Formats</span>
                  <span className="text-[12px] font-mono text-zinc-400">PDF, DOCX, PPTX, XLSX, TXT</span>
                </div>
              </div>

              {/* Storage Section */}
              <div className={`rounded-2xl overflow-hidden divide-y divide-[#38383A]/30 ${
                theme === 'dark' ? 'bg-[#2C2C2E]' : 'bg-white'
              }`}>
                <div className="p-3.5 flex items-center justify-between text-[15px]">
                  <span>Library Size</span>
                  <span className="text-[#8E8E93]">{storageInfo.count} docs ({storageInfo.estimatedSizeKb} KB)</span>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Erase all cached papers?")) {
                      clearDB();
                      setQueue([]);
                      setActivePaper(null);
                      setStorageInfo(getStorageUsage());
                    }
                  }}
                  className="w-full p-3.5 text-center text-rose-500 font-medium"
                >
                  Erase All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;