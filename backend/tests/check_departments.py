import requests
try:
    r = requests.get('http://localhost:8000/books/departments', timeout=5)
    print(r.status_code)
    print(r.text)
except Exception as e:
    print('Error', e)
