// Historias: la semana de historias en formato horizontal (una fila por día, la secuencia una al lado de la otra y el
// recurso fijo a la derecha), con controles para publicarlas por Postiz o a mano, las respuestas por día, feedback
// escrito o grabado por historia o por secuencia, y un editor tipo Canva sobre el HTML de cada historia.
// Cada semana es una carpeta dentro de historias/ (config → historias.carpeta) con su semana.json; ver docs/historias.md.
import type { Hono } from 'hono';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, copyFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CONFIG_PATH, MOTOR_DIR, PYTHON, REPO_DIR, paths } from './config.ts';
import { exec, fileRead, markFeedbackSent, OPEN, posix, readFeedback, ROOT, STATE, TYPES, validatePlannerFeedback, within, write } from './publication-planner.ts';

const STORIES = () => paths().stories;
const relRoot = (p: string) => posix(relative(ROOT(), p));
const STORY_METRICS = ['respuestas', 'vistas_primera', 'vistas_ultima'];
const STORY_MODES = ['postiz', 'mano', 'no'];
const mondayOf = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };

// ── Cuentas de Instagram conectadas (planner.config.json → channels.instagram y sus alternativas) ──
type Account = { profile: string, label: string, marca: string | null, id: string | null };
export function igAccounts(): Account[] {
  const ig = fileRead(CONFIG_PATH, {})?.channels?.instagram;
  const list = ig ? [ig, ...(ig.alternativas || [])].filter((a: any) => a && (a.profile || a.name || a.id) && a.enabled !== false)
    .map((a: any) => ({ profile: String(a.profile || a.name || a.id).replace(/^@/, ''), label: a.label || a.name || a.profile || 'Instagram', marca: a.marca || null, id: a.id || null })) : [];
  return list.length ? list : [{ profile: 'instagram', label: 'Instagram', marca: null, id: null }];
}
// La cuenta de una semana: `cuenta` de su semana.json; sin ella, la principal.
const runAccount = (data: any, accts = igAccounts()) => { const c = String(data?.cuenta || '').replace(/^@/, ''); return accts.some(a => a.profile === c) ? c : accts[0].profile; };
const storyKey = (cuenta: string, week: string) => cuenta + '/' + week;
const draftKey = (cuenta: string, week: string, accts = igAccounts()) => cuenta === accts[0].profile ? week : storyKey(cuenta, week);
const metricsOf = (file: any, cuenta: string, accts = igAccounts()) => cuenta === accts[0].profile ? (file?.dias || {}) : (file?.por_cuenta?.[cuenta] || {});

// ── Semanas ──
// Una semana puede arrancar cualquier día: se indexa en cada lunes que tocan sus días. Si dos carpetas de la misma
// cuenta tocan la misma semana, manda la más reciente.
export function storyWeeks() {
  const out: Record<string, { run: string, mtime: number, data: any, week: string, cuenta: string }> = {}, accts = igAccounts(), base = STORIES();
  if (!within(ROOT(), base) && base !== ROOT()) return out;
  const visit = (dir: string, depth: number) => {
    let names: string[] = []; try { names = readdirSync(dir); } catch { return; }
    if (names.includes('semana.json')) {
      const p = resolve(dir, 'semana.json'), data = fileRead(p, null);
      if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.semana || '') || !Array.isArray(data.dias)) return;
      const mtime = statSync(p).mtimeMs, cuenta = runAccount(data, accts);
      const weeks = new Set<string>(data.dias.map((x: any) => x?.fecha).filter((f: any) => /^\d{4}-\d{2}-\d{2}$/.test(f || '')).map(mondayOf));
      for (const week of weeks) { const k = storyKey(cuenta, week); if (!out[k] || out[k].mtime < mtime) out[k] = { run: relRoot(dir), mtime, data, week, cuenta }; }
      return;
    }
    if (depth < 2) for (const n of names) { if (n.startsWith('.')) continue; const p = resolve(dir, n); try { if (statSync(p).isDirectory()) visit(p, depth + 1); } catch {} }
  };
  visit(base, 0);
  return out;
}
// Foto de fondo de cada historia, leída de su HTML (fuente/<archivo>.html): qué foto tiene y con qué encuadre.
const FONDO_RE = /<div class="fondo">\s*<img\b([^>]*)>/;
function fondoDe(src: string) { const m = FONDO_RE.exec(src); if (!m) return null; const f = /\bsrc="assets\/fotos\/([^"]+)"/.exec(m[1]); if (!f) return null; return { foto: f[1], posicion: (/object-position:\s*([^";]+)/.exec(m[1])?.[1] || '50% 50%').trim() }; }
function storyFile(run: string, img: any) {
  if (typeof img !== 'string') return {};
  const stem = img.split('/').pop()!.replace(/\.png$/, ''), png = resolve(ROOT(), run, img), html = resolve(ROOT(), run, 'fuente', stem + '.html');
  let mtime = 0; try { mtime = Math.round(statSync(png).mtimeMs); } catch {}
  let fondo = null, editable = false; try { fondo = fondoDe(readFileSync(html, 'utf8')); editable = true; } catch {}
  // Una historia con video de fondo o voz en off tiene su MP4 al lado del PNG, con el mismo nombre.
  let video_mtime = 0; try { video_mtime = Math.round(statSync(png.replace(/\.png$/, '.mp4')).mtimeMs); } catch {}
  return { mtime, fondo, editable, video_mtime };
}
// Las rutas del manifiesto son relativas a la carpeta de la semana; el planner las sirve como rutas de tu contenido.
export function storyWeekForPlanner(entry: { run: string, data: any, week?: string, cuenta?: string }) {
  const at = (p: any) => typeof p === 'string' && p && !p.startsWith('/') && !p.includes('..') ? entry.run + '/' + p : null;
  const d = entry.data, dias = (entry.week ? d.dias.filter((x: any) => mondayOf(x.fecha) === entry.week) : d.dias);
  return { ...d, run: entry.run, semana_calendario: entry.week || d.semana, cuenta: entry.cuenta || runAccount(d),
    dias: dias.map((x: any) => ({ ...x, historias: (x.historias || []).map((h: any) => ({ ...h, imagen: at(h.imagen), video: h.video ? at(h.video) : null, ...storyFile(entry.run, h.imagen) })) })),
    recursos: (d.recursos || []).map((r: any) => ({ ...r, preview: at(r.preview), archivo: at(r.archivo) })) };
}
// Estado de cada historia en la cola (fichas con formato story de publicar/), por la imagen de origen.
export function storyQueue() {
  const out: Record<string, any> = {}, real = (p: string) => { try { return realpathSync(p); } catch { return p; } }, base = real(ROOT()), accts = igAccounts();
  const walk = (dir: string, depth = 0) => {
    let names: string[] = []; try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      const p = resolve(dir, n);
      if (n.endsWith('.json')) {
        const d = fileRead(p, null); if (d?.formato !== 'story' || !d.source_final) continue;
        const src = real(isAbsolute(d.source_final) ? d.source_final : resolve(ROOT(), d.source_final)); if (!within(base, src)) continue;
        const posts = ((d.postiz || {}).posts || []).filter((x: any) => x.estado !== 'cancelado'), post = posts.find((x: any) => x.red === 'instagram') || posts[0] || null;
        let cambio = false; try { cambio = !!d.content_sha256 && createHash('sha256').update(readFileSync(src)).digest('hex') !== d.content_sha256; } catch {}
        const ig = d.cuentas?.instagram, cuenta = (ig && accts.find(a => a.id === ig)?.profile) || accts[0].profile;
        // Una historia con video entra a la cola como su MP4; el planner la sigue por su PNG (mismo nombre).
        let key = posix(relative(base, src)); if (/\.mp4$/i.test(key) && existsSync(resolve(base, key.replace(/\.mp4$/i, '.png')))) key = key.replace(/\.mp4$/i, '.png');
        out[key] = { slug: d.slug, estado: d.publicado_at ? 'publicada' : d.estado, cuando: post?.date_utc || null, postiz: post?.provider_state || null, sidecar: posix(relative(base, p)), cambio, cuenta };
      } else if (depth < 2 && !n.startsWith('.')) { try { if (statSync(p).isDirectory()) walk(p, depth + 1); } catch {} }
    }
  };
  for (const f of ['inbox', 'agendado', 'publicado']) walk(resolve(paths().publish, f));
  return out;
}
// Un sticker interactivo (encuesta, link, mención, caja de preguntas, slider) no sale por la API de Instagram: esa
// historia va a mano. Uno marcado «(opcional)» se omite; la «zona segura» del editor tampoco obliga.
export const storyNeedsHand = (sticker: any) => typeof sticker === 'string' && !!sticker.trim() && !/opcional/i.test(sticker) && !/^(zona segura\s*(\+\s*)?)+$/i.test(sticker.trim());
// Una secuencia también pasa a otra semana (por ejemplo, del jueves al lunes siguiente). El borrador la sigue guardando
// en su semana de origen; se ve, se edita y se programa en la semana del día al que va. Hasta 4 semanas antes o 12
// después del día original, y nunca sobre un día que ya tiene otra secuencia con historias.
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const MOVE_BEFORE = 28, MOVE_AFTER = 84;
const dayLabel = (d: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00Z')).replace(/[.,]/g, '');
const defaultStorySeq = (dia: any, at = (p: string) => p) => ({ fecha: dia.fecha, historias: (dia.historias || []).map((h: any) => at(h.imagen)), publicar: 'no', hora: null });
// Las secuencias de una cuenta en su día efectivo (el del borrador o el original), de las semanas que pueden llegar a `week`.
export function storySeqsAround(cuenta: string, week: string, file: any, accts = igAccounts()) {
  const out: any[] = [], lo = addDays(week, -MOVE_AFTER - 7), hi = addDays(week, MOVE_BEFORE + 7);
  for (const e of Object.values(storyWeeks())) {
    if (e.cuenta !== cuenta || e.week < lo || e.week > hi) continue;
    const d = file?.semanas?.[draftKey(cuenta, e.week, accts)]?.secuencias || {}, at = (p: string) => e.run + '/' + p;
    for (const dia of e.data.dias.filter((x: any) => mondayOf(x.fecha) === e.week)) out.push({ semana: e.week, entry: e, orig: dia.fecha, secuencia: { ...defaultStorySeq(dia, at), ...(d[dia.fecha] || {}) } });
  }
  return out;
}
// Días ocupados por secuencias con historias de las otras semanas (una semana no choca consigo misma).
export const storyOccupied = (cuenta: string, week: string, file: any, accts = igAccounts()) => new Map<string, any>(storySeqsAround(cuenta, week, file, accts).filter(x => x.semana !== week && x.secuencia.historias.length).map(x => [x.secuencia.fecha, x]));
export function validateStoryDraft(body: any, manifest: any, ocupados: Map<string, any> = new Map()) {
  if (!body || !/^\d{4}-\d{2}-\d{2}$/.test(body.week || '') || !Number.isInteger(body.revision) || !body.secuencias || typeof body.secuencias !== 'object' || Array.isArray(body.secuencias)) throw new Error('Borrador de historias inválido');
  const dias = new Set((manifest?.dias || []).map((d: any) => d.fecha)), imgs = new Set((manifest?.dias || []).flatMap((d: any) => (d.historias || []).map((h: any) => h.imagen)));
  const seen = new Set<string>(), targets = new Set<string>();
  for (const [seq, s] of Object.entries(body.secuencias) as any) {
    if (!dias.has(seq) || !s || typeof s !== 'object') throw new Error('Secuencia desconocida');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.fecha || '') || addDays(s.fecha, 0) !== s.fecha) throw new Error('Día inválido');
    if (s.fecha < addDays(seq, -MOVE_BEFORE) || s.fecha > addDays(seq, MOVE_AFTER)) throw new Error(`Una secuencia se puede correr hasta 4 semanas antes o 12 después: entre el ${dayLabel(addDays(seq, -MOVE_BEFORE))} y el ${dayLabel(addDays(seq, MOVE_AFTER))}.`);
    if (!Array.isArray(s.historias) || s.historias.length > 8) throw new Error('Historias inválidas');
    for (const h of s.historias) { if (!imgs.has(h) || seen.has(h)) throw new Error('Historias inválidas o repetidas'); seen.add(h); }
    // Un día sin historias no ocupa lugar: otra secuencia puede caer ahí.
    if (s.historias.length) { if (targets.has(s.fecha)) throw new Error('Dos secuencias quedaron el mismo día'); targets.add(s.fecha); }
    if (s.historias.length && ocupados.has(s.fecha)) throw new Error(`El ${dayLabel(s.fecha)} ya tiene otra secuencia de historias. Mové primero esa.`);
    if (!STORY_MODES.includes(s.publicar)) throw new Error('Elegí Postiz, a mano o no se publica');
    if (s.hora !== null && s.hora !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.hora)) throw new Error('Hora inválida');
    if (s.publicar === 'postiz' && !s.hora) throw new Error('Para Postiz elegí la hora');
    if (s.cuenta !== undefined && s.cuenta !== null && !igAccounts().some(a => a.profile === s.cuenta)) throw new Error('Esa cuenta de Instagram no está conectada en Postiz');
  }
  return body;
}
export function storyProposalPrompt(id: string, file: string, n: number, manual: number, cuentas: string[] = []) {
  return `Confirmo la propuesta de historias ${id} del planner (${file}). Aplicala con python3 engine/historias.py aplicar ${id} --ejecutar: ${n} historia${n === 1 ? '' : 's'} a Postiz${manual ? ` y ${manual} para subir a mano (avisame cuáles)` : ''}${cuentas.length ? `, en ${cuentas.map(c => '@' + c).join(' y ')}` : ''}.`;
}
export function validateStoryMetrics(body: any) {
  if (!body || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || new Date(body.date + 'T12:00:00Z').toISOString().slice(0, 10) !== body.date) throw new Error('Día inválido');
  for (const k of STORY_METRICS) { const v = body[k]; if (v !== undefined && v !== null && !(Number.isInteger(v) && v >= 0 && v <= 10_000_000)) throw new Error('Cargá un número entero, o dejalo vacío.'); }
  return body;
}

// ── Una historia por su imagen: <semana>/historias/<archivo>.png ──
function storyPaths(imagen: any) {
  if (typeof imagen !== 'string' || !imagen || imagen.includes('..') || imagen.startsWith('/')) throw new Error('Historia inválida');
  const png = resolve(ROOT(), imagen), run = resolve(png, '../..'), stem = basename(png, '.png');
  if (extname(png).toLowerCase() !== '.png' || basename(dirname(png)) !== 'historias' || !(within(STORIES(), run) || run === STORIES()) || !existsSync(resolve(run, 'semana.json'))) throw new Error('Historia inválida');
  return { png, run, stem, html: resolve(run, 'fuente', stem + '.html') };
}
// Lo que el editor no puede cambiar de una historia: sus scripts, manejadores ni archivos fuera de assets/.
const scriptsOf = (h: string) => [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m => ((/\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(m[1]) || [])[1] || '') + '|' + m[2].trim()).join('\n');
const refsOf = (h: string) => new Set([...h.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]));
const handlersOf = (h: string) => (h.match(/\son[a-z]+\s*=/gi) || []).length;
const seqsOf = (h: string) => new Set([...h.matchAll(/\bdata-secuencia\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]));
// Historia con video de fondo o con voz en off: render.py la saca también en MP4, con la voz mezclada.
export const storyHasVideo = (h: string) => /\bdata-secuencia\s*=/.test(h) || /<audio\b[^>]*\bclass="[^"]*\bvoz\b/.test(h);
export function storyVoices(h: string) { return [...h.matchAll(/<audio\b([^>]*)>/gi)].filter(m => /\bclass="[^"]*\bvoz\b/.test(m[1])).map(m => ({ audio: (/\bsrc="([^"]+)"/.exec(m[1]) || [])[1] || null, inicio: parseFloat((/\bdata-inicio="([^"]+)"/.exec(m[1]) || [])[1] || '0') || 0 })).filter(v => v.audio); }
export function validateStoryEdit(prev: string, next: any, fuente: string) {
  if (typeof next !== 'string' || next.length > 500_000 || !/<main\b[^>]*class="[^"]*\bhistoria\b/.test(next)) throw new Error('La historia editada no es válida.');
  if (scriptsOf(next) !== scriptsOf(prev) || handlersOf(next) > handlersOf(prev) || (/javascript:/i.test(next) && !/javascript:/i.test(prev))) throw new Error('La edición tocó código de la historia; no se guardó.');
  const old = refsOf(prev), seq0 = seqsOf(prev);
  for (const q of seqsOf(next)) if (!seq0.has(q) && (!/^assets\/videos\/[a-z0-9-]+\/%03d\.jpg$/.test(q) || !existsSync(resolve(fuente, q.replace('%03d', '001'))))) throw new Error('El video de fondo no está en la carpeta de la semana: ' + q);
  for (const r of refsOf(next)) if (!old.has(r) && (!/^assets\/[A-Za-z0-9_.\/-]+$/.test(r) || r.includes('..') || !existsSync(resolve(fuente, r)))) throw new Error('La historia apunta a un archivo que no está en su carpeta: ' + r);
  return next;
}
// Video de fondo y voz en off: llegan crudos (no en base64), porque un video del teléfono pesa cientos de MB.
const VIDEO_UP: Record<string, string> = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-m4v': '.m4v', 'video/webm': '.webm' };
const AUDIO_UP: Record<string, string> = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/ogg': '.ogg', 'audio/webm': '.webm' };
const upName = (n: any, def: string) => String(n || def).replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || def;
const upStamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 4);
async function mediaDuration(p: string) { try { const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { timeout: 30000 }); const d = parseFloat(stdout); return Number.isFinite(d) ? Math.round(d * 1000) / 1000 : null; } catch { return null; } }
const secs = (v: any) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 36000 ? Number(v) : null;
let videoBusy = false;
// El video pasa por motor-historias/fondo_video.py: color normal (si viene en HDR, la conversión de Apple con las luces
// altas suavizadas), 1080 × 1920 a 30 cuadros y sus cuadros JPG en fuente/assets/videos/<id>/. Una historia de video
// dura hasta 60 s en Instagram: sin «hasta», se toma ese máximo.
export async function prepareStoryVideo(run: string, orig: string, id: string, desde?: any, hasta?: any) {
  if (videoBusy) throw new Error('Hay otro video preparándose. Esperá un momento.');
  videoBusy = true;
  try {
    const d = secs(desde) || 0, h = secs(hasta), args = [resolve(MOTOR_DIR, 'fondo_video.py'), orig, '--fuente', resolve(run, 'fuente'), '--id', id, '--desde', String(d), '--hasta', String(h !== null && h > d ? Math.min(h, d + 60) : d + 60)];
    const { stdout } = await exec(PYTHON, args, { cwd: run, timeout: 900000, maxBuffer: 8 * 1024 * 1024 });
    return { ...JSON.parse(stdout.trim().split('\n').pop()!), id, origen: relRoot(orig) };
  } catch (e: any) { throw new Error('No se pudo preparar el video: ' + String(e?.stderr || e?.message || e).trim().split('\n').pop() + ' (hace falta ffmpeg).'); }
  finally { videoBusy = false; }
}
// El id de una semana en la URL del editor (sus archivos se sirven desde /api/planner/story-fuente/<id>/).
const runId = (run: string) => Buffer.from(relRoot(run)).toString('base64url');
const runFromId = (id: string) => { try { const r = resolve(ROOT(), Buffer.from(id, 'base64url').toString('utf8')); return (within(STORIES(), r) || r === STORIES()) && existsSync(resolve(r, 'semana.json')) ? r : null; } catch { return null; } };

// ── Tu carpeta de fotos (config → historias.fotos) ──
const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
export function photoLibrary() {
  const base = paths().photos, out: any[] = [];
  if (!base || !existsSync(base)) return out;
  const walk = (dir: string, depth = 0) => {
    let names: string[] = []; try { names = readdirSync(dir); } catch { return; }
    for (const n of names.sort()) {
      if (n.startsWith('.') || out.length >= 1500) continue;
      const p = resolve(dir, n);
      try { const st = statSync(p); if (st.isDirectory()) { if (depth < 3) walk(p, depth + 1); } else if (PHOTO_EXT.test(n)) { const r = posix(relative(base, p)); out.push({ id: Buffer.from(r).toString('base64url'), archivo: n, carpeta: posix(relative(base, dir)) || '', mtime: Math.round(st.mtimeMs) }); } } catch {}
    }
  };
  walk(base);
  return out;
}
const photoPath = (id: string) => { const base = paths().photos; if (!base || !/^[A-Za-z0-9_-]+$/.test(id)) return null; try { const p = resolve(base, Buffer.from(id, 'base64url').toString('utf8')); return within(base, p) && PHOTO_EXT.test(p) && existsSync(p) ? p : null; } catch { return null; } };
// Convierte (y achica) una imagen a JPG: sips en macOS, si no ffmpeg; sin ninguno, copia la imagen si el navegador la muestra.
async function toJpg(src: string, out: string, max: number) {
  mkdirSync(dirname(out), { recursive: true });
  try { await exec('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '88', '-Z', String(max), src, '--out', out], { timeout: 60000 }); if (existsSync(out)) return out; } catch {}
  try { await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-vf', `scale='min(${max},iw)':-2`, '-q:v', '3', '-y', out], { timeout: 60000 }); if (existsSync(out)) return out; } catch {}
  if (/\.(jpe?g|png|webp)$/i.test(src)) { const copy = out.replace(/\.jpg$/, extname(src).toLowerCase()); copyFileSync(src, copy); return copy; }
  throw new Error('No se pudo convertir esa foto (instalá ffmpeg o usá JPG/PNG).');
}

// ── Feedback de historias: de una historia (detalles) o de toda la secuencia (general), en <semana>/feedback/ ──
// Notas sin corregir (pendientes, o copiadas que nadie tomó): las cuenta Programar y viajan en su propuesta.
const UNAPPLIED = (e: any) => e.estado !== 'aplicado' && e.estado !== 'en_curso';
const storyFeedbackUnapplied = (run: string, dia?: string) => readFeedback(resolve(ROOT(), run, 'feedback')).filter((e: any) => e.tipo === 'historia' && UNAPPLIED(e) && (!dia || e.dia === dia));
const fbNote = (e: any) => ({ file: e.file, dia: e.dia, alcance: e.alcance || 'historia', n: e.n || null, imagen: e.imagen || null, text: e.text || null, audio: e.audio || null, estado: e.estado || 'pendiente', created_at: e.created_at || null });
const storyFeedbackOf = (run: string, dia: string) => readFeedback(resolve(ROOT(), run, 'feedback')).filter((e: any) => e.tipo === 'historia' && e.dia === dia);
function storyFeedbackCounts(run: string) {
  const out: Record<string, { pendientes: number, historias: Record<string, number>, secuencia: number }> = {};
  for (const e of readFeedback(resolve(ROOT(), run, 'feedback')).filter((e: any) => e.tipo === 'historia' && OPEN(e))) {
    const d = out[e.dia] || (out[e.dia] = { pendientes: 0, historias: {}, secuencia: 0 }); d.pendientes++;
    if (e.alcance === 'secuencia') d.secuencia++; else d.historias[e.imagen] = (d.historias[e.imagen] || 0) + 1;
  }
  return out;
}
function storyFeedbackPrompt(run: string, dia: any, entries: any[]) {
  const pending = entries.filter(e => e.estado !== 'aplicado' && e.estado !== 'en_curso'), busy = entries.filter(e => e.estado === 'en_curso');
  const general = pending.filter(e => e.alcance === 'secuencia'), detalle = pending.filter(e => e.alcance !== 'secuencia').sort((a, b) => (a.n || 0) - (b.n || 0));
  let k = 0;
  const line = (e: any) => [`${++k}. ${new Date(e.created_at).toLocaleString('es-AR', { timeZone: paths().timezone, dateStyle: 'short', timeStyle: 'short' })}${e.alcance === 'secuencia' ? '' : ` · Historia ${e.n || '?'} (${String(e.imagen).split('/').pop()})`}`,
    ...[e.text ? `   Texto: «${e.text}»` : '', e.audio ? `   Audio: ${e.audio}${e.audio_seconds ? ` (${Math.round(e.audio_seconds)} s)` : ''}. Transcribilo antes de actuar.` : ''].filter(Boolean), `   Nota: ${run}/feedback/${e.file}`].join('\n');
  return [
    `Feedback desde el planner sobre las historias del ${dia.fecha}${dia.tipo ? ` (${dia.tipo}${dia.formula ? ' ' + dia.formula : ''})` : ''}${dia.tema ? `: «${dia.tema}»` : ''}.`, '',
    `Carpeta de contenido: ${ROOT()}`, `Semana: ${run} (semana.json; las historias en HTML en fuente/, las imágenes en historias/)`,
    ...(general.length ? ['', `Feedback general de la secuencia (${general.length}): el tema, el enfoque o rehacer varias historias.`, ...general.map(line)] : []),
    ...(detalle.length ? ['', `Detalles de cada historia (${detalle.length}): textos, colores, tamaños o posiciones.`, ...detalle.map(line)] : []),
    ...(busy.length ? ['', `Ya en curso en otra sesión, no las repitas: ${busy.map(e => e.file).join(', ')}`] : []),
    '', 'Implementá estos cambios:',
    '- Antes de tocar nada, fijate que la corrección no esté ya en marcha: si el JSON de una nota dice «aplicado» o «en_curso» con tomado_at de las últimas 12 horas, no la hagas y avisame.',
    '- Si está libre, tomala: en el JSON poné estado «en_curso», tomado_at y tomado_por.',
    `- Seguí ${resolve(REPO_DIR, 'docs/historias.md')} y transcribí cada audio antes de decidir.`,
    ...(general.length ? ['- Feedback general: si cambia el tema o los textos de varias historias, primero mostrame la secuencia propuesta (el texto de cada historia) y esperá mi OK antes de rehacerla.'] : []),
    ...(detalle.length ? ['- Detalles de una historia: hacelos directo.'] : []),
    `- Cada historia se corrige en su HTML de fuente/ y se vuelve a renderizar con python3 "${resolve(MOTOR_DIR, 'render.py')}" <html> --salida <semana>/historias --chequeo. Si semana.json marca la historia con «editado», la tocaron en el editor del planner: partí de su HTML actual. Si cambia el texto, actualizá también su «texto» en semana.json.`,
    '- Si una historia ya está en Postiz, no la agendes, muevas ni quites: el planner la marca «Imagen nueva» y se reemplaza con la propuesta de Programar.',
    '- Al terminar, en el JSON de cada nota poné estado «aplicado», aplicado_at y una línea de qué cambió en «cambio».',
    '- No agendes, muevas ni publiques nada.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
function storyContext(imagen: any) {
  const { run, stem } = storyPaths(imagen), sem = fileRead(resolve(run, 'semana.json'), null);
  const dia = (sem?.dias || []).find((d: any) => (d.historias || []).some((h: any) => h.imagen === 'historias/' + stem + '.png'));
  if (!dia) throw new Error('Esa historia no está en su semana.json.');
  const n = dia.historias.findIndex((h: any) => h.imagen === 'historias/' + stem + '.png') + 1;
  return { run: relRoot(run), dir: resolve(run, 'feedback'), dia, n, imagen: String(imagen) };
}
function storyFeedbackReply(ctx: any) { const entries = storyFeedbackOf(ctx.run, ctx.dia.fecha); return { dia: ctx.dia.fecha, entries, prompt: entries.some((e: any) => e.estado !== 'aplicado' && e.estado !== 'en_curso') ? storyFeedbackPrompt(ctx.run, ctx.dia, entries) : null }; }

let storyBusy = false;
const FUENTE_TYPES: Record<string, string> = { ...TYPES, '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.json': 'application/json; charset=utf-8' };
const IMG_UP: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heic' };

export function registerStories(app: Hono) {
  app.get('/api/planner/stories', c => {
    const week = c.req.query('week') || '', accts = igAccounts(), cuenta = c.req.query('cuenta') || accts[0].profile;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return c.json({ error: 'Semana inválida' }, 400);
    if (!accts.some(a => a.profile === cuenta)) return c.json({ error: 'Esa cuenta de Instagram no está conectada en Postiz' }, 400);
    const all = storyWeeks(), entry = all[storyKey(cuenta, week)];
    const metrics = fileRead(resolve(STATE(), 'historias-metricas.json'), { dias: {} }), drafts = fileRead(resolve(STATE(), 'historias-draft.json'), { revision: 0, semanas: {} });
    const sem = entry ? storyWeekForPlanner(entry) : null;
    // Las secuencias de otras semanas que se corrieron a esta: se muestran y se programan acá.
    const entrantes = storySeqsAround(cuenta, week, drafts, accts).filter(x => x.semana !== week && mondayOf(x.secuencia.fecha) === week && x.secuencia.historias.length).map(x => {
      const s2 = storyWeekForPlanner(x.entry), dia = s2.dias.find((d: any) => d.fecha === x.orig);
      return { semana: x.semana, run: s2.run, orig: x.orig, dia, secuencia: x.secuencia, recurso: (s2.recursos || []).find((r: any) => r.id === dia?.recurso) || null };
    }).filter(x => x.dia);
    const queue = sem || entrantes.length ? storyQueue() : {};
    const cola = Object.fromEntries([...(sem?.dias || []), ...entrantes.map(x => x.dia)].flatMap((d: any) => d.historias.map((h: any) => [h.imagen, queue[h.imagen] || null])).filter(([, v]: any) => v));
    const fb: Record<string, any> = {};
    for (const [run, only] of [...(sem ? [[sem.run, null]] : []), ...entrantes.map(x => [x.run, x.orig])] as [string, string | null][])
      for (const [d, v] of Object.entries(storyFeedbackCounts(run))) if (!only || d === only) fb[d] = { ...v, historias: Object.fromEntries(Object.entries(v.historias).map(([img, n]) => [run + '/' + img, n])) };
    const sinAplicar: Record<string, any[]> = {};
    for (const [run, only] of [...(sem ? [[sem.run, null]] : []), ...entrantes.map(x => [x.run, x.orig])] as [string, string | null][])
      for (const e of storyFeedbackUnapplied(run)) if (!only || e.dia === only) (sinAplicar[run + '|' + e.dia] || (sinAplicar[run + '|' + e.dia] = [])).push(fbNote(e));
    const semanasDe = (p: string) => Object.values(all).filter(e => e.cuenta === p).map(e => e.week).sort();
    return c.json({ week, cuenta, carpeta: relRoot(STORIES()), cuentas: accts.map(a => ({ profile: a.profile, label: a.label, marca: a.marca, semanas: semanasDe(a.profile) })), weeks: semanasDe(cuenta), semana: sem,
      metricas: metricsOf(metrics, cuenta, accts), metricas_cuentas: Object.fromEntries(accts.map(a => [a.profile, metricsOf(metrics, a.profile, accts)])),
      draft: { revision: drafts.revision || 0, ...(drafts.semanas?.[draftKey(cuenta, week, accts)] || { secuencias: {} }) }, cola, entrantes, feedback: fb, feedback_sin_aplicar: sinAplicar });
  });
  app.post('/api/planner/stories/metrics', async c => {
    try {
      const body = validateStoryMetrics(await c.req.json()), accts = igAccounts(), cuenta = body.cuenta || accts[0].profile;
      if (!accts.some(a => a.profile === cuenta)) throw new Error('Esa cuenta de Instagram no está conectada en Postiz');
      const file = fileRead(resolve(STATE(), 'historias-metricas.json'), { version: 1, dias: {} }), principal = cuenta === accts[0].profile;
      const dias = { ...metricsOf(file, cuenta, accts) }, next: any = { ...(dias[body.date] || {}) };
      for (const k of STORY_METRICS) if (body[k] !== undefined) next[k] = body[k];
      next.updated_at = new Date().toISOString(); next.fuente = 'manual';
      if (STORY_METRICS.every(k => next[k] === null || next[k] === undefined)) delete dias[body.date]; else dias[body.date] = next;
      file.version = 1; if (principal) file.dias = dias; else file.por_cuenta = { ...(file.por_cuenta || {}), [cuenta]: dias };
      write('historias-metricas.json', file);
      return c.json({ cuenta, metricas: dias });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  app.post('/api/planner/stories/draft', async c => {
    try {
      const body = await c.req.json(), accts = igAccounts(), cuenta = body?.cuenta || accts[0].profile, entry = storyWeeks()[storyKey(cuenta, body?.week)];
      if (!entry) return c.json({ error: 'Esta semana no tiene historias planificadas.' }, 400);
      const key = draftKey(cuenta, body.week, accts), file = fileRead(resolve(STATE(), 'historias-draft.json'), { revision: 0, semanas: {} });
      if (body.revision !== (file.revision || 0)) return c.json({ error: 'Las historias cambiaron en otra pestaña. Recargá antes de seguir.' }, 409);
      validateStoryDraft(body, storyWeekForPlanner(entry), storyOccupied(cuenta, body.week, file, accts));
      file.revision = (file.revision || 0) + 1; file.semanas = { ...(file.semanas || {}) };
      if (Object.keys(body.secuencias).length) file.semanas[key] = { secuencias: body.secuencias, updated_at: new Date().toISOString() }; else delete file.semanas[key];
      write('historias-draft.json', file);
      return c.json({ revision: file.revision, ...(file.semanas[key] || { secuencias: {} }) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  // Una sola secuencia, guardada en el borrador de su semana de origen: correrla a otra semana, o editar una que llegó de otra.
  app.post('/api/planner/stories/seq', async c => {
    try {
      const body = await c.req.json(), accts = igAccounts(), cuenta = body?.cuenta || accts[0].profile, semana = String(body?.semana || ''), entry = storyWeeks()[storyKey(cuenta, semana)];
      if (!entry) return c.json({ error: 'Esa semana no tiene historias planificadas.' }, 400);
      const file = fileRead(resolve(STATE(), 'historias-draft.json'), { revision: 0, semanas: {} });
      if (body.revision !== (file.revision || 0)) return c.json({ error: 'Las historias cambiaron en otra pestaña. Recargá antes de seguir.' }, 409);
      const sem = storyWeekForPlanner(entry), dia = sem.dias.find((d: any) => d.fecha === body.orig), s = body.secuencia;
      if (!dia || !s || typeof s !== 'object') throw new Error('Secuencia desconocida');
      const key = draftKey(cuenta, semana, accts), secuencias = { ...(file.semanas?.[key]?.secuencias || {}), [dia.fecha]: { fecha: s.fecha, historias: s.historias, publicar: s.publicar, hora: s.hora ?? null, ...(s.cuenta && s.cuenta !== cuenta ? { cuenta: s.cuenta } : {}) } };
      // Se valida la semana de origen entera: los días que no están en el borrador siguen en su lugar.
      const entera = Object.fromEntries(sem.dias.map((d: any) => [d.fecha, secuencias[d.fecha] || defaultStorySeq(d)]));
      validateStoryDraft({ week: semana, revision: body.revision, secuencias: entera }, sem, storyOccupied(cuenta, semana, file, accts));
      const def = defaultStorySeq(dia), cur = secuencias[dia.fecha];
      if (JSON.stringify([cur.fecha, cur.historias, cur.publicar, cur.hora, cur.cuenta || null]) === JSON.stringify([def.fecha, def.historias, 'no', null, null])) delete secuencias[dia.fecha];
      file.revision = (file.revision || 0) + 1; file.semanas = { ...(file.semanas || {}) };
      if (Object.keys(secuencias).length) file.semanas[key] = { secuencias, updated_at: new Date().toISOString() }; else delete file.semanas[key];
      write('historias-draft.json', file);
      return c.json({ revision: file.revision, semana: mondayOf(s.fecha) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  // Congela lo que hay que hacer en Postiz con lo que se ve en la semana: las secuencias propias que siguen en ella y las
  // que llegaron de otras. Nada se agenda hasta que el usuario lo confirma en el chat.
  app.post('/api/planner/stories/proposal', async c => {
    try {
      const body = await c.req.json(), accts = igAccounts(), cuenta = body?.cuenta || accts[0].profile, week = String(body?.week || '');
      const file = fileRead(resolve(STATE(), 'historias-draft.json'), { revision: 0, semanas: {} });
      if (body.revision !== (file.revision || 0)) return c.json({ error: 'Las historias cambiaron en otra pestaña. Recargá antes de seguir.' }, 409);
      const seqs = /^\d{4}-\d{2}-\d{2}$/.test(week) ? storySeqsAround(cuenta, week, file, accts).filter(x => mondayOf(x.secuencia.fecha) === week) : [];
      if (!seqs.length) return c.json({ error: 'Esta semana no tiene historias planificadas.' }, 400);
      const sems: Record<string, any> = {}, semOf = (e: any) => sems[e.week] || (sems[e.week] = storyWeekForPlanner(e)), queue = storyQueue();
      const idOf = (p: string) => accts.find(a => a.profile === p)?.id || null;
      const dias = seqs.map(x => ({ x, sem: semOf(x.entry), dia: semOf(x.entry).dias.find((d: any) => d.fecha === x.orig) })).filter(({ dia }) => dia && dia.tipo !== 'libre')
        .sort((a, b) => a.x.secuencia.fecha.localeCompare(b.x.secuencia.fecha)).map(({ x, sem, dia }) => {
          const s = x.secuencia, all = Object.fromEntries(dia.historias.map((h: any) => [h.imagen, h]));
          return { secuencia: x.orig, semana_origen: x.semana, run: sem.run, tipo: dia.tipo, formula: dia.formula, tema: dia.tema || null, fecha: s.fecha, publicar: s.publicar, hora: s.hora || null, cuenta: s.cuenta || cuenta, cuenta_id: idOf(s.cuenta || cuenta),
            historias: s.historias.map((img: string, i: number) => { const h = all[img] || {}, q = queue[img] || null; return { orden: i + 1, imagen: img, video: h.video || null, sticker: h.sticker || null, a_mano: storyNeedsHand(h.sticker), cola: q }; }) };
        });
      // Feedback sin corregir de cada secuencia que se ve: viaja en la propuesta. Una historia con feedback (o todo el día,
      // si la nota es de la secuencia) no se agenda hasta que el usuario apruebe la versión corregida.
      const fbDias = dias.map((d: any) => ({ d, notas: storyFeedbackUnapplied(d.run, d.secuencia) })).filter(x => x.notas.length);
      const espera = (d: any, h: any) => (fbDias.find(x => x.d === d)?.notas || []).some((e: any) => e.alcance === 'secuencia' || (e.imagen && d.run + '/' + e.imagen === h.imagen));
      const acciones = dias.flatMap((d: any) => d.historias.map((h: any) => {
        let accion = d.publicar === 'postiz' ? (h.a_mano ? 'a_mano' : h.cola && h.cola.estado !== 'publicada' ? (h.cola.cambio ? 'reemplazar' : 'mover') : h.cola ? 'ya_publicada' : 'agendar') : (h.cola && h.cola.estado !== 'publicada' ? 'quitar' : 'nada');
        if (['agendar', 'mover', 'reemplazar'].includes(accion) && espera(d, h)) accion = 'espera_feedback';
        return { ...h, run: d.run, fecha: d.fecha, hora: d.hora, cuenta: d.cuenta, cuenta_id: d.cuenta_id, accion };
      }));
      const id = new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 6), name = 'proposal-historias-' + id + '.json';
      const n = acciones.filter((a: any) => ['agendar', 'mover', 'reemplazar'].includes(a.accion)).length, manual = acciones.filter((a: any) => a.accion === 'a_mano').length;
      const agenda = n || manual || acciones.some((a: any) => a.accion === 'quitar');
      if (!agenda && !fbDias.length) return c.json({ error: 'No hay nada para mandar: elegí Postiz en algún día o dejá feedback.' }, 400);
      const feedback = fbDias.map(({ d, notas }) => ({ run: d.run, secuencia: d.secuencia, fecha: d.fecha, tipo: d.tipo, formula: d.formula, notas: notas.map(fbNote) }));
      write(name, { id, status: 'awaiting_chat_confirmation', created_at: new Date().toISOString(), week, cuenta, run: storyWeeks()[storyKey(cuenta, week)]?.run || dias[0]?.run || seqs[0].entry.run, revision: file.revision || 0, timezone: paths().timezone, dias, acciones, feedback });
      for (const { d, notas } of fbDias) markFeedbackSent(resolve(ROOT(), d.run, 'feedback'), notas.map((e: any) => e.file), 'propuesta-historias');
      const destinos = [...new Set(acciones.filter((a: any) => ['agendar', 'mover', 'reemplazar', 'a_mano'].includes(a.accion)).map((a: any) => a.cuenta))] as string[];
      const where = relRoot(resolve(STATE(), name)), esperan = acciones.filter((a: any) => a.accion === 'espera_feedback').length, total = fbDias.reduce((k, x) => k + x.notas.length, 0);
      const partes = [agenda ? storyProposalPrompt(id, where, n, manual, destinos) : `Propuesta de historias ${id} del planner (${where}): sólo feedback de contenido, sin cambios de agenda.`];
      if (fbDias.length) partes.push([`Contenido · feedback sin aplicar (${total} nota${total === 1 ? '' : 's'}). Corregilo primero${esperan ? `: ${esperan} historia${esperan === 1 ? '' : 's'} con feedback no se agenda${esperan === 1 ? '' : 'n'} ahora (quedan «espera_feedback» en la propuesta) y se programa${esperan === 1 ? '' : 'n'} cuando apruebes la versión nueva` : ''}.`,
        ...fbDias.map(({ d, notas }) => storyFeedbackPrompt(d.run, d, notas))].join('\n\n'));
      return c.json({ id, path: where, prompt: partes.join('\n\n'), feedback: total, esperan });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });

  // ── Editor ──
  app.get('/api/planner/stories/source', c => {
    try {
      const { html, run, stem } = storyPaths(c.req.query('imagen'));
      if (!existsSync(html)) return c.json({ error: 'Esta historia no tiene su HTML en fuente/.' }, 404);
      return c.json({ html: readFileSync(html, 'utf8'), mtime: Math.round(statSync(html).mtimeMs), base: '/api/planner/story-fuente/' + runId(run) + '/', stem });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  app.get('/api/planner/story-fuente/*', c => {
    const raw = c.req.path.slice('/api/planner/story-fuente/'.length), cut = raw.indexOf('/');
    if (cut < 1) return c.text('No disponible', 404);
    const run = runFromId(raw.slice(0, cut)); let file = ''; try { file = decodeURIComponent(raw.slice(cut + 1)); } catch {}
    const type = FUENTE_TYPES[extname(file).toLowerCase()];
    if (!run || !type || file.split('/').some(x => !x || x === '..' || x.startsWith('.'))) return c.text('No disponible', 404);
    const dir = resolve(run, 'fuente'), p = resolve(dir, file);
    try { if (!within(realpathSync(dir), realpathSync(p)) || !statSync(p).isFile()) return c.text('No disponible', 404); } catch { return c.text('No disponible', 404); }
    return new Response(readFileSync(p), { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=60' } });
  });
  // Tu carpeta de fotos: lista, miniaturas y la foto para el recorte.
  app.get('/api/planner/catalog', c => c.json({ fotos: photoLibrary().map(f => ({ ...f, usable: true, usos: [], estilo_ig: [], lugar: f.carpeta, sesion: f.carpeta, calidad: 0, descripcion: f.carpeta ? f.carpeta + ' · ' + f.archivo : f.archivo })), carpeta: paths().photos }));
  const cached = async (id: string, max: number, folder: string) => {
    const p = photoPath(id); if (!p) return null;
    const out = resolve(STATE(), 'cache', folder, createHash('sha256').update(p + statSync(p).mtimeMs).digest('hex') + '.jpg');
    if (existsSync(out)) return out;
    try { return await toJpg(p, out, max); } catch { return null; }
  };
  for (const [route, max, folder] of [['thumb', 360, 'fotos-mini'], ['photo', 1600, 'fotos']] as const) {
    app.get('/api/planner/catalog/' + route, async c => {
      const p = await cached(c.req.query('id') || '', max, folder); if (!p) return c.text('No disponible', 404);
      return new Response(readFileSync(p), { headers: { 'Content-Type': TYPES[extname(p).toLowerCase()] || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
    });
  }
  app.post('/api/planner/stories/photo-asset', async c => {
    try {
      const body = await c.req.json(), { run } = storyPaths(body?.imagen), src = photoPath(String(body?.foto || ''));
      if (!src) throw new Error('Esa foto no está en tu carpeta de fotos.');
      const name = basename(src).replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) || 'foto';
      let out = resolve(run, 'fuente/assets/fotos', name + '.jpg');
      if (!existsSync(out)) out = await toJpg(src, out, 2160);
      return c.json({ src: 'assets/fotos/' + basename(out), archivo: basename(src) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  // Imágenes como sticker: subidas (archivo, arrastradas o pegadas) a <semana>/fuente/assets/subidas/.
  app.post('/api/planner/stories/upload', async c => {
    try {
      const body = await c.req.json(), { run } = storyPaths(body?.imagen), mime = String(body?.mime || '').split(';')[0].trim().toLowerCase();
      if (!IMG_UP[mime] || typeof body.data !== 'string' || body.data.length > 30_000_000) throw new Error('Subí una imagen PNG, JPG, WebP, GIF o HEIC de hasta 20 MB.');
      const buf = Buffer.from(body.data, 'base64'); if (buf.length < 100) throw new Error('La imagen llegó vacía.');
      const base = String(body.name || 'imagen').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'imagen';
      const dir = resolve(run, 'fuente/assets/subidas'); mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 4);
      let out = resolve(dir, `${stamp}-${base}${IMG_UP[mime]}`); writeFileSync(out, buf);
      // El navegador (y el render) no muestran HEIC: se pasa a JPG.
      if (IMG_UP[mime] === '.heic') { try { const jpg = await toJpg(out, out.replace(/\.heic$/, '.jpg'), 2160); unlinkSync(out); out = jpg; } catch { rmSync(out, { force: true }); throw new Error('No se pudo convertir esa foto HEIC. Exportala como JPG.'); } }
      return c.json({ src: 'assets/subidas/' + basename(out) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  app.get('/api/planner/stories/assets', c => {
    try {
      const { run } = storyPaths(c.req.query('imagen')), root = resolve(run, 'fuente/assets'), out: any[] = [];
      const walk = (dir: string, depth = 0) => {
        let names: string[] = []; try { names = readdirSync(dir); } catch { return; }
        for (const n of names) {
          if (n.startsWith('.')) continue; const p = resolve(dir, n), st = statSync(p);
          if (st.isDirectory()) { if (depth < 2) walk(p, depth + 1); }
          // Los cuadros sueltos de una animación (001.jpg, 002.jpg…) no son imágenes para usar.
          else if (/\.(png|jpe?g|webp|gif)$/i.test(n) && !/^\d{2,}\.(png|jpe?g|webp)$/i.test(n)) { const r = posix(relative(root, p)); out.push({ src: 'assets/' + r, carpeta: r.split('/')[0], mtime: Math.round(st.mtimeMs) }); }
        }
      };
      walk(root); out.sort((a, b) => b.mtime - a.mtime);
      return c.json({ imagenes: out.slice(0, 120) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  // Recursos listos (chat de WhatsApp, archivo del recurso…) para Agregar → Recursos del editor.
  app.get('/api/planner/stories/recursos', c => { try { return c.json({ html: readFileSync(resolve(MOTOR_DIR, 'recursos.html'), 'utf8') }); } catch { return c.json({ html: '' }); } });
  // Video de fondo o audio de voz en off, subidos crudos: POST stories/media?imagen=&tipo=video|audio&name=&desde=&hasta=.
  // El original queda en <semana>/originales/; los cuadros del video en fuente/assets/videos/<id>/ y el audio, pasado a
  // WAV 48 kHz, en fuente/assets/audio/.
  app.post('/api/planner/stories/media', async c => {
    try {
      const q = c.req.query(), { run } = storyPaths(q.imagen), tipo = q.tipo;
      if (tipo !== 'video' && tipo !== 'audio') throw new Error('Tipo inválido');
      const tabla = tipo === 'video' ? VIDEO_UP : AUDIO_UP, mime = String(c.req.header('content-type') || '').split(';')[0].trim().toLowerCase(), ext0 = extname(String(q.name || '')).toLowerCase();
      const ext = tabla[mime] || (Object.values(tabla).includes(ext0) ? ext0 : null);
      if (!ext) throw new Error(tipo === 'video' ? 'Subí un video MP4, MOV o WebM.' : 'Subí un audio MP3, WAV, M4A u OGG.');
      const buf = Buffer.from(await c.req.arrayBuffer()), max = tipo === 'video' ? 800_000_000 : 200_000_000;
      if (buf.length < 1000) throw new Error('El archivo llegó vacío.');
      if (buf.length > max) throw new Error(tipo === 'video' ? 'El video pesa más de 800 MB: recortalo antes de subirlo.' : 'El audio pesa más de 200 MB.');
      const stamp = upStamp(), base = upName(q.name, tipo), dir = resolve(run, 'originales'); mkdirSync(dir, { recursive: true });
      const orig = resolve(dir, `${stamp}-${base}${ext}`); writeFileSync(orig, buf);
      if (tipo === 'video') return c.json(await prepareStoryVideo(run, orig, `${base}-${stamp.slice(8, 14)}`, q.desde, q.hasta));
      const adir = resolve(run, 'fuente/assets/audio'); mkdirSync(adir, { recursive: true }); const wav = resolve(adir, `${stamp}-${base}.wav`);
      try { await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', orig, '-vn', '-ac', '2', '-ar', '48000', wav], { timeout: 180000 }); } catch { rmSync(wav, { force: true }); throw new Error('No se pudo leer ese audio (hace falta ffmpeg).'); }
      return c.json({ src: 'assets/audio/' + basename(wav), duracion: await mediaDuration(wav) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  // Cambia el tramo del video de fondo (desde/hasta, en segundos) volviendo a prepararlo desde su original.
  app.post('/api/planner/stories/video-trim', async c => {
    try {
      const body = await c.req.json(), { run } = storyPaths(body?.imagen), m = /^assets\/videos\/([a-z0-9-]+)\/%03d\.jpg$/.exec(String(body?.secuencia || ''));
      if (!m) throw new Error('Esta historia no tiene un video de fondo.');
      const meta = fileRead(resolve(run, 'fuente/assets/videos', m[1], 'video.json'), null), orig = meta?.origen ? resolve(run, String(meta.origen)) : null;
      if (!orig || !within(run, orig) || !existsSync(orig)) throw new Error('No encuentro el video original para recortarlo de nuevo.');
      return c.json(await prepareStoryVideo(run, orig, m[1], body.desde, body.hasta));
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  // Voces para la voz en off: las que ya están en la historia (fuente/assets/audio/) y las de <semana>/voces/.
  app.get('/api/planner/stories/voices', async c => {
    try {
      const { run } = storyPaths(c.req.query('imagen')), out: any[] = [], AUD = /\.(wav|mp3|m4a|aac|ogg)$/i;
      const walk = async (dir: string, en_fuente: boolean) => {
        let names: string[] = []; try { names = readdirSync(dir); } catch { return; }
        for (const n of names) {
          if (n.startsWith('.') || !AUD.test(n)) continue; const p = resolve(dir, n), st = statSync(p); if (!st.isFile()) continue;
          out.push({ path: posix(relative(run, p)), src: en_fuente ? 'assets/audio/' + n : null, media: relRoot(p), nombre: n, duracion: await mediaDuration(p), mtime: Math.round(st.mtimeMs), en_fuente });
        }
      };
      await walk(resolve(run, 'fuente/assets/audio'), true); await walk(resolve(run, 'voces'), false);
      // Una por voz: la copia que ya está en la historia gana, y entre WAV y MP3 de la misma toma, el WAV.
      const seen = new Set<string>(), uno: any[] = [];
      for (const v of out.sort((a, b) => Number(b.en_fuente) - Number(a.en_fuente) || Number(/\.wav$/i.test(b.nombre)) - Number(/\.wav$/i.test(a.nombre)))) { const k = upName(v.nombre, 'voz'); if (!seen.has(k)) { seen.add(k); uno.push(v); } }
      uno.sort((a, b) => b.mtime - a.mtime);
      return c.json({ voces: uno.slice(0, 60) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  // Trae una voz de <semana>/voces/ a fuente/assets/audio/ (WAV 48 kHz) para usarla en la historia.
  app.post('/api/planner/stories/voice-import', async c => {
    try {
      const body = await c.req.json(), { run } = storyPaths(body?.imagen), from = String(body?.path || '');
      if (!/^voces\/[A-Za-z0-9_. -]+\.(wav|mp3|m4a|aac|ogg)$/i.test(from) || from.includes('..')) throw new Error('Voz inválida');
      const src = resolve(run, from); if (!existsSync(src)) throw new Error('Esa voz ya no está en la carpeta de la semana.');
      const adir = resolve(run, 'fuente/assets/audio'); mkdirSync(adir, { recursive: true });
      const wav = resolve(adir, upName(basename(from), 'voz') + '.wav');
      if (!existsSync(wav)) { try { await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-ac', '2', '-ar', '48000', wav], { timeout: 180000 }); } catch { rmSync(wav, { force: true }); throw new Error('No se pudo leer esa voz (hace falta ffmpeg).'); } }
      return c.json({ src: 'assets/audio/' + basename(wav), duracion: await mediaDuration(wav) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  // Guarda la historia editada y la vuelve a renderizar con el chequeo. La versión anterior (HTML, PNG, MP4 y chequeo)
  // queda en <semana>/tmp/ediciones/; si el render falla, vuelve sola.
  app.post('/api/planner/stories/edit', async c => {
    if (storyBusy) return c.json({ error: 'Hay otra historia renderizándose. Esperá unos segundos.' }, 409);
    try {
      const body = await c.req.json(), { png, run, stem, html } = storyPaths(body?.imagen);
      if (!existsSync(png) || !existsSync(html)) return c.json({ error: 'No encuentro la historia en su carpeta.' }, 400);
      if (body.mtime !== Math.round(statSync(html).mtimeMs)) return c.json({ error: 'La historia cambió mientras la editabas. Cerrá el editor y volvé a abrirla.' }, 409);
      const src0 = readFileSync(html, 'utf8'), next = validateStoryEdit(src0, body.html, resolve(run, 'fuente'));
      if (next === src0) return c.json({ ok: true, sin_cambios: true, avisos: [], mtime: Math.round(statSync(png).mtimeMs), html_mtime: body.mtime });
      if (body.texto !== undefined && (typeof body.texto !== 'string' || body.texto.length > 2000)) throw new Error('Texto inválido');
      storyBusy = true;
      try {
        const chq = resolve(run, 'historias', stem + '.chequeo.json'), chq0 = existsSync(chq) ? readFileSync(chq) : null, png0 = readFileSync(png);
        const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14), bak = resolve(run, 'tmp/ediciones', stamp + '-' + stem);
        mkdirSync(bak, { recursive: true }); writeFileSync(resolve(bak, stem + '.html'), src0); writeFileSync(resolve(bak, stem + '.png'), png0); if (chq0) writeFileSync(resolve(bak, stem + '.chequeo.json'), chq0);
        const mp4 = resolve(run, 'historias', stem + '.mp4'), mp4bak = resolve(bak, stem + '.mp4'), conVideo = storyHasVideo(next);
        if (existsSync(mp4)) copyFileSync(mp4, mp4bak);
        writeFileSync(html, next);
        // Las caras (Vision) sólo en macOS: si no hay swiftc, el chequeo sigue sin ellas.
        const caras = resolve(STATE(), 'cache/caras');
        if (!existsSync(caras)) { try { mkdirSync(dirname(caras), { recursive: true }); await exec('swiftc', ['-O', resolve(MOTOR_DIR, 'caras.swift'), '-o', caras], { timeout: 180000 }); } catch {} }
        // Con video o voz en off, render.py saca también el MP4 (cuadro a cuadro, con la voz): tarda más.
        try { await exec(PYTHON, [resolve(MOTOR_DIR, 'render.py'), html, '--salida', resolve(run, 'historias'), '--chequeo', ...(existsSync(caras) ? ['--caras', caras] : [])], { cwd: run, timeout: conVideo ? 900000 : 180000, maxBuffer: 4 * 1024 * 1024 }); }
        catch { writeFileSync(html, src0); writeFileSync(png, png0); if (chq0) writeFileSync(chq, chq0); if (existsSync(mp4bak)) copyFileSync(mp4bak, mp4); throw new Error('No se pudo renderizar la historia; quedó la versión anterior. Revisá que esté instalado Playwright (docs/historias.md).'); }
        const chequeo = fileRead(chq, []), avisos = Array.isArray(chequeo) ? chequeo : (chequeo.problemas || chequeo.avisos || []);
        const f0 = fondoDe(src0), f1 = fondoDe(next);
        const stk = (h: string) => [...h.matchAll(/data-sticker="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
        const k0 = stk(src0), k1 = stk(next), stickers = JSON.stringify(k0) !== JSON.stringify(k1);
        const semana = fileRead(resolve(run, 'semana.json'), null);
        if (semana) {
          for (const d of semana.dias || []) for (const h of d.historias || []) if (h.imagen === 'historias/' + stem + '.png') {
            h.editado = { at: new Date().toISOString(), por: 'planner' };
            if (typeof body.texto === 'string' && body.texto.trim() && body.texto.trim() !== h.texto) { if (h.texto_original === undefined) h.texto_original = h.texto ?? null; h.texto = body.texto.trim(); }
            if (f1 && JSON.stringify(f0) !== JSON.stringify(f1)) h.fondo = { ...f1, cambiado_at: new Date().toISOString() };
            if (!f1 && f0) delete h.fondo;
            if (stickers) h.sticker = k1.length ? k1.join(' + ') : null;
            // Con video o voz en off, la historia que se publica es el MP4.
            const voz = storyVoices(next);
            if (conVideo && existsSync(mp4)) { h.video = 'historias/' + stem + '.mp4'; h.formato = 'video'; if (voz.length) h.voz = voz.length === 1 ? voz[0] : voz; else delete h.voz; }
            else { delete h.video; delete h.voz; if (h.formato === 'video') delete h.formato; }
          }
          const tmp = resolve(run, 'semana.json.' + randomUUID() + '.tmp'); writeFileSync(tmp, JSON.stringify(semana, null, 1) + '\n'); renameSync(tmp, resolve(run, 'semana.json'));
        }
        return c.json({ ok: true, avisos, mtime: Math.round(statSync(png).mtimeMs), html_mtime: Math.round(statSync(html).mtimeMs) });
      } finally { storyBusy = false; }
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });

  // ── Feedback ──
  app.get('/api/planner/stories/feedback', c => { try { return c.json(storyFeedbackReply(storyContext(c.req.query('imagen')))); } catch (e) { return c.json({ error: (e as Error).message }, 400); } });
  app.post('/api/planner/stories/feedback', async c => {
    try {
      const raw = await c.req.json(), body = validatePlannerFeedback({ ...raw, id: raw?.imagen }), ctx = storyContext(raw?.imagen);
      mkdirSync(ctx.dir, { recursive: true });
      const now = new Date(), stamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18) + '-' + randomUUID().slice(0, 4);
      let audio = null;
      if (body.audio) {
        const target = resolve(ctx.dir, stamp + '-planner' + body.audio.ext), rawf = resolve(ctx.dir, stamp + '-raw' + body.audio.ext); writeFileSync(rawf, body.audio.buf);
        // MediaRecorder deja el webm sin duración: una copia con ffmpeg la escribe. Sin ffmpeg queda el original.
        try { await exec('ffmpeg', ['-v', 'error', '-y', '-i', rawf, '-c', 'copy', target], { timeout: 30000 }); if (!existsSync(target) || !statSync(target).size) throw new Error('vacío'); unlinkSync(rawf); } catch { renameSync(rawf, target); }
        audio = relRoot(target);
      }
      const entry = { tipo: 'historia', run: ctx.run, dia: ctx.dia.fecha, imagen: 'historias/' + ctx.imagen.split('/').pop(), n: ctx.n, alcance: raw.alcance === 'secuencia' ? 'secuencia' : 'historia', created_at: now.toISOString(), text: body.text || null, audio, audio_mime: body.audio?.mime || null, audio_seconds: body.audio_seconds, transcript: null, estado: 'pendiente' };
      const target = resolve(ctx.dir, stamp + '-planner.json'), tmp = target + '.tmp'; writeFileSync(tmp, JSON.stringify(entry, null, 2)); renameSync(tmp, target);
      return c.json(storyFeedbackReply(ctx));
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  app.post('/api/planner/stories/feedback/sent', async c => {
    try { const raw = await c.req.json(), ctx = storyContext(raw?.imagen); markFeedbackSent(ctx.dir, storyFeedbackOf(ctx.run, ctx.dia.fecha).map((e: any) => e.file), 'copiar'); return c.json(storyFeedbackReply(ctx)); }
    catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  app.post('/api/planner/stories/feedback/remove', async c => {
    try {
      const raw = await c.req.json(), ctx = storyContext(raw?.imagen);
      if (typeof raw.file !== 'string' || !/^[\w.-]+-planner\.json$/.test(raw.file)) throw new Error('Nota inválida');
      const src = resolve(ctx.dir, raw.file); if (!existsSync(src)) throw new Error('Esa nota ya no está.');
      const entry = fileRead(src, {}); if (entry.tipo !== 'historia' || entry.dia !== ctx.dia.fecha) throw new Error('Esa nota es de otra secuencia.');
      const trash = resolve(ctx.dir, '.borradas'); mkdirSync(trash, { recursive: true });
      if (entry.audio) { const a = resolve(ROOT(), entry.audio); if (within(ctx.dir, a) && existsSync(a)) renameSync(a, resolve(trash, basename(a))); }
      renameSync(src, resolve(trash, raw.file));
      return c.json(storyFeedbackReply(ctx));
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
}
