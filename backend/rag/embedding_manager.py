"""
Embedding management for semantic search using sentence-transformers.
Handles embedding generation, storage, and retrieval.
Falls back to simple hashing if sentence_transformers is not available.
"""

import logging
import numpy as np
from typing import List, Dict, Optional
import hashlib

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    SentenceTransformer = None

from config import settings
from db import get_db, ChunkModel, BookModel

logger = logging.getLogger(__name__)

# Global embedding model instance
_embedding_model: Optional[object] = None


def get_embedding_model():
    """Get or initialize the embedding model.
    
    Falls back to hash-based embeddings if sentence_transformers is not available.
    """
    global _embedding_model
    if _embedding_model is None:
        if SENTENCE_TRANSFORMERS_AVAILABLE:
            try:
                logger.info(f"Loading embedding model: {settings.embedding_model}")
                _embedding_model = SentenceTransformer(settings.embedding_model)
                logger.info("✅ Embedding model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load embedding model: {str(e)}, using fallback")
                _embedding_model = "hash_fallback"
        else:
            logger.warning("⚠️ sentence_transformers not available, using hash-based fallback embeddings")
            _embedding_model = "hash_fallback"
    return _embedding_model


def _hash_to_embedding(text: str, dim: int = 384) -> List[float]:
    """Generate a deterministic embedding from text hash."""
    # Create a hash and use it to generate a consistent embedding vector
    hash_digest = hashlib.sha256(text.encode()).hexdigest()
    # Convert hash to list of floats in range [-1, 1]
    embedding = []
    for i in range(dim):
        byte_val = int(hash_digest[i*2:(i*2)+2], 16) if i*2 < len(hash_digest) else 0
        # Normalize to [-1, 1]
        embedding.append((byte_val / 128.0) - 1.0)
    return embedding


def embed_text(text: str) -> List[float]:
    """Generate embedding for a single text."""
    try:
        model = get_embedding_model()
        if model == "hash_fallback":
            return _hash_to_embedding(text, settings.embedding_dimension)
        else:
            embedding = model.encode(text, convert_to_tensor=False)
            return embedding.tolist()
    except Exception as e:
        logger.error(f"Error generating embedding: {str(e)}")
        # Return fallback embedding
        return _hash_to_embedding(text, settings.embedding_dimension)


def embed_texts(texts: List[str], batch_size: int = 32) -> List[List[float]]:
    """Generate embeddings for multiple texts."""
    try:
        model = get_embedding_model()
        if model == "hash_fallback":
            return [_hash_to_embedding(text, settings.embedding_dimension) for text in texts]
        else:
            embeddings = model.encode(texts, batch_size=batch_size, convert_to_tensor=False)
            return embeddings.tolist()
    except Exception as e:
        logger.error(f"Error generating embeddings: {str(e)}")
        raise


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors."""
    if len(vec1) == 0 or len(vec2) == 0:
        return 0.0
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot_product / (norm1 * norm2))


class EmbeddingManager:
    """Manages embedding generation and storage."""

    def __init__(self):
        self.db = get_db()
        self.model = None

    def rebuild_all_embeddings(self) -> Dict:
        """Rebuild embeddings for all chunks."""
        try:
            logger.info("Starting rebuild of all embeddings...")
            db = get_db()
            chunks_collection = db["chunks"]
            
            # Get all chunks
            all_chunks = list(chunks_collection.find({}))
            logger.info(f"Found {len(all_chunks)} chunks to process")
            
            if len(all_chunks) == 0:
                return {"status": "success", "chunks_processed": 0, "message": "No chunks to process"}
            
            # Extract texts
            texts = [chunk.get("text", "") for chunk in all_chunks]
            
            # Generate embeddings in batches
            embeddings = embed_texts(texts, batch_size=32)
            
            # Update chunks with embeddings
            for chunk, embedding in zip(all_chunks, embeddings):
                chunks_collection.update_one(
                    {"_id": chunk["_id"]},
                    {"$set": {"embedding_vector": embedding}}
                )
            
            logger.info(f"Successfully updated {len(all_chunks)} chunks with embeddings")
            return {
                "status": "success",
                "chunks_processed": len(all_chunks),
                "message": f"Updated {len(all_chunks)} chunks"
            }
        
        except Exception as e:
            logger.error(f"Error rebuilding embeddings: {str(e)}")
            return {"status": "failed", "error": str(e)}

    def rebuild_book_embeddings(self, book_id: str) -> Dict:
        """Rebuild embeddings for a specific book."""
        try:
            logger.info(f"Starting rebuild of embeddings for book {book_id}...")
            db = get_db()
            chunks_collection = db["chunks"]
            
            # Get all chunks for the book
            book_chunks = list(chunks_collection.find({"metadata.book_id": book_id}))
            logger.info(f"Found {len(book_chunks)} chunks for book {book_id}")
            
            if len(book_chunks) == 0:
                return {"status": "success", "chunks_processed": 0, "message": f"No chunks found for book {book_id}"}
            
            # Extract texts
            texts = [chunk.get("text", "") for chunk in book_chunks]
            
            # Generate embeddings in batches
            embeddings = embed_texts(texts, batch_size=32)
            
            # Update chunks with embeddings
            for chunk, embedding in zip(book_chunks, embeddings):
                chunks_collection.update_one(
                    {"_id": chunk["_id"]},
                    {"$set": {"embedding_vector": embedding}}
                )
            
            # Update book status
            BookModel.update_status(book_id, "indexed", total_chunks=len(book_chunks))
            
            logger.info(f"Successfully updated {len(book_chunks)} chunks for book {book_id}")
            return {
                "status": "success",
                "book_id": book_id,
                "chunks_processed": len(book_chunks),
                "message": f"Updated {len(book_chunks)} chunks for book"
            }
        
        except Exception as e:
            logger.error(f"Error rebuilding book embeddings: {str(e)}")
            return {"status": "failed", "error": str(e)}

    def clear_all_embeddings(self) -> Dict:
        """Clear all embedding vectors."""
        try:
            logger.info("Clearing all embedding vectors...")
            ChunkModel.clear_embeddings()
            return {"status": "success", "message": "All embeddings cleared"}
        except Exception as e:
            logger.error(f"Error clearing embeddings: {str(e)}")
            return {"status": "failed", "error": str(e)}

    def clear_book_embeddings(self, book_id: str) -> Dict:
        """Clear embeddings for a specific book."""
        try:
            logger.info(f"Clearing embeddings for book {book_id}...")
            ChunkModel.clear_embeddings(book_id=book_id)
            return {"status": "success", "message": f"Embeddings cleared for book {book_id}"}
        except Exception as e:
            logger.error(f"Error clearing book embeddings: {str(e)}")
            return {"status": "failed", "error": str(e)}

    def search_semantic(self, query: str, top_k: int = 5, book_id: Optional[str] = None) -> List[Dict]:
        """Search chunks using semantic similarity."""
        try:
            # Generate query embedding
            query_embedding = np.array(embed_text(query))
            
            # Get chunks from database
            db = get_db()
            chunks_collection = db["chunks"]
            
            query_filter = {"embedding_vector": {"$exists": True, "$ne": None}}
            if book_id:
                query_filter["metadata.book_id"] = book_id
            
            chunks = list(chunks_collection.find(query_filter))
            
            if not chunks:
                logger.warning(f"No chunks with embeddings found for query (book_id={book_id})")
                return []
            
            # Calculate similarities
            scored_chunks = []
            for chunk in chunks:
                try:
                    chunk_embedding = np.array(chunk.get("embedding_vector", []))
                    if len(chunk_embedding) == 0:
                        continue
                    
                    similarity = cosine_similarity(query_embedding, chunk_embedding)
                    scored_chunks.append({
                        "_id": chunk["_id"],
                        "text": chunk.get("text", ""),
                        "metadata": chunk.get("metadata", {}),
                        "similarity_score": similarity
                    })
                except Exception as e:
                    logger.warning(f"Error calculating similarity for chunk: {str(e)}")
                    continue
            
            # Sort by similarity and return top-k
            scored_chunks.sort(key=lambda x: x["similarity_score"], reverse=True)
            return scored_chunks[:top_k]
        
        except Exception as e:
            logger.error(f"Error in semantic search: {str(e)}")
            return []


# Global embedding manager instance
_embedding_manager: Optional[EmbeddingManager] = None


def get_embedding_manager() -> EmbeddingManager:
    """Get or initialize the embedding manager."""
    global _embedding_manager
    if _embedding_manager is None:
        _embedding_manager = EmbeddingManager()
    return _embedding_manager


def init_embedding_manager():
    """Initialize embedding manager on startup."""
    try:
        manager = get_embedding_manager()
        # Pre-load the model to avoid first-request delay
        get_embedding_model()
        logger.info("✅ Embedding manager initialized")
    except Exception as e:
        logger.error(f"Failed to initialize embedding manager: {str(e)}")
        raise
