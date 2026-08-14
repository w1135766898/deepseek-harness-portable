; ==============================================================================
; Inno Setup Script for DeepSeek Harness Windows x64 Distribution
; ==============================================================================

#define MyAppName "DeepSeek Harness"
#define MyAppVersion "0.1.0-rc.5"
#define MyAppPublisher "DeepSeek Harness Contributors"
#define MyAppURL "https://github.com/w1135766898/deepseek-harness-portable"
#define MyAppExeName "启动-网页版(推荐).bat"

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
OutputDir=..\release
OutputBaseFilename=DeepSeek-Harness-Setup-{#MyAppVersion}-win32-x64
SetupIconFile=..\apps\desktop\assets\deepseek.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\release\DeepSeek Harness-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\runtime\resources\app\assets\deepseek.ico"
Name: "{group}\DeepSeek Harness (原生独立窗口)"; Filename: "{app}\启动-桌面窗口.bat"; IconFilename: "{app}\runtime\resources\app\assets\deepseek.ico"
Name: "{group}\在线更新"; Filename: "{app}\在线更新.bat"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\runtime\resources\app\assets\deepseek.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\创建桌面快捷方式与解除拦截.bat"; Parameters: "/silent"; Flags: runhidden
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent nowait
