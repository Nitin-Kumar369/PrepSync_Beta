"""
Text extraction and recursive chunking pipeline for engineering textbooks.
Tracks page_start and page_end per chunk for source citations.
"""
import bisect
import logging
from typing import List, Dict, Any, Tuple
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

    def _extract_pages(self, pdf_path: str) -> List[Tuple[int, str]]:
        """Extract non-empty text per 1-indexed PDF page."""
        try:
            with open(pdf_path, 'rb') as f:
                reader = pypdf.PdfReader(f)
                pages: List[Tuple[int, str]] = []
                for idx, page in enumerate(reader.pages, start=1):
                    txt = page.extract_text()
                    if txt and txt.strip():
                        pages.append((idx, txt))
                return pages
        except Exception as e:
            logger.error(f"PDF extraction failed for {pdf_path}: {e}")
            return []

    def _build_page_index(self, pages: List[Tuple[int, str]]) -> Tuple[str, List[int], List[int]]:
        """
        Concatenate pages with '\n\n' separators while recording each page's
        start character offset and 1-based page number for binary lookup.
        """
        full_text_parts: List[str] = []
        page_starts: List[int] = []
        page_numbers: List[int] = []
        cursor = 0

        for i, (page_num, page_text) in enumerate(pages):
            if i > 0:
                full_text_parts.append("\n\n")
                cursor += 2
            page_starts.append(cursor)
            page_numbers.append(page_num)
            full_text_parts.append(page_text)
            cursor += len(page_text)

        return "".join(full_text_parts), page_starts, page_numbers

    def _page_at_offset(self, offset: int, page_starts: List[int], page_numbers: List[int]) -> int:
        if not page_starts:
            return 1
        clamped = max(0, offset)
        idx = bisect.bisect_right(page_starts, clamped) - 1
        return page_numbers[max(0, min(idx, len(page_numbers) - 1))]

    def process_book(
        self,
        pdf_path: str,
        book_id: str,
        book_name: str = "",
        department: str = "",
        year_of_study: str = "",
        subject: str = ""
    ) -> List[Dict[str, Any]]:
        pages = self._extract_pages(pdf_path)
        if not pages:
            return []

        full_text, page_starts, page_numbers = self._build_page_index(pages)
        if not full_text.strip():
            return []

        split_texts = self.splitter.split_text(full_text)

        chunks: List[Dict[str, Any]] = []
        search_cursor = 0

        for i, c in enumerate(split_texts):
            clean_text = c.strip()
            if len(clean_text) < 40:
                continue

            found_idx = full_text.find(clean_text, max(0, search_cursor - self.chunk_overlap))
            if found_idx == -1:
                found_idx = full_text.find(clean_text)
            if found_idx == -1:
                found_idx = search_cursor

            start_page = self._page_at_offset(found_idx, page_starts, page_numbers)
            end_offset = found_idx + max(len(clean_text) - 1, 0)
            end_page = self._page_at_offset(end_offset, page_starts, page_numbers)
            search_cursor = found_idx + len(clean_text)

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
                    "page_start": start_page,
                    "page_end": end_page,
                }
            })

        logger.info(f"Split book '{book_id}' into {len(chunks)} structural chunks with page ranges")
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