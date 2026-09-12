; Waypoint installer — updates cleanly over ANY previous version.
; Saves and settings are never touched by the installer itself; the app
; migrates old save formats on first launch (after snapshotting the original
; into saves\backups). Build with: ISCC installer.iss

#define AppVer "1.4.7"

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
; tells the shell to drop its cached icons after an in-place update, so the new Waypoint.exe icon shows without a sign-out
ChangesAssociations=yes
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
; (an existing install adds a choice page after Welcome — update in place, clean install, or a separate copy; see [Code])
DisableProgramGroupPage=yes
DisableWelcomePage=no
MinVersion=10.0
CloseApplications=no

[Files]
; Everything except: build/dev files, the user's own saves and campaign notes,
; per-install settings (system\userdata), logs, and scratch.
Source: "*"; DestDir: "{app}"; Excludes: "installer.iss,Not used,Not used\*,system\Dark Logo.ico,system\Globe Logo.ico,system\Temp-icon.ico,system\fcw_icon.ico,system\nucleus_icon.ico,Waypoint_Setup.exe,Waypoint.lnk,CAMPAIGN_INTEGRATION.md,log.txt,*.zip,*.sha256,manifest.json,RELEASE_NOTES.md,READ ME FIRST*,saves,saves\*,system\userdata,system\userdata\*,system\app.prev,system\app.prev\*,system\app.new,system\app.new\*,scratch,scratch\*,dist,dist\*,tools,tools\*,dev-saves,dev-saves\*,.git,.git\*,.gitignore"; Flags: ignoreversion recursesubdirs createallsubdirs

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

var
  PrevInstallPath: string;
  ModePage: TInputOptionWizardPage;   { shown only when a copy is already installed }
  WipePage: TInputOptionWizardPage;   { shown only for a clean install }

function IsUpdate(): Boolean;
begin
  Result := RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{5E99FC64-B981-4209-A480-DB2444535359}_is1', 'InstallLocation', PrevInstallPath);
end;

{ 0 = update in place, 1 = clean install here, 2 = separate copy in a new folder }
function InstallMode(): Integer;
begin
  Result := 0;
  if (ModePage <> nil) then
  begin
    if ModePage.Values[1] then Result := 1;
    if ModePage.Values[2] then Result := 2;
  end;
end;

function WipeSaves(): Boolean;
begin
  Result := (WipePage <> nil) and WipePage.Values[0];
end;

procedure InitializeWizard;
begin
  { /UPDATE=1 (a scripted or app-driven update) skips the choice page: plain update in place }
  if IsUpdate() and (ExpandConstant('{param:UPDATE|0}') <> '1') then
  begin
    WizardForm.WelcomeLabel1.Caption := 'Welcome to the Waypoint Update Wizard';
    WizardForm.WelcomeLabel2.Caption := 'Setup found an existing copy of Waypoint in:' + #13#10 + PrevInstallPath
      + #13#10#13#10 + 'On the next page you choose what to do with it: update it in place (the usual choice), '
      + 'do a clean install, or put a separate copy somewhere else.'
      + #13#10#13#10 + 'An in-place update never touches your campaigns, saves, images or settings. '
      + 'If your save comes from an older version, the app converts it on first launch after keeping '
      + 'an untouched copy in the saves\backups folder.';

    ModePage := CreateInputOptionPage(wpWelcome, 'A copy of Waypoint is already installed',
      'What would you like Setup to do?',
      'Pick one. The first option is the normal update and keeps everything you have.',
      True, False);
    ModePage.Add('Update this copy in place (recommended) — keeps campaigns, saves, images and settings');
    ModePage.Add('Clean install here — wipe the program files and rebuild them; saves and settings are kept unless you say otherwise on the next page');
    ModePage.Add('Install a separate copy in a new folder — the existing copy is left exactly as it is');
    ModePage.Values[0] := True;

    WipePage := CreateInputOptionPage(ModePage.ID, 'Clean install',
      'What should go?',
      'The program files in ' + PrevInstallPath + ' are removed and installed fresh. Your saves folder (campaigns, maps, images, journals) and your settings are kept unless you tick the box.',
      False, False);
    WipePage.Add('Also delete my saves, images, journals and settings — everything. This cannot be undone.');
    WipePage.Values[0] := False;
  end;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (WipePage <> nil) and (PageID = WipePage.ID) then Result := (InstallMode() <> 1);
  { a separate copy needs the folder page even though a previous folder is known }
  if (PageID = wpSelectDir) and (ModePage <> nil) and (InstallMode() = 2) then Result := False;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (WipePage <> nil) and (CurPageID = WipePage.ID) and WipePage.Values[0] then
  begin
    Result := MsgBox('Delete ALL of Waypoint''s data in ' + PrevInstallPath + ' — every campaign, map, image, journal and setting?'
      + #13#10#13#10 + 'There is no undo. Choose No to keep the saves folder.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
    if not Result then WipePage.Values[0] := False;
  end;
  if (CurPageID = wpSelectDir) and (ModePage <> nil) and (InstallMode() = 2)
     and (CompareText(RemoveBackslashUnlessRoot(WizardForm.DirEdit.Text), RemoveBackslashUnlessRoot(PrevInstallPath)) = 0) then
  begin
    MsgBox('That is the folder of the existing copy. Pick a different folder for a separate copy, or go back and choose "Update this copy in place".', mbError, MB_OK);
    Result := False;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpSelectDir) and (ModePage <> nil) and (InstallMode() = 2)
     and (CompareText(RemoveBackslashUnlessRoot(WizardForm.DirEdit.Text), RemoveBackslashUnlessRoot(PrevInstallPath)) = 0) then
    WizardForm.DirEdit.Text := ExpandConstant('{localappdata}\Programs\Waypoint 2');
end;

{ Clean install: everything under the install folder goes except the saves folder and the
  per-install settings (system\userdata) — those go too only when the box was ticked. }
procedure WipeProgramFiles(Root: string; AlsoData: Boolean);
var
  FindRec: TFindRec;
  P: string;
begin
  if not DirExists(Root) then exit;
  if FindFirst(AddBackslash(Root) + '*', FindRec) then
  begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
        begin
          P := AddBackslash(Root) + FindRec.Name;
          if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then
          begin
            if CompareText(FindRec.Name, 'saves') = 0 then
            begin
              if AlsoData then DelTree(P, True, True, True);
            end
            else if CompareText(FindRec.Name, 'system') = 0 then
            begin
              { inside system\, keep userdata unless the data goes too }
              WipeProgramFiles(P, AlsoData);
            end
            else if CompareText(FindRec.Name, 'userdata') = 0 then
            begin
              if AlsoData then DelTree(P, True, True, True);
            end
            else
              DelTree(P, True, True, True);
          end
          else
            DeleteFile(P);
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssInstall) and (ModePage <> nil) and (InstallMode() = 1) then
    WipeProgramFiles(ExpandConstant('{app}'), WipeSaves());
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
