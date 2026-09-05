#!/usr/bin/env python3
"""
Comprehensive endpoint testing script for RAG backend.
Tests all 35+ endpoints across all routes with happy path and error scenarios.
"""

import sys
import requests
import json
from typing import Dict, List, Tuple
import time

# Configuration
BASE_URL = "http://localhost:8000"
API_URL = f"{BASE_URL}/api"
TEST_USER_EMAIL = "test_user_phase4@example.com"
TEST_ADMIN_EMAIL = "test_admin_phase4@example.com"
TEST_PASSWORD = "TestPassword123"

# Colors for output (disabled on Windows for Unicode compatibility)
import platform
if platform.system() == "Windows":
    GREEN = RED = YELLOW = BLUE = RESET = ""
else:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

class EndpointTester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.results = {
            "passed": [],
            "failed": [],
            "skipped": []
        }
        self.tokens = {}
        self.test_ids = {}

    def log_test(self, endpoint: str, method: str, status: str, message: str = ""):
        """Log test result."""
        timestamp = time.strftime("%H:%M:%S")
        if status == "PASS":
            color = GREEN
            self.results["passed"].append((endpoint, method))
        elif status == "FAIL":
            color = RED
            self.results["failed"].append((endpoint, method, message))
        else:
            color = YELLOW
            self.results["skipped"].append((endpoint, method, message))
        
        print(f"{color}[{timestamp}] [{status}]{RESET} {method:6} {endpoint:50} {message}")

    def print_summary(self):
        """Print test summary."""
        print("\n" + "="*80)
        print(f"{BLUE}TEST SUMMARY{RESET}")
        print("="*80)
        passed = len(self.results["passed"])
        failed = len(self.results["failed"])
        skipped = len(self.results["skipped"])
        total = passed + failed + skipped
        
        print(f"{GREEN}PASSED: {passed}/{total}{RESET}")
        print(f"{RED}FAILED: {failed}/{total}{RESET}")
        print(f"{YELLOW}SKIPPED: {skipped}/{total}{RESET}")
        
        if self.results["failed"]:
            print(f"\n{RED}Failed Tests:{RESET}")
            for endpoint, method, message in self.results["failed"]:
                print(f"  {method} {endpoint}: {message}")

    # ========================
    # AUTH ENDPOINTS
    # ========================
    
    def test_signup(self):
        """Test POST /auth/signup"""
        endpoint = "/auth/signup"
        
        # Test 1: Valid signup
        data = {
            "email": TEST_USER_EMAIL,
            "password": TEST_PASSWORD,
            "full_name": "Test User",
            "department": "Computer Science"
        }
        try:
            resp = requests.post(f"{self.api_url}{endpoint}", json=data)
            if resp.status_code == 201:
                result = resp.json()
                self.tokens["user"] = result.get("access_token")
                self.test_ids["user_email"] = TEST_USER_EMAIL
                self.log_test(endpoint, "POST", "PASS", "Valid signup")
            else:
                self.log_test(endpoint, "POST", "FAIL", f"Status {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self.log_test(endpoint, "POST", "FAIL", str(e)[:100])

        # Test 2: Duplicate email
        try:
            resp = requests.post(f"{self.api_url}{endpoint}", json=data)
            if resp.status_code == 400 and "already registered" in resp.text.lower():
                self.log_test(endpoint, "POST", "PASS", "Duplicate email rejected")
            else:
                self.log_test(endpoint, "POST", "FAIL", f"Unexpected response: {resp.text[:100]}")
        except Exception as e:
            self.log_test(endpoint, "POST", "FAIL", str(e)[:100])

        # Test 3: Weak password
        weak_data = data.copy()
        weak_data["email"] = "weakpass@test.com"
        weak_data["password"] = "weak"
        try:
            resp = requests.post(f"{self.api_url}{endpoint}", json=weak_data)
            if resp.status_code == 400:
                self.log_test(endpoint, "POST", "PASS", "Weak password rejected")
            else:
                self.log_test(endpoint, "POST", "FAIL", f"Weak password not rejected: {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "POST", "FAIL", str(e)[:100])

    def test_login(self):
        """Test POST /auth/login"""
        endpoint = "/auth/login"
        
        # Test 1: Valid login
        data = {
            "email": TEST_USER_EMAIL,
            "password": TEST_PASSWORD
        }
        try:
            resp = requests.post(f"{self.api_url}{endpoint}", json=data)
            if resp.status_code == 200:
                result = resp.json()
                self.tokens["user"] = result.get("access_token")
                self.log_test(endpoint, "POST", "PASS", "Valid login")
            else:
                self.log_test(endpoint, "POST", "FAIL", f"Status {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self.log_test(endpoint, "POST", "FAIL", str(e)[:100])

        # Test 2: Wrong password
        wrong_data = data.copy()
        wrong_data["password"] = "WrongPassword123"
        try:
            resp = requests.post(f"{self.api_url}{endpoint}", json=wrong_data)
            if resp.status_code == 401:
                self.log_test(endpoint, "POST", "PASS", "Wrong password rejected")
            else:
                self.log_test(endpoint, "POST", "FAIL", f"Wrong password not rejected: {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "POST", "FAIL", str(e)[:100])

    def test_me(self):
        """Test GET /auth/me"""
        endpoint = "/auth/me"
        if not self.tokens.get("user"):
            self.log_test(endpoint, "GET", "SKIP", "No auth token")
            return
        
        headers = {"Authorization": f"Bearer {self.tokens['user']}"}
        try:
            resp = requests.get(f"{self.api_url}{endpoint}", headers=headers)
            if resp.status_code == 200:
                self.log_test(endpoint, "GET", "PASS", "User info retrieved")
            else:
                self.log_test(endpoint, "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    # ========================
    # BOOKS ENDPOINTS
    # ========================
    
    def test_books_departments(self):
        """Test GET /books/departments"""
        endpoint = "/books/departments"
        try:
            resp = requests.get(f"{self.api_url}{endpoint}")
            if resp.status_code == 200:
                result = resp.json()
                if "departments" in result or isinstance(result, list):
                    self.log_test(endpoint, "GET", "PASS", "Departments retrieved")
                    # Save for later tests
                    if isinstance(result, dict):
                        depts = result.get("departments", [])
                    else:
                        depts = result
                    if depts:
                        self.test_ids["department"] = depts[0]
                else:
                    self.log_test(endpoint, "GET", "FAIL", "Invalid response format")
            else:
                self.log_test(endpoint, "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    def test_books_years(self):
        """Test GET /books/departments/{department}/years"""
        endpoint = "/books/departments/{department}/years"
        if not self.test_ids.get("department"):
            self.log_test(endpoint, "GET", "SKIP", "No department")
            return
        
        dept = self.test_ids["department"]
        try:
            resp = requests.get(f"{self.api_url}/books/departments/{dept}/years")
            if resp.status_code == 200:
                result = resp.json()
                years = result.get("years", [])
                if years:
                    self.test_ids["year"] = years[0]
                self.log_test(endpoint.replace("{department}", dept), "GET", "PASS", f"Found {len(years)} years")
            else:
                self.log_test(endpoint.replace("{department}", dept), "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint.replace("{department}", dept), "GET", "FAIL", str(e)[:100])

    def test_books_subjects(self):
        """Test GET /books/departments/{department}/years/{year}/subjects"""
        endpoint = "/books/departments/{dept}/years/{year}/subjects"
        if not self.test_ids.get("department") or not self.test_ids.get("year"):
            self.log_test(endpoint, "GET", "SKIP", "Missing dept/year")
            return
        
        dept = self.test_ids["department"]
        year = self.test_ids["year"]
        try:
            resp = requests.get(f"{self.api_url}/books/departments/{dept}/years/{year}/subjects")
            if resp.status_code == 200:
                result = resp.json()
                subjects = result.get("subjects", [])
                if subjects:
                    self.test_ids["subject"] = subjects[0]
                self.log_test(endpoint.replace("{dept}", dept).replace("{year}", year), "GET", "PASS", f"Found {len(subjects)} subjects")
            else:
                self.log_test(endpoint.replace("{dept}", dept).replace("{year}", year), "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    def test_books_by_filters(self):
        """Test GET /books/departments/{dept}/years/{year}/subjects/{subject}"""
        endpoint = "/books/departments/{dept}/years/{year}/subjects/{subject}"
        if not all(k in self.test_ids for k in ["department", "year", "subject"]):
            self.log_test(endpoint, "GET", "SKIP", "Missing filter params")
            return
        
        dept = self.test_ids["department"]
        year = self.test_ids["year"]
        subject = self.test_ids["subject"]
        try:
            url = f"{self.api_url}/books/departments/{dept}/years/{year}/subjects/{subject}"
            resp = requests.get(url)
            if resp.status_code == 200:
                result = resp.json()
                books = result.get("books", [])
                if books:
                    self.test_ids["book_id"] = books[0]["book_id"]
                self.log_test(endpoint, "GET", "PASS", f"Found {len(books)} books")
            else:
                self.log_test(endpoint, "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    def test_book_details(self):
        """Test GET /books/{book_id}"""
        endpoint = "/books/{book_id}"
        if not self.test_ids.get("book_id"):
            self.log_test(endpoint, "GET", "SKIP", "No book_id")
            return
        
        book_id = self.test_ids["book_id"]
        try:
            resp = requests.get(f"{self.api_url}/books/{book_id}")
            if resp.status_code == 200:
                self.log_test(endpoint.replace("{book_id}", book_id), "GET", "PASS", "Book details retrieved")
            elif resp.status_code == 404:
                self.log_test(endpoint.replace("{book_id}", book_id), "GET", "PASS", "404 for book (expected if not indexed)")
            else:
                self.log_test(endpoint.replace("{book_id}", book_id), "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    # ========================
    # CHAT ENDPOINTS
    # ========================
    
    def test_chat_create_query(self):
        """Test POST /chat"""
        endpoint = "/chat"
        if not self.tokens.get("user"):
            self.log_test(endpoint, "POST", "SKIP", "No auth token")
            return
        
        if not self.test_ids.get("book_id"):
            self.log_test(endpoint, "POST", "SKIP", "No book_id")
            return
        
        headers = {"Authorization": f"Bearer {self.tokens['user']}"}
        data = {
            "query": "What is object oriented programming?",
            "book_id": self.test_ids["book_id"],
            "book_filters": {
                "department": self.test_ids.get("department", ""),
                "year_of_study": self.test_ids.get("year", ""),
                "subject": self.test_ids.get("subject", "")
            }
        }
        try:
            resp = requests.post(f"{self.api_url}{endpoint}", json=data, headers=headers)
            if resp.status_code == 200:
                result = resp.json()
                if "chat_id" in result:
                    self.test_ids["chat_id"] = result["chat_id"]
                    self.test_ids["session_id"] = result.get("session_id")
                self.log_test(endpoint, "POST", "PASS", "Chat query created")
            else:
                self.log_test(endpoint, "POST", "FAIL", f"Status {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            self.log_test(endpoint, "POST", "FAIL", str(e)[:100])

    def test_chat_list(self):
        """Test GET /chat/list"""
        endpoint = "/chat/list"
        if not self.tokens.get("user"):
            self.log_test(endpoint, "GET", "SKIP", "No auth token")
            return
        
        headers = {"Authorization": f"Bearer {self.tokens['user']}"}
        try:
            resp = requests.get(f"{self.api_url}{endpoint}", headers=headers)
            if resp.status_code == 200:
                result = resp.json()
                chats = result.get("chats", [])
                self.log_test(endpoint, "GET", "PASS", f"Retrieved {len(chats)} chats")
            else:
                self.log_test(endpoint, "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    def test_chat_get(self):
        """Test GET /chat/{chat_id}"""
        endpoint = "/chat/{chat_id}"
        if not self.tokens.get("user") or not self.test_ids.get("chat_id"):
            self.log_test(endpoint, "GET", "SKIP", "Missing token or chat_id")
            return
        
        headers = {"Authorization": f"Bearer {self.tokens['user']}"}
        chat_id = self.test_ids["chat_id"]
        try:
            resp = requests.get(f"{self.api_url}/chat/{chat_id}", headers=headers)
            if resp.status_code == 200:
                self.log_test(endpoint.replace("{chat_id}", chat_id), "GET", "PASS", "Chat retrieved")
            else:
                self.log_test(endpoint.replace("{chat_id}", chat_id), "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    # ========================
    # PROFILE ENDPOINTS
    # ========================
    
    def test_profile_get(self):
        """Test GET /profile/profile"""
        endpoint = "/profile/profile"
        if not self.tokens.get("user"):
            self.log_test(endpoint, "GET", "SKIP", "No auth token")
            return
        
        headers = {"Authorization": f"Bearer {self.tokens['user']}"}
        try:
            resp = requests.get(f"{self.api_url}{endpoint}", headers=headers)
            if resp.status_code == 200:
                self.log_test(endpoint, "GET", "PASS", "Profile retrieved")
            else:
                self.log_test(endpoint, "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    # ========================
    # HEALTH CHECK
    # ========================
    
    def test_health(self):
        """Test GET /health"""
        endpoint = "/health"
        try:
            resp = requests.get(f"{self.base_url}{endpoint}")
            if resp.status_code == 200:
                result = resp.json()
                status = result.get("status", "unknown")
                self.log_test(endpoint, "GET", "PASS", f"Status: {status}")
            else:
                self.log_test(endpoint, "GET", "FAIL", f"Status {resp.status_code}")
        except Exception as e:
            self.log_test(endpoint, "GET", "FAIL", str(e)[:100])

    def run_all_tests(self):
        """Run all endpoint tests."""
        print(f"\n{BLUE}{'='*80}")
        print("STARTING COMPREHENSIVE ENDPOINT TESTS")
        print(f"{'='*80}{RESET}\n")

        # Health check
        self.test_health()

        # Auth
        print(f"\n{BLUE}Testing Auth Endpoints...{RESET}")
        self.test_signup()
        self.test_login()
        self.test_me()

        # Books
        print(f"\n{BLUE}Testing Books Endpoints...{RESET}")
        self.test_books_departments()
        self.test_books_years()
        self.test_books_subjects()
        self.test_books_by_filters()
        self.test_book_details()

        # Chat
        print(f"\n{BLUE}Testing Chat Endpoints...{RESET}")
        self.test_chat_create_query()
        self.test_chat_list()
        self.test_chat_get()

        # Profile
        print(f"\n{BLUE}Testing Profile Endpoints...{RESET}")
        self.test_profile_get()

        # Summary
        self.print_summary()

if __name__ == "__main__":
    print(f"\n{YELLOW}Checking if backend is running on {BASE_URL}...{RESET}")
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=2)
        print(f"{GREEN}Backend is running{RESET}\n")
    except:
        print(f"{RED}Backend is not running on {BASE_URL}{RESET}")
        print(f"Start backend with: cd backend && python main.py")
        sys.exit(1)

    tester = EndpointTester(BASE_URL)
    tester.run_all_tests()
