; IntegrAlo installer (RNF-06, epígrafe 3.8), compiled with Inno Setup 6 by `pnpm installer`.
; It installs the self-contained package built by `pnpm package` and leaves IntegrAlo running
; as a Windows service: nothing else (Node.js, Mosquitto) has to be installed or configured.
;
; Decisions:
; - Program in Program Files (read-only for users); data in %ProgramData%\IntegrAlo, kept on
;   updates and on uninstall unless the user asks to delete it.
; - The data folder holds the broker passwords and the server's private key: only SYSTEM (the
;   service) and administrators may read it.
; - Firewall: TCP 4100 (app) and 1883 (nodes) on private and domain networks; public networks
;   only if the user ticks it. The server panel (4101) listens on 127.0.0.1 and needs no rule.

#ifndef SourceDir
  #error Pass /DSourceDir=<release\IntegrAlo> (pnpm installer does it)
#endif
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppPort "4100"
#define BrokerPort "1883"
#define PanelPort "4101"
#define Service "{app}\service\IntegrAlo-service.exe"

[Setup]
AppId={{FB40DD8D-1A43-4CAE-AE10-5AD0F3A26CCC}
AppName=IntegrAlo
AppVersion={#AppVersion}
AppVerName=IntegrAlo {#AppVersion}
AppPublisher=Tony Alejandro Fernández Ruz (Cujae)
DefaultDirName={autopf}\IntegrAlo
DefaultGroupName=IntegrAlo
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
OutputBaseFilename=IntegrAlo-Setup-{#AppVersion}
UninstallDisplayName=IntegrAlo
UninstallDisplayIcon={app}\mosquitto\mosquitto.exe
; The service keeps files open: it is stopped in PrepareToInstall, not by Restart Manager.
CloseApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[CustomMessages]
spanish.TaskFirewall=Permitir en el firewall de Windows la app (puerto {#AppPort}) y los nodos ESP32 (puerto {#BrokerPort}) en redes privadas
spanish.TaskFirewallPublic=Permitirlos también en redes públicas (solo si la red de la instalación está marcada como pública)
spanish.TaskMosquitto=Detener el servicio Mosquitto de Windows ya instalado y dejarlo en inicio manual (ocupa el puerto {#BrokerPort}; IntegrAlo trae su propio Mosquitto)
spanish.GroupNetwork=Red:
spanish.GroupOther=Otros:
spanish.StoppingService=Deteniendo el servicio IntegrAlo…
spanish.StartingService=Registrando e iniciando el servicio IntegrAlo…
spanish.OpenPanel=Abrir el panel del servidor
spanish.PanelShortcut=Panel del servidor IntegrAlo
spanish.ServiceFailed=No se pudo iniciar el servicio IntegrAlo (código %1). Revise los registros en %2.
spanish.DeleteData=¿Borrar también los datos de IntegrAlo?%n%nSe eliminarían la base de datos (historial, usuarios, auditoría), la configuración del broker y la identidad del servidor, con la que los teléfonos vinculados lo reconocen.%n%nCarpeta: %1

[Tasks]
Name: "firewall"; Description: "{cm:TaskFirewall}"; GroupDescription: "{cm:GroupNetwork}"
Name: "firewall\public"; Description: "{cm:TaskFirewallPublic}"; GroupDescription: "{cm:GroupNetwork}"; Flags: unchecked
Name: "mosquitto"; Description: "{cm:TaskMosquitto}"; GroupDescription: "{cm:GroupOther}"; Check: MosquittoServiceExists

[InstallDelete]
; On updates, the previous code and dependencies are replaced as a whole (not merged).
Type: filesandordirs; Name: "{app}\apps"
Type: filesandordirs; Name: "{app}\node"
Type: filesandordirs; Name: "{app}\mosquitto"
Type: filesandordirs; Name: "{app}\modules"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Dirs]
Name: "{commonappdata}\IntegrAlo"; Flags: uninsneveruninstall

[INI]
Filename: "{app}\Panel del servidor.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://127.0.0.1:{#PanelPort}"

[Icons]
; (No shortcut to the logs folder: opening it from Explorer offers to grant the user
; permanent access to the protected data folder. The panel shows the recent log.)
Name: "{autoprograms}\IntegrAlo\{cm:PanelShortcut}"; Filename: "{app}\Panel del servidor.url"

[Run]
; Everything else (permissions, Mosquitto, firewall, service) runs from [Code], in order.
Filename: "http://127.0.0.1:{#PanelPort}"; Description: "{cm:OpenPanel}"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "{#Service}"; Parameters: "stopwait"; Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{#Service}"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""IntegrAlo - app (TCP {#AppPort})"""; Flags: runhidden waituntilterminated; RunOnceId: "FirewallApp"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""IntegrAlo - nodos MQTT (TCP {#BrokerPort})"""; Flags: runhidden waituntilterminated; RunOnceId: "FirewallBroker"

[UninstallDelete]
Type: files; Name: "{app}\Panel del servidor.url"

[Code]
const
  ServicesKey = 'SYSTEM\CurrentControlSet\Services\';

function ServiceExists(Name: String): Boolean;
begin
  Result := RegKeyExists(HKLM, ServicesKey + Name);
end;

function MosquittoServiceExists: Boolean;
begin
  Result := ServiceExists('mosquitto');
end;

function FirewallProfiles(Param: String): String;
begin
  if WizardIsTaskSelected('firewall\public') then
    Result := 'private,domain,public'
  else
    Result := 'private,domain';
end;

function Run(Exe, Params: String): Integer;
begin
  if not Exec(Exe, Params, '', SW_HIDE, ewWaitUntilTerminated, Result) then
    Result := -1;
end;

function RunService(Command: String): Integer;
begin
  Result := Run(ExpandConstant('{#Service}'), Command);
end;

procedure FirewallRule(Name, Port: String);
var
  Netsh: String;
begin
  Netsh := ExpandConstant('{sys}\netsh.exe');
  { Deleted first, so an update does not duplicate it. }
  Run(Netsh, 'advfirewall firewall delete rule name="' + Name + '"');
  Run(Netsh, 'advfirewall firewall add rule name="' + Name + '" dir=in action=allow protocol=TCP localport=' + Port + ' profile=' + FirewallProfiles(''));
end;

{ Updating: the running service keeps the files open, so it is stopped first. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if ServiceExists('IntegrAlo') and FileExists(ExpandConstant('{#Service}')) then
  begin
    WizardForm.PreparingLabel.Caption := CustomMessage('StoppingService');
    RunService('stopwait');
  end;
end;

{ After the files are copied, in this order: protect the data folder, free port {#BrokerPort}
  if the user agreed, open the firewall, and register (or update) and start the service. }
procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    { Only SYSTEM (S-1-5-18) and Administrators (S-1-5-32-544); its files inherit it. }
    Run(ExpandConstant('{sys}\icacls.exe'), '"' + ExpandConstant('{commonappdata}\IntegrAlo') + '" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F');
    if WizardIsTaskSelected('mosquitto') then
    begin
      Run(ExpandConstant('{sys}\net.exe'), 'stop mosquitto');
      Run(ExpandConstant('{sys}\sc.exe'), 'config mosquitto start= demand');
    end;
    if WizardIsTaskSelected('firewall') then
    begin
      FirewallRule('IntegrAlo - app (TCP {#AppPort})', '{#AppPort}');
      FirewallRule('IntegrAlo - nodos MQTT (TCP {#BrokerPort})', '{#BrokerPort}');
    end;
    WizardForm.StatusLabel.Caption := CustomMessage('StartingService');
    if ServiceExists('IntegrAlo') then
      RunService('refresh')
    else
      RunService('install');
    Code := RunService('start');
    if Code <> 0 then
      MsgBox(FmtMessage(CustomMessage('ServiceFailed'), [IntToStr(Code), ExpandConstant('{commonappdata}\IntegrAlo\logs')]), mbError, MB_OK);
  end;
end;

{ The data is kept unless the user explicitly asks to delete it (never in a silent uninstall). }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{commonappdata}\IntegrAlo');
    if DirExists(DataDir) and not UninstallSilent then
      if MsgBox(FmtMessage(CustomMessage('DeleteData'), [DataDir]), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(DataDir, True, True, True);
  end;
end;
