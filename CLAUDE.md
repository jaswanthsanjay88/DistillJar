# CLAUDE.md — DistillJar Engineering & Architecture Guide

> **Project**: DistillJar (Local Research Paper Intelligence Vault & Model Context Protocol Server)  
> **Design Stance**: Cupertino-inspired minimalist monochrome aesthetic used consistently across all platforms (macOS, Windows, Linux, Mobile Web).  
> **Core Philosophy**: 100% Offline • Zero Telemetry • Local Trust Model • Lightweight Tauri v2 Desktop (~12MB)  
> **Primary Language Stack**: TypeScript (React 19, Vite 6, Tailwind CSS), Rust (Tauri v2), Python 3.12 (FastAPI, FastMCP, Microsoft MarkItDown, Ollama)  
> **License**: MIT License ([`LICENSE`](file:///d:/ojs_pdf_processing/summarijar/LICENSE))

---

## 🏛️ Architecture Overview

DistillJar is an offline-first research intelligence workspace and Model Context Protocol (MCP) server. It ingests scientific papers (PDF, DOCX, PPTX, XLSX), extracts atomic-fact knowledge matrices via hierarchical map-reduce distillation, and exposes the private library to external AI agents (Claude Desktop, Cursor).

```
┌─────────────────────────────────────────────────────────────┐
│                       DISTILLJAR VAULT                      │
│                                                             │
│   📄 Documents       ⚙ Ingestion           🧠 Distillation  │
│   • PDF Papers       • MarkItDown          • Hierarchical   │
│   • Word / PPTX      • Table Extraction      Map-Reduce     │
│   • Excel Data       • Heading Chunking    • Fact Matrix    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────┐┌──────────────────────────────┐
│  Desktop & Web UI            ││  Model Context Protocol      │
│  • Cupertino Minimalist UI   ││  (MCP Server)                │
│  • Inset Grouped Tables      ││  • Claude Desktop            │
│  • Distill Reading Studio    ││  • Cursor IDE                │
│  • Private RAG Assistant     ││  • Autonomous Agents         │
└──────────────────────────────┘└──────────────────────────────┘
```

---

## 📂 Repository Structure

```
d:\ojs_pdf_processing/
├── summarijar/                      # Core Web & Desktop Application
│   ├── src-tauri/                   # Tauri v2 Rust native desktop engine
│   │   ├── src/main.rs              # Tauri entry point
│   │   ├── Cargo.toml               # Rust LTO & binary size optimizations
│   │   └── tauri.conf.json          # Multi-OS bundle targets & window configuration
│   ├── services/                    # Business Logic Services
│   │   ├── compressionService.ts    # Hierarchical map-reduce fact extraction
│   │   ├── ollamaService.ts         # Local Ollama connection & health ping
│   │   ├── pdfService.ts            # Client-side PDF parser (fallback)
│   │   ├── llamaVectorService.ts    # In-memory vector embeddings index
│   │   ├── searxngService.ts        # Optional local SearXNG web search
│   │   └── storageService.ts        # High-capacity IndexedDB vault storage
│   ├── public/                      # Static assets & logo.svg
│   ├── App.tsx                      # Main React component (Cupertino Navigation)
│   ├── index.html                   # Mobile-first viewport, Open Source font stack
│   ├── package.json                 # Clean scripts (Vite, Tauri v2 only)
│   └── vite.config.ts               # Vite build config (base: './')
├── .github/workflows/               # GitHub Actions CI/CD
│   └── release-tauri.yml            # Multi-OS release matrix with Apple Notarization
├── mcp_server.py                    # Model Context Protocol (MCP) Server (FastMCP)
├── main.py                          # FastAPI backend service (Microsoft MarkItDown)
├── pdf_process.py                   # Standalone MarkItDown batch RAG CLI
├── distilljar_logo_mark_mono.svg    # Geometric D monogram logo mark
└── LICENSE                          # MIT License
```

---

## 🛠️ Essential Commands

### 1. Frontend & Web Development (`summarijar/`)
```bash
# Start Vite development server (port 3000)
npm run dev

# Production build (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

### 2. Desktop Packaging (Tauri v2)
```bash
# Run Tauri desktop app in dev mode
npm run tauri:dev

# Build standalone production desktop binaries (~12MB)
npm run tauri:build
```

### 3. Python Services & MCP Server
```bash
# Start FastAPI backend (port 8000)
py -m uvicorn main:app --host 0.0.0.0 --port 8000
# or (macOS/Linux):
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000

# Start MCP Server for Claude Desktop / Cursor (stdio transport)
py mcp_server.py
# or (macOS/Linux):
python3 mcp_server.py

# Run batch PDF CLI summarizer
py pdf_process.py
```

---

## 🔌 Model Context Protocol (MCP) Integration

DistillJar functions as an MCP server for Claude Desktop, Cursor, and any MCP client.

### Cross-Platform Configuration (`claude_desktop_config.json`):

#### macOS & Linux:
```json
{
  "mcpServers": {
    "distilljar": {
      "command": "python3",
      "args": [
        "/path/to/distilljar/mcp_server.py"
      ]
    }
  }
}
```

#### Windows:
```json
{
  "mcpServers": {
    "distilljar": {
      "command": "py",
      "args": [
        "C:\\path\\to\\distilljar\\mcp_server.py"
      ]
    }
  }
}
```

### MCP Trust & Security Model:
* **Local Trust Model (Process-Level Isolation)**: Any local process configured with `mcp_server.py` has direct read/write access to `~/.distilljar/vault/`. No network ports are opened for MCP (pure `stdio` transport).

### Available MCP Tools:
1. **`list_library_papers`**: Returns metadata for all papers in `~/.distilljar/vault/` (filenames, sizes, compression yield).
2. **`get_paper_knowledge_matrix(filename)`**: Retrieves the atomic-fact knowledge matrix (theorems, empirical metrics, methodology).
3. **`query_paper_rag(query, filename?, model?)`**: Runs private grounded semantic retrieval + local Ollama synthesis.
4. **`get_page_chunks(filename, page_number?)`**: Retrieves verbatim Markdown chunks with exact page citations.
5. **`ingest_new_paper(file_path, model?)`**: Converts any `.pdf`, `.docx`, `.pptx`, `.xlsx`, or `.txt` via Microsoft MarkItDown and builds its knowledge matrix.

---

## 🎨 UI/UX Design Stance & Font Licensing

1. **Design Stance**: A deliberate **Cupertino-inspired, minimalist monochrome aesthetic** applied consistently across all platforms (macOS, Windows, Linux, Mobile Web). It prioritizes calmness, content legibility, and whitespace over OS-specific skeuomorphic widgets.
2. **Font Stack & Licensing (100% Legal & Open Source)**:
   - Uses the **system-native font stack + Inter (SIL Open Font License)**:
     `font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;`
   - Monospace: `JetBrains Mono` / `ui-monospace`.
   - **Zero bundled proprietary Apple fonts** (`SF Pro`), ensuring full cross-platform open-source compliance.
3. **Typography & Layout Hierarchy**:
   - Screen Title: `34pt Bold` (Large Title) or `20pt Bold` (Inline Nav Title).
   - Body Copy: `17pt Regular`, line-height `1.8` for long-form reading.
   - Secondary Metadata: `13pt Regular`, `text-[#8E8E93]` (systemGray).
   - Card Surfaces: Inset Grouped lists with `0.5pt` hairline separators.

---

## 💾 Storage Architecture (Multi-Gigabyte Scale)

* **Web / Desktop App**: Backed by **IndexedDB** (`DistillJarVault`) with an in-memory synchronous cache, supporting gigabytes of documents and vector indices without hitting the 5MB browser `localStorage` ceiling.
* **MCP Server & Python CLI**: Backed by local structured JSON and Markdown files in `~/.distilljar/vault/`.

---

## 🛡️ Security & Privacy Guardrails

1. **Strictly Offline**: All inference routes through local Ollama (`localhost:11434`). Never add external cloud AI APIs unless explicitly requested.
2. **Zero Telemetry**: 0 analytics SDKs, 0 network beacons, 0 background update pingers.
3. **Open Source**: MIT Licensed ([`LICENSE`](file:///d:/ojs_pdf_processing/summarijar/LICENSE)).
4. **Cross-Platform File System**: Always use `Path` abstractions and forward slashes to ensure seamless execution across Windows, macOS, and Linux.
