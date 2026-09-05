"""
Simplified 'vector store' using MongoDB with support for both naive and semantic search.

This stores chunks in the `chunks` collection and performs retrieval using either:
1. Naive token-overlap scoring (default, simpler for college projects)
2. Semantic similarity using embeddings (via sentence-transformers)
"""

import logging
from typing import List, Dict, Optional, Tuple
from config import settings
from db import get_db

logger = logging.getLogger(__name__)


class SimpleVectorStore:
    """Store chunks in MongoDB and retrieve by simple similarity."""

    def __init__(self):
        self.db = get_db()
        self.collection = self.db["chunks"]

    def add_chunks(self, chunks: List[Dict]) -> int:
        if not chunks:
            return 0
        docs = []
        for c in chunks:
            doc = {
                "_id": c.get("id"),
                "text": c.get("text"),
                "metadata": c.get("metadata", {})
            }
            docs.append(doc)
        # Upsert each chunk to avoid duplicates
        for d in docs:
            self.collection.update_one({"_id": d["_id"]}, {"$set": d}, upsert=True)
        logger.info(f"Stored {len(docs)} chunks in MongoDB")
        return len(docs)

    def query(self, query_text: str, n_results: int = 5, where_filter: Dict = None, book_id: str = None) -> Tuple[List[str], List[Dict], List[None], List[float]]:
        """Query using strategy based on config (semantic or naive)."""
        # Add book_id to filter if provided
        if book_id:
            where_filter = where_filter or {}
            where_filter["metadata.book_id"] = book_id
        
        # Use semantic search if configured and embeddings are available
        if settings.vector_db_type == "semantic":
            return self._semantic_query(query_text, n_results, where_filter)
        else:
            return self._naive_query(query_text, n_results, where_filter)

    def _naive_query(self, query_text: str, n_results: int = 5, where_filter: Dict = None) -> Tuple[List[str], List[Dict], List[None], List[float]]:
        # naive token overlap scoring
        tokens = set([t.lower() for t in query_text.split() if len(t) > 2])
        cursor = self.collection.find(where_filter or {})
        scored = []
        for doc in cursor:
            text_tokens = set([t.lower() for t in (doc.get("text") or "").split() if len(t) > 2])
            if not text_tokens:
                score = 0.0
            else:
                inter = tokens.intersection(text_tokens)
                score = len(inter) / max(1, len(tokens))
            scored.append((score, doc))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:n_results]
        documents = [d[1]["text"] for d in top]
        metadatas = [d[1].get("metadata", {}) for d in top]
        embeddings = [None for _ in top]
        similarity_scores = [float(d[0]) for d in top]
        return documents, metadatas, embeddings, similarity_scores

    def _semantic_query(self, query_text: str, n_results: int = 5, where_filter: Dict = None) -> Tuple[List[str], List[Dict], List[None], List[float]]:
        """Semantic search using embeddings."""
        try:
            from rag.embedding_manager import get_embedding_manager
            import numpy as np
            
            manager = get_embedding_manager()
            
            # Get embedding model and encode query
            from rag.embedding_manager import embed_text
            query_embedding = np.array(embed_text(query_text))
            
            # Get chunks with embeddings
            query_filter = {"embedding_vector": {"$exists": True, "$ne": None}}
            if where_filter:
                query_filter.update(where_filter)
            
            chunks = list(self.collection.find(query_filter))
            
            if not chunks:
                logger.warning(f"No chunks with embeddings found (where_filter={where_filter})")
                # Fallback to naive search
                return self._naive_query(query_text, n_results, where_filter)
            
            # Calculate similarities
            scored = []
            for chunk in chunks:
                try:
                    chunk_embedding = np.array(chunk.get("embedding_vector", []))
                    if len(chunk_embedding) == 0:
                        continue
                    
                    # Cosine similarity
                    dot_product = np.dot(query_embedding, chunk_embedding)
                    norm_q = np.linalg.norm(query_embedding)
                    norm_c = np.linalg.norm(chunk_embedding)
                    
                    if norm_q == 0 or norm_c == 0:
                        score = 0.0
                    else:
                        score = float(dot_product / (norm_q * norm_c))
                    
                    scored.append((score, chunk))
                except Exception as e:
                    logger.warning(f"Error calculating similarity: {str(e)}")
                    continue
            
            scored.sort(key=lambda x: x[0], reverse=True)
            top = scored[:n_results]
            documents = [d[1]["text"] for d in top]
            metadatas = [d[1].get("metadata", {}) for d in top]
            embeddings = [None for _ in top]
            similarity_scores = [float(d[0]) for d in top]
            
            return documents, metadatas, embeddings, similarity_scores
        
        except Exception as e:
            logger.warning(f"Semantic search failed, falling back to naive: {str(e)}")
            return self._naive_query(query_text, n_results, where_filter)

    def search(self, query_text: str, top_k: int = 5, book_id: str = None, use_semantic: bool = None) -> List[Dict]:
        """Search and return chunk dictionaries with similarity scores."""
        # Determine search strategy
        semantic = use_semantic if use_semantic is not None else (settings.vector_db_type == "semantic")
        
        where_filter = {}
        if book_id:
            where_filter["metadata.book_id"] = book_id
        
        documents, metadatas, embeddings, scores = self.query(
            query_text, top_k, where_filter, book_id
        )
        
        result = []
        for doc, meta, score in zip(documents, metadatas, scores):
            result.append({
                "text": doc,
                "metadata": meta,
                "similarity_score": score
            })
        
        return result

    def delete_by_book_id(self, book_id: str) -> int:
        res = self.collection.delete_many({"metadata.book_id": book_id})
        logger.info(f"Deleted {res.deleted_count} chunks for book {book_id}")
        return res.deleted_count

    def delete_all(self) -> bool:
        self.collection.delete_many({})
        logger.info("Cleared all chunks collection")
        return True

    def get_collection_stats(self) -> Dict:
        count = self.collection.count_documents({})
        return {"total_chunks": count}

    def health_check(self) -> bool:
        try:
            self.db.command("ping")
            return True
        except Exception as e:
            logger.error(f"MongoDB health check failed: {e}")
            return False


_store: Optional[SimpleVectorStore] = None


def get_vector_store() -> SimpleVectorStore:
    global _store
    if _store is None:
        _store = SimpleVectorStore()
    return _store


def init_vector_store():
    try:
        get_vector_store()
        logger.info("Vector store (MongoDB) initialized")
    except Exception as e:
        logger.error(f"Failed to initialize vector store: {e}")
        raise
