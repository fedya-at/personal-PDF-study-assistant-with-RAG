# Personal PDF Study Assistant — FastAPI Service

A web API version of the PDF Study Assistant, using Ollama (local, free, no API key) as the LLM.

## 1. Prerequisites

- Python 3.10+
- [Ollama](https://ollama.com/download) installed and running
- A model pulled locally:
  ```bash
  ollama pull llama3.2
  ```

## 2. Setup

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

## 3. Run the server

```bash
   python -m uvicorn app:app --reload
```

The API is now live at `http://127.0.0.1:8000`.
Open `http://127.0.0.1:8000/docs` for interactive Swagger UI — you can try every endpoint from the browser, no curl needed.

## 4. Endpoints

### Upload a PDF
```bash
curl -X POST "http://127.0.0.1:8000/documents/upload" \
  -F "file=@my_notes.pdf"
```
Response:
```json
{
  "doc_id": "a1b2c3d4",
  "filename": "my_notes.pdf",
  "num_pages": 42,
  "num_chunks": 138
}
```
Save the `doc_id` — you'll use it (optionally) when asking questions.

### List uploaded documents
```bash
curl "http://127.0.0.1:8000/documents"
```

### Ask a question (scoped to one document)
```bash
curl -X POST "http://127.0.0.1:8000/ask" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is photosynthesis?", "doc_id": "a1b2c3d4", "top_k": 4}'
```

### Ask a question across ALL uploaded documents
Omit `doc_id` entirely:
```bash
curl -X POST "http://127.0.0.1:8000/ask" \
  -H "Content-Type: application/json" \
  -d '{"question": "Compare what these documents say about evolution", "top_k": 4}'
```
This retrieves the top matches from *each* document separately first, then merges and re-ranks — so a large PDF can't drown out a smaller one (see the tutorial's "multi-PDF reasoning" upgrade idea).

Response shape (same for both cases):
```json
{
  "answer": "Photosynthesis is ... [a1b2c3d4-p12-c2, page 12]",
  "sources": [
    {"chunk_id": "a1b2c3d4-p12-c2", "doc_id": "a1b2c3d4", "page_number": 12, "score": 0.81}
  ]
}
```

### Delete a document
```bash
curl -X DELETE "http://127.0.0.1:8000/documents/a1b2c3d4"
```

## 5. Important limitations (by design, for learning purposes)

- **In-memory only.** All uploaded documents and their vector indexes live in RAM. Restarting the server clears everything. To persist across restarts, save each `VectorStore`'s FAISS index with `faiss.write_index()` and its `metadata` list to a JSON file, then reload both on startup — or swap FAISS for ChromaDB, which persists to disk automatically.
- **No authentication.** Anyone who can reach this server can upload/ask/delete. Fine for local use; add an API key or auth middleware before exposing it publicly.
- **Single Ollama model, single worker.** Concurrent requests will queue behind Ollama's own concurrency limits. Fine for personal use; for many simultaneous users you'd want a task queue and/or a hosted LLM provider with real concurrency.

## 6. Swapping the LLM

`rag_pipeline.py` is the only file that talks to the LLM. To use Groq or OpenAI instead of Ollama, just replace the `ollama.chat(...)` call in `rag_pipeline.py` (and in `app.py`'s `_ask_across_all_documents`) with the equivalent client call — nothing else in the project needs to change.
