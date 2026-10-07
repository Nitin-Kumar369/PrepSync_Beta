"""
Text extraction and recursive chunking pipeline for engineering textbooks.
"""
import logging
from typing import List, Dict, Any
import pypdf
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

class SimpleChunkingPipeline:
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 180):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n\n", "\n\n", "\n", ". ", "; ", " ", ""],
            length_function=len,
            is_separator_regex=False
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

_pipeline = None

def get_chunking_pipeline() -> SimpleChunkingPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = SimpleChunkingPipeline()
    return _pipeline

def init_chunking_pipeline():
    global _pipeline
    _pipeline = SimpleChunkingPipeline()