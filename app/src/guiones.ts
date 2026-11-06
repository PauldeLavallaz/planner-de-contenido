// Pestaña Guiones: revisar guiones, audios, rough cuts, finales y carruseles de la semana, aprobarlos y dejar feedback
// escrito o grabado para Claude Code. Cada semana es un plan en <contenido>/<guiones.carpeta>/<AAAA-MM-DD>/plan.json (o
// en una subcarpeta, si hay más de un plan por semana) y cada pieza apunta a su carpeta, donde viven guion.txt, el audio,
// rough_cut*.mp4, final.mp4, slides/ y feedback/. El planner sólo lee esas carpetas; lo que escribe es lo que elegís acá
// (estado, estilo, look y título) en el plan y en el estado del planner (<publicar>/.planner/). Formato en docs/guiones.md.
import type { Hono } from 'hono';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config, paths } from './config.ts';
import { ROOT, STATE, exec, fileRead, within, posix, readFeedback, validatePlannerFeedback, markFeedbackSent, OPEN, plannerMediaPath } from './publication-planner.ts';
import { cantidad, editarDesc, nombreMensaje, tituloMensaje } from './titulo-mensaje.ts';

const ESTADO = () => resolve(STATE(), 'guiones-estado.json');
// Estilos cambiados desde el planner, por pieza: el de antes, el elegido y sus muestras.
const ESTILOS = () => resolve(STATE(), 'guiones-estilos.json');
// Favoritos, descartados, cuadros elegidos y elecciones de estilo: el catálogo que va aprendiendo de lo que elegís.
const PREFS = () => resolve(STATE(), 'estilos-preferencias.json');
// Cuadros de los videos terminados de cada estilo: cache regenerable.
const CUADROS = () => resolve(STATE(), 'cache/estilos'), CUADROS_IDX = () => resolve(CUADROS(), 'index.json');
export const rel = (p: string) => within(ROOT(), p) ? posix(relative(ROOT(), p)) : p;
export const writeJson = (target: string, data: unknown) => { mkdirSync(dirname(target), { recursive: true }); const tmp = target + '.' + randomUUID() + '.tmp'; writeFileSync(tmp, JSON.stringify(data, null, 2)); renameSync(tmp, target); };
const UNAPPLIED = (e: any) => e.estado !== 'aplicado' && e.estado !== 'en_curso';
// Lo que queda de una pieza al sacarle la aprobación: si estaba pausada o descartada.
const marcas = (st: any) => Object.fromEntries(['descartado', 'pausado'].filter(k => st?.[k]).map(k => [k, st[k]]));
const BY = 'el planner';

// El día y la hora en que empezó a producirse una pieza: los del nombre de su carpeta si termina en AAAAMMDD-HHMMSS o, si
// no, cuándo se creó la carpeta. «YYYY-MM-DDTHH:MM»; null si no hay carpeta.
function inicioDe(run: unknown, dir: string | null) {
  const m = typeof run === 'string' ? /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\d{2}\/?$/.exec(run) : null;
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  if (!dir) return null;
  const t = statSync(dir).birthtimeMs || statSync(dir).mtimeMs;
  const hora = new Intl.DateTimeFormat('sv-SE', { timeZone: paths().timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  return t ? hora.format(t).replace(' ', 'T') : null;
}

// La carpeta de una pieza vale si está dentro de la carpeta de contenido, existe y no es oculta.
export function runDir(run: unknown) {
  if (typeof run !== 'string' || !run || run.includes('..')) return null;
  const p = resolve(ROOT(), run);
  if (!within(ROOT(), p) || relative(ROOT(), p).split(sep).some(x => x.startsWith('.'))) return null;
  return existsSync(p) && statSync(p).isDirectory() ? p : null;
}
// Rutas del plan: relativas a la carpeta del plan o, si no existen ahí, a la carpeta de contenido.
function enContenido(planDir: string, x: unknown) {
  if (typeof x !== 'string' || !x || x.includes('..')) return null;
  const a = resolve(planDir, x), b = resolve(ROOT(), x), p = existsSync(a) ? a : b;
  return within(ROOT(), p) ? rel(p) : null;
}

export function guionesPlans() {
  const base = paths().guiones, out: any[] = [];
  if (!existsSync(base)) return out;
  for (const week of readdirSync(base)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) continue;
    const dir = resolve(base, week);
    if (!statSync(dir).isDirectory()) continue;
    for (const sub of ['', ...readdirSync(dir).filter(x => !x.startsWith('.') && statSync(resolve(dir, x)).isDirectory())]) {
      const f = resolve(dir, sub, 'plan.json');
      if (!existsSync(f)) continue;
      const d = fileRead(f, null);
      if (!d || !Array.isArray(d.piezas)) continue;
      const planDir = dirname(f);
      // Cada pieza con `run`: su carpeta relativa a la de contenido (en el plan puede venir como `carpeta`).
      const piezas = d.piezas.filter((p: any) => p && typeof p === 'object').map((p: any) => ({ ...p, id: String(p.id || ''), run: enContenido(planDir, p.carpeta ?? p.run) || String(p.carpeta ?? p.run ?? ''),
        muestras: (Array.isArray(p.muestras) ? p.muestras : []).map((m: any) => { const path = enContenido(planDir, typeof m === 'string' ? m : m?.path); return path ? { path, nota: m?.nota || '' } : null; }).filter(Boolean) }));
      // Un plan de pauta (`tipo: "anuncios"`, o en una subcarpeta `anuncios/`) se ve en Guiones → Anuncios, no con el orgánico.
      const tipo = d.tipo === 'anuncios' || (d.tipo === undefined && /^anuncios?$/i.test(sub)) ? 'anuncios' : 'organico';
      out.push({ week: d.semana || week, perfil: sub, tipo, marca: limpio(d.marca, 80), path: rel(f), titulo: d.titulo || '', piezas: piezas.length, mtime: statSync(f).mtimeMs, data: { ...d, piezas }, file: f });
    }
  }
  return out.sort((a, b) => a.week < b.week ? -1 : a.week > b.week ? 1 : a.perfil.localeCompare(b.perfil));
}
// La pieza dentro del plan.json tal cual está escrito, para cambiarle un campo sin tocar el resto.
export function piezaEnPlan(plan: any, run: string) {
  const raw = fileRead(plan.file, null), planDir = dirname(plan.file);
  const target = raw?.piezas?.find((x: any) => (enContenido(planDir, x?.carpeta ?? x?.run) || x?.carpeta || x?.run) === run);
  return { raw, target };
}

const durations = new Map<string, { mtime: number, seconds: number | null }>();
async function seconds(p: string) {
  const m = statSync(p).mtimeMs, hit = durations.get(p);
  if (hit && hit.mtime === m) return hit.seconds;
  let s: number | null = null;
  try { const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { timeout: 10000 }); s = Math.round(parseFloat(stdout) * 10) / 10 || null; } catch {}
  durations.set(p, { mtime: m, seconds: s });
  return s;
}

export const guionFeedback = (dir: string) => readFeedback(resolve(dir, 'feedback')).filter((e: any) => e.tipo === 'guion');
// Una nota de copy no cambia el audio ni el corte: no saca la aprobación ni pone la pieza «Con feedback».
const deContenido = (e: any) => typeof e.copy !== 'string';
const AUDIOS = ['voice/audio_final.mp3', 'voice/audio_final.wav', 'audio.mp3', 'audio.wav', 'audio.m4a', 'voz.mp3', 'voz.wav', 'voz.m4a'];
const audioDe = (dir: string) => AUDIOS.map(n => resolve(dir, n)).find(existsSync) || null;
const cortesDe = (dir: string) => readdirSync(dir).filter(f => /^rough_cut(_v\d+)?\.mp4$/.test(f)).map(f => resolve(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
export const etapaDe = (dir: string) => versionesFinal(dir).length ? 'final' : cortesDe(dir).length ? 'rough_cut' : laminas(dir).length ? 'borrador_carrusel' : null;

// Versiones de un final: una iteración se guarda aparte (final_gancho_b.mp4) para no pisar lo aprobado o agendado, y se ve
// igual en la tarjeta. Las copias técnicas (liviana, para la web o para Postiz) no son versiones.
export function versionesFinal(dir: string) {
  return readdirSync(dir).filter(f => /^final([_-].*)?\.mp4$/.test(f) && !/liviano|_(app|web|postiz)\.mp4$/.test(f)).map(f => {
    const abs = resolve(dir, f), n = f === 'final.mp4' ? 'final' : f.slice(6, -4).replace(/[_-]+/g, ' ');
    return { abs, path: rel(abs), modified: statSync(abs).mtimeMs, nombre: n[0].toUpperCase() + n.slice(1) };
  }).sort((a, b) => b.modified - a.modified);
}
// Se revisa la más nueva. Aprobar una la fija, hasta que aparezca otra después de esa aprobación.
function finalVigente(vs: ReturnType<typeof versionesFinal>, st: any) {
  const ok = st?.estado === 'aprobado' ? vs.find(v => v.path === st.video && v.modified === st.video_modified) : null;
  return ok && !vs.some(v => v.modified > Date.parse(st.at)) ? ok : vs[0];
}
// Qué versión está en el calendario: la cola guarda de qué archivo copió cada pieza agendada. Lo que se ve en Guiones puede ser otra.
// Con una versión elegida sólo para el planner (`cola.py reemplazar --solo-planner`, `version_planner` en la ficha), la del
// calendario es ésa, sin subir todavía, y Postiz sigue con la de `source_final` hasta que se pida subirla.
let agendados: { at: number, map: Map<string, { agendada?: string, en_postiz?: string, sin_subir?: true }> } | null = null;
function agendadaEl(abs: string) {
  if (!agendados || Date.now() - agendados.at > 15000) {
    const map = new Map<string, { agendada?: string, en_postiz?: string, sin_subir?: true }>(), d = resolve(paths().publish, 'agendado');
    for (const f of existsSync(d) ? readdirSync(d) : []) if (f.endsWith('.json')) {
      const m = fileRead(resolve(d, f), null), fecha = m?.slot?.fecha || '', vp = m?.version_planner?.path;
      if (m?.source_final) map.set(real(m.source_final), vp ? { en_postiz: fecha } : { agendada: fecha });
      if (typeof vp === 'string' && vp) map.set(real(resolve(ROOT(), vp)), { agendada: fecha, sin_subir: true });
    }
    agendados = { at: Date.now(), map };
  }
  return agendados.map.get(real(abs)) || {};
}
const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };

// El copy del post: publish_kit.md → «## Caption» (o «## Copy»), caption.txt o, en un reel, copy.txt. En un carrusel
// copy.txt es el texto de las láminas.
export function captionDe(dir: string, carrusel = false) {
  const kit = resolve(dir, 'publish_kit.md');
  if (existsSync(kit)) {
    let cur: string | null = null; const sec: Record<string, string[]> = {};
    for (const line of readFileSync(kit, 'utf8').split('\n')) {
      const m = /^##\s+(.*)/.exec(line);
      if (m) { cur = m[1].trim().toLowerCase().replace(/^\d+[.)]\s*/, ''); sec[cur] ||= []; }
      else if (cur !== null) sec[cur].push(line);
    }
    for (const [k, v] of Object.entries(sec)) {
      if (!(k.startsWith('caption') || /^copy\b(?!\s+de\s+(las\s+)?l[áa]minas)/.test(k))) continue;
      let txt = v.join('\n').trim(); const b = /```[a-z]*\n([\s\S]*?)\n```/.exec(txt); txt = (b ? b[1] : txt).trim();
      if (txt) return txt;
    }
  }
  for (const name of ['caption.txt', ...(carrusel ? [] : ['copy.txt'])]) { const f = resolve(dir, name); if (existsSync(f) && readFileSync(f, 'utf8').trim()) return readFileSync(f, 'utf8').trim(); }
  return '';
}

// Carruseles: las láminas de <pieza>/slides/ (NN.png, y NN.mp4 si la lámina está animada).
function laminas(dir: string) {
  const s = resolve(dir, 'slides');
  if (!existsSync(s)) return [];
  const byN = new Map<string, any>();
  for (const f of readdirSync(s).filter(f => /^\d{2}\.(png|jpg|mp4)$/.test(f)).sort()) {
    const n = f.slice(0, 2), p = resolve(s, f), it = byN.get(n) || { n: Number(n), png: null, mp4: null, modified: 0 };
    it[f.endsWith('.mp4') ? 'mp4' : 'png'] = rel(p); it.modified = Math.max(it.modified, statSync(p).mtimeMs);
    byN.set(n, it);
  }
  return [...byN.values()].filter(x => x.png).sort((a, b) => a.n - b.n);
}
// Hasta tres portadas por carrusel en <pieza>/portadas/a|b|c.png, con portadas.json opcional ({"a": {"titulo", "idea"}}).
// La elegida queda en portadas/elegida.json y se copia a slides/01.png.
function portadas(dir: string) {
  const d = resolve(dir, 'portadas');
  if (!existsSync(d)) return [];
  const meta = fileRead(resolve(d, 'portadas.json'), {}), el = fileRead(resolve(d, 'elegida.json'), {});
  return ['a', 'b', 'c'].map(id => {
    const f = ['png', 'jpg'].map(x => resolve(d, `${id}.${x}`)).find(existsSync);
    return f ? { id, path: rel(f), modified: statSync(f).mtimeMs, titulo: meta[id]?.titulo || '', idea: meta[id]?.idea || '', elegida: el.id === id } : null;
  }).filter(Boolean);
}
// Muestras del estilo (un cuadro o un clip de un video ya hecho en ese estilo, o una referencia): sólo archivos que existen.
function muestras(list: any[]) {
  return (list || []).filter((m: any) => { const p = resolve(ROOT(), m.path); return within(ROOT(), p) && existsSync(p) && statSync(p).isFile(); })
    .map((m: any) => ({ path: m.path, nota: m.nota || '', tipo: /\.(mp4|mov|webm)$/i.test(m.path) ? 'video' : 'imagen' })).slice(0, 6);
}

// Biblioteca de estilos: los que ya se diseñaron para algún plan, con paleta, título y muestras, de más usado a menos
// usado. Cada estilo se ve con cuadros de un video terminado en ese estilo, si hay.
export const prefs = () => { const d = fileRead(PREFS(), {}); return { favoritos: d.favoritos || {}, descartados: d.descartados || {}, portadas: d.portadas || {}, ajustes: d.ajustes || {}, elecciones: Array.isArray(d.elecciones) ? d.elecciones : [] }; };
// `ajustes` pisa nombre, paleta, título, ritmo o título en pantalla de un estilo sin reescribir los planes viejos.
function ajusteDe(id: string, aj: Record<string, any>) {
  const a = aj[id]; if (!a) return {};
  return Object.fromEntries(['nombre', 'paleta', 'titulo', 'ritmo', 'titulo_css'].filter(k => a[k] !== undefined).map(k => [k, a[k]]));
}
export function estilosLibrary() {
  const by = new Map<string, any>(), cambiados = fileRead(ESTILOS(), {}), usos = new Map<string, number>(), terminados = new Map<string, number>();
  for (const pl of guionesPlans()) for (const p of pl.data.piezas) {
    const e = p?.estilo; if (!e?.id) continue;
    usos.set(e.id, (usos.get(e.id) || 0) + 1);
    // De qué estilo es cada video terminado: el de su pieza o, si se cambió desde el planner después de terminarla, el de antes.
    const dir = runDir(p.run), fin = dir ? versionesFinal(dir)[0]?.abs : null, ch = cambiados[p.run];
    const deFinal = fin ? (ch && statSync(fin).mtimeMs <= Date.parse(ch.at) ? ch.de?.id : e.id) : null;
    if (deFinal) terminados.set(deFinal, (terminados.get(deFinal) || 0) + 1);
    if (!Array.isArray(e.paleta) || !e.paleta.length) continue;
    const prev = by.get(e.id), ms = muestras(p.muestras), tipo = p.tipo === 'carrusel' ? 'carrusel' : 'reel';
    by.set(e.id, { ...prev, ...e, muestras: ms.length ? ms : prev?.muestras || [], tipos: [...new Set([...(prev?.tipos || []), tipo])], videos: prev?.videos || [] });
    if (deFinal && by.get(deFinal)) by.get(deFinal).videos.push(rel(fin!));
  }
  const aj = prefs().ajustes;
  return [...by.values()].map(s => ({ ...s, ...ajusteDe(s.id, aj), usos: usos.get(s.id) || 0, terminados: terminados.get(s.id) || 0, videos: [...new Set<string>(s.videos)].map(v => ({ path: v, exacto: true })) }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}
const titulos = new Map<string, string>();
function tituloVideo(path: string, plans: any[]) {
  if (!titulos.has(path)) { const run = posix(dirname(path)), p = plans.flatMap(x => x.data.piezas).find((x: any) => x.run === run); titulos.set(path, String(p?.titulo || basename(dirname(path)))); }
  return titulos.get(path)!;
}
// Cuatro cuadros por video (al 20, 40, 60 y 80 % de su duración) con ffmpeg, de a uno, en segundo plano y con nice.
const cola: string[] = [];
let analizando = false;
function cuadrosDe(path: string, idx: Record<string, any>) {
  const hit = idx[path];
  if (hit && hit.mtime === Math.round(statSync(resolve(ROOT(), path)).mtimeMs)) return (hit.cuadros || []).map((c: any) => ({ t: c.t, url: `/api/planner/guiones/estilos/cuadro?f=${hit.dir}/${c.file}` }));
  if (!cola.includes(path)) { cola.push(path); setImmediate(analizarCola); }
  return null;
}
async function analizarCola() {
  if (analizando) return;
  analizando = true;
  try {
    while (cola.length) {
      const path = cola[0], p = resolve(ROOT(), path), dir = createHash('sha1').update(path).digest('hex').slice(0, 16), out = resolve(CUADROS(), dir), cuadros: any[] = [];
      try {
        mkdirSync(out, { recursive: true });
        const dur = await seconds(p) || 0;
        for (const f of [0.2, 0.4, 0.6, 0.8]) {
          const t = Math.round(dur * f * 2) / 2, file = `${t.toFixed(2)}.jpg`;
          await exec('nice', ['-n', '10', 'ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', String(t), '-i', p, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', '-threads', '2', resolve(out, file)], { timeout: 60000 });
          if (existsSync(resolve(out, file))) cuadros.push({ t, file });
        }
      } catch (e) { console.error(new Date().toISOString(), 'cuadros de estilo', path, String((e as Error).message).slice(0, 300)); }
      const idx = fileRead(CUADROS_IDX(), {});
      idx[path] = { mtime: existsSync(p) ? Math.round(statSync(p).mtimeMs) : 0, dir, cuadros };
      writeJson(CUADROS_IDX(), idx);
      cola.shift();
    }
  } finally { analizando = false; }
}

// La ficha de la tarjeta: `tema` y `referencia` son opcionales en plan.json; lo que falta o no vale no llega a la tarjeta.
const TOMAR = ['recrear', 'idea', 'formato'];
const REDES = /(^|\.)((instagram|tiktok|youtube|x|twitter|facebook|threads|linkedin|reddit)\.(com|net)|youtu\.be)$/i;
const limpio = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const cifra = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
// Sólo http(s) hacia afuera: las rutas de carpetas o de documentos y localhost no son un original.
function urlExterna(v: unknown) {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v.trim()), h = u.hostname.toLowerCase();
    return ['http:', 'https:'].includes(u.protocol) && h.includes('.') && !/^[\d.]+$/.test(h) && !/\.(local|localhost)$/.test(h) ? u : null;
  } catch { return null; }
}
// El @ de la cuenta: el del plan («@cuenta (original)» queda «@cuenta») o el de la URL. Si no hay, lo que diga el plan.
function cuentaDe(v: unknown, u: URL) {
  const c = limpio(v, 80), arroba = c && /^@[\w.-]+/.exec(c);
  if (arroba) return arroba[0];
  const [a, b] = u.pathname.split('/').filter(Boolean);
  if (a?.startsWith('@')) return a;
  if (/(^|\.)(x|twitter)\.com$/i.test(u.hostname) && b === 'status' && a !== 'i') return '@' + a;
  if (/(^|\.)instagram\.com$/i.test(u.hostname) && ['p', 'reel', 'reels', 'tv'].includes(b)) return '@' + a;
  return c;
}
// La miniatura pasa por la misma validación de media que el resto del planner.
function posterDe(v: unknown) {
  const p = limpio(v, 400);
  return p && /\.(jpe?g|png|webp|mp4|mov|webm)$/i.test(p) && plannerMediaPath(p) ? p : null;
}
// La referencia original de una pieza: `referencia` o, en planes que no la tienen, la primera URL de una red social de
// `referencias[]`. `referencia: null` dice que no tiene, aunque `referencias[]` traiga fuentes. Sin una URL externa, no hay bloque.
export function referenciaDe(p: any) {
  if (p?.referencia === null) return null;
  let r = p?.referencia, u = urlExterna(r?.url);
  if (!u) for (const x of Array.isArray(p?.referencias) ? p.referencias : []) {
    const c = urlExterna(typeof x === 'string' ? x : x?.url);
    if (c && REDES.test(c.hostname)) { r = typeof x === 'string' ? {} : x; u = c; break; }
  }
  if (!u) return null;
  return { url: u.href, cuenta: cuentaDe(r.cuenta, u), vistas: cifra(r.vistas), multiplo: cifra(r.multiplo), tomar: TOMAR.includes(r.tomar) ? r.tomar : null,
    poster: posterDe(r.poster), hook_original: limpio(r.hook_original, 400), nota: limpio(r.nota, 300) };
}

// Para quién es el mensaje de cada pieza (`mensaje_de` en plan.json): el filtro Para de Guiones. Las opciones, con su
// nombre, salen de `guiones.mensajes` en la config ([{id, nombre}]); un valor que coincide con el id o el nombre de una
// opción queda como su id. Sin opciones configuradas, vale lo que traiga cada plan.
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function mensajesConfig(raw: any = config()?.guiones?.mensajes) {
  return (Array.isArray(raw) ? raw : []).map((m: any) => typeof m === 'string' ? { id: m, nombre: m } : { id: limpio(m?.id, 40), nombre: limpio(m?.nombre, 60) || limpio(m?.id, 40) })
    .filter((m: any) => m.id).map((m: any) => ({ id: String(m.id), nombre: String(m.nombre) }));
}
export function mensajeDe(p: any, ops = mensajesConfig()) {
  const v = limpio(p?.mensaje_de, 40);
  if (!v) return null;
  return ops.find(m => [m.id, m.nombre].some(x => sinAcentos(x) === sinAcentos(v)))?.id || v;
}

async function pieza(p: any, estados: Record<string, any>, estilos: Record<string, any> = {}) {
  // El estilo elegido en el planner manda mientras el plan siga con el de antes; si trae un tercero, gana el plan.
  const ov = estilos[p.run];
  if (ov && p.estilo?.id === ov.de?.id) p = { ...p, estilo: ov.a, muestras: ov.muestras };
  const dir = runDir(p.run), st = estados[p.run];
  const out: any = { ...p, tema: limpio(p.tema, 120), mensaje_de: mensajeDe(p), marca: limpio(p.marca, 80), quien: limpio(p.quien, 60), referencia: referenciaDe(p), run_ok: !!dir, inicio: inicioDe(p.run, dir), guion: null, audio: null, feedback: [], estado: p.tipo === 'carrusel' ? 'sin_laminas' : 'sin_audio', muestras: muestras(p.muestras),
    estilo_antes: ov && p.estilo?.id === ov.a?.id ? { id: ov.de?.id || null, nombre: ov.de?.nombre || ov.de?.id || '' } : null,
    descartado: st?.descartado || null, pausado: st?.descartado ? null : st?.pausado || null };
  if (!dir) { if (p.guion_texto) out.guion = { texto: p.guion_texto, palabras: 0 }; return out; }
  out.feedback = guionFeedback(dir);
  const listo = (mod: boolean) => st?.estado === 'aprobado' && mod;
  if (p.tipo === 'carrusel') {
    const ls = laminas(dir), mod = ls.reduce((m, x) => Math.max(m, x.modified), 0);
    const texto = existsSync(resolve(dir, 'copy.txt')) ? readFileSync(resolve(dir, 'copy.txt'), 'utf8').trim() : (p.guion_texto || '');
    out.guion = { texto, palabras: texto ? texto.split(/\s+/).filter(Boolean).length : 0 };
    out.laminas = ls; out.etapa = 'borrador'; out.portadas = portadas(dir); out.copy = captionDe(dir, true);
    out.estado = !ls.length ? 'sin_laminas' : listo(st?.laminas_modified === mod) ? 'aprobado' : out.feedback.filter(deContenido).some(UNAPPLIED) ? 'cambios' : 'borrador_por_revisar';
    out.aprobado_at = out.estado === 'aprobado' ? st.at : null;
    return out;
  }
  const texto = existsSync(resolve(dir, 'guion.txt')) ? readFileSync(resolve(dir, 'guion.txt'), 'utf8').trim() : (p.guion_texto || '');
  out.guion = { texto, palabras: texto ? texto.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length : 0 };
  out.copy = captionDe(dir);
  const a = audioDe(dir);
  if (a) out.audio = { path: rel(a), seconds: await seconds(a), modified: statSync(a).mtimeMs };
  // Con varias versiones del final se revisa la vigente (finalVigente) y la tarjeta lista las demás.
  const cuts = cortesDe(dir), finales = versionesFinal(dir), fin = finalVigente(finales, st);
  if (fin) out.video = { path: fin.path, seconds: await seconds(fin.abs), modified: fin.modified, versiones: 1, final: true,
    ...(finales.length > 1 ? { lista: await Promise.all(finales.map(async v => ({ path: v.path, nombre: v.nombre, modified: v.modified, seconds: await seconds(v.abs), agendada: agendadaEl(v.abs).agendada ?? null, en_postiz: agendadaEl(v.abs).en_postiz ?? null, sin_subir: !!agendadaEl(v.abs).sin_subir,
      aprobada: st?.estado === 'aprobado' && st.video === v.path && st.video_modified === v.modified }))) } : {}) };
  else if (cuts[0]) out.video = { path: rel(cuts[0]), seconds: await seconds(cuts[0]), modified: statSync(cuts[0]).mtimeMs, versiones: cuts.length };
  out.etapa = out.video?.final ? 'final' : out.video ? 'rough_cut' : 'audio';
  // Un video mudo a propósito se aprueba por el texto en pantalla (guion.txt) hasta que haya corte.
  if (p.mudo && !out.video) {
    const g = resolve(dir, 'guion.txt'), gmod = existsSync(g) ? statSync(g).mtimeMs : 0;
    out.etapa = 'texto';
    out.estado = !gmod ? 'sin_audio' : listo(st?.guion_modified === gmod) ? 'aprobado' : out.feedback.filter(deContenido).some(UNAPPLIED) ? 'cambios' : 'texto_por_revisar';
    out.aprobado_at = out.estado === 'aprobado' ? st.at : null;
    return out;
  }
  // Una aprobación vale para lo que se revisó (el corte, o el audio si todavía no hay corte): si cambió, vuelve a revisarse.
  const media = out.video || out.audio;
  out.estado = !media ? 'sin_audio' : listo(out.video ? st?.video_modified === out.video.modified : st?.audio_modified === out.audio.modified) ? 'aprobado'
    : out.feedback.filter(deContenido).some(UNAPPLIED) ? 'cambios' : out.video?.final ? 'final_por_revisar' : out.video ? 'por_revisar' : 'por_escuchar';
  out.aprobado_at = out.estado === 'aprobado' ? st.at : null;
  return out;
}

// Lo que hace de verdad el pedido, como título de la conversación: «Editar el video «X»», «Cambiar el copy de «X»» o
// «Corregir 3 piezas de «Semana del 3 nov»».
function guionesTitulo(plan: any, piezas: any[]) {
  const conNotas = piezas.map(p => ({ p, notas: p.feedback.filter((e: any) => UNAPPLIED(e) && e.estado !== 'en_curso') })).filter(x => x.notas.length);
  if (conNotas.length !== 1) return tituloMensaje('Feedback', `Corregir ${cantidad(conNotas.length, 'pieza')} de ${nombreMensaje(plan.titulo || plan.semana || plan.week)}`);
  const { p, notas } = conNotas[0];
  return tituloMensaje('Feedback', editarDesc(p.titulo || p.hook || p.id, notas.some((e: any) => !deContenido(e)), notas.some(deContenido), p.tipo === 'carrusel' ? 'el carrusel' : p.video ? 'el video' : 'el guion'));
}

function guionesPrompt(plan: any, piezas: any[]) {
  const lines: string[] = [];
  let n = 0;
  for (const p of piezas) {
    const notas = p.feedback.filter((e: any) => UNAPPLIED(e) && e.estado !== 'en_curso');
    if (!notas.length) continue;
    lines.push('', `## ${p.id} · «${p.titulo || p.hook || ''}»`, `Carpeta: ${p.run}`, p.tipo === 'carrusel'
      ? `Carrusel: ${p.run}/slides/ · ${p.laminas?.length || 0} láminas · texto en ${p.run}/copy.txt`
      : `Guion: ${p.run}/guion.txt · Audio: ${p.audio?.path || 'sin audio'}${p.video ? ` · ${p.video.final ? 'Final' : 'Rough cut'} revisado: ${p.video.path}` : ''}`);
    for (const e of notas) {
      n++;
      if (!deContenido(e)) { lines.push(`${n}. Copy nuevo, textual (reemplaza el actual en todas las redes):`, e.copy, `   Nota: ${p.run}/feedback/${e.file}`); continue; }
      lines.push(`${n}. ${e.text ? `«${e.text}»` : ''}${e.audio ? `${e.text ? ' + ' : ''}audio ${e.audio}${e.audio_seconds ? ` (${Math.round(e.audio_seconds)} s)` : ''}: transcribilo antes de actuar` : ''}`, `   Nota: ${p.run}/feedback/${e.file}`);
      if (e.video && e.video !== p.video?.path) lines.push(`   Sobre la versión: ${e.video}`);
    }
  }
  return [
    guionesTitulo(plan, piezas),
    '',
    `Feedback desde el planner (pestaña Guiones) sobre «${plan.titulo || plan.semana || plan.week}».`,
    '',
    `Carpeta de contenido: ${ROOT()}`,
    `Plan: ${plan.path}`,
    ...lines,
    '',
    'Cómo aplicarlo:',
    '- Leé las instrucciones del proyecto de contenido (CLAUDE.md o AGENTS.md de esa carpeta, si existen), el plan y la carpeta de cada pieza.',
    '- Antes de corregir, fijate que la nota no esté ya «en_curso» o «aplicado»; si está libre, poné «en_curso», tomado_at y tomado_por en su JSON.',
    '- Transcribí cada audio y, si la nota es sobre un rough cut o un final, mirá el video en los segundos que nombra antes de decidir.',
    '- Notas de guion o voz: corregí guion.txt; si cambia una frase, regenerá sólo ese tramo del audio, con la misma voz.',
    '- Notas de rough cut: corregí el montaje y volvé a renderizar como rough_cut_vN.mp4, sin pisar la versión anterior.',
    '- Notas de un final ya aprobado o agendado: guardá la iteración aparte (final_<qué cambia>.mp4) sin pisar final.mp4; la tarjeta muestra las dos versiones.',
    '- Notas de carrusel: corregí las láminas o copy.txt y volvé a exportar slides/.',
    '- Notas de copy: es el texto que escribió el usuario; usalo textual (sólo arreglá un error de tipeo evidente). Va en publish_kit.md de la pieza, sección «## Caption» (creala si falta). Si la pieza ya está en la cola de publicación o en Postiz, avisá antes de cambiarla ahí.',
    '- Notas de estilo, look o título (las deja el planner cuando se cambian en una pieza que ya tiene corte): plan.json ya tiene `estilo`, `look` o `titulo_tipo`; rehacé el corte (o las láminas) con eso como rough_cut_vN.mp4.',
    '- Si la corrección implica gastar (generar video, voz o imágenes con servicios pagos), avisá antes con qué y cuánto.',
    '- Al terminar, en el JSON de cada nota poné estado «aplicado», aplicado_at y una línea de qué cambió en «cambio».',
    '- No agendes, muevas ni publiques nada.',
  ].join('\n');
}

export function registerGuiones(app: Hono) {
  app.get('/api/planner/guiones', async c => {
    const plans = guionesPlans(), perfil = c.req.query('perfil') ?? null, week = c.req.query('week') || '', path = c.req.query('path') || '';
    const weeks = plans.map(p => ({ week: p.week, perfil: p.perfil, tipo: p.tipo, marca: p.marca, titulo: p.titulo, piezas: p.piezas, path: p.path }));
    // El plan pedido por su archivo (dos planes pueden compartir semana y nombre); si no, el de la semana pedida o, sin
    // semana, el más nuevo.
    const pick = (path ? plans.find(p => p.path === path) : null) || plans.filter(p => (perfil === null || p.perfil === perfil) && (!week || p.week === week)).pop() || (!week ? plans.at(-1) : null);
    if (!pick) return c.json({ weeks, plan: null, piezas: [], carpeta: rel(paths().guiones), mensajes: mensajesConfig() });
    const { conProduccion } = await import('./produccion.ts');
    const estados = fileRead(ESTADO(), {}), estilos = fileRead(ESTILOS(), {});
    const piezas = await Promise.all(pick.data.piezas.map((p: any) => pieza(conProduccion(p), estados, estilos)));
    // Un estilo descartado en la biblioteca se marca en la tarjeta de las piezas que todavía lo usan.
    const pr = prefs();
    for (const p of piezas) { p.estilo_descartado = !!pr.descartados[p.estilo?.id]; if (p.estilo?.id) p.estilo = { ...p.estilo, ...ajusteDe(p.estilo.id, pr.ajustes) }; }
    const plan = { ...pick.data, path: pick.path, perfil: pick.perfil, tipo: pick.tipo, marca: pick.marca, week: pick.week, piezas: undefined };
    return c.json({ weeks, plan, piezas, carpeta: rel(paths().guiones), mensajes: mensajesConfig() });
  });
  app.post('/api/planner/guiones/estado', async c => {
    const body = await c.req.json().catch(() => null);
    const dir = runDir(body?.run);
    if (!dir || !['aprobado', 'por_escuchar'].includes(body?.estado)) return c.json({ error: 'Pieza inválida' }, 400);
    const estados = fileRead(ESTADO(), {}), finales = versionesFinal(dir);
    // Se aprueba la versión que se estaba mirando; sin decir cuál, la que muestra la tarjeta.
    const elegida = finales.find(x => x.path === body.video) || finalVigente(finales, estados[body.run]);
    const a = audioDe(dir), v = elegida ? elegida.abs : cortesDe(dir)[0];
    const ls = laminas(dir), lmod = ls.reduce((m, x) => Math.max(m, x.modified), 0), g = resolve(dir, 'guion.txt');
    const mudo = !a && !v && !ls.length && existsSync(g) && guionesPlans().some(pl => pl.data.piezas.some((x: any) => x.run === body.run && x.mudo));
    if (body.estado === 'aprobado' && !a && !v && !ls.length && !mudo) return c.json({ error: 'Esta pieza todavía no tiene audio.' }, 409);
    // Aprobar desde el menú de estado también saca la pausa o el descarte.
    if (body.estado === 'aprobado') { const { descartado: _d, pausado: _p, ...prev } = estados[body.run] || {}; estados[body.run] = { ...prev, estado: 'aprobado', at: new Date().toISOString(), by: BY,
      ...(a ? { audio: rel(a), audio_modified: statSync(a).mtimeMs } : {}), ...(v ? { video: rel(v), video_modified: statSync(v).mtimeMs } : {}),
      ...(ls.length ? { laminas_modified: lmod } : {}), ...(mudo ? { guion_modified: statSync(g).mtimeMs } : {}) }; }
    else { const m = marcas(estados[body.run]); if (Object.keys(m).length) estados[body.run] = m; else delete estados[body.run]; }
    writeJson(ESTADO(), estados);
    return c.json({ ok: true, estado: estados[body.run] || null });
  });
  // Descartar (no va) o pausar (va más adelante): no borra nada; la tarjeta baja en gris y sus notas no viajan en «Copiar
  // feedback». Recuperar o reanudar la deja como estaba, con su aprobación si tenía. Una pieza está pausada o descartada.
  app.post('/api/planner/guiones/descartar', async c => {
    const body = await c.req.json().catch(() => null), k = ({ descartar: 'descartado', recuperar: 'descartado', pausar: 'pausado', reanudar: 'pausado' } as any)[body?.accion];
    if (!runDir(body?.run) || !k) return c.json({ error: 'Pieza inválida' }, 400);
    const estados = fileRead(ESTADO(), {}), { descartado: _d, pausado: _p, ...resto } = estados[body.run] || {}, prev = estados[body.run] || {};
    if (body.accion === 'descartar' || body.accion === 'pausar') estados[body.run] = { ...resto, [k]: { at: new Date().toISOString(), by: BY } };
    else { const { [k]: _, ...r } = prev; if (Object.keys(r).length) estados[body.run] = r; else delete estados[body.run]; }
    writeJson(ESTADO(), estados);
    return c.json({ ok: true, descartado: estados[body.run]?.descartado || null, pausado: estados[body.run]?.descartado ? null : estados[body.run]?.pausado || null });
  });
  // Elegir la portada ganadora de un carrusel: pasa a ser la lámina 1 (la original queda en portadas/_lamina01_original.png).
  app.post('/api/planner/guiones/portada', async c => {
    const body = await c.req.json().catch(() => null);
    const dir = runDir(body?.run);
    if (!dir || !['a', 'b', 'c'].includes(body?.id)) return c.json({ error: 'Portada inválida' }, 400);
    const d = resolve(dir, 'portadas'), src = ['png', 'jpg'].map(x => resolve(d, `${body.id}.${x}`)).find(existsSync);
    if (!src) return c.json({ error: 'Esa portada no existe.' }, 404);
    const s01 = resolve(dir, 'slides/01.png'), orig = resolve(d, '_lamina01_original.png');
    if (existsSync(s01) && !existsSync(orig)) writeFileSync(orig, readFileSync(s01));
    mkdirSync(resolve(dir, 'slides'), { recursive: true });
    if (src.endsWith('.png')) writeFileSync(s01, readFileSync(src));
    else await exec('ffmpeg', ['-v', 'error', '-y', '-i', src, s01], { timeout: 20000 });
    writeJson(resolve(d, 'elegida.json'), { id: body.id, at: new Date().toISOString(), by: BY });
    return c.json({ portadas: portadas(dir) });
  });
  app.get('/api/planner/guiones/estilos', c => {
    const idx = fileRead(CUADROS_IDX(), {}), plans = guionesPlans();
    const estilos = estilosLibrary().map(s => ({ ...s, videos: s.videos.slice(0, 3).map((v: any) => ({ ...v, titulo: tituloVideo(v.path, plans), cuadros: cuadrosDe(v.path, idx) })) }));
    return c.json({ estilos, preferencias: prefs(), analizando: cola.length });
  });
  app.get('/api/planner/guiones/estilos/cuadro', c => {
    const f = c.req.query('f') || '';
    if (!/^[0-9a-f]{16}\/[\d.]+\.jpg$/.test(f) || !existsSync(resolve(CUADROS(), f))) return c.text('No disponible', 404);
    return new Response(readFileSync(resolve(CUADROS(), f)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
  });
  // Favorito o descartado: uno saca al otro. Lo lee quien planifique la próxima semana.
  app.post('/api/planner/guiones/estilos/preferencia', async c => {
    const body = await c.req.json().catch(() => null), s = estilosLibrary().find(x => x.id === body?.estilo);
    if (!s || !['favorito', 'quitar_favorito', 'descartar', 'recuperar'].includes(body?.accion)) return c.json({ error: 'Estilo inválido' }, 400);
    const pr = prefs(), meta = { nombre: s.nombre, at: new Date().toISOString(), by: BY };
    if (body.accion === 'favorito') { pr.favoritos[s.id] = meta; delete pr.descartados[s.id]; }
    else if (body.accion === 'descartar') { pr.descartados[s.id] = meta; delete pr.favoritos[s.id]; }
    else delete pr[body.accion === 'quitar_favorito' ? 'favoritos' : 'descartados'][s.id];
    writeJson(PREFS(), pr);
    return c.json({ preferencias: pr });
  });
  // El cuadro que representa a un estilo en la biblioteca; vacío vuelve al automático.
  app.post('/api/planner/guiones/estilos/portada', async c => {
    const body = await c.req.json().catch(() => null), s = estilosLibrary().find(x => x.id === body?.estilo);
    if (!s || (body.cuadro && !/^[0-9a-f]{16}\/[\d.]+\.jpg$/.test(body.cuadro))) return c.json({ error: 'Cuadro inválido' }, 400);
    const pr = prefs();
    if (body.cuadro) pr.portadas[s.id] = { cuadro: body.cuadro, at: new Date().toISOString(), by: BY }; else delete pr.portadas[s.id];
    writeJson(PREFS(), pr);
    return c.json({ preferencias: pr });
  });
  // Cambiar el estilo de una pieza: va al plan.json. No toca la aprobación ni el feedback. Si ya hay corte o láminas,
  // deja una nota para rehacerlas (una por pieza mientras siga pendiente; si se vuelve al estilo del corte, se va).
  app.post('/api/planner/guiones/estilo', async c => {
    const body = await c.req.json().catch(() => null);
    const pick = guionesPlans().find(x => x.path === body?.plan), pz = pick?.data.piezas.find((x: any) => x.run === body?.run);
    if (!pz || typeof body.estilo !== 'string') return c.json({ error: 'Pieza inválida' }, 400);
    const estilos = fileRead(ESTILOS(), {}), ov = [estilos[body.run]?.de?.id, estilos[body.run]?.a?.id].includes(pz.estilo?.id) ? estilos[body.run] : null;
    const cur = ov && pz.estilo?.id === ov.de?.id ? { estilo: ov.a, muestras: ov.muestras } : { estilo: pz.estilo || {}, muestras: pz.muestras || [] };
    const original = ov ? { estilo: ov.de, muestras: ov.de_muestras || [] } : cur, actual = cur.estilo;
    const lib = body.estilo === original.estilo?.id ? null : estilosLibrary().find(s => s.id === body.estilo);
    if (!lib && body.estilo !== original.estilo?.id) return c.json({ error: 'Ese estilo no está en la biblioteca.' }, 400);
    if (actual.id === body.estilo) return c.json({ ok: true, estilo: actual });
    const { muestras: ms = [], tipos: _t, videos: _v, usos: _u, terminados: _te, ...libEstilo } = lib || {};
    const nuevo = lib ? { estilo: libEstilo, muestras: ms.map((m: any) => ({ path: m.path, nota: m.nota })) } : original;
    const { raw, target } = piezaEnPlan(pick, body.run);
    if (!target) return c.json({ error: 'El plan cambió mientras tanto. Recargá y volvé a elegir.' }, 409);
    // Las muestras se escriben relativas a la carpeta de contenido, que el plan también acepta.
    target.estilo = nuevo.estilo; target.muestras = nuevo.muestras.map((m: any) => m.nota ? m : m.path);
    writeJson(pick!.file, raw);
    const now = new Date(), estilo = nuevo.estilo;
    if (!lib) delete estilos[body.run];
    else estilos[body.run] = { de: original.estilo, de_muestras: original.muestras, a: estilo, muestras: nuevo.muestras, plan: pick!.path, pieza: pz.id, at: now.toISOString(), by: BY };
    writeJson(ESTILOS(), estilos);
    const pr = prefs();
    if (body.deshacer) { const k = pr.elecciones.map((e: any) => e.run).lastIndexOf(body.run); if (k >= 0) pr.elecciones.splice(k, 1); }
    else pr.elecciones.push({ at: now.toISOString(), plan: pick!.path, run: body.run, pieza: pz.id, tipo: pz.tipo === 'carrusel' ? 'carrusel' : 'reel',
      formato: pz.formato?.id ? { id: pz.formato.id, nombre: pz.formato.nombre } : null, de: { id: actual.id || null, nombre: actual.nombre || '' }, a: { id: estilo.id, nombre: estilo.nombre } });
    pr.elecciones = pr.elecciones.slice(-500);
    writeJson(PREFS(), pr);
    const nota = notaDeCambio(body.run, pz.id, 'estilo', { id: actual.id || null, nombre: actual.nombre || '' }, { id: estilo.id, nombre: estilo.nombre }, `Cambiar el estilo a «${estilo.nombre}».`);
    return c.json({ ok: true, estilo, antes: actual.id ? { id: actual.id, nombre: actual.nombre } : null, nota: !!nota });
  });
  app.post('/api/planner/guiones/feedback', async c => {
    try {
      const raw = await c.req.json();
      const dir = runDir(raw?.run);
      if (!dir) return c.json({ error: 'Pieza inválida' }, 400);
      const body: any = validatePlannerFeedback({ ...raw, id: raw.run, text: typeof raw.copy === 'string' ? 'copy' : raw.text });
      const fb = resolve(dir, 'feedback'); mkdirSync(fb, { recursive: true });
      const now = new Date(), stamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18) + '-' + randomUUID().slice(0, 4);
      if (typeof raw.copy === 'string') {
        const copy = raw.copy.replace(/\r\n/g, '\n').trim().slice(0, 5000);
        // Una edición del copy todavía sin copiar se reescribe en la misma nota; volver al copy que ya tiene la pieza la saca.
        const actual = captionDe(dir, laminas(dir).length > 0 || raw.tipo === 'carrusel').replace(/\r\n/g, '\n').trim();
        const prev = [...guionFeedback(dir)].reverse().find((e: any) => !deContenido(e) && UNAPPLIED(e));
        if (prev && OPEN(prev) && copy === actual) { const trash = resolve(fb, '.borradas'); mkdirSync(trash, { recursive: true }); renameSync(resolve(fb, prev.file), resolve(trash, prev.file)); }
        else if (prev && copy === prev.copy) {}
        else if (prev && OPEN(prev)) writeJson(resolve(fb, prev.file), { ...fileRead(resolve(fb, prev.file), {}), copy, created_at: now.toISOString() });
        else if (copy !== actual) writeJson(resolve(fb, stamp + '-planner.json'), { tipo: 'guion', etapa: 'copy', run: raw.run, pieza: typeof raw.pieza === 'string' ? raw.pieza.slice(0, 40) : null, created_at: now.toISOString(), by: BY, text: null, copy, copy_anterior: actual, audio: null, estado: 'pendiente' });
        return c.json({ entries: guionFeedback(dir) });
      }
      let audio = null;
      if (body.audio) {
        const target = resolve(fb, stamp + '-planner' + body.audio.ext), tmp = resolve(fb, stamp + '-raw' + body.audio.ext);
        writeFileSync(tmp, body.audio.buf);
        // MediaRecorder deja el webm sin duración: una copia con ffmpeg la escribe. Si falla, queda el original.
        try { await exec('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-c', 'copy', target], { timeout: 30000 }); if (!existsSync(target) || !statSync(target).size) throw new Error('vacío'); } catch { renameSync(tmp, target); }
        if (existsSync(tmp)) try { renameSync(tmp, resolve(fb, '.' + stamp + '-raw' + body.audio.ext)); } catch {}
        audio = rel(target);
      }
      const entry: any = { tipo: 'guion', etapa: etapaDe(dir) || 'audio', run: raw.run, pieza: typeof raw.pieza === 'string' ? raw.pieza.slice(0, 40) : null, created_at: now.toISOString(), by: BY, text: body.text || null, audio, audio_mime: body.audio?.mime || null, audio_seconds: body.audio_seconds, transcript: null, estado: 'pendiente' };
      // Con varias versiones, la nota dice sobre cuál se escribió.
      if (versionesFinal(dir).some(v => v.path === raw.video)) entry.video = raw.video;
      writeJson(resolve(fb, stamp + '-planner.json'), entry);
      // Una nota nueva saca la aprobación: lo revisado va a cambiar. La pausa o el descarte quedan.
      const estados = fileRead(ESTADO(), {}); if (estados[raw.run]) { const m = marcas(estados[raw.run]); if (Object.keys(m).length) estados[raw.run] = m; else delete estados[raw.run]; writeJson(ESTADO(), estados); }
      return c.json({ entries: guionFeedback(dir) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  app.post('/api/planner/guiones/feedback/remove', async c => {
    const body = await c.req.json().catch(() => null);
    const dir = runDir(body?.run);
    if (!dir || typeof body.file !== 'string' || !/^[\w.-]+-planner\.json$/.test(body.file)) return c.json({ error: 'Nota inválida' }, 400);
    const fb = resolve(dir, 'feedback'), src = resolve(fb, body.file);
    if (!existsSync(src)) return c.json({ error: 'Esa nota ya no está.' }, 404);
    const trash = resolve(fb, '.borradas'); mkdirSync(trash, { recursive: true });
    const entry = fileRead(src, {});
    if (entry.audio) { const a = resolve(ROOT(), entry.audio); if (within(fb, a) && existsSync(a)) renameSync(a, resolve(trash, basename(a))); }
    renameSync(src, resolve(trash, body.file));
    return c.json({ entries: guionFeedback(dir) });
  });
  // «Copiar feedback para Claude Code»: las notas sin corregir del plan en un mensaje; pasan a «enviado».
  app.post('/api/planner/guiones/copiar', async c => {
    const body = await c.req.json().catch(() => null);
    const plans = guionesPlans(), pick = (body?.path ? plans.find(p => p.path === body.path) : null) || plans.filter(p => p.perfil === (body?.perfil ?? '') && p.week === body?.week).pop();
    if (!pick) return c.json({ error: 'No encuentro ese plan.' }, 404);
    const { conProduccion } = await import('./produccion.ts');
    const estados = fileRead(ESTADO(), {}), estilos = fileRead(ESTILOS(), {});
    // `runs` limita el pedido a las piezas que se ven en el planner (el formato de la barra).
    const runs = Array.isArray(body.runs) ? new Set(body.runs) : null;
    const piezas = (await Promise.all(pick.data.piezas.map((p: any) => pieza(conProduccion(p), estados, estilos)))).filter(p => !p.descartado && !p.pausado && (!runs || runs.has(p.run)));
    if (!piezas.some(p => p.feedback.some((e: any) => UNAPPLIED(e) && e.estado !== 'en_curso'))) return c.json({ error: 'No hay feedback sin corregir.' }, 400);
    const prompt = guionesPrompt({ ...pick.data, path: pick.path, week: pick.week }, piezas);
    if (body.marcar !== false) for (const p of piezas) { const dir = runDir(p.run); if (dir) markFeedbackSent(resolve(dir, 'feedback'), p.feedback.filter(OPEN).map((e: any) => e.file), 'guiones'); }
    return c.json({ prompt });
  });
}

// Con corte, final o láminas, cambiar el estilo, el look o el título deja una nota para rehacerlo: una por campo mientras
// siga pendiente, que se va si se vuelve a lo que tiene el corte.
export function notaDeCambio(run: string, pieza: string, campo: string, actual: { id: string | null, nombre: string } | null, nuevo: { id: string | null, nombre: string } | null, texto: string) {
  const dir = runDir(run); if (!dir) return null;
  const now = new Date();
  mkdirSync(resolve(dir, 'logs'), { recursive: true });
  appendFileSync(resolve(dir, 'logs/events.ndjson'), JSON.stringify({ ts: now.toISOString(), event: campo + '_cambiado', by: BY, detail: `${actual?.id || '—'} → ${nuevo?.id || '—'}` }) + '\n');
  const etapa = etapaDe(dir); if (!etapa) return null;
  const fb = resolve(dir, 'feedback'), abierta = guionFeedback(dir).filter((e: any) => e.cambio_de?.campo === campo && OPEN(e)).pop();
  const hecho = abierta ? abierta.cambio_de.de : actual;
  if (abierta && (hecho?.id || null) === (nuevo?.id || null)) { const trash = resolve(fb, '.borradas'); mkdirSync(trash, { recursive: true }); renameSync(resolve(fb, abierta.file), resolve(trash, abierta.file)); return null; }
  if ((hecho?.id || null) === (nuevo?.id || null)) return null;
  const que = ({ final: 'El final', rough_cut: 'El rough cut', borrador_carrusel: 'El borrador' } as any)[etapa];
  const file = abierta?.file || now.toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18) + '-' + randomUUID().slice(0, 4) + '-planner.json';
  const { file: _f, ...prev } = abierta || {};
  const nota = { tipo: 'guion', etapa, run, pieza, created_at: now.toISOString(), by: BY, ...prev,
    text: `${texto} ${que} está hecho ${hecho?.nombre || hecho?.id ? `con «${hecho.nombre || hecho.id}»` : ({ look: 'sin un look elegido', titulo: 'con el título del estilo' } as any)[campo] || 'con lo de antes'}: rehacelo.`, audio: null, audio_mime: null, audio_seconds: null,
    transcript: null, estado: 'pendiente', cambio_de: { campo, de: hecho, a: nuevo }, updated_at: now.toISOString() };
  mkdirSync(fb, { recursive: true }); writeJson(resolve(fb, file), nota);
  return nota;
}
