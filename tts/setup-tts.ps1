$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv-supertonic\Scripts\python.exe')) {
    python -m venv .venv-supertonic
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create Python environment.' }
}
& .\.venv-supertonic\Scripts\python.exe -m pip install -r requirements-tts.txt
if ($LASTEXITCODE -ne 0) { throw 'Package installation failed.' }
& .\.venv-supertonic\Scripts\python.exe -u tts_demo.py --download
if ($LASTEXITCODE -ne 0) { throw 'Model setup failed.' }
