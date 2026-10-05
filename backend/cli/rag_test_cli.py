"""
CLI utility for testing ChromaDB RAG retrieval and debugging.
"""
import sys
import os
from pathlib import Path

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    __import__("pysqlite3")
    sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
except ImportError:
    pass

import logging
from argparse import ArgumentParser
from tabulate import tabulate
from rag.vector_store import get_vector_store
from db import BookModel

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def test_query(args):
    query = args.query
    book_id = args.book_id
    top_k = args.top_k or 5

    logger.info(f"Testing ChromaDB retrieval for: '{query}'")
    if book_id:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            logger.error(f"Book '{book_id}' not found.")
            sys.exit(1)
        logger.info(f"Filter applied: {book.get('title')}")

    vector_store = get_vector_store()
    results = vector_store.search(query, top_k=top_k, book_id=book_id)

    if not results:
        logger.warning("No matching chunks found in ChromaDB.")
        return

    table_data = []
    for i, res in enumerate(results, 1):
        meta = res.get("metadata", {})
        snippet = res.get("text", "")[:120].replace("\n", " ") + "..."
        table_data.append([
            i,
            f"{res.get('similarity_score', 0):.4f}",
            meta.get("book_name", "Unknown"),
            meta.get("subject", "-"),
            snippet
        ])

    print("\n" + tabulate(table_data, headers=["#", "Score", "Book", "Subject", "Text Preview"], tablefmt="grid"))


def main():
    parser = ArgumentParser(description="ChromaDB RAG Test CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    t_parser = subparsers.add_parser("test", help="Test ChromaDB query")
    t_parser.add_argument("--query", required=True, help="Search query")
    t_parser.add_argument("--book-id", help="Filter by book ID")
    t_parser.add_argument("--top-k", type=int, default=5, help="Number of chunks (default 5)")
    t_parser.set_defaults(func=test_query)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()