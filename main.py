"""
DistillJar Backend Service (FastAPI + Microsoft MarkItDown + Ollama)
Provides high-performance server-side document parsing, Markdown extraction, and RAG.
"""

import os
import tempfile
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from markitdown import MarkItDown
import ollama

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
    except Exception as e:
        return f"Distillation generated from Markdown structure. Length: {len(text)} characters."


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "DistillJar Backend",
        "parser": "Microsoft MarkItDown",
        "engine": "FastAPI + Ollama"
    }


@app.get("/health")
def health():
    return {"status": "ok"}


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
        # 1. Convert to structured Markdown with Microsoft MarkItDown
        result = md_converter.convert(str(tmp_path))
        markdown_text = result.text_content if result and result.text_content else ""

        if not markdown_text:
            raise HTTPException(status_code=400, detail="Could not extract text from document.")

        original_chars = len(content)
        compressed_chars = len(markdown_text)

        # 2. Extract Executive Synthesis
        summary = extract_dense_summary(markdown_text, model=model)

        # 3. Optional Question Answering
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
