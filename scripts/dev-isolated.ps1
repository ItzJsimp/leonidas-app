[CmdletBinding()]
param(
    [ValidateSet('desktop', 'web', 'server')]
    [string]$Mode = 'desktop',
    [ValidateRange(1, 48000)]
    [int]$PortOffset = 10000,
    [switch]$RefreshSnapshot,
    [switch]$Check,
    [switch]$DryRun,
    # A new user's state: empty sandbox home, no AIOS, no AI sign-ins.
    [switch]$FirstRun,
    [string]$SandboxDir
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$devHome = Join-Path $repoRoot '.t3'
if ($FirstRun) {
    if ($RefreshSnapshot) { throw '-FirstRun starts from empty state; do not combine it with -RefreshSnapshot.' }
    if (-not $SandboxDir) {
        $SandboxDir = Join-Path ([IO.Path]::GetTempPath()) "leonidas-first-run-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    }
    $SandboxDir = [IO.Path]::GetFullPath($SandboxDir)
    $devHome = Join-Path $SandboxDir 't3'
    $userHome = Join-Path $SandboxDir 'home'
}
$runner = Join-Path $PSScriptRoot 'dev-runner.ts'
$vp = Join-Path $repoRoot 'node_modules/.bin/vp.cmd'
$node = (Get-Command node -ErrorAction Stop).Source
$runnerMode = @{ desktop = 'dev:desktop'; web = 'dev'; server = 'dev:server' }[$Mode]
if (-not (Test-Path -LiteralPath $vp)) {
    throw 'Install workspace dependencies first: npx pnpm@11.10.0 install --frozen-lockfile'
}

# All paths derive from this checkout; ambient live homes and ports never win.
$isolatedEnv = @{
    T3CODE_HOME = $devHome
    T3CODE_PORT_OFFSET = [string]$PortOffset
    T3CODE_DEV_INSTANCE = $repoRoot
    T3CODE_DESKTOP_APP_USER_MODEL_ID = 'com.t3tools.t3code.dev'
    T3CODE_PORT = $null
    VITE_DEV_SERVER_URL = $null
    VITE_HTTP_URL = $null
    VITE_WS_URL = $null
    PATH = "$(Join-Path $repoRoot 'node_modules/.bin');$env:PATH"
}
if ($FirstRun) {
    # The cwd project would lead the server to a parent AIOS. The real profile holds AI sign-ins.
    $isolatedEnv.T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD = 'false'
    $isolatedEnv.LEONIDAS_AIOS_ROOT = $null
    $isolatedEnv.AIOS_ROOT = $null
    $isolatedEnv.USERPROFILE = $userHome
    $isolatedEnv.HOME = $userHome
    $isolatedEnv.CLAUDE_CONFIG_DIR = Join-Path $userHome '.claude'
    $isolatedEnv.CODEX_HOME = Join-Path $userHome '.codex'
}
$savedEnv = @{}
foreach ($key in $isolatedEnv.Keys) {
    $savedEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
try {
    foreach ($key in $isolatedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($key, $isolatedEnv[$key], 'Process')
    }
    if ($Check) {
        [pscustomobject]@{
            Mode = $runnerMode
            Home = $devHome
            ElectronProfile = Join-Path $devHome 'electron/t3code-dev'
            ServerPortStart = 13773 + $PortOffset
            WebPortStart = 5733 + $PortOffset
            Title = 'Leonidas (Dev)'
            UserHome = $env:USERPROFILE
            AutoBootstrapProject = $env:T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD -ne 'false'
        }
        return
    }
    if ($FirstRun) {
        New-Item -ItemType Directory -Force -Path $devHome, $userHome | Out-Null
        Write-Host "First-run sandbox: $SandboxDir. Open the pairing link in a private browser window; the first chat writes only here."
    }
    Push-Location -LiteralPath $repoRoot
    try {
        if ($RefreshSnapshot -and -not $DryRun) {
            & (Join-Path $PSScriptRoot 'refresh-dev-snapshot.ps1')
        }
        $runnerArgs = @($runner, $runnerMode, '--home-dir', $devHome)
        if ($DryRun) { $runnerArgs += '--dry-run' }
        & $node @runnerArgs
        if ($LASTEXITCODE -ne 0) { throw "Isolated dev runner exited with code $LASTEXITCODE" }
    } finally { Pop-Location }
} finally {
    foreach ($key in $savedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($key, $savedEnv[$key], 'Process')
    }
}
