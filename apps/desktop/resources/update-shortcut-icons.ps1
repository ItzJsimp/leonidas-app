[CmdletBinding()]
param([string]$InstallDirectory, [string]$ExecutableName, [string]$IconPath)
$ErrorActionPreference = 'Stop'

function Update-LeonidasShortcutIcons {
    param(
        [Parameter(Mandatory)][string]$TargetPath,
        [Parameter(Mandatory)][string]$IconPath,
        [Parameter(Mandatory)][string[]]$Directories
    )
    if (-not (Test-Path -LiteralPath $TargetPath -PathType Leaf)) { throw 'The installed app is missing.' }
    if (-not (Test-Path -LiteralPath $IconPath -PathType Leaf)) { throw 'The shortcut icon is missing.' }
    if (-not ('LeonidasShellRefresh' -as [type])) {
        Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LeonidasShellRefresh {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern void SHChangeNotify(uint eventId, uint flags, string item1, IntPtr item2);
}
'@
    }
    $shell = New-Object -ComObject WScript.Shell
    $expectedTarget = [IO.Path]::GetFullPath($TargetPath)
    foreach ($directory in ($Directories | Select-Object -Unique)) {
        if (-not $directory -or -not (Test-Path -LiteralPath $directory -PathType Container)) { continue }
        $scanErrors = @()
        $files = @(Get-ChildItem -LiteralPath $directory -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue -ErrorVariable scanErrors)
        foreach ($scanError in $scanErrors) { Write-Warning "Could not inspect a shortcut directory: $scanError" }
        foreach ($file in $files) {
            try {
                $link = $shell.CreateShortcut($file.FullName)
                if (-not $link.TargetPath -or $link.TargetPath -ne $expectedTarget) { continue }
                $iconLocation = $IconPath + ',0'
                if ($link.IconLocation -eq $iconLocation) { continue }
                # Preserve the pin path and launch metadata so Windows keeps its position.
                $link.IconLocation = $iconLocation
                $link.Save()
                [LeonidasShellRefresh]::SHChangeNotify(0x2000, 0x1005, $file.FullName, [IntPtr]::Zero)
                Write-Output $file.FullName
            } catch {
                Write-Warning "Could not update the shortcut icon at $($file.FullName): $($_.Exception.Message)"
            }
        }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    if (-not $InstallDirectory -or -not $ExecutableName -or -not $IconPath) { throw 'Installer arguments are missing.' }
    $directories = @(
        [Environment]::GetFolderPath('DesktopDirectory'),
        [Environment]::GetFolderPath('CommonDesktopDirectory'),
        [Environment]::GetFolderPath('Programs'),
        [Environment]::GetFolderPath('CommonPrograms'),
        (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
    )
    Update-LeonidasShortcutIcons -TargetPath (Join-Path $InstallDirectory $ExecutableName) -IconPath $IconPath -Directories $directories
}
