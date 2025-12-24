import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessedPaper, ChatMessage, ProcessJob, OllamaConfig } from './types';
import { parsePdf } from './services/pdfService';
import { llamaRagQuery } from './services/ollamaService';
import { compressDocument } from './services/compressionService';
import { getPaperFromDB, savePaperToDB } from './services/storageService';
import { searchExternal, SearXNGResult } from './services/searxngService';
import { buildVectorIndex, retrieveRelevantChunks, generateLlamaEmbedding, VectorIndex } from './services/llamaVectorService';
import showdown from 'showdown';

interface EnhancedMessage extends ChatMessage {
  sources?: { title: string; uri: string }[];
}

const App: React.FC = () => {
  const [queue, setQueue] = useState<ProcessJob[]>([]);
  const [activePaper, setActivePaper] = useState<ProcessedPaper | null>(null);
  const [vectorIndex, setVectorIndex] = useState<VectorIndex | null>(null);
  const [messages, setMessages] = useState<EnhancedMessage[]>([]);
  const [input, setInput] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [showConfig, setShowConfig] = useState(false);
  const [viewMode, setViewMode] = useState<'synthesis' | 'source'>('synthesis');
  const [ollamaConfig, setOllamaConfig] = useState<OllamaConfig>(() => {
    const saved = localStorage.getItem('OLLAMA_CONFIG');
    return saved ? JSON.parse(saved) : { baseUrl: 'http://localhost:11434', model: 'llama3.2:latest' };
  });

  // Markdown converter with monochrome styling
  const converter = useMemo(() => {
    const conv = new showdown.Converter({
      tables: true,
      strikethrough: true,
      tasklists: true,
      simpleLineBreaks: true,
      openLinksInNewWindow: true,
      ghCodeBlocks: true,
    });
    return conv;
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Sequential Processing Queue
  useEffect(() => {
    const processNext = async () => {
      const nextJob = queue.find(j => j.status === 'Queued');
      if (!nextJob || queue.some(j => j.status === 'Processing')) return;

      updateJob(nextJob.id, { status: 'Processing', progress: 0 });

      try {
        let result: ProcessedPaper;
        const cached = getPaperFromDB(nextJob.file.name, nextJob.file.size);

        if (cached) {
          result = cached;
        } else {
          const { fullText, chunks } = await parsePdf(nextJob.file, (p) => {
            updateJob(nextJob.id, { progress: Math.round(p * 0.3) });
          });

          const compressedContext = await compressDocument(fullText, ollamaConfig, (cp) => {
            const baseProgress = 30;
            const compressionStep = Math.round((cp.current / cp.total) * 70);
            updateJob(nextJob.id, { progress: baseProgress + compressionStep });
          });

          result = {
            id: Math.random().toString(36).substr(2, 9),
            filename: nextJob.file.name,
            fullText,
            chunks,
            shortformSummary: "Distillation complete. Key findings extracted and indexed.",
            compressedContext,
            tokenStats: { original: fullText.length, compressed: compressedContext.length },
            timestamp: Date.now()
          };
          savePaperToDB(result, nextJob.file.size);
        }

        if (result.chunks.length > 0) {
          const index = await buildVectorIndex(result.chunks, ollamaConfig);
          setVectorIndex(index);
        }

        updateJob(nextJob.id, { status: 'Completed', progress: 100, result });
        if (!activePaper) setActivePaper(result);
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

    // Explicitly cast the file list conversion to File[] to avoid 'unknown' inference issues.
    const files: File[] = Array.from(fileList);
    const newJobs: ProcessJob[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'Queued',
      progress: 0
    }));
    setQueue(prev => [...prev, ...newJobs]);
    e.target.value = "";
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activePaper) return;

    const userQuery = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: 'user', content: userQuery, timestamp: Date.now() }]);

    let webResults: SearXNGResult[] = [];
    if (searchEnabled) {
      setIsSearching(true);
      webResults = await searchExternal(userQuery);
      setIsSearching(false);
    }

    try {
      let responseText = "";
      let sources: { title: string; uri: string }[] | undefined;

      responseText = await llamaRagQuery(userQuery, activePaper.compressedContext, webResults, ollamaConfig);
      sources = webResults.map(r => ({ title: r.title, uri: r.url }));

      setMessages(prev => [...prev, {
        role: 'assistant', content: responseText, timestamp: Date.now(),
        sources: sources
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant', content: `Encountered an issue: ${err.message}`, timestamp: Date.now()
      }]);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const fileList = e.dataTransfer.files;
    if (!fileList || fileList.length === 0) return;

    // Fix implicit 'unknown' type error by casting
    const rawFiles: any[] = Array.from(fileList);
    const files: File[] = rawFiles.filter((f: any) => f.type === 'application/pdf');
    if (files.length === 0) return;

    const newJobs: ProcessJob[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'Queued',
      progress: 0
    }));
    setQueue(prev => [...prev, ...newJobs]);
  };

  return (
    <div
      className="flex h-screen bg-white text-black overflow-hidden font-sans relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center pointer-events-none backdrop-blur-sm">
          <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center text-white text-3xl">
              +
            </div>
            <p className="text-xl font-bold text-black">Drop PDF to Process</p>
          </div>
        </div>
      )}

      {/* LEFT LIBRARY SIDEBAR */}
      <aside className="w-64 border-r border-neutral-200 bg-white flex flex-col shrink-0 z-20">
        <div className="p-6 border-b border-neutral-100">
          <h1 className="text-xl font-bold tracking-tight text-black">DistillJar</h1>
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-1">Research Distillation</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <label className="flex items-center gap-3 w-full p-3 rounded border border-neutral-300 hover:border-black hover:bg-neutral-50 cursor-pointer transition-all mb-6 group">
            <input type="file" accept=".pdf" multiple onChange={handleFileUpload} className="hidden" />
            <div className="w-8 h-8 rounded bg-neutral-100 flex items-center justify-center text-neutral-600 group-hover:bg-neutral-200 group-hover:text-black text-lg">+</div>
            <span className="text-sm font-medium text-neutral-700 group-hover:text-black">Add Paper</span>
          </label>

          {queue.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-2 mb-2">Library</p>
              {queue.map(job => (
                <button
                  key={job.id}
                  onClick={() => job.result && setActivePaper(job.result)}
                  className={`w-full text-left p-3 rounded transition-all flex flex-col gap-1 ${activePaper?.filename === job.file.name ? 'bg-neutral-100 border border-neutral-300' : 'hover:bg-neutral-50'}`}
                >
                  <span className="text-xs font-semibold truncate w-full text-black">{job.file.name}</span>
                  {job.status === 'Processing' ? (
                    <div className="w-full bg-neutral-200 h-1 rounded-full overflow-hidden">
                      <div className="bg-black h-full transition-all duration-300" style={{ width: `${job.progress}%` }}></div>
                    </div>
                  ) : (
                    <span className={`text-[10px] ${job.status === 'Completed' ? 'text-neutral-600' : 'text-neutral-400'}`}>{job.status}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-100">
          <button
            onClick={() => setShowConfig(true)}
            className="w-full flex items-center justify-center gap-2 p-2 rounded hover:bg-neutral-100 text-xs text-neutral-600 font-medium"
          >
            ⚙ Settings
          </button>
        </div>
      </aside>

      {/* CENTER DISTILLATION AREA */}
      <main className="flex-1 flex flex-col bg-white overflow-hidden relative z-10">
        {!activePaper ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-neutral-400">
            <div className="w-24 h-24 mb-6 border-2 border-neutral-200 rounded-full flex items-center justify-center text-4xl italic text-neutral-300">S</div>
            <h2 className="text-lg font-medium text-black mb-2">Welcome to DistillJar</h2>
            <p className="max-w-xs text-sm">Upload a research paper to begin distillation</p>
          </div>
        ) : (
          <>
            <header className="h-16 px-12 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setViewMode('synthesis')}
                  className={`text-sm font-semibold transition-all ${viewMode === 'synthesis' ? 'text-black border-b-2 border-black py-4 mt-1' : 'text-neutral-400'}`}
                >
                  Synthesized Insights
                </button>
                <button
                  onClick={() => setViewMode('source')}
                  className={`text-sm font-semibold transition-all ${viewMode === 'source' ? 'text-black border-b-2 border-black py-4 mt-1' : 'text-neutral-400'}`}
                >
                  Document Data
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Llama 3.2</span>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
              <div className="max-w-4xl mx-auto px-12 py-16 fade-in">
                {viewMode === 'synthesis' ? (
                  <article className="prose-readable serif text-black">
                    <h1 className="text-4xl font-bold mb-8 tracking-tight text-black leading-tight">
                      {activePaper.filename.replace(/\.pdf$/i, '')}
                    </h1>

                    <div className="flex items-center gap-6 mb-12 not-serif p-4 bg-neutral-50 rounded border border-neutral-200">
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Compression Yield</p>
                        <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
                          <div className="bg-black h-full" style={{ width: `${(activePaper.tokenStats.compressed / activePaper.tokenStats.original) * 100}%` }}></div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xl font-bold text-black">
                          {((1 - activePaper.tokenStats.compressed / activePaper.tokenStats.original) * 100).toFixed(0)}%
                        </p>
                        <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Condensed</p>
                      </div>
                    </div>

                    <div className="mb-12">
                      <p className="text-2xl leading-relaxed text-neutral-700 italic border-l-4 border-black pl-8 mb-12">
                        {activePaper.shortformSummary}
                      </p>
                    </div>

                    <div
                      className="markdown-content text-lg"
                      dangerouslySetInnerHTML={{ __html: converter.makeHtml(activePaper.compressedContext) }}
                    />
                  </article>
                ) : (
                  <div className="space-y-6 not-serif">
                    <h2 className="text-xl font-bold mb-8 text-black">Document Fragments</h2>
                    {activePaper.chunks.map((chunk, idx) => (
                      <div key={chunk.id} className="p-6 bg-neutral-50 rounded border border-neutral-200 hover:border-neutral-400 transition-all">
                        <p className="text-[10px] font-bold text-neutral-600 mb-2 uppercase">Page {chunk.pageNumber}</p>
                        <p className="text-sm text-black leading-relaxed">{chunk.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* RIGHT DIALOGUE SIDEBAR */}
      <aside className={`w-[400px] bg-neutral-50 border-l border-neutral-200 flex flex-col shrink-0 ${!activePaper ? 'opacity-20 pointer-events-none' : ''}`}>
        <div className="p-6 border-b border-neutral-200 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-black">Research Assistant</h3>
            <button
              onClick={() => setSearchEnabled(!searchEnabled)}
              className={`text-[10px] font-bold px-2 py-1 rounded transition-all ${searchEnabled ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'}`}
            >
              WEB: {searchEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className="text-[11px] text-neutral-600 leading-tight">Query paper contents and web sources</p>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30">
              <div className="text-2xl mb-2">💬</div>
              <p className="text-xs text-neutral-500">Ask anything about the document</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} fade-in`}>
              <div className={`max-w-[90%] px-4 py-3 rounded-lg text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-black text-white rounded-tr-none'
                : 'bg-white text-black border border-neutral-300 rounded-tl-none'
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
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 px-1">
                  {msg.sources.slice(0, 3).map((s, si) => (
                    <a key={si} href={s.uri} target="_blank" className="text-[9px] bg-white border border-neutral-300 text-neutral-700 px-2 py-0.5 rounded hover:border-black transition-all truncate max-w-[120px]">
                      {s.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 bg-white border-t border-neutral-200">
          <form onSubmit={handleSendMessage} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="w-full bg-neutral-50 border border-neutral-300 rounded px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="absolute right-2 top-1.5 w-9 h-9 bg-black text-white rounded flex items-center justify-center hover:bg-neutral-800 disabled:bg-neutral-300 transition-all"
            >
              ↑
            </button>
          </form>
          {isSearching && (
            <div className="mt-2 text-[9px] font-bold text-neutral-600 animate-pulse text-center uppercase tracking-widest">
              Searching external sources...
            </div>
          )}
        </div>
      </aside>

      {/* SETTINGS MODAL */}
      {showConfig && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded p-8 w-full max-w-md border border-neutral-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-black">Llama Configuration</h2>
              <button onClick={() => setShowConfig(false)} className="text-neutral-500 hover:text-black text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Ollama API URL</label>
                <input
                  type="text" value={ollamaConfig.baseUrl}
                  onChange={(e) => setOllamaConfig({ ...ollamaConfig, baseUrl: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-300 rounded p-3 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Model Name</label>
                <input
                  type="text" value={ollamaConfig.model}
                  onChange={(e) => setOllamaConfig({ ...ollamaConfig, model: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-300 rounded p-3 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <button
                onClick={() => {
                  localStorage.setItem('OLLAMA_CONFIG', JSON.stringify(ollamaConfig));
                  setShowConfig(false);
                }}
                className="w-full bg-black text-white py-3 rounded font-bold text-sm mt-4 hover:bg-neutral-800"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
      `}</style>
    </div>
  );
};

export default App;