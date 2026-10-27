# Rotate the primary display (used for vertical demo recording).
# Usage: powershell -File display-rotate.ps1 portrait | landscape
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without BOM.
# Manual fix if stuck: Settings > System > Display > Display orientation > Landscape
param([string]$mode = 'landscape')
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Rot {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra;
    public int dmFields; public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight;
    public int dmDisplayFlags; public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent;
    public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2;
    public int dmPanningWidth; public int dmPanningHeight;
  }
  [DllImport("user32.dll")] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll")] public static extern int ChangeDisplaySettings(ref DEVMODE dm, int flags);
}
"@
$dm = New-Object Rot+DEVMODE
$dm.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($dm)
[Rot]::EnumDisplaySettings($null, -1, [ref]$dm) | Out-Null
$want = 0                       # 0 = landscape
if ($mode -eq 'portrait') { $want = 1 }   # 1 = portrait (90 deg)
if ($dm.dmDisplayOrientation -eq $want) { "already $mode"; exit 0 }
# swap width/height when switching between landscape and portrait
if (($dm.dmDisplayOrientation % 2) -ne ($want % 2)) { $t = $dm.dmPelsWidth; $dm.dmPelsWidth = $dm.dmPelsHeight; $dm.dmPelsHeight = $t }
$dm.dmDisplayOrientation = $want
$dm.dmFields = 0x00000080 -bor 0x00080000 -bor 0x00100000   # DM_DISPLAYORIENTATION | DM_PELSWIDTH | DM_PELSHEIGHT
$r = [Rot]::ChangeDisplaySettings([ref]$dm, 0)
if ($r -eq 0) { "ok $mode $($dm.dmPelsWidth)x$($dm.dmPelsHeight)" } else { "failed $r"; exit 1 }
