$ErrorActionPreference = 'Continue'

$root = 'E:\documents\work\deepseek\reader'
$jdk = 'D:\android-dev\jdk-21'
$sdk = 'D:\android-dev\sdk'

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = "$jdk\bin;$sdk\platform-tools;$env:PATH"

Set-Location $root

Write-Output '=== 1/3 build web bundle ==='
npm run build
if ($LASTEXITCODE -ne 0) { throw 'web build failed' }

Write-Output '=== 2/3 sync Capacitor android ==='
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'cap sync failed' }

Write-Output '=== 3/3 gradle assembleDebug ==='
Set-Location (Join-Path $root 'android')
& .\gradlew.bat assembleDebug --no-daemon --console=plain
if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }

$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
$outDir = Join-Path $root 'dist-apk'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Copy-Item $apk (Join-Path $outDir 'modu-reader-v0.1.0-debug.apk') -Force
Write-Output "APK: $(Join-Path $outDir 'modu-reader-v0.1.0-debug.apk')"
Write-Output "SIZE: $([math]::Round((Get-Item (Join-Path $outDir 'modu-reader-v0.1.0-debug.apk')).Length/1MB,2)) MB"
