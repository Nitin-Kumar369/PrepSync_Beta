import sys, os
# ensure backend folder on path
sys.path.insert(0, os.path.abspath(os.path.join(os.getcwd(), 'backend')))
from db import SessionModel
from utils import generate_chat_id
print('about to create session directly')
s = SessionModel.create(session_id=generate_chat_id(), user_id='69a14afdd826aab6cb74e9c1',book_id='dummy_book',subject='',department='',year_of_study='',title='test')
print('result', s)
print('type', type(s))
