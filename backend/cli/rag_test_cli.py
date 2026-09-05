"""
CLI utility for testing RAG retrieval and debugging.

Usage:
  python -m backend.cli.rag_test_cli test --query "your question" 
  python -m backend.cli.rag_test_cli test --query "your question" --book-id <book_id>
  python -m backend.cli.rag_test_cli interactive [--book-id <book_id>]
"""

import sys
import logging
from argparse import ArgumentParser
from pathlib import Path
from tabulate import tabulate

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.rag.vector_store import get_vector_store
from backend.db import BookModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_query(args):
    """Test RAG retrieval for a single query."""
    query = args.query
    book_id = args.book_id
    top_k = args.top_k or 5
    
    logger.info(f"Testing RAG retrieval for query: '{query}'")
    if book_id:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            logger.error(f"❌ Book with id {book_id} not found")
            sys.exit(1)
        logger.info(f"Filtering to book: {book.get('title')}")
    
    # Perform search
    vector_store = get_vector_store()
    results = vector_store.search(query, top_k=top_k, book_id=book_id)
    
    if not results:
        logger.warning("No results found")
        return
    
    logger.info(f"\n✅ Found {len(results)} results:")
    logger.info("=" * 80)
    
    # Display results in table format
    table_data = []
    for i, result in enumerate(results, 1):
        metadata = result.get("metadata", {})
        text_preview = result.get("text", "")[:100].replace("\n", " ") + "..."
        
        table_data.append([
            i,
            f"{result.get('similarity_score', 0):.4f}",
            metadata.get("book_name", "Unknown"),
            metadata.get("subject", "-"),
            text_preview
        ])
    
    print("\n" + tabulate(
        table_data,
        headers=["#", "Score", "Book", "Subject", "Preview"],
        tablefmt="grid"
    ))
    
    # Display detailed results
    print("\n" + "=" * 80)
    print("DETAILED RESULTS:")
    print("=" * 80)
    
    for i, result in enumerate(results, 1):
        metadata = result.get("metadata", {})
        text = result.get("text", "")
        score = result.get("similarity_score", 0)
        
        print(f"\n[{i}] Similarity Score: {score:.4f}")
        print(f"Book: {metadata.get('book_name', 'Unknown')}")
        print(f"Department: {metadata.get('department', '-')}")
        print(f"Year: {metadata.get('year_of_study', '-')}")
        print(f"Subject: {metadata.get('subject', '-')}")
        print(f"Page: {metadata.get('page', '-')}")
        print(f"Chunk Index: {metadata.get('chunk_index', '-')}")
        print(f"\nText ({len(text)} chars):")
        print("-" * 60)
        print(text[:500] + ("..." if len(text) > 500 else ""))
        print("-" * 60)


def interactive_mode(args):
    """Interactive mode for testing multiple queries."""
    book_id = args.book_id
    top_k = args.top_k or 5
    
    if book_id:
        book = BookModel.find_by_book_id(book_id)
        if not book:
            logger.error(f"❌ Book with id {book_id} not found")
            sys.exit(1)
        logger.info(f"Interactive mode for book: {book.get('title')}")
    else:
        logger.info("Interactive mode (all books)")
    
    vector_store = get_vector_store()
    
    logger.info("\nEnter queries to test RAG retrieval (type 'exit' to quit)")
    logger.info("-" * 60)
    
    while True:
        try:
            query = input("\n📝 Query: ").strip()
            
            if query.lower() in ["exit", "quit", "q"]:
                logger.info("Exiting interactive mode")
                break
            
            if not query:
                continue
            
            logger.info(f"Searching for: '{query}'...")
            results = vector_store.search(query, top_k=top_k, book_id=book_id)
            
            if not results:
                logger.warning("No results found")
                continue
            
            logger.info(f"Found {len(results)} results:")
            for i, result in enumerate(results, 1):
                metadata = result.get("metadata", {})
                score = result.get("similarity_score", 0)
                text = result.get("text", "")[:100].replace("\n", " ") + "..."
                
                print(f"{i}. [{score:.4f}] {metadata.get('book_name', 'Unknown')} - {text}")
        
        except KeyboardInterrupt:
            logger.info("\nExiting interactive mode")
            break
        except Exception as e:
            logger.error(f"Error: {str(e)}")


def main():
    parser = ArgumentParser(
        description="Test and debug RAG retrieval"
    )
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # test command
    test_parser = subparsers.add_parser(
        "test",
        help="Test RAG retrieval for a single query"
    )
    test_parser.add_argument("--query", required=True, help="Query text to test")
    test_parser.add_argument("--book-id", help="Optional: Filter to specific book")
    test_parser.add_argument("--top-k", type=int, default=5, help="Number of results (default: 5)")
    test_parser.set_defaults(func=test_query)
    
    # interactive command
    interactive_parser = subparsers.add_parser(
        "interactive",
        help="Interactive mode for testing multiple queries"
    )
    interactive_parser.add_argument("--book-id", help="Optional: Filter to specific book")
    interactive_parser.add_argument("--top-k", type=int, default=5, help="Number of results (default: 5)")
    interactive_parser.set_defaults(func=interactive_mode)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    args.func(args)


if __name__ == "__main__":
    main()
