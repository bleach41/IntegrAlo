# Builds the PC version of the firmware core (software-in-the-loop) with the portable GCC in
# .tools\mingw64 (WinLibs) and libmosquitto from the Mosquitto installation.
#   .\firmware\scripts\build.ps1          node, simulate tool and tests
#   .\firmware\scripts\build.ps1 -Test    also runs the unit tests
param([switch]$Test)
$ErrorActionPreference = 'Stop'

$fw = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $fw
$gpp = Join-Path $repo '.tools\mingw64\bin\g++.exe'
$mosq = if ($env:INTEGRALO_MOSQUITTO_DIR) { $env:INTEGRALO_MOSQUITTO_DIR } else { 'C:\Program Files\mosquitto' }
$out = Join-Path $fw 'build'

if (-not (Test-Path $gpp)) { throw "GCC not found in $gpp (unzip WinLibs into .tools\mingw64)" }
if (-not (Test-Path "$mosq\devel\mosquitto.h")) { throw "libmosquitto headers not found in $mosq\devel" }
New-Item -ItemType Directory -Force $out | Out-Null
$env:PATH = "$(Split-Path $gpp);$env:PATH"

# -static: the GCC, C++ and winpthread runtimes go inside the program, so it never picks up an
# incompatible copy of those DLLs installed by another program (Git, etc.).
$flags = @('-std=c++17', '-O2', '-Wall', '-Wextra', '-static')
$core = @('src\core\node_state.cpp', 'src\core\command_handler.cpp', 'src\core\node_app.cpp') | ForEach-Object { Join-Path $fw $_ }

function Build([string]$name, [string[]]$sources, [string[]]$extra = @()) {
  Write-Host "building $name"
  & $gpp @flags @sources @extra -o (Join-Path $out "$name.exe")
  if ($LASTEXITCODE -ne 0) { throw "build of $name failed" }
}

Build 'integralo-fw-pc' ($core + @("$fw\src\pc\main.cpp", "$fw\src\pc\pc_platform.cpp")) @("-I$mosq\devel", "$mosq\mosquitto.dll")
Build 'integralo-fw-simulate' ($core + @("$fw\src\pc\simulate.cpp"))
Build 'test-core' ($core + @("$fw\test\test_core.cpp"))

# libmosquitto and the libraries it needs, next to the program, so it runs from any folder.
foreach ($dll in 'mosquitto.dll', 'mosquitto_common.dll', 'libssl-3-x64.dll', 'libcrypto-3-x64.dll', 'pthreadVC3.dll', 'cjson.dll') {
  if (Test-Path "$mosq\$dll") { Copy-Item "$mosq\$dll" $out -Force }
}

if ($Test) {
  & (Join-Path $out 'test-core.exe')
  if ($LASTEXITCODE -ne 0) { throw 'unit tests failed' }
}
Write-Host "done: $out"
