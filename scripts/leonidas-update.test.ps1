$ErrorActionPreference = 'Stop'
$originalTemp = $env:TEMP
$fixture = Join-Path $originalTemp "leonidas-migration-test-$([Guid]::NewGuid())"
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
try {
  $env:TEMP = $fixture
  $bytes = [Text.Encoding]::UTF8.GetBytes('installer fixture')
  $sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
  $sha512 = [Convert]::ToBase64String([Security.Cryptography.SHA512]::HashData($bytes))
  $badChecksum = $false
  function Invoke-RestMethod {
    @{ tag_name = 'v0.99.123'; draft = $false; prerelease = $false; assets = @(
      @{ name = 'Leonidas-0.99.123-x64.exe'; size = $bytes.Length; digest = "sha256:$sha256"; browser_download_url = 'https://fixture/installer' },
      @{ name = 'latest.yml'; browser_download_url = 'https://fixture/manifest' }
    ) }
  }
  function Invoke-WebRequest($Uri, $OutFile) {
    if ($OutFile) { [IO.File]::WriteAllBytes($OutFile, $bytes); return }
    $checksum = if ($badChecksum) { [Convert]::ToBase64String([byte[]]::new(64)) } else { $sha512 }
    @{ Content = [Text.Encoding]::UTF8.GetBytes("version: 0.99.123`npath: Leonidas-0.99.123-x64.exe`nsha512: $checksum`n") }
  }
  function Get-CimInstance { @(@{ ExecutablePath = (Join-Path $env:LOCALAPPDATA 'Programs/t3code/Leonidas.exe'); ProcessId = 12345 }) }
  function Start-Process { throw 'Test must never start an installer or app.' }
  & "$PSScriptRoot/leonidas-update.ps1" -PrepareOnly | Out-Null
  $badChecksum = $true
  $rejected = $false
  try { & "$PSScriptRoot/leonidas-update.ps1" -PrepareOnly } catch { $rejected = $_.Exception.Message -like '*checksum mismatch*' }
  if (-not $rejected) { throw 'Bad manifest checksum was accepted.' }
  $badChecksum = $false
  $refused = $false
  try { & "$PSScriptRoot/leonidas-update.ps1" } catch { $refused = $_.Exception.Message -like 'Close Leonidas first*' }
  if (-not $refused) { throw 'Installer did not refuse to interrupt a running app.' }
  Write-Host 'Migration checksums and running-app protection passed.'
} finally { $env:TEMP = $originalTemp }
