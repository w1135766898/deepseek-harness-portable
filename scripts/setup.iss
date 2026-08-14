; ==============================================================================
; Inno Setup Script for DeepSeek Harness Windows x64 Distribution
; ==============================================================================

#define MyAppName "DeepSeek Harness"
#define MyAppVersion "0.1.0-rc.6"
#define MyAppPublisher "DeepSeek Harness Contributors"
#define MyAppURL "https://github.com/deepseek-ai/deepseek-harness"
#define MyAppExeName "runtime\DeepSeek Harness.exe"
#define MyZipName "DeepSeek-Harness-0.1.0-rc.6-win32-x64.zip"

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
OutputDir=C:\Users\Ryan\Desktop\deepseek-harness-portable\release
OutputBaseFilename=DeepSeek-Harness-Setup-{#MyAppVersion}-win32-x64
SetupIconFile=C:\Users\Ryan\Desktop\deepseek-harness-portable\apps\desktop\assets\deepseek.ico
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
Source: "..\release\{#MyZipName}"; DestDir: "{tmp}"; Flags: deleteafterinstall nocompression
Source: "C:\Users\Ryan\Desktop\deepseek-harness-portable\apps\desktop\assets\deepseek.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

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
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  ZipPath, AppDir, TarExe, TaskKillExe, MainExe, PickerWorker: String;
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
    PickerWorker := AddBackslash(AppDir) +
      'runtime\resources\app\node_modules\@deepseek-ai\dsh-host-directory-picker-native\lib\worker.cjs';
    if not FileExists(MainExe) then
      RaiseException('Runtime extraction completed without the main executable.');
    if not FileExists(PickerWorker) then
      RaiseException('Runtime extraction completed without the directory picker worker.');
  end;
end;
