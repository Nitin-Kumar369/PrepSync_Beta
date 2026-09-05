import pytest
from rag.llm import RAGLLMStub, GeminiLLM, get_rag_pipeline, reset_rag_pipeline
from config import settings


class DummyResponse:
    def __init__(self, data):
        self._data = data
        self.status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


def test_stub_basic():
    stub = RAGLLMStub()
    result = stub.generate_rag_response("hello", ["chunk1"], [{"book_name": "B"}])
    assert "Based on the provided textbooks" in result["response"]
    assert result["token_usage"] is None


def test_gemini_mock(monkeypatch):
    fake = {"text": "gemini answer", "usage": {"total_tokens": 10}}
    def fake_post(url, headers, json, timeout):
        assert "gemini" in url
        assert headers.get("Authorization") == "Bearer testkey"
        return DummyResponse(fake)

    monkeypatch.setattr("rag.llm.requests.post", fake_post)
    gem = GeminiLLM(api_key="testkey")
    resp = gem.generate_rag_response("q", [], [])
    assert resp["response"] == "gemini answer"
    assert resp["token_usage"]["total_tokens"] == 10


def test_pipeline_selection(monkeypatch):
    # when no key configured, should return stub
    monkeypatch.setattr(settings, "gemini_api_key", "")
    reset_rag_pipeline()
    p = get_rag_pipeline()
    assert isinstance(p, RAGLLMStub)

    # with key, should pick GeminiLLM
    monkeypatch.setattr(settings, "gemini_api_key", "xyz")
    reset_rag_pipeline()
    p2 = get_rag_pipeline()
    assert isinstance(p2, GeminiLLM)
