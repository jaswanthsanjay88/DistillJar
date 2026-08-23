"""
DistillJar Backend Service (FastAPI + Microsoft MarkItDown + Ollama + ScrapeGraphAI)
Provides high-performance server-side document parsing, Markdown extraction, RAG,
and zero-telemetry structured citation extraction.
"""

import os
import json
import tempfile
from pathlib import Path
from pydantic import BaseModel
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from markitdown import MarkItDown
import ollama
import httpx

# Enforce Zero Telemetry across all scraping & AI operations
os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"
os.environ["ANONYMIZED_TELEMETRY"] = "false"

# Optional ScrapeGraphAI with local fallback
try:
    from scrapegraphai.graphs import SmartScraperGraph
    HAS_SCRAPEGRAPHAI = True
except ImportError:
    HAS_SCRAPEGRAPHAI = False

app = FastAPI(title="DistillJar Backend", version="1.0.0")

# Enable CORS for local React/Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

md_converter = MarkItDown()


class CitationExtractRequest(BaseModel):
    url: str
    prompt: str = "Extract key claims, methodology, quantitative benchmarks, and author citations from this page."
    model: str = "llama3.2:latest"


def extract_dense_summary(text: str, model: str = "llama3.2:latest") -> str:
    """
    Summarizes structured Markdown text using local Ollama instance.
    """
    context = text[:32000]
    prompt = (
        "ACT AS: Principal Research Scientist.\n"
        "TASK: Analyze the following document markdown and generate a dense, structured executive synthesis.\n"
        "GUIDELINES:\n"
        "- Highlight core contributions, novel methodology, and empirical metrics.\n"
        "- Preserve all key equations, data points, and statistical findings.\n"
        "- Format with clear Markdown headings and bullet points.\n\n"
        f"DOCUMENT MARKDOWN:\n{context}\n\n"
        "SYNTHESIS:"
    )
    try:
        res = ollama.generate(model=model, prompt=prompt)
        return res.get("response", "").strip()
    except Exception:
        return f"Distillation generated from Markdown structure. Length: {len(text)} characters."


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "DistillJar Backend",
        "parser": "Microsoft MarkItDown",
        "engine": "FastAPI + Ollama",
        "scrapegraphai_enabled": HAS_SCRAPEGRAPHAI
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/extract-citation")
async def extract_citation_endpoint(req: CitationExtractRequest):
    """
    Extracts structured academic data and citations from an external URL via ScrapeGraphAI
    or lightweight native extraction with zero telemetry.
    """
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    # 1. ScrapeGraphAI Path
    if HAS_SCRAPEGRAPHAI:
        try:
            clean_model = req.model.replace(":latest", "")
            graph_config = {
                "llm": {
                    "model": f"ollama/{clean_model}",
                    "base_url": base_url,
                    "format": "json",
                    "temperature": 0.0,
                },
                "verbose": False,
                "headless": True
            }
            smart_scraper = SmartScraperGraph(
                prompt=req.prompt,
                source=req.url,
                config=graph_config
            )
            result = smart_scraper.run()
            return {
                "source_url": req.url,
                "engine": "ScrapeGraphAI (Local Ollama)",
                "extracted_data": result
            }
        except Exception:
            pass

    # 2. Native Zero-Dependency Fallback
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(req.url, headers={"User-Agent": "Mozilla/5.0 DistillJar/1.0"})
            html_text = resp.text

        extract_prompt = (
            f"ACT AS: Structured Academic Data Extractor.\n"
            f"GOAL: {req.prompt}\n\n"
            f"RAW HTML/TEXT CONTENT FROM {req.url}:\n{html_text[:18000]}\n\n"
            f"OUTPUT (Valid JSON structure with extracted fields):"
        )
        res = ollama.generate(model=req.model, prompt=extract_prompt, format="json")
        try:
            parsed = json.loads(res.get("response", "{}"))
        except Exception:
            parsed = {"raw_synthesis": res.get("response", "")}

        return {
            "source_url": req.url,
            "engine": "DistillJar Native Extraction (Local Ollama)",
            "extracted_data": parsed
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@app.post("/process")
async def process_document(
    file: UploadFile = File(...),
    query: str | None = Form(None),
    model: str = Form("llama3.2:latest")
):
    """
    Ingests PDF, DOCX, PPTX, XLSX, CSV, or TXT file using MarkItDown,
    generates a structured knowledge matrix, and optionally answers a query.
    """
    filename = file.filename or "document.pdf"
    suffix = Path(filename).suffix.lower()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = md_converter.convert(str(tmp_path))
        markdown_text = result.text_content if result and result.text_content else ""

        if not markdown_text:
            raise HTTPException(status_code=400, detail="Could not extract text from document.")

        original_chars = len(content)
        compressed_chars = len(markdown_text)
        summary = extract_dense_summary(markdown_text, model=model)

        answer = None
        if query:
            rag_prompt = (
                f"DOCUMENT CONTEXT:\n{markdown_text[:24000]}\n\n"
                f"QUESTION: {query}\n\n"
                "Provide a precise, comprehensive answer based on the document context:"
            )
            try:
                rag_res = ollama.generate(model=model, prompt=rag_prompt)
                answer = rag_res.get("response", "").strip()
            except Exception:
                answer = "Could not generate answer via Ollama."

        return {
            "filename": filename,
            "compressed_context": markdown_text,
            "summary": summary,
            "stats": {
                "original_chars": original_chars,
                "compressed_chars": compressed_chars
            },
            "answer": answer
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
