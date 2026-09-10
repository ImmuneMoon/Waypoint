# Replace the icon embedded in a Windows exe with the images of an .ico (Waypoint.exe has no source; its icon lives only here).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\seticon.ps1 -ExePath Waypoint.exe -IcoPath system\icon.ico -GroupName 32512 -Lang 0 -FirstId 1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\seticon.ps1 -ExePath system\Waypoint-Core.exe -IcoPath system\icon.ico -GroupName 1 -Lang 1033 -FirstId 1
# GroupName and Lang are the exe's existing RT_GROUP_ICON name and language (list them with python + pefile).
# Every image in the .ico becomes an RT_ICON numbered FirstId, FirstId+1, ...; RT_ICON ids above that range that the
# old group used are removed (DeleteIds, comma separated), so no stale sizes are left behind.
param([string]$ExePath,[string]$IcoPath,[int]$GroupName,[int]$Lang,[int]$FirstId=1,[string]$DeleteIds="")
Add-Type -Namespace W -Name Res -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern IntPtr BeginUpdateResourceW(string f, bool del);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool UpdateResourceW(IntPtr h, IntPtr type, IntPtr name, ushort lang, byte[] data, uint cb);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool EndUpdateResourceW(IntPtr h, bool discard);
"@
$bytes=[IO.File]::ReadAllBytes($IcoPath)
$count=[int][BitConverter]::ToUInt16($bytes,4)
if($count -lt 1){ throw "no images in $IcoPath" }
# GRPICONDIR: idReserved, idType, idCount, then 14-byte entries (the .ico's 16-byte entries with the offset replaced by the RT_ICON id)
$ms=New-Object IO.MemoryStream; $bw=New-Object IO.BinaryWriter($ms)
$bw.Write([uint16]0);$bw.Write([uint16]1);$bw.Write([uint16]$count)
$images=@()
for($i=0;$i -lt $count;$i++){
  $e=6+$i*16
  $size=[int][BitConverter]::ToUInt32($bytes,$e+8);$off=[int][BitConverter]::ToUInt32($bytes,$e+12)
  $img=New-Object byte[] $size; [Array]::Copy($bytes,$off,$img,0,$size); $images+=,$img
  $bw.Write($bytes[$e]);$bw.Write($bytes[$e+1]);$bw.Write($bytes[$e+2]);$bw.Write($bytes[$e+3])
  $bw.Write([uint16][BitConverter]::ToUInt16($bytes,$e+4));$bw.Write([uint16][BitConverter]::ToUInt16($bytes,$e+6))
  $bw.Write([uint32]$size);$bw.Write([uint16]($FirstId+$i))
}
$bw.Flush();$gbytes=$ms.ToArray()
$hnd=[W.Res]::BeginUpdateResourceW($ExePath,$false); if($hnd -eq [IntPtr]::Zero){ throw "BeginUpdateResource failed $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
$RT_ICON=[IntPtr]3;$RT_GROUP=[IntPtr]14
for($i=0;$i -lt $count;$i++){
  $img=$images[$i]
  if(-not [W.Res]::UpdateResourceW($hnd,$RT_ICON,[IntPtr]($FirstId+$i),[uint16]$Lang,$img,[uint32]$img.Length)){ throw "icon $($FirstId+$i) write failed" }
}
if(-not [W.Res]::UpdateResourceW($hnd,$RT_GROUP,[IntPtr]$GroupName,[uint16]$Lang,$gbytes,[uint32]$gbytes.Length)){ throw "group write failed" }
foreach($d in ($DeleteIds -split "," | Where-Object { $_ -ne "" } | ForEach-Object { [int]$_ })){
  if($d -ge $FirstId -and $d -lt ($FirstId+$count)){ continue }
  if(-not [W.Res]::UpdateResourceW($hnd,$RT_ICON,[IntPtr]$d,[uint16]$Lang,$null,0)){ throw "delete $d failed" }
}
if(-not [W.Res]::EndUpdateResourceW($hnd,$false)){ throw "EndUpdateResource failed $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
"ok: $ExePath <- $IcoPath ($count images as RT_ICON $FirstId..$($FirstId+$count-1)) group $GroupName lang $Lang"
