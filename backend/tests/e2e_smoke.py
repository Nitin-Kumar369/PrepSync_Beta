import requests, time, uuid, sys
BASE = "http://localhost:8000"
print('Smoke test starting...')
try:
    r = requests.get(f"{BASE}/books/departments", timeout=10)
    print('GET /books/departments', r.status_code)
    deps = r.json().get('departments', [])
    if not deps:
        print('No departments found'); sys.exit(2)
    dept = deps[0]
    print('Picked department:', dept)

    r = requests.get(f"{BASE}/books/departments/{dept}/years", timeout=10)
    print('GET /books/departments/{dept}/years', r.status_code)
    years = r.json().get('years', [])
    year = years[0] if years else None
    print('Picked year:', year)

    r = requests.get(f"{BASE}/books/departments/{dept}/years/{year}/subjects", timeout=10)
    print('GET subjects', r.status_code)
    subjects = r.json().get('subjects', [])
    subject = subjects[0] if subjects else None
    print('Picked subject:', subject)

    r = requests.get(f"{BASE}/books/departments/{dept}/years/{year}/subjects/{subject}", timeout=10)
    print('GET books', r.status_code)
    books = r.json().get('books', [])
    if not books:
        print('No books found'); sys.exit(3)
    book = books[0]
    book_id = book.get('id') or book.get('_id') or book.get('book_id')
    print('Picked book id:', book_id)

    # Signup user
    email = f"e2e+{uuid.uuid4().hex[:8]}@example.com"
    signup = requests.post(f"{BASE}/auth/signup", json={"email": email, "password":"TestPass123"}, timeout=10)
    print('POST /auth/signup', signup.status_code)

    login = requests.post(f"{BASE}/auth/login", data={"username": email, "password": "TestPass123"}, timeout=10)
    print('POST /auth/login', login.status_code)
    token = None
    if login.status_code == 200:
        token = login.json().get('access_token')
    if not token:
        print('Could not obtain token, aborting chat test'); sys.exit(4)

    headers = {"Authorization": f"Bearer {token}"}
    payload = {"query": "What are core concepts of OOP?", "book_id": book_id}
    chat = requests.post(f"{BASE}/chat", json=payload, headers=headers, timeout=30)
    print('POST /chat', chat.status_code)
    try:
        print('Chat response:', chat.json())
    except Exception:
        print('Chat text:', chat.text)

    print('Smoke test finished')
except Exception as e:
    print('Exception during smoke test:', repr(e))
    sys.exit(1)
