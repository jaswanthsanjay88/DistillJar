# DistillJar

Offline research paper intelligence workspace and Model Context Protocol (MCP) server. Built with Tauri v2, Microsoft MarkItDown, and local Ollama inference.

## Overview

DistillJar converts academic papers and technical documents into atomic-fact knowledge matrices. It runs entirely on-device with zero telemetry, no user accounts, and no cloud dependencies.

Key capabilities:
- Document Ingestion: Uses Microsoft MarkItDown to preserve tables, headings, and formulas from PDF, DOCX, PPTX, XLSX, and TXT files.
- Distillation: Generates structured executive summaries and knowledge matrices via local LLMs (Ollama).
- Model Context Protocol (MCP): Exposes your local document vault directly to Claude Desktop, Cursor, and autonomous AI agents.
- Lightweight Desktop Engine: Built with Tauri v2 (~12MB binary) using native OS webviews instead of Chromium.
- High-Capacity Vault: Backed by IndexedDB and local filesystem storage (`~/.distilljar/vault/`).

## Quick Start

### Web Application

```bash
# Clone repository
git clone https://github.com/jaswanthsanjay88/DistillJar.git
cd DistillJar/summarijar

# Install dependencies
npm install

# Start development server
npm run dev
```

The application runs locally at `http://localhost:3000`.

### Desktop Application

Download pre-built binaries for macOS (`.dmg`), Windows (`.exe` / `.msi`), and Linux (`.AppImage` / `.deb`) from the Releases page:
https://github.com/jaswanthsanjay88/DistillJar/releases

To build from source:

```bash
npm run tauri:build
```

### Model Context Protocol (MCP) Server

Connect DistillJar to Claude Desktop or Cursor:

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

*Note: On Windows, set `"command": "py"` or `"python"`.*

#### Exposed MCP Tools

| Tool | Description |
| :--- | :--- |
| `list_library_papers` | Lists all documents indexed in the local vault. |
| `get_paper_knowledge_matrix` | Retrieves the atomic-fact matrix for a specific paper. |
| `query_paper_rag` | Runs private semantic search and RAG synthesis via local Ollama. |
| `get_page_chunks` | Returns exact verbatim Markdown chunks with page citations. |
| `ingest_new_paper` | Ingests a new document via Microsoft MarkItDown into the vault. |

### Python Batch CLI & Backend

```bash
# Start FastAPI backend service (port 8000)
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000

# Run batch PDF CLI summarizer
python3 pdf_process.py
```

## Architecture

```
distilljar/
├── src-tauri/             # Tauri v2 native desktop engine (Rust)
├── services/              # Client parsing, compression, and storage logic
├── App.tsx                # Cupertino-inspired minimal UI
├── main.py                # FastAPI document parsing backend (MarkItDown)
├── mcp_server.py          # FastMCP server for Claude Desktop / Cursor
├── pdf_process.py         # Batch RAG summarization CLI
└── index.html             # Application shell
```

## Privacy & Security

- All inference executes over local loopback (`localhost:11434`).
- Document data is stored locally in `~/.distilljar/vault/` and browser IndexedDB.
- Zero analytics, telemetry, or external network requests.

## License

MIT License. See LICENSE for details.