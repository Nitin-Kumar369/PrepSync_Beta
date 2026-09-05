import pytest
import requests

BASE = "http://localhost:8000"

# The tests assume the server is running externally.
# They use the admin credentials created earlier.
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "AdminPass123!"

def get_admin_token():
    res = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert res.status_code == 200
    return res.json()["access_token"]

@pytest.fixture(scope="module")
def admin_headers():
    token = get_admin_token()
    return {"Authorization": f"Bearer {token}"}


import uuid


def test_department_lifecycle(admin_headers):
    # use a unique department and year name to avoid collisions with existing books
    dept = f"TestDept_{uuid.uuid4().hex[:6]}"
    year = f"Year_{uuid.uuid4().hex[:6]}"
    # create
    res = requests.post(f"{BASE}/admin/departments", params={"name": dept}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["name"] == dept
    # list contains
    res = requests.get(f"{BASE}/admin/departments", headers=admin_headers)
    assert dept in [d["name"] for d in res.json()]
    # add year
    res = requests.post(f"{BASE}/admin/departments/{dept}/years", params={"year": year}, headers=admin_headers)
    assert res.status_code == 200
    # list years
    res = requests.get(f"{BASE}/admin/departments/{dept}/years", headers=admin_headers)
    assert year in res.json()["years"]
    # add subject
    res = requests.post(f"{BASE}/admin/departments/{dept}/years/{year}/subjects", params={"subject": "Math"}, headers=admin_headers)
    assert res.status_code == 200
    # list subjects
    res = requests.get(f"{BASE}/admin/departments/{dept}/years/{year}/subjects", headers=admin_headers)
    assert "Math" in res.json()["subjects"]
    # delete subject
    res = requests.delete(f"{BASE}/admin/departments/{dept}/years/{year}/subjects/Math", headers=admin_headers)
    assert res.status_code == 200
    # delete year
    res = requests.delete(f"{BASE}/admin/departments/{dept}/years/{year}", headers=admin_headers)
    assert res.status_code == 200
    # delete department
    res = requests.delete(f"{BASE}/admin/departments/{dept}", headers=admin_headers)
    assert res.status_code == 200
