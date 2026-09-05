<#
PowerShell helper to create a .venv in project root and install pinned backend deps.
Usage (PowerShell as admin may be required for execution policy):
  .\setup_env.ps1

This script prefers Python 3.11 for compatibility with pinned `pydantic==1.x` + FastAPI.
If Python 3.11 isn't available, it will try other py launcher aliases. If only Python 3.13
is present you will be asked to install Python 3.11 or run the install manually.
#>

function Find-PythonExecutable {
    # Prefer py -3.11, then 3.10, 3.9, then default `python` on PATH
    $candidates = @('py -3.11', 'py -3.10', 'py -3.9', 'py -3.12', 'python')
    foreach ($c in $candidates) {
        try {
            $ver = & $c -c "import sys;print(sys.version.split()[0])" 2>$null
            if ($LASTEXITCODE -eq 0 -and $ver) { return @{exe=$c;version=$ver.Trim()} }
        } catch { }
    }
    return $null
}

Write-Host "Locating a suitable Python executable (prefers 3.11)..."
$py = Find-PythonExecutable
if (-not $py) {
    Write-Error "No Python executable found. Install Python 3.11 and ensure 'py' or 'python' is on PATH."
    exit 1
}

Write-Host "Found Python: $($py.exe) (version $($py.version))"
if ($py.version -like '3.13*') {
    Write-Warning "Detected Python 3.13. Pinned dependencies in requirements.txt target Python 3.11/3.10 for pydantic v1 compatibility."
    Write-Warning "Please install Python 3.11 and re-run this script, or edit requirements to use compatible packages."
}

# Create virtualenv at repo root (one level up from backend folder)
Write-Host "Creating virtual environment .venv using $($py.exe)"
& $py.exe -m venv ..\.venv

Write-Host "Activating venv and upgrading pip/setuptools/wheel"
Push-Location ..\
. .venv\Scripts\Activate
python -m pip install --upgrade pip setuptools wheel

Write-Host "Installing backend requirements (this may take a few minutes)"
python -m pip install -r backend\requirements.txt

Write-Host "Done. Activate the venv in a new shell with: . .venv\Scripts\Activate" -ForegroundColor Green
Pop-Location
