#!/usr/bin/env python3
"""
Create an admin user account.
Run this script to set up your admin account.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from db import UserModel, get_db
from auth import hash_password

def create_admin_user():
    """Create admin user."""
    
    # Admin credentials
    admin_email = "admin@example.com"
    admin_password = "AdminPass123!"
    admin_name = "Admin User"
    admin_department = "Administration"
    
    # Check if admin already exists
    existing = UserModel.find_by_email(admin_email)
    if existing:
        print(f"✅ Admin account already exists: {admin_email}")
        print(f"   Password: {admin_password}")
        return
    
    # Hash password
    password_hash = hash_password(admin_password)
    
    # Create admin user
    admin_user = UserModel.create(
        email=admin_email,
        password_hash=password_hash,
        full_name=admin_name,
        department=admin_department,
        role="admin"
    )
    
    print("✅ Admin account created successfully!")
    print(f"   Email: {admin_email}")
    print(f"   Password: {admin_password}")
    print(f"   User ID: {admin_user.get('_id')}")
    print("\n📝 Use these credentials to login to the admin panel.")

if __name__ == "__main__":
    create_admin_user()
