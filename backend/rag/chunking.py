"""
Text extraction and recursive chunking pipeline for engineering textbooks.
Splits text along natural structural boundaries (paragraphs, sentences)
and sizes chunks to fit the attention context of sentence-transformer models.
"""
import logging
from typing import List, Dict, Any
from pathlib import Path
import pypdf

logger = logging.getLogger(__name__)


class SimpleRecursiveSplitter:
    """Lightweight pure-Python recursive text splitter."""
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 180, separators: List[str] = None):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n\n", "\n\n", "\n", ". ", "; ", " ", ""]

    def split_text(self, text: str) -> List[str]:
        final_chunks = []
        separator = self.separators[-1]
        
        for sep in self.separators:
            if sep == "" or sep in text:
                separator = sep
                break

        splits = text.split(separator) if separator != "" else list(text)
        current_chunk = []
        current_len = 0

        for piece in splits:
            piece_len = len(piece) + (len(separator) if separator != "" else 0)
            if current_len + piece_len > self.chunk_size and current_chunk:
                joined = separator.join(current_chunk).strip()
                if joined:
                    final_chunks.append(joined)
                
                # Roll back for chunk overlap
                overlap_chars = 0
                overlap_pieces = []
                for p in reversed(current_chunk):
                    if overlap_chars + len(p) <= self.chunk_overlap:
                        overlap_pieces.insert(0, p)
                        overlap_chars += len(p)
                    else:
                        break
                current_chunk = overlap_pieces
                current_len = sum(len(p) for p in current_chunk) + (len(separator) * max(0, len(current_chunk) - 1))

            current_chunk.append(piece)
            current_len += piece_len

        if current_chunk:
            joined = separator.join(current_chunk).strip()
            if joined:
                final_chunks.append(joined)

        return final_chunks


class SimpleChunkingPipeline:
    """Text extraction and structure-aware chunking for PDFs."""

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 180):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.splitter = SimpleRecursiveSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap
        )

    def _extract_text(self, pdf_path: str) -> str:
        try:
            with open(pdf_path, 'rb') as f:
                reader = pypdf.PdfReader(f)
                parts = []
                for page in reader.pages:
                    txt = page.extract_text()
                    if txt:
                        parts.append(txt)
                return "\n\n".join(parts)
        except Exception as e:
            logger.error(f"PDF extraction failed for {pdf_path}: {e}")
            return ""

    def process_book(
        self,
        pdf_path: str,
        book_id: str,
        book_name: str = "",
        department: str = "",
        year_of_study: str = "",
        subject: str = ""
    ) -> List[Dict[str, Any]]:
        text = self._extract_text(pdf_path)
        if not text:
            return []

        split_texts = self.splitter.split_text(text)

        chunks = []
        for i, c in enumerate(split_texts):
            clean_text = c.strip()
            if len(clean_text) < 40:
                continue

            chunks.append({
                "id": f"{book_id}_chunk_{i}",
                "text": clean_text,
                "metadata": {
                    "book_id": book_id,
                    "book_name": book_name,
                    "department": department,
                    "year_of_study": year_of_study,
                    "subject": subject,
                    "chunk_index": i,
                }
            })

        logger.info(f"Split book '{book_id}' into {len(chunks)} structural chunks")
        return chunks


_pipeline: SimpleChunkingPipeline | None = None


def get_chunking_pipeline() -> SimpleChunkingPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = SimpleChunkingPipeline()
    return _pipeline


def init_chunking_pipeline():
    global _pipeline
    _pipeline = SimpleChunkingPipeline()
    logger.info("Chunking pipeline initialized")