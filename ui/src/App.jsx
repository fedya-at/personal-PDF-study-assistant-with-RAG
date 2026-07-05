import { useState, useEffect } from "react";

// Change this if your FastAPI server runs somewhere else.
const API_BASE = "http://127.0.0.1:8000";
function renderAnswerWithCitations(
  answerText,
  activeCitation,
  setActiveCitation,
) {
  const parts = answerText.split(/(\[\d+\])/g);

  return parts.map((part, index) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match) {
      return <span key={index}>{part}</span>;
    }

    const citationNumber = Number(match[1]);
    return (
      <sup
        key={index}
        className={`citation-badge ${activeCitation === citationNumber ? "citation-badge-active" : ""}`}
        onMouseEnter={() => setActiveCitation(citationNumber)}
        onMouseLeave={() => setActiveCitation(null)}
      >
        {citationNumber}
      </sup>
    );
  });
}
export default function App() {
  // ---------- State ----------
  const [documents, setDocuments] = useState([]); // list of uploaded PDFs
  const [selectedDocId, setSelectedDocId] = useState(""); // "" means "search all documents"
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
const [activeCitation, setActiveCitation] = useState(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function fetchDocuments() {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      console.error("Could not reach the API. Is uvicorn running?", err);
    }
  }

  // ---------- Upload a PDF ----------
  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");

    // Files must be sent as multipart form data, not JSON.
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.detail || "Upload failed.");
      }

      await fetchDocuments(); // refresh the list to show the new PDF
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      event.target.value = ""; // reset the file input so the same file can be re-selected
    }
  }

  // ---------- Ask a question ----------
  async function handleAsk() {
    if (!question.trim()) return;

    setAsking(true);
    setAskError("");
    setAnswer("");
    setSources([]);

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          doc_id: selectedDocId || null, // empty string -> null -> search all docs
          top_k: 4,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.detail || "The request failed.");
      }

      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources);
    } catch (err) {
      setAskError(err.message);
    } finally {
      setAsking(false);
    }
  }

  function handleQuestionKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleAsk();
    }
  }

  const handleDeleteDocument = async (docId) => {
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.detail || "Delete failed.");
      }

      await fetchDocuments(); // refresh the list to show the updated documents
    } catch (err) {
      console.error("Error deleting document:", err);
    }
  };

  // ---------- Render ----------
  return (
    <div className="page">
      <header className="header">
        <h1>📖 PDF Study Assistant</h1>
        <p className="subtitle">
          Upload your notes. Ask questions. Get answers with page citations.
        </p>
      </header>

      <div className="layout">
        {/* ---------- Left column: upload + document list ---------- */}
        <aside className="sidebar">
          <h2>Your documents</h2>

          <label className="upload-button">
            {uploading ? "Uploading…" : "+ Upload a PDF"}
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              disabled={uploading}
              hidden
            />
          </label>
          {uploadError && <p className="error">{uploadError}</p>}

          <div className="doc-list">
            <button
              className={`doc-item ${selectedDocId === "" ? "doc-item-active" : ""}`}
              onClick={() => setSelectedDocId("")}
            >
              All documents
            </button>

            {documents.map((doc) => (
              <button
                key={doc.doc_id}
                className={`doc-item ${selectedDocId === doc.doc_id ? "doc-item-active" : ""}`}
                onClick={() => setSelectedDocId(doc.doc_id)}
                title={doc.filename}
              >
                <span className="doc-name">{doc.filename}</span>
                <span className="doc-meta">
                  {doc.num_pages}p · {doc.num_chunks} chunks
                </span>
                <button
                  className="delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDocument(doc.doc_id);
                  }}
                >
                  delete
                </button>
              </button>
            ))}

            {documents.length === 0 && (
              <p className="empty-hint">No PDFs uploaded yet.</p>
            )}
          </div>
        </aside>

        {/* ---------- Right column: ask questions ---------- */}
        <main className="main">
          <div className="ask-box">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleQuestionKeyDown}
              placeholder="Ask a question about your PDF... (Enter to send)"
              rows={3}
            />
            <button onClick={handleAsk} disabled={asking || !question.trim()}>
              {asking ? "Thinking…" : "Ask"}
            </button>
          </div>

          {askError && <p className="error">{askError}</p>}

          {answer && (
            <div className="answer-card">
              <h3>Answer</h3>
              <p className="answer-text">
                {renderAnswerWithCitations(
                  answer,
                  activeCitation,
                  setActiveCitation,
                )}
              </p>

              {sources.length > 0 && (
                <div className="sources">
                  <h4>Sources</h4>
                  <ul>
                    {sources.map((s) => (
                      <li
                        key={s.chunk_id}
                        className={`source-pill ${activeCitation === s.citation_number ? "source-pill-active" : ""}`}
                        onMouseEnter={() =>
                          setActiveCitation(s.citation_number)
                        }
                        onMouseLeave={() => setActiveCitation(null)}
                      >
                        <span className="source-pill-number">
                          {s.citation_number}
                        </span>
                        page {s.page_number} · score {s.score.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
