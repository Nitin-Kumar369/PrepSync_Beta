import requests

BASE = "http://localhost:8000"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "AdminPass123!"



import pytest

def get_token():
    res = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.fixture
def headers():
    t = get_token()
    return {"Authorization": f"Bearer {t}"}


import uuid

def test_browse_endpoints(headers):
    # create a dept/year/subject via admin endpoints with a unique department name
    h = headers
    dept = f"TestDept_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/admin/departments", params={"name": dept}, headers=h)
    assert r.status_code == 200
    r = requests.post(f"{BASE}/admin/departments/{dept}/years", params={"year": "1st"}, headers=h)
    assert r.status_code == 200
    r = requests.post(f"{BASE}/admin/departments/{dept}/years/1st/subjects", params={"subject": "Math"}, headers=h)
    assert r.status_code == 200

    # call browse endpoints
    r = requests.get(f"{BASE}/api/books/departments", headers=h)
    assert r.status_code == 200
    assert dept in r.json()["departments"]

    r = requests.get(f"{BASE}/api/books/departments/{dept}/years", headers=h)
    assert r.status_code == 200
    assert "1st" in r.json()["years"]

    r = requests.get(f"{BASE}/api/books/departments/{dept}/years/1st/subjects", headers=h)
    assert r.status_code == 200
    assert "Math" in r.json()["subjects"]

    # clean up
    requests.delete(f"{BASE}/admin/departments/{dept}/years/1st/subjects/Math", headers=h)
    requests.delete(f"{BASE}/admin/departments/{dept}/years/1st", headers=h)
    requests.delete(f"{BASE}/admin/departments/{dept}", headers=h)
