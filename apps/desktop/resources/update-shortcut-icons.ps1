[CmdletBinding()]
param([string]$InstallDirectory, [string]$ExecutableName, [string]$IconPath, [string]$DisplayName)
$ErrorActionPreference = 'Stop'

function Update-LeonidasShortcuts {
    param(
        [Parameter(Mandatory)][string]$TargetPath,
        [Parameter(Mandatory)][string]$IconPath,
        [Parameter(Mandatory)][string[]]$Directories,
        [string]$DisplayName
    )
    if (-not (Test-Path -LiteralPath $TargetPath -PathType Leaf)) { throw 'The installed app is missing.' }
    if (-not (Test-Path -LiteralPath $IconPath -PathType Leaf)) { throw 'The shortcut icon is missing.' }
    if ($DisplayName -and ($DisplayName.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or $DisplayName -in @('.', '..'))) {
        throw 'The shortcut display name is invalid.'
    }
    if (-not ('LeonidasShellRefresh' -as [type])) {
        Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LeonidasShellRefresh {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern void SHChangeNotify(uint eventId, uint flags, string item1, IntPtr item2);
    [DllImport("shell32.dll", EntryPoint = "SHChangeNotify", CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern void NotifyRename(uint eventId, uint flags, string oldName, string newName);
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
                $changed = $false
                $updatedPath = $file.FullName
                if ($link.IconLocation -ne $iconLocation) {
                    $link.IconLocation = $iconLocation
                    $link.Save()
                    [LeonidasShellRefresh]::SHChangeNotify(0x2000, 0x1005, $file.FullName, [IntPtr]::Zero)
                    $changed = $true
                }
                if ($DisplayName -and $file.BaseName -eq [IO.Path]::GetFileNameWithoutExtension($expectedTarget) -and $file.BaseName -ne $DisplayName) {
                    $destination = Join-Path $file.DirectoryName ($DisplayName + '.lnk')
                    if (Test-Path -LiteralPath $destination) {
                        Write-Warning "The shortcut name is already in use: $destination"
                    } else {
                        Move-Item -LiteralPath $file.FullName -Destination $destination
                        # shortcut: Windows can cache the tooltip until sign-in; use a refresh API if Windows adds one.
                        [LeonidasShellRefresh]::NotifyRename(1, 0x1005, $file.FullName, $destination)
                        $updatedPath = $destination
                        $changed = $true
                    }
                }
                if ($changed) { Write-Output $updatedPath }
            } catch {
                Write-Warning "Could not update the shortcut icon at $($file.FullName): $($_.Exception.Message)"
            }
        }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    if (-not $InstallDirectory -or -not $ExecutableName -or -not $IconPath -or -not $DisplayName) { throw 'Installer arguments are missing.' }
    $directories = @(
        [Environment]::GetFolderPath('DesktopDirectory'),
        [Environment]::GetFolderPath('CommonDesktopDirectory'),
        [Environment]::GetFolderPath('Programs'),
        [Environment]::GetFolderPath('CommonPrograms'),
        (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
    )
    Update-LeonidasShortcuts -TargetPath (Join-Path $InstallDirectory $ExecutableName) -IconPath $IconPath -Directories $directories -DisplayName $DisplayName
}
