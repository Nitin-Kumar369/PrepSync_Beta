#!/usr/bin/env python
"""
Simple startup script for the RAG backend.
Verifies environment, auto-installs missing dependencies, and starts the server.
"""

import sys
import os
import subprocess

def auto_install_requirements():
    """Auto-install from requirements.txt if any package is missing."""
    print("🔍 Checking dependencies...\n")
    
    required = [
        "fastapi",
        "uvicorn",
        "pydantic",
        "pymongo",
        "langchain",
        "chromadb",
    ]
    
    missing = []
    for pkg in required:
        try:
            __import__(pkg.replace("-", "_"))
            print(f"✅ {pkg}")
        except ImportError:
            print(f"❌ {pkg}")
            missing.append(pkg)
    
    if missing:
        print(f"\n⚠️  Missing packages: {', '.join(missing)}")
        print("🔧 Auto-installing from requirements.txt...\n")
        
        try:
            # Use python -m pip to ensure correct Python/venv
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                print(f"❌ Installation failed: {result.stderr}")
                return False
            
            print("✅ Dependencies installed successfully!\n")
            return True
        except Exception as e:
            print(f"❌ Error installing dependencies: {str(e)}")
            return False
    
    print("\n✅ All dependencies are installed!")
    return True

def check_imports():
    """Verify all required packages are importable."""
    required = [
        "fastapi",
        "uvicorn",
        "pydantic",
        "pymongo",
        "langchain",
        "chromadb",
    ]
    
    for pkg in required:
        try:
            __import__(pkg.replace("-", "_"))
        except ImportError:
            print(f"❌ {pkg} still not available after installation")
            return False
    
    return True


def start_server():
    """Start the FastAPI server."""
    try:
        import uvicorn
        from main import app
        
        print("\n🚀 Starting FastAPI server...")
        print("📍 API running at: http://localhost:8000")
        print("📚 Docs available at: http://localhost:8000/docs")
        print("🧪 ReDoc at: http://localhost:8000/redoc")
        print("\nPress Ctrl+C to stop the server\n")
        
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info"
        )
    except Exception as e:
        print(f"❌ Error starting server: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    os.chdir(os.path.dirname(__file__))
    
    print("=" * 50)
    print("RAG Backend Startup")
    print("=" * 50)
    
    # Step 1: Auto-install missing dependencies
    if not auto_install_requirements():
        print("\n❌ Failed to install dependencies. Please run manually:")
        print("   pip install -r requirements.txt")
        sys.exit(1)
    
    # Step 2: Verify all imports work
    if not check_imports():
        print("\n❌ Some dependencies failed to import.")
        sys.exit(1)
    
    # Step 3: Start the server
    start_server()
