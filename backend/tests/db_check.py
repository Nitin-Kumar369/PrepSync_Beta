import sys, os
# ensure backend folder is on path so imports like 'from db import ...' work
sys.path.insert(0, os.path.abspath(os.path.join(os.getcwd(), 'backend')))
from db import get_db

users=list(get_db()['users'].find({}))
print('users in db', users)
