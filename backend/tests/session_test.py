import sys, os
# allow import of backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.getcwd(), 'backend')))
import requests
from db import BookModel

# create dummy book in database for testing
print('inserting dummy book')
try:
    dummy = BookModel.create(
        book_id='dummy_book',
        title='Dummy Book',
        department='TestDept',
        year_of_study='1st',
        subject='Testing',
        file_path='uploads/dummy.pdf',
        status='indexed'
    )
    print('dummy book created', dummy.get('book_id'))
except Exception as e:
    print('dummy book exists or creation failed:', e)

BASE='http://127.0.0.1:8000'
print('logging in')
r=requests.post(BASE+'/auth/login',json={'email':'smoke_test@example.com','password':'SmokeTestPass123!'})
print(r.status_code, r.text)
token=r.json().get('access_token','')
headers={'Authorization':'Bearer '+token}

print('creating session')
# create session specifying our dummy book
r=requests.post(BASE+'/chat/sessions',params={'book_id':'dummy_book'},headers=headers)
print(r.status_code, r.text)
session_id=r.json().get('session_id')

print('sending chat query using session')
qr={'query':'Hello world','book_id':'dummy_book','session_id':session_id}
r=requests.post(BASE+'/chat',json=qr,headers=headers)
print(r.status_code, r.text)

print('listing sessions')
r=requests.get(BASE+'/chat/sessions',headers=headers)
print(r.status_code, r.text)

print('deleting session')
r=requests.delete(BASE+f'/chat/sessions/{session_id}',headers=headers)
print(r.status_code)
