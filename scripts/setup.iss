; ==============================================================================
; Inno Setup Script for DeepSeek Harness Windows x64 Distribution
; ==============================================================================

#define MyAppName "DeepSeek Harness"
#define MyAppPublisher "DeepSeek Harness Contributors"
#define MyAppURL "https://github.com/wsnxxxs/deepseek-harness-portable"
#define MyAppExeName "runtime\DeepSeek Harness.exe"
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef MyZipName
  #define MyZipName "DeepSeek-Harness-0.0.0-win32-x64.zip"
#endif
#ifndef MyReleaseDir
  #define MyReleaseDir "..\release"
#endif
#ifndef MyIconPath
  #define MyIconPath "..\apps\desktop\assets\deepseek.ico"
#endif

[Setup]
AppId={{D5E8E89B-4C08-4EA4-8A89-E654C115F05A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\DeepSeek Harness
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE
OutputDir={#MyReleaseDir}
OutputBaseFilename=DeepSeek-Harness-Setup-{#MyAppVersion}-win32-x64
SetupIconFile={#MyIconPath}
Compression=none
SolidCompression=no
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#MyReleaseDir}\{#MyZipName}"; DestDir: "{tmp}"; Flags: deleteafterinstall nocompression
Source: "{#MyIconPath}"; DestDir: "{app}\assets"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\start-desktop.cmd"; IconFilename: "{app}\assets\deepseek.ico"; WorkingDir: "{app}"
Name: "{group}\DeepSeek Harness (网页服务模式)"; Filename: "{app}\启动网页版.bat"; IconFilename: "{app}\assets\deepseek.ico"; WorkingDir: "{app}"
Name: "{group}\在线更新"; Filename: "{app}\在线更新.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\start-desktop.cmd"; IconFilename: "{app}\assets\deepseek.ico"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\start-desktop.cmd"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; WorkingDir: "{app}"; Flags: shellexec nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  DeleteUserData: Boolean;

function DshHomePath(): String;
var
  UserProfile: String;
begin
  Result := Trim(GetEnv('DSH_HOME'));
  if Result = '' then
  begin
    UserProfile := Trim(GetEnv('USERPROFILE'));
    if UserProfile = '' then
      UserProfile := ExtractFileDir(ExtractFileDir(ExpandConstant('{userappdata}')));
    Result := AddBackslash(UserProfile) + '.dsh';
  end;
end;

function NormalizePathForComparison(const Value: String): String;
begin
  Result := Trim(Value);
  while (Length(Result) > 3) and (Result[Length(Result)] = '\') do
    Delete(Result, Length(Result), 1);
end;

function SamePath(const Left, Right: String): Boolean;
begin
  Result := (NormalizePathForComparison(Left) <> '') and
    (CompareText(NormalizePathForComparison(Left), NormalizePathForComparison(Right)) = 0);
end;

function IsUnsafeDataRoot(const DataRoot, InstallRoot: String): Boolean;
var
  DriveRoot: String;
begin
  DriveRoot := '';
  if ExtractFileDrive(DataRoot) <> '' then
    DriveRoot := AddBackslash(ExtractFileDrive(DataRoot));

  Result :=
    (NormalizePathForComparison(DataRoot) = '') or
    SamePath(DataRoot, GetEnv('USERPROFILE')) or
    SamePath(DataRoot, ExpandConstant('{userappdata}')) or
    SamePath(DataRoot, ExpandConstant('{localappdata}')) or
    SamePath(DataRoot, InstallRoot) or
    SamePath(DataRoot, DriveRoot);
end;

procedure StopRunningApp;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM "DeepSeek Harness.exe"', '',
    SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function InitializeUninstall(): Boolean;
var
  DataRoot: String;
begin
  DeleteUserData := False;
  Result := True;
  if UninstallSilent then
    Exit;

  DataRoot := DshHomePath();
  if MsgBox(
    'Do you also want to delete local DeepSeek Harness user data?' + #13#10#13#10 +
    'This removes conversations, credentials, settings, attachments, and other data under:' + #13#10 +
    DataRoot + #13#10#13#10 +
    'Choose No to keep your data for a future reinstall.',
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    DeleteUserData := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataRoot, ElectronUserData: String;
begin
  if CurUninstallStep <> usUninstall then
    Exit;

  StopRunningApp;
  if not DeleteUserData then
    Exit;

  DataRoot := DshHomePath();
  ElectronUserData := ExpandConstant('{userappdata}\DeepSeek Harness');
  if IsUnsafeDataRoot(DataRoot, ExpandConstant('{app}')) then
    RaiseException('Refusing to delete an unsafe data directory: ' + DataRoot);
  if CompareText(DataRoot, ExpandConstant('{app}')) <> 0 then
    DelTree(DataRoot, True, True, True);
  if CompareText(DataRoot, ElectronUserData) <> 0 then
    DelTree(ElectronUserData, True, True, True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  ZipPath, AppDir, StageDir, TarExe, RobocopyExe, TaskKillExe: String;
  MainExe, SafeLauncher, TransactionGate, PickerWorker, ReleaseManifest: String;
  OldRuntime, NewRuntime, BackupRuntime, FailedRuntime: String;
  HadOldRuntime, RuntimeSwapped: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    ZipPath := ExpandConstant('{tmp}\{#MyZipName}');
    AppDir := ExpandConstant('{app}');
    StageDir := ExpandConstant('{tmp}\DeepSeekHarnessSetupStage-{#MyAppVersion}');
    DelTree(StageDir, True, True, True);
    if not ForceDirectories(StageDir) then
      RaiseException('Unable to create the setup staging directory.');

    { Extract and validate the complete release away from {app}. A corrupt or
      incomplete archive therefore cannot partially overwrite a usable install. }
    TarExe := ExpandConstant('{sys}\tar.exe');
    if not FileExists(TarExe) then
      TarExe := ExpandConstant('{sysnative}\tar.exe');
    if not FileExists(TarExe) then
      TarExe := 'tar.exe';
    if not Exec(TarExe,
      '-xf "' + ZipPath + '" -C "' + StageDir + '" --strip-components 1',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      RaiseException('Unable to start the Windows archive extractor.');
    if ResultCode <> 0 then
      RaiseException(Format('Runtime staging failed (tar exit code %d).', [ResultCode]));

    MainExe := AddBackslash(StageDir) + '{#MyAppExeName}';
    SafeLauncher := AddBackslash(StageDir) + 'start-desktop.cmd';
    TransactionGate := AddBackslash(StageDir) + 'runtime\resources\app\src\update-transaction.cjs';
    ReleaseManifest := AddBackslash(StageDir) + 'release-manifest.json';
    PickerWorker := AddBackslash(StageDir) +
      'runtime\resources\app\node_modules\@deepseek-ai\dsh-host-directory-picker-native\lib\worker.cjs';
    if not FileExists(ReleaseManifest) then
      RaiseException('Staged release is missing the release manifest.');
    if not FileExists(MainExe) then
      RaiseException('Staged release is missing the main executable.');
    if not FileExists(SafeLauncher) then
      RaiseException('Staged release is missing the safe desktop launcher.');
    if not FileExists(TransactionGate) then
      RaiseException('Staged release is missing the update transaction launch gate.');
    if not FileExists(PickerWorker) then
      RaiseException('Staged release is missing the directory picker worker.');

    { Restart Manager cannot see files inside the ZIP. Stop the prior tree,
      then require the runtime directory rename to succeed before exposing any
      staged payload. A remaining DLL lock fails here with the old install intact. }
    TaskKillExe := ExpandConstant('{sys}\taskkill.exe');
    if FileExists(TaskKillExe) then
    begin
      Exec(TaskKillExe, '/F /T /IM "DeepSeek Harness.exe"', '', SW_HIDE,
        ewWaitUntilTerminated, ResultCode);
      Sleep(1500);
    end;

    OldRuntime := AddBackslash(AppDir) + 'runtime';
    NewRuntime := AddBackslash(StageDir) + 'runtime';
    BackupRuntime := AddBackslash(AppDir) + '.setup-runtime-backup';
    FailedRuntime := AddBackslash(StageDir) + 'failed-runtime';
    DelTree(BackupRuntime, True, True, True);
    HadOldRuntime := DirExists(OldRuntime);
    RuntimeSwapped := False;
    if HadOldRuntime and (not RenameFile(OldRuntime, BackupRuntime)) then
      RaiseException('The existing runtime is still in use. Close DeepSeek Harness and retry Setup.');

    if not RenameFile(NewRuntime, OldRuntime) then
    begin
      if HadOldRuntime then RenameFile(BackupRuntime, OldRuntime);
      RaiseException('Unable to activate the staged runtime; the previous runtime was restored.');
    end;
    RuntimeSwapped := True;

    try
      { Synchronize non-runtime files only after the atomic runtime switch and
        publish the release manifest last as the commit marker. }
      RobocopyExe := ExpandConstant('{sys}\robocopy.exe');
      if not Exec(RobocopyExe,
        '"' + StageDir + '" "' + AppDir + '" /E /XD "' + NewRuntime +
        '" /XF release-manifest.json /R:2 /W:1 /NP /NDL /NFL /NJH /NJS',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
        RaiseException('Unable to start the setup file synchronizer.');
      if ResultCode >= 8 then
        RaiseException(Format('Setup file synchronization failed (Robocopy exit code %d).', [ResultCode]));
      if not FileCopy(ReleaseManifest, AddBackslash(AppDir) + 'release-manifest.json', False) then
        RaiseException('Unable to publish the release manifest.');
    except
      if RuntimeSwapped then
      begin
        RenameFile(OldRuntime, FailedRuntime);
        if HadOldRuntime then RenameFile(BackupRuntime, OldRuntime);
      end;
      raise;
    end;

    if HadOldRuntime then DelTree(BackupRuntime, True, True, True);
    { Setup has just committed a fully validated runtime. Do not let an old,
      abandoned portable-updater journal roll this installation backward on
      the first shortcut launch. }
    DeleteFile(AddBackslash(AppDir) + '.update-transaction.json');
    DelTree(AddBackslash(AppDir) + '.update-backups', True, True, True);
    DelTree(StageDir, True, True, True);
  end;
end;
