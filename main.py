"""
DistillJar Backend Service (FastAPI + Microsoft MarkItDown + Ollama + ScrapeGraphAI)
Provides high-performance server-side document parsing, Markdown extraction, RAG,
and zero-telemetry structured citation extraction.
"""

import os
import json
import tempfile
from typing import List, Dict, Any, Optional
from pathlib import Path
from pydantic import BaseModel
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Response
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


@app.get("/api/fetch-arxiv")
async def fetch_arxiv_endpoint(arxiv_id: str):
    """
    Proxies and fetches raw PDF bytes from arXiv to bypass client-side CORS restrictions.
    """
    clean_id = arxiv_id.strip().replace(".pdf", "")
    urls = [
        f"https://arxiv.org/pdf/{clean_id}.pdf",
        f"https://export.arxiv.org/pdf/{clean_id}.pdf",
        f"https://arxiv.org/pdf/{clean_id}"
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/pdf,application/octet-stream,*/*",
        "Referer": "https://arxiv.org"
    }
    
    last_err = ""
    for target_url in urls:
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(target_url, headers=headers)
                if resp.status_code == 200 and len(resp.content) > 500:
                    return Response(content=resp.content, media_type="application/pdf")
                last_err = f"arXiv returned status {resp.status_code}, size {len(resp.content)} bytes"
        except Exception as e:
            last_err = str(e)
            
    raise HTTPException(status_code=500, detail=f"Failed to fetch arXiv PDF: {last_err}")


@app.get("/api/fetch-url")
async def fetch_url_endpoint(url: str):
    """
    Fetches any external URL (PDF binary, HTML article, text) and returns content with appropriate media type.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DistillJar/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Server returned {resp.status_code}")
            content_type = resp.headers.get("content-type", "application/octet-stream")
            return Response(content=resp.content, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch URL: {str(e)}")


class ProxyModelRequest(BaseModel):
    url: str
    api_key: Optional[str] = None


@app.post("/api/proxy-models")
async def proxy_models_endpoint(req: ProxyModelRequest):
    """
    Proxies GET requests to custom OpenAI-compatible /models endpoints to bypass browser CORS.
    """
    headers = {"Accept": "application/json"}
    if req.api_key and req.api_key.strip():
        headers["Authorization"] = f"Bearer {req.api_key.strip()}"
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(req.url, headers=headers)
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


class ProxyChatRequest(BaseModel):
    url: str
    model: str
    messages: List[Dict[str, Any]]
    api_key: Optional[str] = None
    temperature: Optional[float] = 0.2
    max_tokens: Optional[int] = 4096


@app.post("/api/proxy-chat")
async def proxy_chat_endpoint(req: ProxyChatRequest):
    """
    Proxies chat completion requests to custom OpenAI-compatible endpoints to bypass browser CORS.
    """
    headers = {"Content-Type": "application/json"}
    if req.api_key and req.api_key.strip():
        headers["Authorization"] = f"Bearer {req.api_key.strip()}"
    
    payload = {
        "model": req.model,
        "messages": req.messages,
        "temperature": req.temperature,
    }
    if req.max_tokens:
        payload["max_tokens"] = req.max_tokens

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.post(req.url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Custom API returned {resp.status_code}: {resp.text}")
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


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
