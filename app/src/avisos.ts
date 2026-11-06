// Avisos por Telegram: manda los que encola el motor (engine/avisos.py) en <publicar>/.planner/avisos/pendientes/. El
// servidor del planner ya corre como servicio, así que es él quien los manda: cada minuto revisa la carpeta, manda lo que
// ya venció con el bot de TELEGRAM_BOT_TOKEN (en .env) al chat de `telegram.chat_id` (en la config) y lo pasa a enviados/.
// Hoy los encola engine/historias.py: el álbum de las historias de cada día para subirlas a mano a TikTok y los avisos de
// la publicación en cadena. Formato de cada aviso en engine/avisos.py.
//
// Cada parte que sale queda anotada en el aviso (`mensajes_enviados`): si Telegram falla a mitad, el reintento sigue desde
// la que falta y no repite las que ya llegaron. Un error deja `siguiente_intento` (lo que pida Telegram, un minuto como
// mínimo) y corta la tanda. Sólo manda: sendMessage, sendDocument y sendMediaGroup de documentos (el archivo tal cual,
// sin la compresión de las fotos de Telegram). Nunca se loguea una URL de la API: lleva el token.
import type { Hono } from 'hono';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import { REPO_DIR, config, paths } from './config.ts';
import { fileRead, within } from './publication-planner.ts';

const dirs = () => { const base = resolve(paths().state, 'avisos'); return { base, pend: resolve(base, 'pendientes'), env: resolve(base, 'enviados') }; };
const API = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// El token, de la variable de entorno o del .env del repo, leído en cada vuelta: se puede agregar con el planner abierto.
export function tokenTelegram() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN.trim();
  try {
    const m = /^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.*)$/m.exec(readFileSync(resolve(REPO_DIR, '.env'), 'utf8'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') || null : null;
  } catch { return null; }
}
const chatTelegram = () => { const c = config()?.telegram?.chat_id; return c === undefined || c === null || String(c).trim() === '' ? null : String(c).trim(); };

class ErrorTelegram extends Error {
  retryAfter: number | null;
  constructor(codigo: string | number, descripcion: string, retryAfter: number | null = null) { super(`telegram ${codigo}: ${descripcion}`); this.retryAfter = retryAfter; }
}
async function llamar(token: string, metodo: string, body: FormData | string, chat: string, espera: number) {
  let r: Response;
  try {
    r = await fetch(`${API()}/bot${token}/${metodo}`, { method: 'POST', body, signal: AbortSignal.timeout(espera * 1000), ...(typeof body === 'string' ? { headers: { 'Content-Type': 'application/json' } } : {}) });
  } catch (e) { throw new ErrorTelegram('red', (e as Error).name); }
  const resp: any = await r.json().catch(() => ({}));
  if (!r.ok || !resp.ok) throw new ErrorTelegram(r.status, resp.description || 'sin detalle', resp.parameters?.retry_after ?? null);
  // sendMediaGroup devuelve un mensaje por archivo. Si el chat no es el configurado, el token es de otro bot o de otro chat.
  const res = Array.isArray(resp.result) ? resp.result[0] || {} : resp.result || {};
  if (String(res.chat?.id) !== chat) throw new ErrorTelegram('respuesta', 'Telegram no confirmó el chat de destino');
  return res.message_id as number;
}
const mandar = (token: string, chat: string, texto: string, silencioso: boolean) =>
  llamar(token, 'sendMessage', JSON.stringify({ chat_id: chat, text: texto, disable_notification: silencioso, link_preview_options: { is_disabled: true } }), chat, 30);
const adjunto = (f: string) => new Blob([readFileSync(f)], { type: MIME[extname(f).toLowerCase()] || 'application/octet-stream' });
async function mandarArchivo(token: string, chat: string, ruta: string | null, texto: string, silencioso: boolean) {
  if (!ruta) return mandar(token, chat, (texto ? texto + '\n\n' : '') + '(No encontré el archivo: buscalo en el planner.)', silencioso);
  const fd = new FormData();
  fd.set('chat_id', chat); fd.set('caption', texto.slice(0, 1024)); fd.set('disable_notification', String(silencioso));
  fd.set('document', adjunto(ruta), basename(ruta));
  return llamar(token, 'sendDocument', fd, chat, 120);
}
// De a diez, como pide Telegram; uno solo va como documento.
async function mandarAlbum(token: string, chat: string, rutas: string[], silencioso: boolean) {
  if (rutas.length < 2) return mandarArchivo(token, chat, rutas[0] || null, '', silencioso);
  let primero: number | null = null;
  for (let i = 0; i < rutas.length; i += 10) {
    const tanda = rutas.slice(i, i + 10);
    let mid: number;
    if (tanda.length === 1) mid = await mandarArchivo(token, chat, tanda[0], '', silencioso);
    else {
      const fd = new FormData();
      fd.set('chat_id', chat); fd.set('disable_notification', String(silencioso));
      fd.set('media', JSON.stringify(tanda.map((_, k) => ({ type: 'document', media: `attach://f${k}` }))));
      tanda.forEach((f, k) => fd.set(`f${k}`, adjunto(f), basename(f)));
      mid = await llamar(token, 'sendMediaGroup', fd, chat, 300);
    }
    primero ??= mid;
  }
  return primero!;
}

// Un archivo del aviso: relativo a la carpeta de contenido, o absoluto adentro de ella o de la cola. Lo demás no sale.
function archivoDe(p: unknown) {
  if (typeof p !== 'string' || !p) return null;
  const { root, publish } = paths(), f = isAbsolute(p) ? resolve(p) : resolve(root, p);
  return (within(root, f) || within(publish, f)) && existsSync(f) ? f : null;
}
const guardar = (f: string, data: any) => { const tmp = f + '.tmp'; writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n'); renameSync(tmp, f); };
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

// Manda un aviso vencido. Devuelve false si hay que cortar la tanda (Telegram limitó o falló).
async function procesar(f: string, av: any, token: string, chat: string, ahora: Date) {
  const hechos = new Set((av.mensajes_enviados || []).map((m: any) => m.parte));
  const partes = Array.isArray(av.partes) ? av.partes : [['texto', String(av.texto || av.titulo || ''), false]];
  for (const [parte, texto, silencioso, extra] of partes) {
    if (hechos.has(parte)) continue;
    const ops = extra && typeof extra === 'object' ? extra : {};
    try {
      const mid = Array.isArray(ops.archivos) ? await mandarAlbum(token, chat, ops.archivos.map(archivoDe).filter(Boolean) as string[], !!silencioso)
        : ops.archivo ? await mandarArchivo(token, chat, archivoDe(ops.archivo), String(texto || ''), !!silencioso)
        : await mandar(token, chat, String(texto || ''), !!silencioso);
      (av.mensajes_enviados ||= []).push({ parte, message_id: mid, at: iso(new Date()) });
      guardar(f, av);
    } catch (e) {
      const espera = Math.max(60, (e as ErrorTelegram).retryAfter || 0);
      av.siguiente_intento = iso(new Date(Math.max(ahora.getTime(), Date.now()) + espera * 1000));
      av.errores = [...(av.errores || []), { at: iso(new Date()), parte, error: (e as Error).message }].slice(-20);
      guardar(f, av);
      console.error(new Date().toISOString(), `aviso ${av.id}: ${(e as Error).message}; reintento en ${espera} s`);
      return false;
    }
  }
  av.enviado_at = iso(new Date()); delete av.siguiente_intento;
  mkdirSync(dirs().env, { recursive: true });
  guardar(resolve(dirs().env, basename(f)), av);
  unlinkSync(f);
  return true;
}

let corriendo = false, sinCredencial = false;
// Una vuelta: manda lo vencido, del más viejo al más nuevo. Sin chat o sin token no hace nada (y lo dice una vez).
export async function enviarAvisos(ahora = new Date()) {
  const { pend } = dirs(), out = { enviados: [] as string[], pendientes: 0 };
  if (corriendo || !existsSync(pend)) return out;
  corriendo = true;
  try {
    const vencidos = readdirSync(pend).filter(n => n.endsWith('.json')).map(n => ({ f: resolve(pend, n), av: fileRead(resolve(pend, n), null) }))
      .filter(({ av }) => av && Date.parse(av.enviar_utc) <= ahora.getTime() && !(av.siguiente_intento && Date.parse(av.siguiente_intento) > ahora.getTime()))
      .sort((a, b) => String(a.av.enviar_utc).localeCompare(String(b.av.enviar_utc)));
    out.pendientes = vencidos.length;
    if (!vencidos.length) return out;
    const token = tokenTelegram(), chat = chatTelegram();
    if (!token || !chat) {
      if (!sinCredencial) console.error(new Date().toISOString(), `${vencidos.length} aviso(s) de Telegram sin mandar: falta ${!token ? 'TELEGRAM_BOT_TOKEN en .env' : 'telegram.chat_id en la config'}`);
      sinCredencial = true;
      return out;
    }
    sinCredencial = false;
    for (const { f, av } of vencidos) {
      if (!await procesar(f, av, token, chat, ahora)) break;
      out.enviados.push(av.id);
    }
    return out;
  } finally { corriendo = false; }
}

export function registerAvisos(app: Hono) {
  // Lo pendiente y lo último enviado, para ver si los avisos están saliendo.
  app.get('/api/planner/avisos', c => {
    const { pend, env } = dirs(), lista = (d: string) => existsSync(d) ? readdirSync(d).filter(n => n.endsWith('.json')).map(n => fileRead(resolve(d, n), null)).filter(Boolean) : [];
    const resumen = (a: any) => ({ id: a.id, titulo: a.titulo || '', tipo: a.tipo || null, enviar_utc: a.enviar_utc || null, enviado_at: a.enviado_at || null, siguiente_intento: a.siguiente_intento || null, error: a.errores?.at(-1)?.error || null });
    return c.json({ configurado: !!(tokenTelegram() && chatTelegram()), pendientes: lista(pend).map(resumen).sort((a, b) => String(a.enviar_utc).localeCompare(String(b.enviar_utc))),
      enviados: lista(env).map(resumen).sort((a, b) => String(b.enviado_at).localeCompare(String(a.enviado_at))).slice(0, 10) });
  });
  const vuelta = () => enviarAvisos().catch(e => console.error(new Date().toISOString(), 'avisos de Telegram', (e as Error).message));
  setTimeout(vuelta, 5000).unref();
  setInterval(vuelta, 60000).unref();
}
