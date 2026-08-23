<div align="center">

# DistillJar

### The Privacy-First Research Paper Intelligence Vault & MCP Server

**100% Offline • Zero Telemetry • Microsoft MarkItDown • Native Apple Aesthetic • Tauri v2**

[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-black?style=flat-square&logo=apple)](https://github.com/jaswanthsanjay88/DistillJar/releases)
[![Tauri v2](https://img.shields.io/badge/Desktop-Tauri%20v2%20(~12MB)-24C8D8?style=flat-square&logo=tauri)](https://tauri.app)
[![MCP Server](https://img.shields.io/badge/MCP-Protocol%20Ready-6366F1?style=flat-square&logo=anthropic)](https://modelcontextprotocol.io)
[![Parser](https://img.shields.io/badge/Ingestion-Microsoft%20MarkItDown-0078D4?style=flat-square&logo=microsoft)](https://github.com/microsoft/markitdown)
[![Local LLM](https://img.shields.io/badge/Inference-Local%20Ollama-10B981?style=flat-square&logo=ollama)](https://ollama.com)
[![Privacy](https://img.shields.io/badge/Privacy-Zero%20Telemetry%20%2F%20No%20Upload-000000?style=flat-square)](#-privacy--zero-telemetry-guarantee)

</div>

---

## 💡 What is DistillJar?

**DistillJar** is an offline-first research intelligence workspace and Model Context Protocol (MCP) server. It converts dense scientific papers, technical reports, and datasets into **atomic-fact knowledge matrices** and exposes your private literature vault directly to external AI clients (Claude Desktop, Cursor, Antigravity) without ever uploading a single byte to the cloud.

Built for researchers, engineers, and privacy-conscious analysts who require **deep document comprehension without cloud exposure**.

---

## ✨ Key Pillars

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
│  • iOS-Native Minimalist UI  ││  (MCP Server)                │
│  • Inset Grouped Tables      ││  • Claude Desktop            │
│  • Distill Reading Studio    ││  • Cursor IDE                │
│  • Private RAG Assistant     ││  • Autonomous Agents         │
└──────────────────────────────┘└──────────────────────────────┘
```

### 1. 🛡️ Privacy-First & Zero Telemetry
* **No Accounts, No Logins, No Cloud Calls**: Everything runs locally via your local Ollama instance (`llama3.2`, `gemma3`, `deepseek-r1`).
* **Zero Telemetry**: No analytics beacons, no tracking pixels, and no silent background pings.

### 2. 🔌 Native Model Context Protocol (MCP) Server
* DistillJar acts as a **local research infrastructure** server.
* Any MCP-compatible client (Claude Desktop, Cursor) can query your paper library, retrieve knowledge matrices, and cross-reference citations directly within your IDE.

### 3. 📑 Microsoft MarkItDown Ingestion Engine
* Replaces flat, scrambled PDF readers with Microsoft's structured `markitdown` parser.
* **Preserves Tables**: Formats experimental results and benchmarks into native Markdown tables (`| Col 1 | Col 2 |`).
* **Semantic Heading Chunking**: Splits papers by `#`, `##`, `###` sections, maintaining logical context across chunks.
* **Multi-Format Support**: Ingests `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.html`, and `.txt`.

### 4. ⚡ Tauri v2 Packaging (~12MB vs 150MB+ Electron)
* Built on Rust and native OS webviews (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux).
* Ultra-fast cold boot, negligible RAM footprint, and small binary sizes.

### 5. 🎨 iOS-Forward Cupertino Aesthetic
* System typography (`SF Pro Display` / `SF Pro Text`), Inset Grouped lists (`UITableViewStyleInsetGrouped`), `UISegmentedControl` pill switchers, and subtle translucency (`ios-blur`).

---

## 🚀 Quick Start

### Option A: Desktop Application (Recommended)

Download the signed and notarized binary for your OS from [GitHub Releases](https://github.com/jaswanthsanjay88/DistillJar/releases):

* **macOS (Apple Silicon / Intel)**: `DistillJar-macOS-universal.dmg` (Apple Notarized)
* **Windows (x64)**: `DistillJar-Windows-Setup.exe` / `.msi` (Authenticode Signed)
* **Linux (x86_64)**: `DistillJar-Linux.AppImage` / `.deb`

### Option B: Local Web App

```bash
# 1. Clone repository
git clone https://github.com/jaswanthsanjay88/DistillJar.git
cd DistillJar/summarijar

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔌 Using DistillJar as an MCP Server

Expose your local paper library directly to **Claude Desktop** or **Cursor**:

### 1. Configure Claude Desktop

Add this block to your `claude_desktop_config.json`:

* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "distilljar": {
      "command": "py",
      "args": [
        "d:\\ojs_pdf_processing\\mcp_server.py"
      ]
    }
  }
}
```

### 2. Available MCP Tools

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `list_library_papers` | *None* | Lists all indexed papers, page counts, and compression yields. |
| `get_paper_knowledge_matrix` | `filename: str` | Fetches the full atomic-fact matrix (theorems, empirical metrics). |
| `query_paper_rag` | `query: str`, `filename?: str` | Runs private semantic retrieval & Ollama synthesis. |
| `get_page_chunks` | `filename: str`, `page_number?: int` | Retrieves verbatim Markdown chunks with exact page citations. |
| `ingest_new_paper` | `file_path: str` | Ingests any document (`.pdf`, `.docx`, `.pptx`, `.xlsx`) via MarkItDown. |

---

## 🐍 Python Batch Pipeline & Backend

### 1. Batch CLI RAG Summarizer (`pdf_process.py`)

Place papers in `input/` and run:

```bash
py pdf_process.py
```

Outputs structured Markdown RAG answers and exports summary benchmarks to `output_rag/summaries.xlsx`.

### 2. FastAPI Backend Server (`main.py`)

```bash
py -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Provides high-speed `POST /process` endpoints with Microsoft MarkItDown and Ollama integration.

---

## 🏗️ Repository Architecture

```
d:\ojs_pdf_processing\
├── summarijar/                      # DistillJar Core Application
│   ├── src-tauri/                   # Tauri v2 Rust native desktop engine
│   │   ├── src/main.rs              # Rust entry point
│   │   ├── Cargo.toml               # Rust dependencies & LTO optimizations
│   │   └── tauri.conf.json          # Multi-OS bundle targets & window configuration
│   ├── services/                    # Client services
│   │   ├── compressionService.ts    # Hierarchical map-reduce fact extraction
│   │   ├── ollamaService.ts         # Local Ollama connection & health ping
│   │   ├── pdfService.ts            # Client-side PDF parser
│   │   ├── llamaVectorService.ts    # In-memory vector embeddings index
│   │   └── storageService.ts        # LocalStorage vault database
│   ├── App.tsx                      # iOS Cupertino UI & navigation controller
│   ├── index.html                   # Mobile-first viewport, SF Pro typography
│   └── package.json                 # Build targets (Vite, Tauri, Electron)
├── .github/workflows/               # GitHub Actions CI/CD
│   └── release-tauri.yml            # Multi-OS Matrix (macOS Notarization + Windows Authenticode)
├── mcp_server.py                    # Model Context Protocol (MCP) Server (FastMCP)
├── main.py                          # FastAPI document processing service
├── pdf_process.py                   # Standalone MarkItDown batch RAG CLI
└── distilljar_logo_mark_mono.svg    # Geometric D monogram logo mark
```

---

## 🔐 Privacy & Security Verification

| Layer | Implementation | Verification |
| :--- | :--- | :--- |
| **Inference** | Local Ollama (`localhost:11434`) | `netstat -ano \| findstr 11434` (100% loopback) |
| **Document Storage** | Local filesystem (`~/.distilljar/vault/`) | No remote database dependencies |
| **Code Signing** | Apple Notarization + Windows Authenticode | Zero Gatekeeper / SmartScreen warnings |
| **Telemetry** | None | 0 analytics SDKs, 0 network beacons |

---

## 📄 License

MIT License. Open source and built for the global research community.