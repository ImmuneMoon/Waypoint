# Replace the icon embedded in a Windows exe with a single-image .ico (Waypoint.exe has no source; its icon lives only here).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\seticon.ps1 -ExePath Waypoint.exe -IcoPath "system\icon.ico" -GroupName 32512 -Lang 0 -IconId 2
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\seticon.ps1 -ExePath system\Waypoint-Core.exe -IcoPath "system\icon.ico" -GroupName 1 -Lang 1033 -IconId 1 -DeleteIds "2,3,4"
# GroupName / Lang / IconId are the existing RT_GROUP_ICON name, its language and the RT_ICON id it points at
# (list them with python + pefile); DeleteIds removes the other RT_ICON sizes the old group used.
param([string]$ExePath,[string]$IcoPath,[int]$GroupName,[int]$Lang,[int]$IconId,[string]$DeleteIds="")
Add-Type -Namespace W -Name Res -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern IntPtr BeginUpdateResourceW(string f, bool del);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool UpdateResourceW(IntPtr h, IntPtr type, IntPtr name, ushort lang, byte[] data, uint cb);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool EndUpdateResourceW(IntPtr h, bool discard);
"@
$bytes=[IO.File]::ReadAllBytes($IcoPath)
$count=[BitConverter]::ToUInt16($bytes,4)
if($count -ne 1){ throw "expected a single-image .ico, got $count" }
$iw=$bytes[6];$ih=$bytes[7];$colors=$bytes[8];$planes=[BitConverter]::ToUInt16($bytes,10);$bpp=[BitConverter]::ToUInt16($bytes,12)
$size=[int][BitConverter]::ToUInt32($bytes,14);$off=[int][BitConverter]::ToUInt32($bytes,18)
$img=New-Object byte[] $size; [Array]::Copy($bytes,$off,$img,0,$size)
# GRPICONDIR: idReserved, idType, idCount, then 14-byte entries ending in the RT_ICON id
$ms=New-Object IO.MemoryStream; $bw=New-Object IO.BinaryWriter($ms)
$bw.Write([uint16]0);$bw.Write([uint16]1);$bw.Write([uint16]1)
$bw.Write([byte]$iw);$bw.Write([byte]$ih);$bw.Write([byte]$colors);$bw.Write([byte]0);$bw.Write([uint16]$planes);$bw.Write([uint16]$bpp);$bw.Write([uint32]$size);$bw.Write([uint16]$IconId)
$bw.Flush();$gbytes=$ms.ToArray()
$hnd=[W.Res]::BeginUpdateResourceW($ExePath,$false); if($hnd -eq [IntPtr]::Zero){ throw "BeginUpdateResource failed $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
$RT_ICON=[IntPtr]3;$RT_GROUP=[IntPtr]14
if(-not [W.Res]::UpdateResourceW($hnd,$RT_ICON,[IntPtr]$IconId,[uint16]$Lang,$img,[uint32]$img.Length)){ throw "icon write failed" }
if(-not [W.Res]::UpdateResourceW($hnd,$RT_GROUP,[IntPtr]$GroupName,[uint16]$Lang,$gbytes,[uint32]$gbytes.Length)){ throw "group write failed" }
foreach($d in ($DeleteIds -split "," | Where-Object { $_ -ne "" } | ForEach-Object { [int]$_ })){ if(-not [W.Res]::UpdateResourceW($hnd,$RT_ICON,[IntPtr]$d,[uint16]$Lang,$null,0)){ throw "delete $d failed" } }
if(-not [W.Res]::EndUpdateResourceW($hnd,$false)){ throw "EndUpdateResource failed $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
"ok: $ExePath <- $IcoPath ($size bytes) group $GroupName icon $IconId lang $Lang"
