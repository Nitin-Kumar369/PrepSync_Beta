import sys
import os

# Ensure backend directory is on PYTHONPATH so tests can import modules directly
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
