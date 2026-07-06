
import os
import tempfile
import uuid

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pdf_loader import load_pdf_pages
from chunker import chunk_pages
from embedder import Embedder
from vector_store import VectorStore
from rag_pipeline import answer_question, condense_question

app = FastAPI(title="Personal PDF Study Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static frontend files (if they exist)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    from fastapi.responses import FileResponse
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve SPA - if file doesn't exist in static, serve index.html"""
        file_path = os.path.join(static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        # Return index.html for all non-file routes (SPA routing)
        return FileResponse(os.path.join(static_dir, "index.html"))

# ---------- In-memory state ----------
# One embedder instance shared by everything (loading the model is slow, do it once).
embedder = Embedder()

# doc_id -> {"filename": str, "store": VectorStore, "num_chunks": int, "num_pages": int}
documents: dict[str, dict] = {}


# ---------- Request/response schemas ----------
class ConversationTurn(BaseModel):
    question: str
    answer: str
class AskRequest(BaseModel):
    question: str
    doc_id: str | None = None  # None = search across ALL uploaded documents
    top_k: int = 6
    history:list[ConversationTurn] =[] # optional chat history for follow-up questions


class Source(BaseModel):
    citation_number: int
    chunk_id: str
    doc_id: str
    page_number: int
    score: float


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]


class DocumentInfo(BaseModel):
    doc_id: str
    filename: str
    num_pages: int
    num_chunks: int


# ---------- Endpoints ----------

@app.get("/health")
def health():
    return {"status": "ok", "documents_indexed": len(documents)}


@app.post("/documents/upload", response_model=DocumentInfo)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are supported.")

    doc_id = str(uuid.uuid4())[:8]

    # Save the upload to a temp file since PyMuPDF needs a file path.
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        pages = load_pdf_pages(tmp_path)
    finally:
        os.remove(tmp_path)  # always clean up the temp file

    if not pages:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found in this PDF (it may be a scanned image)."
        )

    chunks = chunk_pages(pages, doc_id=doc_id)
    texts = [c["text"] for c in chunks]
    vectors = embedder.embed_texts(texts)

    """ in FAISS store = VectorStore(embedding_dim=vectors.shape[1])"""
    store = VectorStore(collection_name=doc_id)
    store.add(vectors, chunks)

    documents[doc_id] = {
        "filename": file.filename,
        "store": store,
        "num_chunks": len(chunks),
        "num_pages": len(pages),
    }

    return DocumentInfo(
        doc_id=doc_id,
        filename=file.filename,
        num_pages=len(pages),
        num_chunks=len(chunks),
    )


@app.get("/documents", response_model=list[DocumentInfo])
def list_documents():
    return [
        DocumentInfo(
            doc_id=doc_id,
            filename=info["filename"],
            num_pages=info["num_pages"],
            num_chunks=info["num_chunks"],
        )
        for doc_id, info in documents.items()
    ]


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="doc_id not found.")
    """ This added with chromadb-backed vector store to delete the collection from disk """
    documents[doc_id]["store"].delete_collection()
    del documents[doc_id]
    return {"status": "deleted", "doc_id": doc_id}


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest):
    """
    Ask a question.
    - If request.doc_id is set, only searches that document.
    - If request.doc_id is None, searches across ALL uploaded documents and
      merges results by score (top-k per document, then re-sorted overall).
    """
    if not documents:
        raise HTTPException(status_code=400, detail="No documents uploaded yet.")

      # Pydantic gives us ConversationTurn objects; the RAG functions just want
    # plain {"question": ..., "answer": ...} dicts, so convert once here.
    history = [turn.model_dump() for turn in request.history]

    if request.doc_id is not None:
        if request.doc_id not in documents:
            raise HTTPException(status_code=404, detail="doc_id not found.")
        store = documents[request.doc_id]["store"]
        result = answer_question(request.question, embedder, store, top_k=request.top_k, history=history)
    else:
        result = _ask_across_all_documents(request.question, top_k=request.top_k, history=history)

    return AskResponse(**result)


def _ask_across_all_documents(question: str, top_k: int, history: list[dict]) -> dict:
    """
    Multi-PDF reasoning: retrieve top_k chunks from EACH document separately
    (so one large PDF can't drown out the others), merge, keep the best
    top_k overall, then run the same RAG prompt/LLM step once on the merged set.
    """
    from rag_pipeline import build_context_block, _build_sources, SYSTEM_PROMPT, OLLAMA_MODEL
    import ollama

    history = history or []
    standalone_question = condense_question(question, history)
    query_vector = embedder.embed_query(standalone_question)

    all_candidates = []
    for doc_id, info in documents.items():
        all_candidates.extend(info["store"].search(query_vector, top_k=top_k))

    if not all_candidates:
        return {"answer": "I couldn't find this in the provided documents.", "sources": []}

    all_candidates.sort(key=lambda c: c["score"], reverse=True)
    top_chunks = all_candidates[:top_k]

    context_block = build_context_block(top_chunks)
    user_prompt = f"""Document excerpts:

{context_block}

Question: {question}

Answer the question using only the excerpts above. Cite with bracketed excerpt
numbers like [1], never with chunk ids or page numbers written out."""
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history:
        messages.append({"role": "user", "content": turn["question"]})
        messages.append({"role": "assistant", "content": turn["answer"]})
    messages.append({"role": "user", "content": user_prompt})

    response = ollama.chat(
        model=OLLAMA_MODEL,
        messages=messages,
        options={"temperature": 0}
    )

    sources = _build_sources(top_chunks)
    return {"answer": response["message"]["content"], "sources": sources}