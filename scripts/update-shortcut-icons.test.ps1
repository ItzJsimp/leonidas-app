$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../apps/desktop/resources/update-shortcut-icons.ps1')
$temp = Join-Path ([IO.Path]::GetTempPath()) ('leonidas-shortcut-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    $target = Join-Path $temp 'Leonidas Code.exe'
    $otherTarget = Join-Path $temp 'unrelated.exe'
    $icon = Join-Path $temp 'leonidas-shortcut-1.2.3.ico'
    New-Item -ItemType File -Path $target,$otherTarget | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../assets/prod/t3-black-windows.ico') -Destination $icon
    $shell = New-Object -ComObject WScript.Shell
    $pinPath = Join-Path $temp 'original pin.lnk'
    $pin = $shell.CreateShortcut($pinPath)
    $pin.TargetPath = $target
    $pin.Arguments = '--example'
    $pin.Description = 'Original description'
    $pin.WorkingDirectory = $temp
    $pin.IconLocation = $target + ',0'
    $pin.Save()
    $pinCreated = (Get-Item -LiteralPath $pinPath).CreationTimeUtc
    $otherPath = Join-Path $temp 'unrelated.lnk'
    $other = $shell.CreateShortcut($otherPath)
    $other.TargetPath = $otherTarget
    $other.IconLocation = $otherTarget + ',0'
    $other.Save()
    $unrelatedBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes($otherPath))
    $changed = @(Update-LeonidasShortcuts -TargetPath $target -IconPath $icon -Directories @($temp, (Join-Path $temp 'missing')))
    if ($changed.Count -ne 1 -or $changed[0] -ne $pinPath) { throw 'Expected only the original app shortcut to change.' }
    $after = $shell.CreateShortcut($pinPath)
    if ($after.IconLocation -ne ($icon + ',0')) { throw 'The icon location did not change.' }
    if ((Get-Item -LiteralPath $pinPath).CreationTimeUtc -ne $pinCreated) { throw 'The shortcut update must keep its creation time.' }
    if ($after.TargetPath -ne $target -or $after.Arguments -ne '--example' -or $after.Description -ne 'Original description' -or $after.WorkingDirectory -ne $temp) { throw 'Launch metadata changed.' }
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($otherPath)) -ne $unrelatedBefore) { throw 'An unrelated shortcut changed.' }
    if (@(Update-LeonidasShortcuts -TargetPath $target -IconPath $icon -Directories @($temp)).Count -ne 0) { throw 'Repeated migration must be idempotent.' }
    $legacyPin = Join-Path $temp 'Leonidas Code.lnk'
    $renamedPin = Join-Path $temp 'Leonidas.lnk'
    Copy-Item -LiteralPath $pinPath -Destination $legacyPin
    $legacyCreated = (Get-Item -LiteralPath $legacyPin).CreationTimeUtc
    $renamed = @(Update-LeonidasShortcuts -TargetPath $target -IconPath $icon -Directories @($temp) -DisplayName 'Leonidas')
    if ($renamed.Count -ne 1 -or $renamed[0] -ne $renamedPin -or (Test-Path -LiteralPath $legacyPin)) { throw 'The existing legacy shortcut must be renamed without a second shortcut.' }
    if ((Get-Item -LiteralPath $renamedPin).CreationTimeUtc -ne $legacyCreated) { throw 'The renamed shortcut must keep its creation time.' }
    $renamedLink = $shell.CreateShortcut($renamedPin)
    if ($renamedLink.TargetPath -ne $target -or $renamedLink.Arguments -ne '--example' -or $renamedLink.IconLocation -ne ($icon + ',0')) { throw 'The renamed shortcut lost launch metadata.' }
    if (@(Update-LeonidasShortcuts -TargetPath $target -IconPath $icon -Directories @($temp) -DisplayName 'Leonidas').Count -ne 0) { throw 'Repeated name migration must be idempotent.' }
    Copy-Item -LiteralPath $pinPath -Destination $legacyPin
    $destinationBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes($renamedPin))
    $collisionWarnings = @()
    $null = Update-LeonidasShortcuts -TargetPath $target -IconPath $icon -Directories @($temp) -DisplayName 'Leonidas' -WarningVariable collisionWarnings -WarningAction SilentlyContinue
    if ($collisionWarnings.Count -eq 0 -or -not (Test-Path -LiteralPath $legacyPin) -or [Convert]::ToBase64String([IO.File]::ReadAllBytes($renamedPin)) -ne $destinationBefore) { throw 'A name collision must preserve both existing shortcuts and produce a warning.' }
    $rejected = $false
    try { Update-LeonidasShortcuts -TargetPath $target -IconPath (Join-Path $temp 'missing.ico') -Directories @($temp) } catch { $rejected = $true }
    if (-not $rejected) { throw 'A missing icon must fail.' }
    $invalidNameRejected = $false
    try { Update-LeonidasShortcuts -TargetPath $target -IconPath $icon -Directories @($temp) -DisplayName '../outside' } catch { $invalidNameRejected = $true }
    if (-not $invalidNameRejected) { throw 'A shortcut name cannot contain a path.' }
    $after.IconLocation = $target + ',0'
    $after.Save()
    (Get-Item -LiteralPath $pinPath).IsReadOnly = $true
    try {
        $warnings = @()
        $null = Update-LeonidasShortcuts -TargetPath $target -IconPath $icon -Directories @($temp) -WarningVariable warnings -WarningAction SilentlyContinue
        if ($warnings.Count -eq 0) { throw 'An inaccessible shortcut must produce a warning.' }
    } finally { (Get-Item -LiteralPath $pinPath).IsReadOnly = $false }
    Write-Output 'Shortcut icon migration passed: metadata preserved, unrelated shortcut unchanged, repeated run unchanged, missing icon rejected, inaccessible shortcut warned, legacy name migrated, collisions preserved.'
} finally {
    if ([IO.Path]::GetFullPath($temp).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()))) {
        Remove-Item -LiteralPath $temp -Recurse -Force
    }
}
