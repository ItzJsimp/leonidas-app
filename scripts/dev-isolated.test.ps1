$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'dev-isolated.ps1'
$beforePath = $env:PATH
$beforeHome = $env:T3CODE_HOME
$beforePort = $env:T3CODE_PORT
try {
    $env:T3CODE_HOME = 'live-profile-must-not-be-used'
    $env:T3CODE_PORT = '3773'
    $check = & $launcher -Check
    $expectedHome = Join-Path (Split-Path -Parent $PSScriptRoot) '.t3'
    if ($check.Home -ne $expectedHome) { throw 'Ambient live home leaked into dev' }
    if ($check.ElectronProfile -ne (Join-Path $expectedHome 'electron/t3code-dev')) { throw 'Electron profile is not isolated' }
    if ($check.ServerPortStart -eq 3773 -or $check.ServerPortStart -eq $check.WebPortStart) { throw 'Dev ports collide' }
    if ($check.Title -ne 'Leonidas (Dev)') { throw 'Missing dev identity' }
    if ($env:PATH -ne $beforePath -or $env:T3CODE_HOME -ne 'live-profile-must-not-be-used' -or $env:T3CODE_PORT -ne '3773') { throw 'Launcher leaked environment changes' }
    $web = & $launcher -Mode web -Check
    if ($web.Mode -ne 'dev') { throw 'Web mode did not select single-origin dev' }
    & $launcher -Mode web -DryRun
    Write-Output 'PASS: isolated home, profile, ports, title, environment restoration, web mode and dry-run'
} finally {
    $env:T3CODE_HOME = $beforeHome
    $env:T3CODE_PORT = $beforePort
}
