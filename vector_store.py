"""ChromaDB-backed vector store: indexes chunk vectors and runs similarity search."""
import chromadb

# One shared Chroma client for the whole app. Using PersistentClient means
# your index survives a server restart — swap to chromadb.Client() (no path)
# if you want the old FAISS-style "everything resets on restart" behavior.
_client = chromadb.PersistentClient(path="./chroma_data")


class VectorStore:
    def __init__(self, collection_name: str):
        # metadata={"hnsw:space": "cosine"} makes Chroma use cosine distance,
        # matching how our normalized embeddings were designed to be compared.
        self.collection = _client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def add(self, vectors, chunk_metadata: list[dict]):
        self.collection.add(
            ids=[c["chunk_id"] for c in chunk_metadata],
            embeddings=vectors.tolist(),
            documents=[c["text"] for c in chunk_metadata],
            metadatas=[
                {"doc_id": c.get("doc_id", ""), "page_number": c["page_number"]}
                for c in chunk_metadata
            ],
        )

    def search(self, query_vector, top_k: int = 4) -> list[dict]:
        results = self.collection.query(
            query_embeddings=query_vector.tolist(),
            n_results=top_k,
        )

        ids = results["ids"][0]
        distances = results["distances"][0]
        metadatas = results["metadatas"][0]
        documents = results["documents"][0]

        output = []
        for i in range(len(ids)):
            output.append({
                "chunk_id": ids[i],
                "doc_id": metadatas[i].get("doc_id", ""),
                "page_number": metadatas[i]["page_number"],
                "text": documents[i],
                "score": 1 - distances[i],  # cosine distance -> similarity
            })
        return output

    def size(self) -> int:
        return self.collection.count()

    def delete_collection(self):
        """Call this when a document is deleted, so its data isn't orphaned on disk."""
        _client.delete_collection(name=self.collection.name)