# PrepSync Web App

This repository contains a simplified Retrieval-Augmented Generation (RAG) web application
with a FastAPI backend and React/Vite frontend. The system supports PDF ingestion,
vector storage, chat interface, authentication, and an admin panel.

## Setup (Windows)

1. **Install Python 3.11** (using [winget](https://learn.microsoft.com/windows/package-manager/) or manual installer).
2. **Clone repository** and open in VS Code.
3. **Create virtual environment and install dependencies**:
   ```powershell
   cd backend
   py -3.11 -m venv ..\.venv
   . ..\.venv\Scripts\Activate
   python -m pip install --upgrade pip setuptools wheel
   python -m pip install -r requirements.txt
   ```
4. **Copy `.env.example` to `.env`** and adjust values if needed.

## Running Backend

From workspace root:
```powershell
cd backend
. ..\.venv\Scripts\Activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Visit `http://localhost:8000/docs` to access Swagger/OpenAPI UI.

## Smoke Tests

Once server is running, you can execute the smoke test script:
```powershell
. .venv\Scripts\Activate
python backend\tests\smoke_test.py
```

## Frontend Start (scaffold)

In another terminal:
```powershell
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173` for the React UI.

## Auto-Initialization

On first run, the system automatically initializes:

- **Embedding Model**: The sentence-transformers model (`all-MiniLM-L6-v2`, ~80-90MB) is downloaded automatically from HuggingFace on first API call. This happens in `backend/rag/embedding_manager.py` when `get_embedding_model()` is invoked. No pre-download needed.
- **ChromaDB**: Vector database initializes on first backend startup at `backend/chroma_db/`. It creates necessary indices and metadata automatically.
- **Database**: MongoDB connection is established on first API call. Ensure MongoDB is running locally on port 27017.

## Uploading PDFs

Sample PDF uploads are **not** included in the repository. To add engineering textbooks:

1. Log in as admin or create an admin account via `backend/scripts/create_admin.py`
2. Navigate to the Admin Panel in the React UI
3. Use the upload interface to add PDF files
4. The system will automatically extract text, chunk content, generate embeddings, and store in ChromaDB

## Configuration Notes

- **MongoDB**: Running locally on port 27017 by default (adjust `MONGODB_URI` in `.env`)
- **Gemini API**: Optional for development; leave empty for demo mode
- **Embeddings**: Handled locally via sentence-transformers; no external API calls required
- **Chroma DB Path**: Stored at `./chroma_db/` relative to backend directory

## Notes
- This is a university project demonstrating RAG architecture with local embedding and semantic search
- All AI operations use local models; no expensive cloud API calls (unless Gemini key is configured)
- For production deployment, consider containerizing with Docker and using cloud-managed vector databases

---
Keep exploring the code under `backend/` and `frontend/src/` for further development.