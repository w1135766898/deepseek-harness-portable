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
Source: "setup-runtime-preflight.ps1"; DestDir: "{app}"; Flags: ignoreversion

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
  RuntimePreflightResultCode: Integer;

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

function QuotePowerShellArgument(const Value: String): String;
begin
  // A Windows filesystem path cannot contain a double quote.
  Result := '"' + Value + '"';
end;

procedure RunRuntimePreflight(
  const Mode, ResourcePath, DestinationPath, ReportPath: String
);
var
  PowerShellExe, ScriptPath, Parameters: String;
begin
  PowerShellExe := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  if not FileExists(PowerShellExe) then
    PowerShellExe := ExpandConstant('{sysnative}\WindowsPowerShell\v1.0\powershell.exe');
  ScriptPath := AddBackslash(ExpandConstant('{app}')) + 'setup-runtime-preflight.ps1';
  Parameters := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' +
    QuotePowerShellArgument(ScriptPath) + ' -Mode ' + Mode + ' -InstallRoot ' +
    QuotePowerShellArgument(ExpandConstant('{app}')) + ' -ResourcePath ' +
    QuotePowerShellArgument(ResourcePath) + ' -DestinationPath ' +
    QuotePowerShellArgument(DestinationPath) + ' -ReportPath ' +
    QuotePowerShellArgument(ReportPath);
  RuntimePreflightResultCode := -1;
  Log('DSH_SETUP_TRACE preflight-files');
  if not FileExists(PowerShellExe) then
    Exit;
  if not FileExists(ScriptPath) then
    Exit;
  Log('DSH_SETUP_TRACE preflight-exec');
  if not Exec(PowerShellExe, Parameters, '', SW_HIDE,
    ewWaitUntilTerminated, RuntimePreflightResultCode) then
    Exit;
  Log(Format('DSH_SETUP_TRACE preflight-exit-%d', [RuntimePreflightResultCode]));
  Log('DSH_SETUP_TRACE preflight-return');
end;

procedure StopRunningApp;
var
  AppDir, RuntimePath, ReportPath: String;
begin
  AppDir := ExpandConstant('{app}');
  RuntimePath := AddBackslash(AppDir) + 'runtime';
  ReportPath := AddBackslash(AppDir) + 'setup-runtime-process-report.json';
  Log('DSH_SETUP_TRACE stop-enter');
  RunRuntimePreflight('Stop', RuntimePath, '', ReportPath);
  Log('DSH_SETUP_TRACE stop-returned');
  if RuntimePreflightResultCode <> 0 then
    Log(Format('Runtime preflight could not stop every verified product process (exit code %d); the critical swap will check again.', [RuntimePreflightResultCode]));
end;

procedure RemoveDirectoryWithRetry(const Path: String);
var
  Attempt: Integer;
begin
  for Attempt := 1 to 20 do
  begin
    if not DirExists(Path) then
      Exit;
    DelTree(Path, True, True, True);
    if not DirExists(Path) then
      Exit;
    Log('DSH_SETUP_TRACE postinstall-enter');
    StopRunningApp;
    Log('DSH_SETUP_TRACE postinstall-stopped');
    Sleep(500);
  end;
end;

function RenameDirectoryWithRetry(const Source, Destination: String): Boolean;
var
  Attempt: Integer;
begin
  // The desktop shell can take a short moment to release Electron/Node DLL
  // handles after taskkill returns. Retry the same-volume move instead of
  // failing immediately during an otherwise safe in-place upgrade.
  for Attempt := 1 to 20 do
  begin
    if RenameFile(Source, Destination) then
    begin
      Result := True;
      Exit;
    end;
    StopRunningApp;
    Sleep(500);
  end;
  Result := False;
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
  ZipPath, AppDir, StageDir, TarExe, RobocopyExe, RunId: String;
  MainExe, SafeLauncher, TransactionGate, PickerWorker, MarketplaceManifest, ReleaseManifest: String;
  OldRuntime, NewRuntime, BackupRuntime, FailedRuntime, LockReport, OrphanRuntime: String;
  ReportText: AnsiString;
  HadOldRuntime, RuntimeSwapped: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    ZipPath := ExpandConstant('{tmp}\{#MyZipName}');
    AppDir := ExpandConstant('{app}');
    // Every Setup attempt uses fresh transaction paths. An interrupted older
    // attempt may have a partially deleted fixed backup or stage; those paths
    // are retained as evidence and can never collide with this swap.
    StopRunningApp;
    // Keep the staging tree on the target volume. The runtime activation below
    // uses RenameFile, which is an atomic same-volume move and cannot cross
    // from the system TEMP drive to a user-selected D: or E: installation.
    Log('DSH_SETUP_TRACE pre-runid');
    RunId := GetMD5OfString(ExpandConstant('{tmp}'));
    Log('DSH_SETUP_TRACE runid-' + RunId);
    StageDir := AddBackslash(AppDir) + '.setup-stage-{#MyAppVersion}-' + RunId;
    if not ForceDirectories(StageDir) then
      RaiseException('Unable to create the setup staging directory.');
    Log('DSH_SETUP_TRACE stage-created-' + StageDir);

    // Extract and validate the complete release in a separate directory on the
    // target volume. A corrupt or incomplete archive therefore cannot partially
    // overwrite a usable install, while runtime activation remains same-volume.
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
    MarketplaceManifest := AddBackslash(StageDir) +
      'runtime\resources\app\node_modules\dsh-plugin-marketplace\package.json';
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
    if not FileExists(MarketplaceManifest) then
      RaiseException('Staged release is missing the plugin marketplace manifest.');

    OldRuntime := AddBackslash(AppDir) + 'runtime';
    NewRuntime := AddBackslash(StageDir) + 'runtime';
    BackupRuntime := AddBackslash(AppDir) + '.setup-runtime-backup-' + RunId;
    FailedRuntime := AddBackslash(StageDir) + 'failed-runtime';
    LockReport := AddBackslash(AppDir) + 'setup-runtime-lock-report.json';
    RunRuntimePreflight('Stop', OldRuntime, BackupRuntime, LockReport);
    if RuntimePreflightResultCode <> 0 then
      RaiseException(Format('Unable to stop the verified DeepSeek Harness process tree (exit code %d). Details: %s', [RuntimePreflightResultCode, LockReport]));
    HadOldRuntime := DirExists(OldRuntime);
    RuntimeSwapped := False;
    if HadOldRuntime and (not RenameDirectoryWithRetry(OldRuntime, BackupRuntime)) then
    begin
      RunRuntimePreflight('Diagnose', OldRuntime, BackupRuntime, LockReport);
      if RuntimePreflightResultCode <> 0 then
        Log(Format('Runtime lock diagnostics exited with code %d.', [RuntimePreflightResultCode]));
      ReportText := '';
      if not LoadStringFromFile(LockReport, ReportText) then
        ReportText := 'The lock report could not be read.';
      RaiseException(
        'Unable to move the existing runtime.' + #13#10 +
        'Source: ' + OldRuntime + #13#10 +
        'Destination: ' + BackupRuntime + #13#10 +
        'Lock report: ' + LockReport + #13#10#13#10 + ReportText);
    end;

    if not RenameDirectoryWithRetry(NewRuntime, OldRuntime) then
    begin
      if HadOldRuntime then RenameFile(BackupRuntime, OldRuntime);
      RaiseException('Unable to activate the staged runtime; the previous runtime was restored.');
    end;
    RuntimeSwapped := True;

    try
      // Synchronize non-runtime files only after the atomic runtime switch and
      // publish the release manifest last as the commit marker.
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
      RaiseException(GetExceptionMessage);
    end;

    if HadOldRuntime then
    begin
      DelTree(BackupRuntime, True, True, True);
      if DirExists(BackupRuntime) then
      begin
        OrphanRuntime := AddBackslash(AppDir) + '.setup-orphan-runtime-' + RunId;
        if RenameFile(BackupRuntime, OrphanRuntime) then
          Log('Retained an undeletable previous runtime as isolated evidence: ' + OrphanRuntime)
        else
          Log('Unable to delete or isolate the unique previous runtime: ' + BackupRuntime);
      end;
    end;
    // Setup has just committed a fully validated runtime. Do not let an old,
    // abandoned portable-updater journal roll this installation backward on
    // the first shortcut launch.
    DeleteFile(AddBackslash(AppDir) + '.update-transaction.json');
    DelTree(AddBackslash(AppDir) + '.update-backups', True, True, True);
    RemoveDirectoryWithRetry(StageDir);
  end;
end;
