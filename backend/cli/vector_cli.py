"""
CLI utility for managing vector embeddings in ChromaDB.
"""
import sys
import os
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# SQLite compatibility check
try:
    __import__("pysqlite3")
    sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
except ImportError:
    pass

import logging
from argparse import ArgumentParser
from rag.vector_store import get_vector_store
from rag.chunking import get_chunking_pipeline
from db import BookModel

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def rebuild_book(args):
    book_id = args.book_id
    book = BookModel.find_by_book_id(book_id)
    if not book:
        logger.error(f"Book with id {book_id} not found")
        sys.exit(1)

    path = book.get("file_path")
    if not path or not os.path.exists(path):
        logger.error(f"PDF file does not exist at {path}")
        sys.exit(1)

    logger.info(f"Rebuilding vectors for: {book.get('title')}")
    vs = get_vector_store()
    vs.delete_by_book_id(book_id)

    pipeline = get_chunking_pipeline()
    chunks = pipeline.process_book(
        pdf_path=path,
        book_id=book_id,
        book_name=book.get("title", ""),
        department=book.get("department", ""),
        year_of_study=book.get("year_of_study", ""),
        subject=book.get("subject", "")
    )
    vs.add_chunks(chunks)
    BookModel.update_status(book_id, "indexed", total_chunks=len(chunks))
    logger.info(f"Successfully indexed {len(chunks)} chunks into ChromaDB.")


def rebuild_all(args):
    logger.info("Rebuilding ChromaDB for all books...")
    vs = get_vector_store()
    vs.delete_all()

    books = BookModel.find_all()
    pipeline = get_chunking_pipeline()
    total = 0

    for book in books:
        book_id = book.get("book_id")
        path = book.get("file_path")
        if path and os.path.exists(path):
            logger.info(f"Indexing book: {book.get('title')} ({book_id})")
            chunks = pipeline.process_book(
                pdf_path=path,
                book_id=book_id,
                book_name=book.get("title", ""),
                department=book.get("department", ""),
                year_of_study=book.get("year_of_study", ""),
                subject=book.get("subject", "")
            )
            vs.add_chunks(chunks)
            BookModel.update_status(book_id, "indexed", total_chunks=len(chunks))
            total += len(chunks)

    logger.info(f"All books reindexed. Total chunks in ChromaDB: {total}")


def clear_all(args):
    vs = get_vector_store()
    vs.delete_all()
    logger.info("ChromaDB collection cleared.")


def main():
    parser = ArgumentParser(description="ChromaDB Vector Management CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_rebuild_all = subparsers.add_parser("rebuild-all", help="Rebuild all books in ChromaDB")
    p_rebuild_all.set_defaults(func=rebuild_all)

    p_rebuild = subparsers.add_parser("rebuild", help="Rebuild a single book")
    p_rebuild.add_argument("--book-id", required=True, help="Book ID to rebuild")
    p_rebuild.set_defaults(func=rebuild_book)

    p_clear = subparsers.add_parser("clear-all", help="Clear all vectors from ChromaDB")
    p_clear.set_defaults(func=clear_all)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()