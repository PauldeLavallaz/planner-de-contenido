// Deja el planner corriendo solo al iniciar sesión, sin una terminal abierta.
// macOS: LaunchAgent (se reinicia si se cae). Linux: servicio systemd de usuario. Windows: acceso en Inicio.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { resolve, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const name = 'planner-de-contenido';
const label = 'com.planner-de-contenido';
const appDir = fileURLToPath(new URL('..', import.meta.url));
const server = resolve(appDir, 'src/server.ts');
const port = Number(process.env.PLANNER_PORT || 4180);
const url = `http://127.0.0.1:${port}`;
const os = platform();
const logs = os === 'darwin' ? resolve(homedir(), 'Library/Logs/PlannerDeContenido') : resolve(homedir(), '.local/state', name);
const envPath = [dirname(process.execPath), process.env.PATH || ''].filter(Boolean).join(delimiter);
const xml = t => String(t).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

async function health() {
  try { const r = await fetch(url + '/api/health', { signal: AbortSignal.timeout(1000) }); const j = await r.json(); return j.service === 'publication-planner' && j.ok ? j : null; } catch { return null; }
}
async function ready() {
  for (let i = 0; i < 24; i++) {
    const h = await health();
    if (h) { console.log(`Planner listo: ${url} (PID ${h.pid}). Logs: ${logs}`); return; }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`El planner todavía no responde en ${url}. Revisá ${logs}`);
}
function run(cmd, args, required = true) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (required && r.status !== 0) throw new Error(r.stderr || r.error?.message || `${cmd}: ${r.status}`);
  return r;
}

const mac = {
  plist: resolve(homedir(), 'Library/LaunchAgents', label + '.plist'),
  get target() { return `gui/${process.getuid()}/${label}`; },
  install() {
    mkdirSync(logs, { recursive: true }); mkdirSync(dirname(this.plist), { recursive: true });
    writeFileSync(this.plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(server)}</string></array>
<key>WorkingDirectory</key><string>${xml(appDir)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>3</integer>
<key>StandardOutPath</key><string>${xml(resolve(logs, 'stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(resolve(logs, 'stderr.log'))}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(envPath)}</string><key>PLANNER_PORT</key><string>${port}</string></dict>
</dict></plist>\n`, { mode: 0o600 });
    run('/bin/launchctl', ['bootout', this.target], false);
    run('/bin/launchctl', ['enable', this.target]);
    run('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, this.plist]);
  },
  restart() { run('/bin/launchctl', ['kickstart', '-k', this.target]); },
  status() { const r = run('/bin/launchctl', ['print', this.target], false); return r.status === 0 ? 'instalado (LaunchAgent)' : 'no instalado'; },
  uninstall() { run('/bin/launchctl', ['bootout', this.target], false); if (existsSync(this.plist)) unlinkSync(this.plist); },
};

const linux = {
  unit: resolve(homedir(), '.config/systemd/user', name + '.service'),
  install() {
    mkdirSync(dirname(this.unit), { recursive: true }); mkdirSync(logs, { recursive: true });
    writeFileSync(this.unit, `[Unit]\nDescription=Planner de contenido\n\n[Service]\nExecStart=${process.execPath} ${server}\nWorkingDirectory=${appDir}\nEnvironment=PATH=${envPath}\nEnvironment=PLANNER_PORT=${port}\nRestart=always\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n`);
    run('systemctl', ['--user', 'daemon-reload']);
    run('systemctl', ['--user', 'enable', '--now', name]);
  },
  restart() { run('systemctl', ['--user', 'restart', name]); },
  status() { const r = run('systemctl', ['--user', 'is-active', name], false); return (r.stdout || '').trim() || 'no instalado'; },
  uninstall() { run('systemctl', ['--user', 'disable', '--now', name], false); if (existsSync(this.unit)) unlinkSync(this.unit); run('systemctl', ['--user', 'daemon-reload'], false); },
};

// Windows: un script oculto en la carpeta Inicio arranca el planner al iniciar sesión.
const win = {
  file: resolve(process.env.APPDATA || resolve(homedir(), 'AppData/Roaming'), 'Microsoft/Windows/Start Menu/Programs/Startup', name + '.vbs'),
  install() {
    mkdirSync(logs, { recursive: true });
    const cmd = `cmd /c set PLANNER_PORT=${port}&& "${process.execPath}" "${server}" >> "${resolve(logs, 'planner.log')}" 2>&1`;
    writeFileSync(this.file, `Set s = CreateObject("WScript.Shell")\ns.CurrentDirectory = "${appDir}"\ns.Run "${cmd.replaceAll('"', '""')}", 0, False\n`);
    this.start();
  },
  start() { spawn('wscript.exe', [this.file], { detached: true, stdio: 'ignore' }).unref(); },
  async restart() { const h = await health(); if (h) run('taskkill', ['/PID', String(h.pid), '/F'], false); await new Promise(r => setTimeout(r, 800)); this.start(); },
  status() { return existsSync(this.file) ? 'instalado (Inicio de Windows)' : 'no instalado'; },
  async uninstall() { const h = await health(); if (h) run('taskkill', ['/PID', String(h.pid), '/F'], false); if (existsSync(this.file)) unlinkSync(this.file); },
};

const svc = os === 'darwin' ? mac : os === 'win32' ? win : linux;
try {
  switch (process.argv[2]) {
    case 'install': await svc.install(); await ready(); break;
    case 'restart': await svc.restart(); await ready(); break;
    case 'status': {
      console.log('Servicio:', svc.status());
      const h = await health();
      console.log(h ? `Responde en ${url} (PID ${h.pid}, desde ${h.startedAt})` : `No responde en ${url}`);
      if (!h) process.exitCode = 1;
      break;
    }
    case 'uninstall': await svc.uninstall(); console.log('Arranque automático retirado. Tus carpetas y el estado del planner quedan igual.'); break;
    default: console.error('Uso: node scripts/service.mjs install|status|restart|uninstall'); process.exitCode = 1;
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
