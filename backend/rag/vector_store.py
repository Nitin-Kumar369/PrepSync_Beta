"""
ChromaDB vector store implementation.
Persists chunks, embeddings, and metadata directly in ChromaDB.
"""
import sys
import os
import logging

# Ensure backend root is on sys.path for internal imports like 'config'
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# SQLite workaround for environments with outdated system sqlite3
try:
    __import__("pysqlite3")
    sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
except ImportError:
    pass

import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import List, Dict, Optional, Tuple
from config import settings
from rag.embedding_manager import embed_text, embed_texts

logger = logging.getLogger(__name__)


class ChromaVectorStore:
    """Store chunks and vector embeddings using persistent ChromaDB."""

    def __init__(self):
        os.makedirs(settings.chroma_db_path, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=settings.chroma_db_path,
            settings=ChromaSettings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(
            name=settings.chroma_collection_name,
            metadata={"hnsw:space": "cosine"}
        )

    def add_chunks(self, chunks: List[Dict]) -> int:
        """Embed and upsert chunks with their metadata into ChromaDB."""
        if not chunks:
            return 0

        ids = [c["id"] for c in chunks]
        texts = [c["text"] for c in chunks]

        sanitized_metadatas = []
        for c in chunks:
            raw_meta = c.get("metadata", {})
            clean_meta = {}
            for k, v in raw_meta.items():
                if v is None:
                    clean_meta[k] = ""
                elif isinstance(v, (str, int, float, bool)):
                    clean_meta[k] = v
                else:
                    clean_meta[k] = str(v)
            sanitized_metadatas.append(clean_meta)

        embeddings = embed_texts(texts, batch_size=32)

        self.collection.upsert(
            ids=ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=sanitized_metadatas
        )
        logger.info(f"Upserted {len(ids)} chunks into ChromaDB collection '{settings.chroma_collection_name}'")
        return len(ids)

    def query(
        self,
        query_text: str,
        n_results: int = 5,
        where_filter: Optional[Dict] = None,
        book_id: Optional[str] = None
    ) -> Tuple[List[str], List[Dict], List[None], List[float]]:
        """Query ChromaDB using cosine similarity."""
        conditions = []
        if book_id:
            conditions.append({"book_id": {"$eq": book_id}})

        if where_filter:
            for k, v in where_filter.items():
                if v:
                    field = k.replace("metadata.", "")
                    conditions.append({field: {"$eq": v}})

        if len(conditions) > 1:
            query_where = {"$and": conditions}
        elif len(conditions) == 1:
            query_where = conditions[0]
        else:
            query_where = None

        query_embedding = embed_text(query_text)

        total_available = self.collection.count()
        if total_available == 0:
            logger.warning("ChromaDB collection is empty.")
            return [], [], [], []

        effective_n = min(n_results, total_available)

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=effective_n,
            where=query_where
        )

        documents = results["documents"][0] if results["documents"] else []
        metadatas = results["metadatas"][0] if results["metadatas"] else []
        distances = results["distances"][0] if results.get("distances") and results["distances"] else []

        similarity_scores = [max(0.0, 1.0 - float(d)) for d in distances]
        embeddings = [None] * len(documents)

        return documents, metadatas, embeddings, similarity_scores

    def search(
        self,
        query_text: str,
        top_k: int = 5,
        book_id: Optional[str] = None,
        use_semantic: bool = True
    ) -> List[Dict]:
        """Convenience method returning a list of matched chunk dicts."""
        documents, metadatas, _, scores = self.query(
            query_text=query_text,
            n_results=top_k,
            book_id=book_id
        )

        results = []
        for doc, meta, score in zip(documents, metadatas, scores):
            results.append({
                "text": doc,
                "metadata": meta,
                "similarity_score": score
            })
        return results

    def delete_by_book_id(self, book_id: str) -> int:
        """Delete all chunks tagged with a specific book_id."""
        try:
            self.collection.delete(where={"book_id": {"$eq": book_id}})
            logger.info(f"Deleted chunks for book '{book_id}' from ChromaDB")
            return 1
        except Exception as e:
            logger.error(f"Error deleting chunks for book {book_id}: {e}")
            return 0

    def delete_all(self) -> bool:
        """Clear all vectors from the collection."""
        try:
            self.client.delete_collection(settings.chroma_collection_name)
            self.collection = self.client.get_or_create_collection(
                name=settings.chroma_collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            logger.info("Cleared ChromaDB collection")
            return True
        except Exception as e:
            logger.error(f"Failed to clear ChromaDB: {e}")
            return False

    def get_collection_stats(self) -> Dict:
        """Return collection count."""
        return {"total_chunks": self.collection.count()}

    def health_check(self) -> bool:
        """Ping ChromaDB client."""
        try:
            self.client.heartbeat()
            return True
        except Exception as e:
            logger.error(f"ChromaDB health check failed: {e}")
            return False


_store: Optional[ChromaVectorStore] = None


def get_vector_store() -> ChromaVectorStore:
    global _store
    if _store is None:
        _store = ChromaVectorStore()
    return _store


def init_vector_store():
    get_vector_store()
    logger.info("ChromaDB vector store initialized")