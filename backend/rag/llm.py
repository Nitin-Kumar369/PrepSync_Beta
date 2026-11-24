"""
RAG LLM pipeline with multi-model Gemini REST adapter and 2-pass failover.
Falls back to RAGLLMStub if no GEMINI_API_KEY is configured or all models fail.
"""

import logging
import time
from typing import Optional, Dict, List

from config import settings
import requests

logger = logging.getLogger(__name__)

ACTIVE_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.5-flash"
]


class RAGLLMStub:
    """Simple RAG response generator that concatenates sources."""

    def __init__(self):
        pass

    def build_rag_prompt(self, query: str, retrieved_chunks: List[str], chunk_metadatas: List[Dict], previous_messages: List[Dict] = None) -> str:
        parts = [f"Question: {query}\n"]
        parts.append("Context:\n")
        for i, (chunk, meta) in enumerate(zip(retrieved_chunks, chunk_metadatas), 1):
            parts.append(f"Source {i} ({meta.get('book_name','Unknown')}):\n")
            parts.append(chunk[:1000] + "\n---\n")
        return "\n".join(parts)

    def generate_rag_response(self, query: str, retrieved_chunks: List[str], chunk_metadatas: List[Dict], previous_messages: List[Dict] = None) -> Dict:
        if retrieved_chunks:
            answer = "Based on the provided textbooks, here is a concise answer:\n\n" + retrieved_chunks[0][:1500]
        else:
            answer = "I couldn't find relevant content in the indexed textbooks. Try rephrasing or upload related books."

        return {"response": answer, "token_usage": None, "error_source": None}


class GeminiLLM:
    """Adapter for calling Gemini via its REST API with 2-pass multi-model failover."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def build_rag_prompt(self, query: str, retrieved_chunks: List[str], chunk_metadatas: List[Dict], previous_messages: List[Dict] = None) -> str:
        return RAGLLMStub().build_rag_prompt(query, retrieved_chunks, chunk_metadatas, previous_messages)

    def build_rag_messages(self, query: str, retrieved_chunks: List[str], chunk_metadatas: List[Dict], previous_messages: List[Dict] = None) -> List[Dict[str, str]]:
        """Construct a `messages` array (system + previous messages + user) for Gemini."""
        max_len = getattr(settings, "rag_max_context_length", 4000)
        parts = [
            "You are an expert academic tutor dedicated strictly to the subject.\n\n"
            "CORE DIRECTIVES & POLICIES:\n"
            "1. STRICT SUBJECT GUARDRAIL:\n"
            "   - Check if the user's query belongs to book's subject or the contents of book's title.\n"
            "   - If the query is off-topic or unrelated to this course curriculum (e.g., cooking, politics, pop culture, unrelated general trivia, creative writing, or completely different disciplines), you MUST FIRMLY REFUSE to answer.\n"
            "   - Refusal response: 'This inquiry falls outside the scope of this textbook and course subject. Please ask a question related to this curriculum.' Do not provide any off-topic details.\n\n"
            "2. SEAMLESS ANSWER SYNTHESIS (ZERO META-DISCLOSURE):\n"
            "   - When the question is relevant to the subject, deliver a comprehensive, authoritative, and technically thorough explanation.\n"
            "   - Synthesize the provided textbook context seamlessly with your academic domain knowledge. If the provided excerpts are incomplete, brief, or missing specific aspects, expand naturally using your expert knowledge to deliver an exhaustive, complete answer.\n"
            "   - CRITICAL REQUIREMENT: NEVER mention, reference, or acknowledge 'chunks', 'excerpts', 'sources', 'context', 'passages', or 'provided material'.\n"
            "   - NEVER state phrases like 'Based on the text...', 'The excerpts don't mention...', 'According to common knowledge...', or 'Evidence is missing from the provided notes...'.\n"
            "   - The user must perceive all explanations as coming directly, naturally, and authoritatively from the course textbook material.\n\n"
            "3. FORMATTING:\n"
            "   - Structure explanations using clean Markdown (bolding, clear bullet points, code blocks).\n"
            "   - Format formulas and mathematical equations using standard LaTeX ($inline$ or $$display$$).\n\n"
            "TEXTBOOK REFERENCE MATERIAL:\n"
        ]
        total = 0
        for i, (chunk, meta) in enumerate(zip(retrieved_chunks, chunk_metadatas), 1):
            snippet = chunk
            if total + len(snippet) > max_len:
                remaining = max_len - total
                if remaining <= 0:
                    break
                snippet = snippet[:remaining]
            parts.append(f"Source {i} ({meta.get('book_name','Unknown')}):\n{snippet}\n---\n")
            total += len(snippet)

        system_content = "\n".join(parts)

        messages: List[Dict[str, str]] = [{"role": "system", "content": system_content}]

        if previous_messages:
            for pm in previous_messages:
                role = pm.get("role", "user")
                content = pm.get("content", "")
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": query})
        return messages

    def generate_rag_response(self, query: str, retrieved_chunks: List[str], chunk_metadatas: List[Dict], previous_messages: List[Dict] = None) -> Dict:
        """Generate response using Gemini API REST endpoint with 2-pass multi-model failover."""
        messages = self.build_rag_messages(query, retrieved_chunks, chunk_metadatas, previous_messages)

        contents = []
        system_text = ""

        for msg in messages:
            if msg["role"] == "system":
                system_text += msg["content"] + "\n"
                continue

            role = "model" if msg["role"] in ["assistant", "model"] else "user"

            if contents and contents[-1]["role"] == role:
                contents[-1]["parts"][0]["text"] += f"\n\n{msg['content']}"
            else:
                contents.append({
                    "role": role,
                    "parts": [{"text": msg["content"]}]
                })

        if contents and contents[0]["role"] == "model":
            contents.pop(0)

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": settings.rag_temperature,
                "maxOutputTokens": 8192
            }
        }

        if system_text:
            payload["systemInstruction"] = {
                "parts": [{"text": system_text}]
            }

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key
        }

        last_error_source = "gemini_exception"

        for pass_num in range(2):
            for model_name in ACTIVE_MODELS:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
                try:
                    logger.info(f"Generating RAG response using {model_name} (pass {pass_num + 1})...")
                    resp = requests.post(url, headers=headers, json=payload, timeout=45)

                    if resp.status_code in [429, 500, 503]:
                        last_error_source = f"gemini_http_error_{resp.status_code}"
                        logger.warning(f"Transient error on {model_name}: HTTP {resp.status_code}")
                        continue

                    if resp.status_code in [400, 404]:
                        last_error_source = f"gemini_http_error_{resp.status_code}"
                        logger.warning(f"Skipping {model_name}: HTTP {resp.status_code}")
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                    answer = ""
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            answer = parts[0].get("text", "")

                    if not answer:
                        logger.warning(f"{model_name} returned empty response, trying next model...")
                        last_error_source = "gemini_empty_response"
                        continue

                    usage = None
                    if "usageMetadata" in data:
                        usage = {
                            "prompt_tokens": data["usageMetadata"].get("promptTokenCount", 0),
                            "completion_tokens": data["usageMetadata"].get("candidatesTokenCount", 0)
                        }

                    logger.info(f"Gemini API response generated via {model_name} ({len(answer)} chars)")
                    return {"response": answer, "token_usage": usage, "error_source": None}

                except requests.exceptions.Timeout:
                    logger.warning(f"Timeout on {model_name}, trying next model...")
                    last_error_source = "gemini_timeout"
                except Exception as e:
                    logger.warning(f"Error on {model_name}: {type(e).__name__} - {str(e)}")
                    last_error_source = "gemini_exception"

            if pass_num == 0:
                time.sleep(3)

        logger.error(f"All Gemini models failed ({last_error_source}), falling back to stub")
        stub = RAGLLMStub()
        fallback = stub.generate_rag_response(query, retrieved_chunks, chunk_metadatas, previous_messages)
        fallback["error_source"] = last_error_source
        return fallback


_instance: Optional[object] = None


def get_rag_pipeline() -> object:
    global _instance
    if _instance is None:
        if settings.gemini_api_key:
            _instance = GeminiLLM(settings.gemini_api_key)
            logger.info("Gemini LLM initialized")
        else:
            _instance = RAGLLMStub()
            logger.info("RAG LLM stub initialized (no Gemini API key)")
    return _instance


def reset_rag_pipeline():
    global _instance
    _instance = None


def init_rag_pipeline():
    get_rag_pipeline()