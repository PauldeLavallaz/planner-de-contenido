import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, statSync } from 'node:fs';

export const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
export const REPO_DIR = resolve(APP_DIR, '..');
export const PUBLIC_DIR = resolve(APP_DIR, 'public');
export const ENGINE_DIR = resolve(process.env.PLANNER_ENGINE || resolve(REPO_DIR, 'engine'));
export const CONFIG_PATH = resolve(process.env.PLANNER_CONFIG || resolve(REPO_DIR, 'planner.config.json'));
export const PYTHON = process.env.PLANNER_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const expand = (p: string) => p.startsWith('~') ? resolve(homedir(), p.slice(1).replace(/^[\\/]/, '')) : p;
let cached: { mtime: number, value: Paths } | null = null;
export const MOTOR_DIR = resolve(process.env.PLANNER_MOTOR || resolve(REPO_DIR, 'motor-historias'));
// stories: la carpeta con las semanas de historias (cada una con su semana.json); photos: tu carpeta de fotos para
// usar de fondo o de sticker en el editor (opcional).
// guiones: la carpeta con los planes de cada semana (<AAAA-MM-DD>/plan.json); looks: una imagen o video por look del avatar.
export type Paths = { configured: boolean, root: string, publish: string, state: string, timezone: string, networks: string[], stories: string, photos: string | null, guiones: string, looks: string };

// La config se relee cuando cambia: la instalación la va completando con el planner ya abierto.
export function paths(): Paths {
  let mtime = -1;
  try { mtime = statSync(CONFIG_PATH).mtimeMs; } catch {}
  if (cached && cached.mtime === mtime) return cached.value;
  let cfg: any = {};
  try { cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch {}
  const base = dirname(CONFIG_PATH);
  const rootRaw = expand(String(cfg?.content?.root ?? '..'));
  const root = isAbsolute(rootRaw) ? resolve(rootRaw) : resolve(base, rootRaw);
  const pubRaw = expand(String(cfg?.publish_root ?? 'publicar'));
  const publish = isAbsolute(pubRaw) ? resolve(pubRaw) : resolve(root, pubRaw);
  const at = (raw: string) => { const x = expand(raw); return isAbsolute(x) ? resolve(x) : resolve(root, x); };
  const st = cfg?.historias || {}, gu = cfg?.guiones || {};
  const value = { configured: mtime >= 0, root, publish, state: resolve(publish, '.planner'), timezone: cfg?.timezone || 'America/Argentina/Buenos_Aires', networks: Object.keys(cfg?.channels || {}),
    stories: at(String(st.carpeta ?? 'historias')), photos: st.fotos ? at(String(st.fotos)) : null, guiones: at(String(gu.carpeta ?? 'guiones')), looks: at(String(gu.looks ?? 'looks')) };
  cached = { mtime, value };
  return value;
}
