"""
Utility functions for RAG backend.
"""

import logging
import os
import re
from typing import Optional, List
from pathlib import Path
from uuid import uuid4
from datetime import datetime
from bson import ObjectId

logger = logging.getLogger(__name__)


def generate_unique_id(prefix: str = "") -> str:
    """Generate a unique ID, optionally with a prefix."""
    unique_id = str(uuid4())
    return f"{prefix}_{unique_id}" if prefix else unique_id


def generate_chat_id() -> str:
    """Generate a unique chat ID."""
    return generate_unique_id("chat")


def generate_book_id(department: str, subject: str) -> str:
    """Generate a unique book ID from department and subject."""
    # Slugify department and subject
    dept_slug = re.sub(r'[^a-z0-9]+', '', department.lower())[:10]
    subj_slug = re.sub(r'[^a-z0-9]+', '', subject.lower())[:10]
    return f"book_{dept_slug}_{subj_slug}_{int(datetime.utcnow().timestamp())}"


def slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


def format_file_size(size_bytes: int) -> str:
    """Format bytes to human-readable size."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.2f} TB"


def get_file_size(file_path: str) -> int:
    """Get file size in bytes."""
    return os.path.getsize(file_path)


def ensure_directory_exists(directory: str) -> bool:
    """Ensure a directory exists, create if needed."""
    try:
        Path(directory).mkdir(parents=True, exist_ok=True)
        return True
    except Exception as e:
        logger.error(f"Failed to create directory {directory}: {str(e)}")
        return False


def safe_delete_file(file_path: str) -> bool:
    """Safely delete a file."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Deleted file: {file_path}")
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to delete file {file_path}: {str(e)}")
        return False


def is_valid_email(email: str) -> bool:
    """Validate email address format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def convert_objectid_to_string(obj: dict) -> dict:
    """Recursively convert ObjectId to string in a dictionary."""
    if isinstance(obj, dict):
        return {k: convert_objectid_to_string(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_objectid_to_string(item) for item in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj


def clean_text(text: str) -> str:
    """Clean and normalize text."""
    # Remove leading/trailing whitespace
    text = text.strip()
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove control characters
    text = ''.join(char for char in text if ord(char) >= 32 or char in '\n\t')
    return text


def truncate_string(text: str, max_length: int = 100) -> str:
    """Truncate string to max length with ellipsis."""
    if len(text) > max_length:
        return text[:max_length - 3] + "..."
    return text


def estimate_token_count(text: str, avg_chars_per_token: int = 4) -> int:
    """Rough estimation of token count."""
    return len(text) // avg_chars_per_token


def get_timestamp() -> datetime:
    """Get current UTC timestamp."""
    return datetime.utcnow()


def get_timestamp_iso() -> str:
    """Get current UTC timestamp as ISO string."""
    return datetime.utcnow().isoformat()


class TokenCounter:
    """Simple token counter for monitoring API usage."""

    def __init__(self):
        self.input_tokens = 0
        self.output_tokens = 0
        self.total_tokens = 0

    def add(self, input_tokens: int = 0, output_tokens: int = 0):
        """Add token counts."""
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.total_tokens += input_tokens + output_tokens

    def estimate_cost(self, input_price_per_1m: float = 0.075, output_price_per_1m: float = 0.30) -> float:
        """Estimate cost based on Gemini pricing."""
        input_cost = (self.input_tokens / 1_000_000) * input_price_per_1m
        output_cost = (self.output_tokens / 1_000_000) * output_price_per_1m
        return input_cost + output_cost

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "estimated_cost": self.estimate_cost()
        }

    def __str__(self) -> str:
        return f"Tokens: {self.total_tokens} (in: {self.input_tokens}, out: {self.output_tokens})"


# Singleton token counter for application
_token_counter = TokenCounter()


def get_token_counter() -> TokenCounter:
    """Get the global token counter."""
    global _token_counter
    return _token_counter


if __name__ == "__main__":
    # Test utilities
    print(f"Chat ID: {generate_chat_id()}")
    print(f"Book ID: {generate_book_id('CSE', 'Data Structures')}")
    print(f"Slugified: {slugify('Computer Science Engineering')}")
    print(f"File size: {format_file_size(1024 * 1024 * 5)}")
    print(f"Valid email: {is_valid_email('test@example.com')}")
    print(f"Token count estimate: {estimate_token_count('This is a test sentence.')}")

    # Test token counter
    tc = get_token_counter()
    tc.add(input_tokens=100, output_tokens=50)
    print(f"Token counter: {tc}")
    print(f"Cost estimate: ${tc.estimate_cost():.6f}")
