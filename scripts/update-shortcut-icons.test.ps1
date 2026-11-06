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
    $otherPath = Join-Path $temp 'unrelated.lnk'
    $other = $shell.CreateShortcut($otherPath)
    $other.TargetPath = $otherTarget
    $other.IconLocation = $otherTarget + ',0'
    $other.Save()
    $unrelatedBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes($otherPath))
    $changed = @(Update-LeonidasShortcutIcons -TargetPath $target -IconPath $icon -Directories @($temp, (Join-Path $temp 'missing')))
    if ($changed.Count -ne 1 -or $changed[0] -ne $pinPath) { throw 'Expected only the original app shortcut to change.' }
    $after = $shell.CreateShortcut($pinPath)
    if ($after.IconLocation -ne ($icon + ',0')) { throw 'The icon location did not change.' }
    if ($after.TargetPath -ne $target -or $after.Arguments -ne '--example' -or $after.Description -ne 'Original description' -or $after.WorkingDirectory -ne $temp) { throw 'Launch metadata changed.' }
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($otherPath)) -ne $unrelatedBefore) { throw 'An unrelated shortcut changed.' }
    if (@(Update-LeonidasShortcutIcons -TargetPath $target -IconPath $icon -Directories @($temp)).Count -ne 0) { throw 'Repeated migration must be idempotent.' }
    $rejected = $false
    try { Update-LeonidasShortcutIcons -TargetPath $target -IconPath (Join-Path $temp 'missing.ico') -Directories @($temp) } catch { $rejected = $true }
    if (-not $rejected) { throw 'A missing icon must fail.' }
    $after.IconLocation = $target + ',0'
    $after.Save()
    (Get-Item -LiteralPath $pinPath).IsReadOnly = $true
    try {
        $warnings = @()
        $null = Update-LeonidasShortcutIcons -TargetPath $target -IconPath $icon -Directories @($temp) -WarningVariable warnings -WarningAction SilentlyContinue
        if ($warnings.Count -eq 0) { throw 'An inaccessible shortcut must produce a warning.' }
    } finally { (Get-Item -LiteralPath $pinPath).IsReadOnly = $false }
    Write-Output 'Shortcut icon migration passed: metadata preserved, unrelated shortcut unchanged, repeated run unchanged, missing icon rejected, inaccessible shortcut warned.'
} finally {
    if ([IO.Path]::GetFullPath($temp).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()))) {
        Remove-Item -LiteralPath $temp -Recurse -Force
    }
}
