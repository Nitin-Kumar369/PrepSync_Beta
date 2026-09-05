import pytest
import requests

BASE = "http://localhost:8000"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "AdminPass123!"


def get_admin_token():
    res = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert res.status_code == 200
    return res.json()["access_token"]

@pytest.fixture
def admin_headers():
    token = get_admin_token()
    return {"Authorization": f"Bearer {token}"}


def test_vector_endpoints(admin_headers):
    """Ensure vector rebuild and RAG test endpoints work for an existing book."""
    headers = admin_headers

    # choose a real book ID that exists in the test database
    book_id = "oop_001"

    # rebuild vectors for the book (job queued)
    resp = requests.post(f"{BASE}/admin/vectors/rebuild/{book_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert "message" in data and "Vector rebuild job started" in data["message"]

    # run a RAG test query filtering by the same book
    query = "introduction"
    resp = requests.post(f"{BASE}/admin/vectors/test-rag", headers=headers, json={"query": query, "book_id": book_id})
    assert resp.status_code == 200
    results = resp.json()
    assert results.get("query") == query
    assert results.get("book_id") == book_id
    assert isinstance(results.get("results_count"), int)
    assert "results" in results and isinstance(results["results"], list)
    # results_count may be zero or more depending on index content; make sure key exists
