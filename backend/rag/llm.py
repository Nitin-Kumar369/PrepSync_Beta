"""
Very small LLM pipeline stub for college demo.

This does not call external LLMs. Instead it builds a readable answer
by concatenating top retrieved chunks and prefixing an educational note.
If `GEMINI_API_KEY` is configured and you want to enable Gemini, we
can add that later, but it's optional for the course project.
"""

import logging
from typing import Optional, Dict, List

from config import settings
import requests

logger = logging.getLogger(__name__)


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
        prompt = self.build_rag_prompt(query, retrieved_chunks, chunk_metadatas, previous_messages)
        if retrieved_chunks:
            answer = "Based on the provided textbooks, here is a concise answer:\n\n" + retrieved_chunks[0][:1500]
        else:
            answer = "I couldn't find relevant content in the indexed textbooks. Try rephrasing or upload related books."

        return {"response": answer, "token_usage": None, "error_source": None}


class GeminiLLM:
    """Adapter for calling Gemini via its REST API."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def build_rag_prompt(self, query: str, retrieved_chunks: List[str], chunk_metadatas: List[Dict], previous_messages: List[Dict] = None) -> str:
        return RAGLLMStub().build_rag_prompt(query, retrieved_chunks, chunk_metadatas, previous_messages)

    def build_rag_messages(self, query: str, retrieved_chunks: List[str], chunk_metadatas: List[Dict], previous_messages: List[Dict] = None) -> List[Dict[str, str]]:
        """Construct a `messages` array (system + previous messages + user) for Gemini."""
        max_len = getattr(settings, "rag_max_context_length", 4000)
        parts = ["You are an assistant for answering questions using the retrieved textbook chunks. Format your responses using markdown and LaTeX where appropriate.\nPrefer to use the provided chunks to answer; if not available, answer concisely from your knowledge and state when evidence is missing.\n\n"]
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

        messages: List[Dict[str, str]] = []
        messages.append({"role": "system", "content": system_content})

        if previous_messages:
            for pm in previous_messages:
                role = pm.get("role", "user")
                content = pm.get("content", "")
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": query})
        return messages

    def generate_rag_response(self, query: str, retrieved_chunks: List[str], chunk_metadatas: List[Dict], previous_messages: List[Dict] = None) -> Dict:
        """Generate response using Gemini API REST endpoint with fallback."""
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
                "maxOutputTokens": 8192 # <--- Increased to prevent cutoff
            }
        }
        
        if system_text:
            payload["systemInstruction"] = {
                "parts": [{"text": system_text}]
            }

        try:
            model_name = "gemini-3.6-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key
            }
            
            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            
            data = resp.json()
            
            answer = ""
            if "candidates" in data and len(data["candidates"]) > 0:
                candidate = data["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    if len(candidate["content"]["parts"]) > 0:
                        answer = candidate["content"]["parts"][0].get("text", "")
            
            usage = None
            if "usageMetadata" in data:
                usage = {
                    "prompt_tokens": data["usageMetadata"].get("promptTokenCount", 0),
                    "completion_tokens": data["usageMetadata"].get("candidatesTokenCount", 0)
                }
            
            if not answer:
                logger.warning("Gemini API returned empty response, falling back to stub")
                raise Exception("Empty response from Gemini")
            
            logger.info(f"Gemini API response generated ({len(answer)} chars)")
            return {"response": answer, "token_usage": usage, "error_source": None}
            
        except requests.exceptions.Timeout:
            logger.warning("Gemini API timeout, falling back to stub")
            stub = RAGLLMStub()
            fallback = stub.generate_rag_response(query, retrieved_chunks, chunk_metadatas, previous_messages)
            fallback["error_source"] = "gemini_timeout"
            return fallback
        except requests.exceptions.HTTPError as e:
            error_details = e.response.text if hasattr(e, 'response') and e.response is not None else "No details"
            logger.error(f"Gemini API HTTP error {e.response.status_code if hasattr(e, 'response') else 'Unknown'}: {error_details}")
            
            stub = RAGLLMStub()
            fallback = stub.generate_rag_response(query, retrieved_chunks, chunk_metadatas, previous_messages)
            fallback["error_source"] = f"gemini_http_error_{e.response.status_code if hasattr(e, 'response') else 'unknown'}"
            return fallback
        except Exception as e:
            logger.error(f"Gemini API call failed: {type(e).__name__}")
            stub = RAGLLMStub()
            fallback = stub.generate_rag_response(query, retrieved_chunks, chunk_metadatas, previous_messages)
            fallback["error_source"] = "gemini_exception"
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