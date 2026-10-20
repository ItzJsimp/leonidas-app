' Starts Open-LeonidasDev.ps1 with no console window at all (-WindowStyle Hidden still flashes one
' when Windows Terminal is the default terminal). The pinned taskbar shortcut points here.
Dim sh, here, ps1
Set sh = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
ps1 = here & "\Open-LeonidasDev.ps1"
sh.Run """C:\Program Files\PowerShell\7\pwsh.exe"" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
