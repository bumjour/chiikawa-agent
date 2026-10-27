# 주 모니터 방향 바꾸기 (홍보 영상 세로 녹화용)
# 사용: powershell -File display-rotate.ps1 portrait | landscape
# 문제가 생기면: 설정 → 시스템 → 디스플레이 → 디스플레이 방향 → 가로
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
$want = if ($mode -eq 'portrait') { 1 } else { 0 }   # 0 = 가로, 1 = 세로(90도)
if ($dm.dmDisplayOrientation -eq $want) { "이미 $mode"; exit 0 }
# 가로 ↔ 세로가 바뀌면 너비·높이도 맞바꿔요
if (($dm.dmDisplayOrientation % 2) -ne ($want % 2)) { $t = $dm.dmPelsWidth; $dm.dmPelsWidth = $dm.dmPelsHeight; $dm.dmPelsHeight = $t }
$dm.dmDisplayOrientation = $want
$dm.dmFields = 0x00000080 -bor 0x00080000 -bor 0x00100000   # DM_DISPLAYORIENTATION | DM_PELSWIDTH | DM_PELSHEIGHT
$r = [Rot]::ChangeDisplaySettings([ref]$dm, 0)
if ($r -eq 0) { "ok $mode $($dm.dmPelsWidth)x$($dm.dmPelsHeight)" } else { "실패 $r"; exit 1 }
