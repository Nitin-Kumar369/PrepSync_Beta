#!/usr/bin/env python
"""Test if the backend can start without errors."""

import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    logger.info("Testing backend imports...")
    
    # Test imports one by one
    logger.info("Importing config...")
    from config import settings
    logger.info("✅ Config imported")
    
    logger.info("Importing auth...")
    from auth import hash_password, create_access_token
    logger.info("✅ Auth imported")
    
    logger.info("Importing db...")
    from db import get_db, UserModel
    logger.info("✅ DB imported")
    
    logger.info("Importing models...")
    from models import SignupRequest, LoginRequest
    logger.info("✅ Models imported")
    
    logger.info("Importing routes...")
    from routes.auth import router as auth_router
    logger.info("✅ Auth routes imported")
    
    logger.info("Importing main app...")
    from main import app
    logger.info("✅ Main app imported")
    
    logger.info("\n" + "="*50)
    logger.info("✅ ALL IMPORTS SUCCESSFUL")
    logger.info("Backend is ready to start!")
    logger.info("="*50)
    sys.exit(0)
    
except Exception as e:
    logger.error("\n" + "="*50)
    logger.error(f"❌ IMPORT ERROR: {str(e)}")
    logger.error("="*50)
    import traceback
    traceback.print_exc()
    sys.exit(1)
