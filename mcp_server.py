"""
DistillJar Model Context Protocol (MCP) Server
Exposes your local research paper library, knowledge matrices, and RAG search
as native tools to Claude Desktop, Cursor, and AI agents.
"""

import os
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastmcp import FastMCP
from markitdown import MarkItDown
import ollama

# Initialize FastMCP Server
mcp = FastMCP("DistillJar Research Vault")

# Vault Storage Directory
VAULT_DIR = Path.home() / ".distilljar" / "vault"
VAULT_DIR.mkdir(parents=True, exist_ok=True)
INDEX_FILE = VAULT_DIR / "library_index.json"

md_converter = MarkItDown()


def load_index() -> Dict[str, Any]:
    if INDEX_FILE.exists():
        try:
            return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_index(index_data: Dict[str, Any]):
    INDEX_FILE.write_text(json.dumps(index_data, indent=2), encoding="utf-8")


# -----------------------------------------------------------------------------
# MCP TOOLS
# -----------------------------------------------------------------------------

@mcp.tool()
def list_library_papers() -> List[Dict[str, Any]]:
    """
    Lists all research papers currently indexed in the DistillJar local vault.
    Returns paper names, original sizes, condensed matrix sizes, and timestamps.
    """
    index = load_index()
    return [
        {
            "filename": p.get("filename"),
            "original_chars": p.get("original_chars", 0),
            "matrix_chars": p.get("matrix_chars", 0),
            "condensed_yield": f"{p.get('condensed_yield', 0)}%",
            "chunks_count": len(p.get("chunks", [])),
            "added_at": p.get("added_at")
        }
        for p in index.values()
    ]


@mcp.tool()
def get_paper_knowledge_matrix(filename: str) -> str:
    """
    Retrieves the complete hierarchical atomic-fact knowledge matrix for a specific paper.
    Use this to inspect all extracted theorems, methodology, and experimental claims.
    """
    index = load_index()
    for key, paper in index.items():
        if filename.lower() in paper.get("filename", "").lower():
            return paper.get("compressed_context", "No matrix available.")
    return f"Paper '{filename}' not found in local vault. Available: {list(index.keys())}"


@mcp.tool()
def query_paper_rag(query: str, filename: Optional[str] = None, model: str = "llama3.2:latest") -> str:
    """
    Performs local RAG retrieval and question answering over one or all research papers.
    Uses your local Ollama instance for 100% private synthesis.
    """
    index = load_index()
    if not index:
        return "No papers in vault. Use ingest_new_paper first."

    context_blocks = []
    for key, paper in index.items():
        if filename is None or filename.lower() in paper.get("filename", "").lower():
            matrix = paper.get("compressed_context", "")[:8000]
            context_blocks.append(f"### Paper: {paper.get('filename')}\n{matrix}")

    combined_context = "\n\n---\n\n".join(context_blocks)
    if not combined_context:
        return f"No matching paper found for '{filename}'."

    prompt = (
        "You are an expert research assistant with access to the user's private paper vault.\n"
        f"QUESTION: {query}\n\n"
        f"DOCUMENT KNOWLEDGE MATRIX:\n{combined_context}\n\n"
        "Provide a detailed, insightful answer citing specific papers and sections:"
    )

    try:
        res = ollama.generate(model=model, prompt=prompt)
        return res.get("response", "").strip()
    except Exception as e:
        return f"Ollama query failed: {e}. Raw matching context:\n\n{combined_context[:3000]}"


@mcp.tool()
def get_page_chunks(filename: str, page_number: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Retrieves exact raw Markdown chunks and page splits for a paper.
    Use this for verbatim quotes and checking exact page citations.
    """
    index = load_index()
    for key, paper in index.items():
        if filename.lower() in paper.get("filename", "").lower():
            chunks = paper.get("chunks", [])
            if page_number is not None:
                return [c for c in chunks if c.get("page_number") == page_number]
            return chunks
    return []


@mcp.tool()
def ingest_new_paper(file_path: str, model: str = "llama3.2:latest") -> str:
    """
    Ingests a new research paper (.pdf, .docx, .pptx, .xlsx, or .txt) from the local filesystem
    using Microsoft MarkItDown, extracts atomic facts, and adds it to the DistillJar vault.
    """
    path = Path(file_path)
    if not path.exists():
        return f"File does not exist: {file_path}"

    try:
        # Convert with MarkItDown
        res = md_converter.convert(str(path))
        markdown_text = res.text_content if res else ""
        if not markdown_text:
            return f"Failed to extract text from {path.name}"

        # Generate Synthesis via Ollama
        prompt = (
            "ACT AS: Principal Research Scientist.\n"
            "TASK: Create a dense, structured executive knowledge matrix of the following paper markdown.\n"
            "GUIDELINES:\n"
            "- Extract all novel methodologies, core claims, quantitative metrics, and dataset findings.\n"
            "- Preserve exact equations and empirical data points.\n\n"
            f"MARKDOWN:\n{markdown_text[:28000]}\n\n"
            "KNOWLEDGE MATRIX:"
        )

        try:
            summary_res = ollama.generate(model=model, prompt=prompt)
            matrix = summary_res.get("response", "").strip()
        except Exception:
            matrix = markdown_text[:12000]

        # Simple page chunking simulation
        chunks = [
            {"id": f"c_{i}", "text": chunk.strip(), "page_number": i + 1}
            for i, chunk in enumerate(markdown_text.split("\n\n---\n\n")[:50])
            if chunk.strip()
        ]

        # Save to Vault Index
        index = load_index()
        key = path.name
        index[key] = {
            "filename": path.name,
            "file_path": str(path.resolve()),
            "original_chars": len(markdown_text),
            "matrix_chars": len(matrix),
            "condensed_yield": max(0, round((1 - len(matrix) / max(1, len(markdown_text))) * 100)),
            "compressed_context": matrix,
            "chunks": chunks,
            "added_at": str(Path(file_path).stat().st_mtime)
        }
        save_index(index)

        return f"Successfully ingested '{path.name}' into DistillJar Vault ({len(markdown_text)} chars -> {len(matrix)} chars matrix, {len(chunks)} chunks)."

    except Exception as e:
        return f"Ingestion error: {str(e)}"


# -----------------------------------------------------------------------------
# MCP RESOURCES
# -----------------------------------------------------------------------------

@mcp.resource("papers://library")
def get_library_resource() -> str:
    """Returns the entire library catalog in JSON format."""
    return json.dumps(load_index(), indent=2)


if __name__ == "__main__":
    # Run standalone stdio server for Claude Desktop / Cursor
    mcp.run(transport="stdio")
