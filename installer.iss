; Waypoint installer — updates cleanly over ANY previous version.
; Saves and settings are never touched by the installer itself; the app
; migrates old save formats on first launch (after snapshotting the original
; into saves\backups). Build with: ISCC installer.iss

#define AppVer "1.1.6"

[Setup]
AppId={{5E99FC64-B981-4209-A480-DB2444535359}
AppName=Waypoint
AppVersion={#AppVer}
AppPublisher=Nucleus Games
AppContact=fulllioncreativeworks@gmail.com
AppSupportURL=https://fulllioncreativeworks.com/
VersionInfoVersion={#AppVer}
VersionInfoDescription=Waypoint — campaign mapping and whiteboard planning
DefaultDirName={localappdata}\Programs\Waypoint
UninstallDisplayIcon={app}\Waypoint.exe
SetupIconFile=system\icon.ico
LicenseFile=license.txt
InfoBeforeFile=WHATSNEW.txt
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
OutputDir=.
OutputBaseFilename=Waypoint_Setup
PrivilegesRequired=lowest
UsePreviousAppDir=yes
DisableDirPage=auto
DisableProgramGroupPage=yes
DisableWelcomePage=no
MinVersion=10.0
CloseApplications=no

[Files]
; Everything except: build/dev files, the user's own saves and campaign notes,
; per-install settings (system\userdata), logs, and scratch.
Source: "*"; DestDir: "{app}"; Excludes: "installer.iss,Waypoint_Setup.exe,Waypoint.lnk,CAMPAIGN_INTEGRATION.md,log.txt,*.zip,*.sha256,manifest.json,RELEASE_NOTES.md,READ ME FIRST*,saves,saves\*,system\userdata,system\userdata\*,system\app.prev,system\app.prev\*,system\app.new,system\app.new\*,scratch,scratch\*,dist,dist\*,tools,tools\*,dev-saves,dev-saves\*,.git,.git\*,.gitignore"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Waypoint"; Filename: "{app}\Waypoint.exe"; Tasks: startmenuicon
Name: "{autodesktop}\Waypoint"; Filename: "{app}\Waypoint.exe"; Tasks: desktopicon

[Tasks]
Name: "startmenuicon"; Description: "Create a &Start Menu shortcut"; GroupDescription: "Additional icons:"
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Run]
Filename: "{app}\Waypoint.exe"; Description: "Launch Waypoint"; Flags: nowait postinstall skipifsilent

[Code]
procedure TaskKill(FileName: String);
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/f /im ' + '"' + FileName + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

{ A running Waypoint may be hosting a live table. Never kill it silently:
  a silent update aborts, an interactive one asks first. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if FindWindowByWindowName('Waypoint') <> 0 then
  begin
    if WizardSilent() then
    begin
      Result := 'Waypoint is running. Close it (end any multiplayer session first) and run the update again.';
      exit;
    end;
    if MsgBox('Waypoint is currently running.' + #13#10#13#10 +
              'If you are hosting a multiplayer session, closing it will disconnect your players. ' +
              'Close Waypoint and continue with the update?', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := 'Update cancelled — Waypoint is still running.';
      exit;
    end;
  end;
  TaskKill('Waypoint.exe');
  TaskKill('Waypoint-Core.exe');
end;

function IsUpdate(): Boolean;
var
  InstallPath: string;
begin
  Result := RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{5E99FC64-B981-4209-A480-DB2444535359}_is1', 'InstallLocation', InstallPath);
end;

procedure InitializeWizard;
begin
  if IsUpdate() then
  begin
    WizardForm.WelcomeLabel1.Caption := 'Welcome to the Waypoint Update Wizard';
    WizardForm.WelcomeLabel2.Caption := 'Setup found an existing copy of Waypoint and will update it in place.'
      + #13#10#13#10 + 'Your campaigns, saves, images, and settings are not touched by this update. '
      + 'If your save comes from an older version of Waypoint, the app converts it to the newest format '
      + 'on first launch — after keeping an untouched copy of the original in the saves\backups folder.'
      + #13#10#13#10 + 'Updates work from any prior version, no matter how old.';
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    // Default is NO — uninstalling never silently destroys campaigns.
    if MsgBox('Do you also want to delete your saved campaigns, maps, and images?' + #13#10#13#10
      + 'Choose No to keep the saves folder so a future install can pick it back up.',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      DelTree(ExpandConstant('{app}\saves'), True, True, True);
    end;
    if MsgBox('Also delete local settings and your multiplayer profile?' + #13#10
      + '(Choose No to keep them for a future install.)',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      DelTree(ExpandConstant('{app}\system\userdata'), True, True, True);
    end;
  end;
end;
