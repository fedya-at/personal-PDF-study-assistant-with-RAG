# PDF Study Assistant — React UI

A minimal React frontend for the FastAPI PDF Study Assistant backend. No Tailwind, no component libraries, no state management library — just React's built-in `useState`/`useEffect` and the browser's `fetch`, so the code stays readable if you're new to React.

## What it does

- Upload PDFs (drag-free — just a file picker button)
- See a list of uploaded documents in the sidebar
- Pick "All documents" or one specific document to search
- Ask a question, see the answer with clickable-style source pills showing page number + chunk id

## 1. Prerequisites

- Node.js 18+ installed (`node -v` to check)
- The FastAPI backend from the previous step **already running** at `http://127.0.0.1:8000`
  (run `uvicorn app:app --reload` in that project first — this UI is just a client for it)

## 2. Setup

```bash
npm install
```

## 3. Run it

```bash
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173`. Open that in your browser.

## 4. How the code is organized

```
src/
├── main.jsx     # entry point — mounts <App /> into the page
├── App.jsx      # the ENTIRE UI logic lives here (on purpose, for simplicity)
└── App.css      # plain CSS, no framework
```

Everything is in one `App.jsx` file rather than split into many small components. That's a deliberate simplification for learning — in a bigger app you'd split this into `<UploadPanel />`, `<DocumentList />`, `<AskBox />`, `<AnswerCard />` components, but one file is easier to read top-to-bottom when you're first learning how a React app talks to a backend.

## 5. The three things every React-to-API app needs

If you're new to connecting React to a backend, these are the three patterns used throughout `App.jsx`:

1. **State to hold server data:**
   ```js
   const [documents, setDocuments] = useState([]);
   ```
2. **`fetch` to talk to the API**, then `setDocuments(...)` to store the response so React re-renders:
   ```js
   const res = await fetch(`${API_BASE}/documents`);
   const data = await res.json();
   setDocuments(data);
   ```
3. **`useEffect` to run a fetch once when the page first loads:**
   ```js
   useEffect(() => {
     fetchDocuments();
   }, []); // empty array = "run once, on mount"
   ```

Everything else in the file is just applying these three patterns to upload, ask, and delete.

## 6. Common issues

- **"Failed to fetch" / network error in the browser console** → the FastAPI server isn't running, or isn't on port 8000. Check the terminal where you ran `uvicorn app:app --reload`.
- **CORS error in the browser console** → shouldn't happen here since the backend already allows all origins (`allow_origins=["*"]` in `app.py`), but if you changed that, you'll need to add `http://localhost:5173` to the allowed origins list.
- **Upload succeeds but nothing shows up** → check the FastAPI terminal for errors (e.g. a scanned PDF with no extractable text will return a 422 error, shown in the UI as a red error line).

## 7. Where to go next

- Add a loading skeleton instead of "Thinking…" text
- Show the actual chunk text in a source pill on hover/click (the API already returns `chunk_id`; you'd add the raw text to the API response too)
- Add a delete button next to each document in the sidebar (the backend already has `DELETE /documents/{doc_id}` ready to use)
- Persist chat history in state so previous Q&A pairs stay visible instead of being replaced by the newest one
