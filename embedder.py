"""Embeddings: turn text chunks into vectors using sentence-transformers (local, free)."""
from sentence_transformers import SentenceTransformer


class Embedder:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)

    def embed_texts(self, texts: list[str]):
        return self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True  # lets us use dot product as cosine similarity
        ).astype("float32")

    def embed_query(self, query: str):
        return self.embed_texts([query])
