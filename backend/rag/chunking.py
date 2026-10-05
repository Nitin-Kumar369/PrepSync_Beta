"""
Text extraction and recursive chunking pipeline for engineering textbooks.
Splits text along natural structural boundaries (paragraphs, sentences)
and sizes chunks to fit the attention context of sentence-transformer models.
"""
import logging
from typing import List, Dict, Any
from pathlib import Path
import pypdf

# LangChain text splitter (from requirements.txt)
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    from langchain.text_splitter import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)


class SimpleChunkingPipeline:
    """Text extraction and structure-aware chunking for PDFs."""

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 180):
        # 1000 chars (~180-200 tokens) comfortably fits within all-MiniLM-L6-v2's 256 token ceiling
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n\n", "\n\n", "\n", ". ", "; ", " ", ""],
            length_function=len
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
        """Extract text and produce structured, bounded chunks."""
        text = self._extract_text(pdf_path)
        if not text:
            return []

        # Split respecting paragraphs and sentence breaks
        split_texts = self.splitter.split_text(text)

        chunks = []
        for i, c in enumerate(split_texts):
            clean_text = c.strip()
            # Omit boilerplate lines and residual page header remnants
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


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    pipeline = get_chunking_pipeline()
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