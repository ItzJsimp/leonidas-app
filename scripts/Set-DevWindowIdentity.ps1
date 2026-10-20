<#
.SYNOPSIS
  Gives the "Leonidas Code (Dev)" window and its pinned shortcut one taskbar identity and the green icon.
.DESCRIPTION
  The dev window is a Vivaldi/Chrome app window, so Windows files it under the browser, not under the
  pinned shortcut, and paints the page favicon. This sets one AppUserModelID on the window (and, with
  -ShortcutPath, on a .lnk) so the window joins the pinned button, and paints the green icon on it.
  -WaitSeconds waits for the window to appear. Prints how many windows were updated.
#>
[CmdletBinding()]
param(
    [string]$ShortcutPath,
    [int]$WaitSeconds = 0,
    [string]$ProfileMarker = 'dev-window-profile'
)

$ErrorActionPreference = 'Stop'
$appId = 'Leonidas.Code.Dev'
$repoRoot = Split-Path -Parent $PSScriptRoot
$icon = Join-Path $repoRoot 'assets/dev/leonidas-dev-green.ico'
$launcher = Join-Path $PSScriptRoot 'Open-LeonidasDev.vbs'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class DevIdentity {
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    struct PROPERTYKEY { public Guid fmtid; public uint pid; }
    [StructLayout(LayoutKind.Sequential)]
    struct PROPVARIANT { public ushort vt, r1, r2, r3; public IntPtr p; public IntPtr q; }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore {
        [PreserveSig] int GetCount(out uint c);
        [PreserveSig] int GetAt(uint i, out PROPERTYKEY k);
        [PreserveSig] int GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
        [PreserveSig] int SetValue(ref PROPERTYKEY k, ref PROPVARIANT v);
        [PreserveSig] int Commit();
    }

    [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid riid, out IPropertyStore ps);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHGetPropertyStoreFromParsingName(string path, IntPtr bc, int flags, ref Guid riid, out IPropertyStore ps);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT v);

    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadImage(IntPtr i, string f, uint t, int cx, int cy, uint fl);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

    static readonly Guid Fmt = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    static readonly Guid IPS = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");

    static void Put(IPropertyStore ps, uint pid, string value) {
        var key = new PROPERTYKEY { fmtid = Fmt, pid = pid };
        // VT_LPWSTR (31) owning a CoTaskMem string; PropVariantClear frees it.
        var v = new PROPVARIANT { vt = 31, p = Marshal.StringToCoTaskMemUni(value) };
        try { Marshal.ThrowExceptionForHR(ps.SetValue(ref key, ref v)); } finally { PropVariantClear(ref v); }
    }

    // pid 5 = ID, 2 = RelaunchCommand, 3 = RelaunchIconResource, 4 = RelaunchDisplayNameResource.
    // Windows ignores the relaunch values unless all of them are present with the ID.
    static void Fill(IPropertyStore ps, string appId, string command, string iconResource, string name) {
        Put(ps, 5, appId);
        Put(ps, 2, command);
        Put(ps, 3, iconResource);
        Put(ps, 4, name);
        Marshal.ThrowExceptionForHR(ps.Commit());
    }

    public static void StampShortcut(string path, string appId) {
        var iid = IPS; IPropertyStore ps;
        Marshal.ThrowExceptionForHR(SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 2, ref iid, out ps));
        Put(ps, 5, appId);
        Marshal.ThrowExceptionForHR(ps.Commit());
    }

    public static int StampWindows(uint[] pids, string appId, string command, string iconResource, string name, string icoFile) {
        var hits = new List<IntPtr>();
        var pidSet = new HashSet<uint>(pids);
        EnumWindows((h, l) => {
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (!pidSet.Contains(pid) || !IsWindowVisible(h) || GetWindowTextLength(h) == 0) return true;
            var cls = new StringBuilder(64); GetClassName(h, cls, 64);
            if (cls.ToString() == "Chrome_WidgetWin_1") hits.Add(h);
            return true;
        }, IntPtr.Zero);
        foreach (var h in hits) {
            var iid = IPS; IPropertyStore ps;
            Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(h, ref iid, out ps));
            Fill(ps, appId, command, iconResource, name);
            // WM_SETICON: 1 = big, 0 = small. LoadImage flags: IMAGE_ICON 1, LR_LOADFROMFILE 0x10.
            var big = LoadImage(IntPtr.Zero, icoFile, 1, GetSystemMetrics(11), GetSystemMetrics(12), 0x10);
            var small = LoadImage(IntPtr.Zero, icoFile, 1, GetSystemMetrics(49), GetSystemMetrics(50), 0x10);
            if (big != IntPtr.Zero) SendMessage(h, 0x80, (IntPtr)1, big);
            if (small != IntPtr.Zero) SendMessage(h, 0x80, IntPtr.Zero, small);
        }
        return hits.Count;
    }
}
'@

if ($ShortcutPath) {
    [DevIdentity]::StampShortcut($ShortcutPath, $appId)
    Write-Output "shortcut stamped: $ShortcutPath"
}

$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
    $pids = [uint32[]]@(Get-CimInstance Win32_Process |
            Where-Object { $_.CommandLine -match [regex]::Escape($ProfileMarker) } | ForEach-Object { $_.ProcessId })
    if ($pids.Count -gt 0) {
        $n = [DevIdentity]::StampWindows($pids, $appId, "`"wscript.exe`" `"$launcher`"", "$icon,0", 'Leonidas Code (Dev)', $icon)
        if ($n -gt 0) { Write-Output "windows stamped: $n"; return }
    }
    if ($WaitSeconds -gt 0) { Start-Sleep -Milliseconds 700 }
} while ((Get-Date) -lt $deadline)
Write-Output 'windows stamped: 0'
