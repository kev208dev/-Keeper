param([string]$AndroidSdk = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
if (-not $AndroidSdk) { $AndroidSdk = $env:ANDROID_HOME }
if (-not $AndroidSdk) { $AndroidSdk = $env:ANDROID_SDK_ROOT }
if (-not $AndroidSdk) { $AndroidSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $AndroidSdk 'platforms\android-35\android.jar'))) { throw 'Install Android SDK platform 35 and build-tools 35.0.0, then pass -AndroidSdk.' }
$pythonPath = Join-Path $root '.venv-supertonic\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { $pythonPath = 'python' }
& $pythonPath (Join-Path $PSScriptRoot 'prepare_android_assets.py')
if ($LASTEXITCODE -ne 0) { throw 'Model preparation failed.' }
$sdkValue = $AndroidSdk.Replace('\','/').Replace(':','\:')
[IO.File]::WriteAllText((Join-Path $root 'android\local.properties'),"sdk.dir=$sdkValue`n",[Text.UTF8Encoding]::new($false))
& .\android\gradlew.bat -p android :app:assembleDebug :app:lintDebug --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
New-Item -ItemType Directory -Force release | Out-Null
$apk = Join-Path $root 'release\Keeper-TTS-0.1.0-android-test.apk'
Copy-Item -LiteralPath 'android\app\build\outputs\apk\debug\app-debug.apk' -Destination $apk -Force
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $apk).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $root 'release\SHA256SUMS-android.txt'),"$hash  Keeper-TTS-0.1.0-android-test.apk`n",[Text.UTF8Encoding]::new($false))
Write-Host "APK: $apk"
Write-Host 'Debug-signed test APK. Real-device verification is required.'
