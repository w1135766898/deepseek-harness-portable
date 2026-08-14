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
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\deepseek.ico"; WorkingDir: "{app}\runtime"
Name: "{group}\DeepSeek Harness (网页服务模式)"; Filename: "{app}\启动网页版.bat"; IconFilename: "{app}\assets\deepseek.ico"; WorkingDir: "{app}"
Name: "{group}\在线更新"; Filename: "{app}\在线更新.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\deepseek.ico"; WorkingDir: "{app}\runtime"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; WorkingDir: "{app}\runtime"; Flags: nowait postinstall skipifsilent

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
  ZipPath, AppDir, TarExe, TaskKillExe, MainExe, PickerWorker, ReleaseManifest: String;
begin
  if CurStep = ssPostInstall then
  begin
    { The payload is extracted by tar rather than [Files], so Restart Manager
      cannot discover its locked executables. Stop any prior app tree before
      replacing the runtime to prevent a mixed-version installation. }
    TaskKillExe := ExpandConstant('{sys}\taskkill.exe');
    if FileExists(TaskKillExe) then
    begin
      Exec(TaskKillExe, '/F /T /IM "DeepSeek Harness.exe"', '', SW_HIDE,
        ewWaitUntilTerminated, ResultCode);
      Sleep(500);
    end;

    ZipPath := ExpandConstant('{tmp}\{#MyZipName}');
    AppDir := ExpandConstant('{app}');
    TarExe := ExpandConstant('{sys}\tar.exe');
    if not FileExists(TarExe) then
      TarExe := ExpandConstant('{sysnative}\tar.exe');
    if not FileExists(TarExe) then
      TarExe := 'tar.exe';
    if not Exec(TarExe,
      '-xf "' + ZipPath + '" -C "' + AppDir + '" --strip-components 1',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      RaiseException('Unable to start the Windows archive extractor.');
    if ResultCode <> 0 then
      RaiseException(Format('Runtime extraction failed (tar exit code %d).', [ResultCode]));

    MainExe := AddBackslash(AppDir) + '{#MyAppExeName}';
    ReleaseManifest := AddBackslash(AppDir) + 'release-manifest.json';
    PickerWorker := AddBackslash(AppDir) +
      'runtime\resources\app\node_modules\@deepseek-ai\dsh-host-directory-picker-native\lib\worker.cjs';
    if not FileExists(ReleaseManifest) then
      RaiseException('Runtime extraction completed without the release manifest.');
    if not FileExists(MainExe) then
      RaiseException('Runtime extraction completed without the main executable.');
    if not FileExists(PickerWorker) then
      RaiseException('Runtime extraction completed without the directory picker worker.');
  end;
end;
