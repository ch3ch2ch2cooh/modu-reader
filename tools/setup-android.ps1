$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$root = 'D:\android-dev'
$dl = Join-Path $root 'downloads'
$sdk = Join-Path $root 'sdk'
$jdkDir = Join-Path $root 'jdk-21'
$log = Join-Path $root 'setup.log'

New-Item -ItemType Directory -Force -Path $root, $dl, $sdk | Out-Null

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
  Write-Output $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

Log "=== Android toolchain setup start ==="

$jdkZip = Join-Path $dl 'jdk21.zip'
$cmdZip = Join-Path $dl 'cmdline-tools.zip'

if (-not (Test-Path (Join-Path $jdkDir 'bin\java.exe'))) {
  if (-not (Test-Path $jdkZip) -or (Get-Item $jdkZip).Length -lt 100MB) {
    Log "Downloading JDK 21 ..."
    & curl.exe -L --fail --retry 3 --retry-delay 2 -o $jdkZip 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse'
    if ($LASTEXITCODE -ne 0) { throw "JDK download failed ($LASTEXITCODE)" }
  }
  Log "Extracting JDK ..."
  $tmp = Join-Path $root 'jdk-tmp'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  & tar.exe -xf $jdkZip -C $tmp
  if ($LASTEXITCODE -ne 0) { throw "JDK extract failed" }
  $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
  Move-Item $inner.FullName $jdkDir
  Remove-Item $tmp -Recurse -Force
  Log "JDK ready: $jdkDir"
} else { Log "JDK already present" }

$env:JAVA_HOME = $jdkDir
$env:PATH = "$jdkDir\bin;$env:PATH"
$jv = & "$jdkDir\bin\java.exe" -version 2>&1 | Out-String
Log $jv

$sm = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sm)) {
  if (-not (Test-Path $cmdZip) -or (Get-Item $cmdZip).Length -lt 100MB) {
    Log "Downloading Android commandline-tools ..."
    & curl.exe -L --fail --retry 3 --retry-delay 2 -o $cmdZip 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
    if ($LASTEXITCODE -ne 0) { throw "cmdline-tools download failed" }
  }
  Log "Extracting commandline-tools ..."
  $ctTmp = Join-Path $sdk 'ct-tmp'
  if (Test-Path $ctTmp) { Remove-Item $ctTmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $ctTmp | Out-Null
  & tar.exe -xf $cmdZip -C $ctTmp
  $latest = Join-Path $sdk 'cmdline-tools\latest'
  New-Item -ItemType Directory -Force -Path (Split-Path $latest) | Out-Null
  Move-Item (Join-Path $ctTmp 'cmdline-tools') $latest
  Remove-Item $ctTmp -Recurse -Force
  Log "sdkmanager ready"
}

Log "Accepting SDK licenses ..."
$yesFile = Join-Path $root 'yes.txt'
Set-Content -Path $yesFile -Value ((1..80 | ForEach-Object { 'y' }) -join "`r`n") -Encoding ascii
$lic = Start-Process -FilePath $sm -ArgumentList @("--sdk_root=$sdk", "--licenses") -RedirectStandardInput $yesFile -RedirectStandardOutput (Join-Path $root 'licenses.log') -RedirectStandardError (Join-Path $root 'licenses.err') -NoNewWindow -Wait -PassThru
Log "licenses exit: $($lic.ExitCode)"
Get-Content (Join-Path $root 'licenses.log') -ErrorAction SilentlyContinue | Select-Object -Last 20 | ForEach-Object { Log $_ }

Log "Installing SDK packages ..."
foreach ($pkg in @('platform-tools','platforms;android-36','build-tools;36.0.0','platforms;android-35','build-tools;35.0.0')) {
  Log "  -> $pkg"
  & $sm --sdk_root=$sdk $pkg 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { Log "WARN: $pkg exited $LASTEXITCODE" }
}

Log "=== Installed packages ==="
& $sm --sdk_root=$sdk --list_installed 2>&1 | ForEach-Object { Log $_ }

Log "=== DONE ==="
Log "JAVA_HOME=$jdkDir"
Log "ANDROID_HOME=$sdk"
