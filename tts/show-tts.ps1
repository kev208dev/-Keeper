$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$env:PYTHONUTF8 = '1'
Start-Transcript -Path (Join-Path $PSScriptRoot 'outputs\terminal-demo.log') -Force
try {
    Write-Host 'Keeper Korean TTS / Supertonic 3 / CPU / Offline' -ForegroundColor Cyan
    & .\run-voice.ps1 -Text '안녕하세요. 키퍼 키오스크 도우미입니다. 원하시는 메뉴를 선택해 주세요.' -Play
    Write-Host ''
    Write-Host '다른 문장 실행:' -ForegroundColor Cyan
    Write-Host '.\run-voice.ps1 -Text "결제가 완료되었습니다. 이용해 주셔서 감사합니다." -Play'
} finally {
    Stop-Transcript
}
