import requests, time, uuid, sys
BASE = "http://localhost:8000"
BOOKS_BASE = BASE + "/api/books"
AUTH_BASE = BASE + "/auth"
print('Searching for any indexed book...')
try:
    deps = requests.get(f"{BOOKS_BASE}/departments", timeout=10).json().get('departments', [])
    found = None
    for d in deps:
        years = requests.get(f"{BOOKS_BASE}/departments/{d}/years", timeout=10).json().get('years', [])
        for y in years:
            subjects = requests.get(f"{BASE}/books/departments/{d}/years/{y}/subjects", timeout=10).json().get('subjects', [])
            for s in subjects:
                books = requests.get(f"{BOOKS_BASE}/departments/{d}/years/{y}/subjects/{s}", timeout=10).json().get('books', [])
                if books:
                    found = (d,y,s,books[0])
                    break
            if found: break
        if found: break

    if not found:
        print('No indexed books found across departments. Aborting.'); sys.exit(2)

    dept, year, subject, book = found
    print('Found book', book.get('title') or book.get('book_name') or book)
    book_id = book.get('id') or book.get('_id') or book.get('book_id')

    # Signup
    email = f"e2e+{uuid.uuid4().hex[:8]}@example.com"
    signup = requests.post(f"{AUTH_BASE}/signup", json={"email": email, "password":"TestPass123","full_name":"E2E Tester","department":"CSE"}, timeout=10)
    print('signup', signup.status_code)
    login = requests.post(f"{AUTH_BASE}/login", json={"email": email, "password": "TestPass123"}, timeout=10)
    print('login', login.status_code)
    token = None
    if login.status_code == 200:
        token = login.json().get('access_token')
    if not token:
        print('Login failed, aborting'); sys.exit(3)

    headers = {"Authorization": f"Bearer {token}"}
    payload = {"query": "Explain core OOP concepts", "book_id": book_id}
    chat = requests.post(f"{BASE}/chat", json=payload, headers=headers, timeout=60)
    print('POST /chat', chat.status_code)
    try:
        print(chat.json())
    except Exception:
        print(chat.text)

except Exception as e:
    print('Exception in finder test:', repr(e))
    sys.exit(1)
