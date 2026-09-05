import requests
import json

BASE = "http://127.0.0.1:8000"


def signup(email, password, full_name="Test User"):
    url = f"{BASE}/auth/signup"
    payload = {
        "email": email,
        "password": password,
        "full_name": full_name,
        "department": "Testing"
    }
    r = requests.post(url, json=payload)
    print("SIGNUP", r.status_code, r.text)
    return r


def login(email, password):
    url = f"{BASE}/auth/login"
    payload = {"email": email, "password": password}
    r = requests.post(url, json=payload)
    print("LOGIN", r.status_code, r.text)
    if r.status_code == 200:
        return r.json().get("access_token")
    return None


def me(token):
    url = f"{BASE}/auth/me"
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(url, headers=headers)
    print("ME", r.status_code, r.text)
    return r


if __name__ == "__main__":
    email = "smoke_test@example.com"
    password = "SmokeTestPass123!"

    signup(email, password)
    token = login(email, password)
    if token:
        me(token)
    else:
        print("Login failed; aborting smoke tests")
