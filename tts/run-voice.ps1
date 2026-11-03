param(
    [string]$Text = '안녕하세요. 키퍼 키오스크 도우미입니다. 원하시는 메뉴를 선택해 주세요.',
    [ValidateSet('F1','F2','F3','F4','F5','M1','M2','M3','M4','M5')][string]$Voice = 'F1',
    [double]$Speed = 1.0,
    [int]$Steps = 5,
    [switch]$Play,
    [string]$Output = ''
)
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$pythonPath = Join-Path $PSScriptRoot '.venv-supertonic\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Run setup-tts.ps1 first.' }
$demoArgs = @('-u', (Join-Path $PSScriptRoot 'tts_demo.py'), '--text', $Text, '--voice', $Voice, '--speed', $Speed.ToString([Globalization.CultureInfo]::InvariantCulture), '--steps', $Steps)
if ($Output) { $demoArgs += @('--output', $Output) }
if ($Play) { $demoArgs += '--play' }
& $pythonPath @demoArgs
if ($LASTEXITCODE -ne 0) { throw "TTS failed (exit $LASTEXITCODE)." }
