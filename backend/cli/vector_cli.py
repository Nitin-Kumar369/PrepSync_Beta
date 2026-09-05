"""
CLI utility for managing vector embeddings in the RAG system.

Usage:
  python -m backend.cli.vector_cli rebuild-all
  python -m backend.cli.vector_cli rebuild --book-id <book_id>
  python -m backend.cli.vector_cli clear-all
  python -m backend.cli.vector_cli clear --book-id <book_id>
"""

import sys
import logging
from argparse import ArgumentParser
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.rag.embedding_manager import get_embedding_manager
from backend.db import BookModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def rebuild_all(args):
    """Rebuild embeddings for all books."""
    logger.info("Starting rebuild of all embeddings...")
    manager = get_embedding_manager()
    result = manager.rebuild_all_embeddings()
    
    if result["status"] == "success":
        logger.info(f"✅ Successfully rebuilt embeddings for {result['chunks_processed']} chunks")
    else:
        logger.error(f"❌ Failed to rebuild embeddings: {result.get('error')}")
        sys.exit(1)


def rebuild_book(args):
    """Rebuild embeddings for a specific book."""
    book_id = args.book_id
    if not book_id:
        logger.error("❌ book_id is required for rebuild command")
        sys.exit(1)
    
    # Verify book exists
    book = BookModel.find_by_book_id(book_id)
    if not book:
        logger.error(f"❌ Book with id {book_id} not found")
        sys.exit(1)
    
    logger.info(f"Starting rebuild of embeddings for book: {book.get('title')}")
    manager = get_embedding_manager()
    result = manager.rebuild_book_embeddings(book_id)
    
    if result["status"] == "success":
        logger.info(f"✅ Successfully rebuilt embeddings for {result['chunks_processed']} chunks")
    else:
        logger.error(f"❌ Failed to rebuild embeddings: {result.get('error')}")
        sys.exit(1)


def clear_all(args):
    """Clear all embedding vectors."""
    logger.info("⚠️  This will clear ALL embedding vectors. Ctrl+C to cancel...")
    try:
        input("Press Enter to confirm...")
    except KeyboardInterrupt:
        logger.info("Cancelled.")
        sys.exit(0)
    
    logger.info("Clearing all embeddings...")
    manager = get_embedding_manager()
    result = manager.clear_all_embeddings()
    
    if result["status"] == "success":
        logger.info(f"✅ {result['message']}")
    else:
        logger.error(f"❌ Failed to clear embeddings: {result.get('error')}")
        sys.exit(1)


def clear_book(args):
    """Clear embeddings for a specific book."""
    book_id = args.book_id
    if not book_id:
        logger.error("❌ book_id is required for clear command")
        sys.exit(1)
    
    # Verify book exists
    book = BookModel.find_by_book_id(book_id)
    if not book:
        logger.error(f"❌ Book with id {book_id} not found")
        sys.exit(1)
    
    logger.info(f"Clearing embeddings for book: {book.get('title')}")
    manager = get_embedding_manager()
    result = manager.clear_book_embeddings(book_id)
    
    if result["status"] == "success":
        logger.info(f"✅ {result['message']}")
    else:
        logger.error(f"❌ Failed to clear embeddings: {result.get('error')}")
        sys.exit(1)


def main():
    parser = ArgumentParser(
        description="Manage vector embeddings for RAG chunks"
    )
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # rebuild-all command
    rebuild_all_parser = subparsers.add_parser(
        "rebuild-all",
        help="Rebuild embeddings for all chunks"
    )
    rebuild_all_parser.set_defaults(func=rebuild_all)
    
    # rebuild command
    rebuild_parser = subparsers.add_parser(
        "rebuild",
        help="Rebuild embeddings for a specific book"
    )
    rebuild_parser.add_argument("--book-id", required=True, help="Book ID to rebuild")
    rebuild_parser.set_defaults(func=rebuild_book)
    
    # clear-all command
    clear_all_parser = subparsers.add_parser(
        "clear-all",
        help="Clear all embedding vectors"
    )
    clear_all_parser.set_defaults(func=clear_all)
    
    # clear command
    clear_parser = subparsers.add_parser(
        "clear",
        help="Clear embeddings for a specific book"
    )
    clear_parser.add_argument("--book-id", required=True, help="Book ID to clear")
    clear_parser.set_defaults(func=clear_book)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    args.func(args)


if __name__ == "__main__":
    main()
