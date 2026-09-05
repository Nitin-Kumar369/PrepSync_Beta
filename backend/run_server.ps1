<#
Activate project venv and start the FastAPI server via uvicorn.
Usage: from backend folder run: .\run_server.ps1
#>

Push-Location ..\
if (-Not (Test-Path .venv)) {
    Write-Host "Virtual environment .venv not found. Run setup_env.ps1 first." -ForegroundColor Yellow
    Pop-Location
    exit 1
}

. .venv\Scripts\Activate
Write-Host "Starting FastAPI (uvicorn) on http://0.0.0.0:8000"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
Pop-Location
