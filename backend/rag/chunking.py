"""
Simplified chunking pipeline for college-level demo.

Extracts text from a PDF using pypdf and splits into fixed-size chunks.
This avoids heavy external dependencies and preserves plain-text content.
"""

import logging
from typing import List, Dict, Any
from pathlib import Path
import pypdf

logger = logging.getLogger(__name__)


class SimpleChunkingPipeline:
    """Simple text extraction and chunking from PDFs."""

    def __init__(self, chunk_size: int = 6000, chunk_overlap: int = 400):
        # 6000 chars ≈ 1000 words (averaging 6 chars/word + spaces)
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

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
            logger.error(f"PDF extraction failed: {e}")
            return ""

    def _split_text(self, text: str) -> List[str]:
        if not text:
            return []
        chunks = []
        start = 0
        length = len(text)
        while start < length:
            end = start + self.chunk_size
            chunk = text[start:end]
            chunks.append(chunk.strip())
            start = end - self.chunk_overlap if end < length else end
        return chunks

    def process_book(self, pdf_path: str, book_id: str, book_name: str = "", department: str = "", year_of_study: str = "", subject: str = "") -> List[Dict[str, Any]]:
        """Extract text and return list of simple chunk dicts."""
        text = self._extract_text(pdf_path)
        if not text:
            return []

        raw_chunks = self._split_text(text)
        chunks = []
        for i, c in enumerate(raw_chunks):
            chunks.append({
                "id": f"{book_id}_chunk_{i}",
                "text": c,
                "metadata": {
                    "book_id": book_id,
                    "book_name": book_name,
                    "department": department,
                    "year_of_study": year_of_study,
                    "subject": subject,
                    "chunk_index": i,
                }
            })
        logger.info(f"Split book {book_id} into {len(chunks)} chunks")
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


if __name__ == "__main__":
    # Test chunking (requires a sample PDF)
    import logging

    logging.basicConfig(level=logging.INFO)

    pipeline = get_chunking_pipeline()

    # Example: process a test PDF (if it exists)
    test_pdf = "./test_book.pdf"
    if Path(test_pdf).exists():
        chunks = pipeline.process_book(
            pdf_path=test_pdf,
            book_id="test_001",
            book_name="Test Book",
            department="Computer Science",
            year_of_study="2nd",
            subject="Algorithms",
        )
        print(f"Created {len(chunks)} chunks")
        if chunks:
            print(f"First chunk: {chunks[0]}")
    else:
        print(f"Test PDF not found at {test_pdf}")
