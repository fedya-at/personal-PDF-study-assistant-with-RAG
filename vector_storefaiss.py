"""In memory vector store."""
import faiss


class VectorStore:
    def __init__(self, embedding_dim: int):
        self.index = faiss.IndexFlatIP(embedding_dim)  # inner product == cosine (normalized vectors)
        self.metadata = []

    def add(self, vectors, chunk_metadata: list[dict]):
        assert len(vectors) == len(chunk_metadata)
        self.index.add(vectors)
        self.metadata.extend(chunk_metadata)

    def search(self, query_vector, top_k: int = 4) -> list[dict]:
        scores, indices = self.index.search(query_vector, top_k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            r = dict(self.metadata[idx])
            r["score"] = float(score)
            results.append(r)
        return results

    def size(self) -> int:
        return len(self.metadata)
