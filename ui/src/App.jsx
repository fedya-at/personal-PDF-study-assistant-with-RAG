import { useState, useEffect } from "react";

const LOADING_PHRASES = [
  "Reading your answer",
  "Thinking about answer",
  "Preparing response",
];

// Change this if your FastAPI server runs somewhere else.
const API_BASE = "http://127.0.0.1:8000";

/**
 * The LLM writes citations inline as plain "[1]", "[2]" markers. This splits
 * the answer text on those markers and turns each one into a small clickable
 * badge. `messageId` is included in the active-citation key so hovering a
 * badge in one turn never highlights a same-numbered pill in a different turn.
 */
function renderAnswerWithCitations(
  answerText,
  messageId,
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
    const citationKey = `${messageId}:${citationNumber}`;
    return (
      <sup
        key={index}
        className={`citation-badge ${activeCitation === citationKey ? "citation-badge-active" : ""}`}
        onMouseEnter={() => setActiveCitation(citationKey)}
        onMouseLeave={() => setActiveCitation(null)}
      >
        {citationNumber}
      </sup>
    );
  });
}

let nextMessageId = 1;

export default function App() {
  // ---------- State ----------
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  // The whole conversation thread: each item is one Q&A turn.
  // { id, question, answer, sources, error, loading }
  const [messages, setMessages] = useState([]);
  const [activeCitation, setActiveCitation] = useState(null); // "messageId:citationNumber"
  const [theme, setTheme] = useState("light");
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);

  useEffect(() => {
    const storedTheme = localStorage.getItem("pdf-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (!asking) return;

    const interval = window.setInterval(() => {
      setLoadingPhraseIndex((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 1200);

    return () => window.clearInterval(interval);
  }, [asking]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("pdf-theme", theme);
  }, [theme]);

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

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");

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

      await fetchDocuments();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  // ---------- Ask a question (as part of an ongoing conversation) ----------
  async function handleAsk() {
    const currentQuestion = question.trim();
    if (!currentQuestion) return;

    // History sent to the API is every PRIOR turn that finished successfully —
    // this is what lets a follow-up like "what about page 5?" be understood.
    const history = messages
      .filter((m) => m.answer && !m.error)
      .map((m) => ({ question: m.question, answer: m.answer }));

    const messageId = nextMessageId++;

    // Show the user's question immediately, with a "thinking" placeholder,
    // instead of waiting for the response to show anything.
    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        question: currentQuestion,
        answer: null,
        sources: [],
        error: null,
        loading: true,
      },
    ]);
    setQuestion("");
    setAsking(true);

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion,
          doc_id: selectedDocId || null,
          top_k: 6,
          history,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.detail || "The request failed.");
      }

      const data = await res.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                answer: data.answer,
                sources: data.sources,
                loading: false,
              }
            : m,
        ),
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, error: err.message, loading: false } : m,
        ),
      );
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

  function handleNewConversation() {
    setMessages([]);
    setActiveCitation(null);
  }

  const handleDeleteDocument = async (docId) => {
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.detail || "Failed to delete document.");
      }

      // Remove the document from the local state
      setDocuments((prev) => prev.filter((doc) => doc.doc_id !== docId));
      delete documents[docId];
    } catch (err) {
      console.error("Error deleting document:", err);
    }
  };

  return (
    <div className="page">
      <header className="header">
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={() =>
              setTheme((current) => (current === "light" ? "dark" : "light"))
            }
          >
            {theme === "light" ? "🌙 Dark mode" : "☀️ Light mode"}
          </button>
        </div>
        <h1>📖 PDF Study Assistant</h1>
        <p className="subtitle">
          Upload your notes. Ask questions. Get answers with page citations.
        </p>
      </header>

      <div className="layout">
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
                <span
                  className="delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDocument(doc.doc_id);
                  }}
                >
                  delete
                </span>
              </button>
            ))}

            {documents.length === 0 && (
              <p className="empty-hint">No PDFs uploaded yet.</p>
            )}
          </div>

          {messages.length > 0 && (
            <button className="new-chat-button" onClick={handleNewConversation}>
              + New conversation
            </button>
          )}
        </aside>

        <main className="main">
          <div className="thread">
            {messages.length === 0 && (
              <p className="empty-hint">
                Ask a question to start the conversation.
              </p>
            )}

            {messages.map((m) => (
              <div key={m.id} className="turn">
                <div className="question-bubble">{m.question}</div>

                {m.loading && (
                  <div className="thinking" aria-label="Loading response">
                    <span className="thinking-text">
                      {LOADING_PHRASES[loadingPhraseIndex]}
                    </span>
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                )}
                {m.error && <p className="error">{m.error}</p>}

                {m.answer && (
                  <div className="answer-card">
                    <p className="answer-text">
                      {renderAnswerWithCitations(
                        m.answer,
                        m.id,
                        activeCitation,
                        setActiveCitation,
                      )}
                    </p>

                    {m.sources.length > 0 && (
                      <div className="sources">
                        <h4>Sources</h4>
                        <ul>
                          {m.sources.map((s) => {
                            const citationKey = `${m.id}:${s.citation_number}`;
                            return (
                              <li
                                key={s.chunk_id}
                                className={`source-pill ${
                                  activeCitation === citationKey
                                    ? "source-pill-active"
                                    : ""
                                }`}
                                onMouseEnter={() =>
                                  setActiveCitation(citationKey)
                                }
                                onMouseLeave={() => setActiveCitation(null)}
                              >
                                <span className="source-pill-number">
                                  {s.citation_number}
                                </span>
                                page {s.page_number} · score{" "}
                                {s.score.toFixed(2)}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="ask-box">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleQuestionKeyDown}
              placeholder={
                messages.length === 0
                  ? "Ask a question about your PDF... (Enter to send)"
                  : "Ask a follow-up... (Enter to send)"
              }
              rows={3}
            />
            <button onClick={handleAsk} disabled={asking || !question.trim()}>
              {asking ? "Thinking…" : "Ask"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
