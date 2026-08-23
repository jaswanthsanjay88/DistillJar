import os
from pathlib import Path
import re
import numpy as np
import pandas as pd
import ollama
from markitdown import MarkItDown

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx", ".pptx", ".xlsx", ".csv", ".html"}

_markitdown_instance = None

def get_markitdown():
    global _markitdown_instance
    if _markitdown_instance is None:
        _markitdown_instance = MarkItDown()
    return _markitdown_instance


def read_file(file_path: Path) -> str:
    """
    Read and convert file content to structured Markdown using Microsoft MarkItDown.
    Supports PDF, TXT, DOCX, PPTX, XLSX, CSV, and HTML.
    """
    ext = file_path.suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")

    try:
        md = get_markitdown()
        result = md.convert(str(file_path))
        if result and result.text_content:
            return result.text_content
    except Exception as e:
        print(f"[Warning] MarkItDown error for {file_path.name}: {e}. Falling back to plain reader.")

    # Fallback to direct reading
    if ext in {".txt", ".md", ".csv", ".html"}:
        return file_path.read_text(encoding="utf-8", errors="replace")
    elif ext == ".pdf":
        import PyPDF2
        text = ""
        with file_path.open("rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text
    else:
        raise ValueError(f"Could not convert {file_path.name}")


def clean_text(text: str) -> str:
    """
    Remove trailing references / bibliography if present at the end of the paper.
    """
    # Safe match near end of document
    match = re.search(r"\n#{1,3}\s*(References|Bibliography)\s*\n", text, re.IGNORECASE)
    if match and match.start() > len(text) * 0.4:
        return text[:match.start()]
    return text


def chunk_text(text: str, max_chunk_length: int = 2500) -> list[str]:
    """
    Split markdown text into semantic chunks by headers and paragraphs.
    Preserves heading context across chunks.
    """
    sections = re.split(r"(\n#{1,4}\s+[^\n]+)", text)
    chunks = []
    current_chunk = ""
    current_header = ""

    for section in sections:
        if re.match(r"\n#{1,4}\s+[^\n]+", section):
            current_header = section.strip()
            continue

        paragraphs = section.split("\n\n")
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            candidate = (f"{current_header}\n\n{para}" if current_header else para)
            if len(current_chunk) + len(candidate) + 2 > max_chunk_length:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = candidate
            else:
                current_chunk = (current_chunk + "\n\n" + candidate).strip()

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks if chunks else [text[:max_chunk_length]]


def embed_chunks(chunks: list[str], embedder) -> np.ndarray:
    """
    Compute embedding for each chunk.
    """
    return np.array([embedder.encode(chunk) for chunk in chunks])


def retrieve_relevant_chunks(query: str, chunks: list[str], chunk_embeddings: np.ndarray,
                              embedder, top_k: int = 3) -> list[str]:
    """
    Retrieve top_k chunks most similar to query using cosine similarity.
    """
    query_embedding = embedder.encode(query)
    norms = np.linalg.norm(chunk_embeddings, axis=1) * np.linalg.norm(query_embedding)
    similarities = np.dot(chunk_embeddings, query_embedding) / (norms + 1e-10)
    top_indices = np.argsort(similarities)[-top_k:][::-1]
    return [chunks[i] for i in top_indices]


def rag_summarize(document_markdown: str, query: str) -> str:
    """
    Retrieve relevant markdown chunks and summarize using local Ollama model.
    """
    from sentence_transformers import SentenceTransformer
    
    cleaned = clean_text(document_markdown)
    chunks = chunk_text(cleaned)
    print(f"Document parsed into {len(chunks)} semantic Markdown chunks.")

    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = embed_chunks(chunks, embedder)
    relevant_chunks = retrieve_relevant_chunks(query, chunks, embeddings, embedder, top_k=3)
    context = "\n\n---\n\n".join(relevant_chunks)

    prompt = (
        f"You are an expert research analyst.\n\n"
        f"Question: {query}\n\n"
        f"Markdown Document Context:\n{context}\n\n"
        f"Provide a clear, structured, and comprehensive answer drawing strictly from the context:"
    )
    
    response = ollama.generate(model="gemma3:1b", prompt=prompt)
    return response.get("response", "").strip()


def process_file(file_path: Path, output_folder: Path, query: str) -> tuple[str, str] | None:
    """
    Process a file using MarkItDown + RAG.
    """
    try:
        markdown_text = read_file(file_path)
    except Exception as e:
        print(f"Error reading {file_path.name}: {e}")
        return None

    try:
        answer = rag_summarize(markdown_text, query)
        output_file = output_folder / f"{file_path.stem}_rag_answer.txt"
        output_file.write_text(answer, encoding="utf-8")
        print(f"RAG answer for {file_path.name} saved to {output_file}")
        return file_path.name, answer
    except Exception as e:
        print(f"Error summarizing {file_path.name}: {e}")
        return None


def main():
    input_folder = Path("input")
    input_folder.mkdir(exist_ok=True)
    output_folder = Path("output_rag")
    output_folder.mkdir(exist_ok=True)

    query = "Summarize the key contributions, main methodology, and core findings of this document."
    
    files = [f for f in input_folder.iterdir() if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS]

    if not files:
        print(f"No supported files found in '{input_folder}'. Place .pdf, .docx, .txt files in the input folder.")
        return

    results = []
    for file in files:
        print(f"\nProcessing file: {file.name} with MarkItDown RAG.")
        result = process_file(file, output_folder, query)
        if result:
            results.append(result)

    if results:
        df = pd.DataFrame(results, columns=["Filename", "Summary"])
        excel_path = output_folder / "summaries.xlsx"
        df.to_excel(excel_path, index=False)
        print(f"\nAll summaries successfully saved to {excel_path}")


if __name__ == "__main__":
    main()