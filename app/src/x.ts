// Sección Twitter: lo que se escribe para tu cuenta de X, se edita y se agenda, y lo que lo alimenta (tus bookmarks,
// las búsquedas y la base de cuentas que seguís). Vos bookmarkeás y decidís; la skill x-borradores escribe los borradores
// con tu voz. Todo vive en la carpeta de X de la cola (paths().x, `x.carpeta` en la config; ver engine/x/comun.py):
// - cuenta.json: nombre, usuario y foto de tu cuenta (lo completa engine/x/bookmarks.py); si falta, la config.
// - bookmarks.json: el índice que arma engine/x/indice.py. temas.json: tus temas y el tema de cada bookmark.
// - borradores/<id>.json. `tipo`: post o hilo (desde cero) y sobre (comentario sobre el post de otro, que sale citándolo).
// - busquedas/<id>.json: lo que trae engine/x/buscar.py. cuentas.json: la base de cuentas con su tipo.
// - estado.json: lo que decidís acá sobre los bookmarks («Me interesa», «No me interesa») y qué cuentas son tu tono.
// - feedback/<id>/: tus notas escritas o grabadas sobre un borrador o un tweet marcado.
// Lo que decidís se guarda acá: texto, aprobar o descartar, el horario propuesto en la semana. Mandar a Postiz no:
// «Copiar pedido» arma el mensaje y pegarlo en Claude Code es tu OK (engine/x/agendar.py lo agenda).
import type { Hono } from 'hono';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config, paths } from './config.ts';
import { exec, rel, validatePlannerFeedback, within } from './publication-planner.ts';
import { cantidad, diasMensaje, nombreMensaje, tituloMensaje } from './titulo-mensaje.ts';

const DIR = () => paths().x;
const ID = /^[a-z0-9][a-z0-9-]{0,120}$/;
const TWEET = /^\d{1,25}$/;
const HANDLE = /^[A-Za-z0-9_]{1,30}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;
const ESTADOS = new Set(['borrador', 'aprobado', 'descartado']);
const MAX_PARTES = 25, MAX_TEXTO = 25000;
const HORARIOS = ['10:00', '14:00', '19:00'];
// Los tipos de cuenta por defecto; cuentas.json puede traer los suyos (`tipos: [{id, nombre}]`).
const TIPOS = [{ id: 'voz', nombre: 'Tono' }, { id: 'metodo', nombre: 'Método' }, { id: 'criterio', nombre: 'Criterio' }, { id: 'lanzamiento', nombre: 'Lanzamientos' }];
// Una cuenta que guardaste tantas veces aparece en Cuentas aunque no esté en la base.
const MIN_BOOKMARKS_CUENTA = 3;

const readJson = (p: string, fallback: any) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (target: string, data: unknown) => { mkdirSync(resolve(target, '..'), { recursive: true }); const tmp = target + '.' + randomUUID() + '.tmp'; writeFileSync(tmp, JSON.stringify(data, null, 2)); renameSync(tmp, target); };
const tipoDe = (b: any) => b.tipo === 'cita' || b.tipo === 'sobre' ? 'sobre' : (b.partes?.length > 1 ? 'hilo' : 'post');
const conSobre = (b: any, id: string) => ({ ...b, id, sobre: b.sobre || b.cita || null });

const FB_FILE = /^[\w.-]+-planner\.json$/;
const feedbackDir = (id: string) => resolve(DIR(), 'feedback', id);
function feedback(id: string) {
  const dir = feedbackDir(id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => FB_FILE.test(f)).sort().map(f => ({ ...readJson(resolve(dir, f), {}), file: f }));
}

function borradores() {
  const dir = resolve(DIR(), 'borradores');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json') && ID.test(f.slice(0, -5)))
    .map(f => { const b = readJson(resolve(dir, f), {}), id = f.slice(0, -5); return { ...conSobre(b, id), tipo: tipoDe(b), feedback: feedback(id) }; })
    .filter(b => Array.isArray(b.partes))
    .sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
}

// Lo que querés decir de un tweet marcado «Me interesa», escrito o grabado: mismas notas que un borrador, en la carpeta
// del id del tweet.
function notasDeBookmarks() {
  const dir = resolve(DIR(), 'feedback');
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).filter(f => TWEET.test(f)).map(id => [id, feedback(id)]).filter(([, notas]) => notas.length));
}

// Lo que Claude Code trae de X sin que sean bookmarks: las marcas y las notas son las de los bookmarks, por id del tweet.
function busquedas() {
  const dir = resolve(DIR(), 'busquedas');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.')).map(f => ({ ...readJson(resolve(dir, f), {}), id: f.slice(0, -5) }))
    .filter(b => Array.isArray(b.items) && b.items.length)
    .sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
}

// La base de cuentas (cuentas.json) con lo que dicen tus bookmarks de cada una, más las que guardaste seguido.
function cuentas(indice: any[], voz: Record<string, any>) {
  const base = readJson(resolve(DIR(), 'cuentas.json'), {});
  const por = new Map<string, any>();
  for (const b of indice) {
    const h = String(b.autor?.handle || '').toLowerCase(); if (!h) continue;
    const c = por.get(h) || { handle: b.autor.handle, n: 0, ultimo: null, avatar: null, nombre: null, verificado: false, likes: [] };
    c.n++;
    if (!c.ultimo || String(b.fecha || '') > c.ultimo) c.ultimo = b.fecha || c.ultimo;
    c.avatar = c.avatar || b.autor?.avatar || null;
    c.nombre = c.nombre || b.autor?.nombre || null;
    c.verificado = c.verificado || !!b.autor?.verificado;
    if (b.metricas?.likes != null) c.likes.push(b.metricas.likes);
    por.set(h, c);
  }
  const lista = (Array.isArray(base.cuentas) ? base.cuentas : []).filter((c: any) => HANDLE.test(String(c?.handle || '')));
  const enBase = new Set(lista.map((c: any) => String(c.handle).toLowerCase()));
  const sueltas = [...por.values()].filter(c => !enBase.has(c.handle.toLowerCase()) && c.n >= MIN_BOOKMARKS_CUENTA)
    .map(c => ({ handle: c.handle, tipo: null, why: '', origen: 'bookmarks' }));
  return [...lista, ...sueltas].map((c: any) => {
    const k = String(c.handle).toLowerCase(), d = por.get(k) || { n: 0, likes: [] };
    const likes = [...d.likes].sort((a: number, b: number) => a - b);
    return { handle: c.handle, tipo: c.tipo ?? c.tier ?? null, why: c.why || '', origen: c.origen || '',
      voz: voz[k]?.voz ?? null, nombre: d.nombre || c.nombre || null, avatar: d.avatar || null, verificado: !!d.verificado,
      bookmarks: d.n || 0, ultimo_bookmark: d.ultimo || null, likes_mediana: likes.length ? likes[Math.floor(likes.length / 2)] : null };
  });
}

// Tu cuenta: la que bajó bookmarks.py (con nombre y foto), o la de la config (`x.usuario`) o la conectada en Postiz.
function tuCuenta() {
  const cfg = config(), x = cfg.x || {}, ch = cfg.channels?.x || {}, c = readJson(resolve(DIR(), 'cuenta.json'), {});
  const handle = String(c.handle || x.usuario || ch.profile || '').replace(/^@/, '') || null;
  return { handle, nombre: c.nombre || x.nombre || ch.name || handle, avatar: c.avatar || null, verificado: !!c.verificado };
}

export function xData() {
  const indice = readJson(resolve(DIR(), 'bookmarks.json'), { items: [] });
  const items = Array.isArray(indice.items) ? indice.items : [];
  const estado = readJson(resolve(DIR(), 'estado.json'), {});
  const cfg = config(), x = cfg.x || {};
  const temas = readJson(resolve(DIR(), 'temas.json'), {});
  const asignados = temas.asignados || {};
  const base = readJson(resolve(DIR(), 'cuentas.json'), {});
  const horarios = Array.isArray(x.horarios) && x.horarios.filter((h: any) => HORA.test(String(h))).length ? x.horarios.filter((h: any) => HORA.test(String(h))) : HORARIOS;
  return {
    cuenta: tuCuenta(),
    // Agendar necesita la cuenta de X conectada en Postiz (o Typefully para citar).
    postiz: !!cfg.channels?.x?.id,
    slots: horarios,
    zona: paths().timezone,
    actualizado: indice.actualizado || null,
    // Los más nuevos alcanzan para trabajar; el índice entero sólo cuenta para las cuentas.
    bookmarks: items.slice(0, 400).map((b: any) => ({ ...b, tema: asignados[b.id] || null })),
    temas: (Array.isArray(temas.temas) ? temas.temas : []).filter((t: any) => t?.id).map((t: any) => ({ id: String(t.id), nombre: String(t.nombre || t.id) })),
    total_bookmarks: items.length,
    estado: estado.bookmarks || {},
    bookmark_notas: notasDeBookmarks(),
    busquedas: busquedas(),
    borradores: borradores(),
    tipos: Array.isArray(base.tipos) && base.tipos.length ? base.tipos.filter((t: any) => t?.id).map((t: any) => ({ id: String(t.id), nombre: String(t.nombre || t.id) })) : TIPOS,
    cuentas: cuentas(items, estado.cuentas || {}),
  };
}

function leerBorrador(id: string) {
  const file = resolve(DIR(), 'borradores', id + '.json');
  return { file, actual: existsSync(file) ? readJson(file, null) : null };
}
const conHistorial = (b: any, entrada: any) => [...(b.historial || []), { at: new Date().toISOString(), ...entrada }].slice(-30);
const ocupado = (b: any) => b.estado === 'agendado' || b.estado === 'publicado';

export function registerX(app: Hono) {
  app.get('/api/planner/x', c => c.json(xData()));

  // Texto editado de un borrador: las partes, en orden. Si cambió en disco desde que se abrió (`editado`), no se pisa.
  app.post('/api/planner/x/borrador', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || ''))) return c.json({ error: 'Borrador inválido' }, 400);
    const { file, actual } = leerBorrador(body.id);
    if (!actual) return c.json({ error: 'Ese borrador ya no está' }, 404);
    const partes = Array.isArray(body.partes) ? body.partes : null;
    if (!partes || !partes.length || partes.length > MAX_PARTES || partes.some((p: any) => typeof p?.texto !== 'string' || p.texto.length > MAX_TEXTO))
      return c.json({ error: 'El texto no es válido' }, 400);
    if (ocupado(actual)) return c.json({ error: 'Ya está agendado: pedile a Claude Code que lo mueva o lo saque' }, 409);
    if (body.editado !== undefined && (actual.editado || null) !== (body.editado || null))
      return c.json({ error: 'Lo cambiaron mientras lo editabas. Recargá para ver la última versión.', borrador: conSobre(actual, body.id) }, 409);
    const viejas = Array.isArray(actual.partes) ? actual.partes : [];
    const nuevas = partes.map((p: any, i: number) => ({ ...(viejas[i] || {}), texto: p.texto.replace(/\r\n/g, '\n') }));
    const editado = new Date().toISOString();
    // Una parte de más lo vuelve hilo y quedarse con una lo vuelve post; el que es sobre un post sigue siéndolo.
    const tipo = tipoDe(actual) === 'sobre' ? 'sobre' : nuevas.length > 1 ? 'hilo' : 'post';
    // Lo que escribió Claude Code queda en `texto_original` desde la primera edición: contra eso aprende tu voz.
    const texto_original = actual.texto_original || viejas.map((p: any) => p.texto);
    const next = { ...actual, tipo, partes: nuevas, texto_original, editado, editado_por: 'usuario', historial: conHistorial(actual, { accion: 'texto', antes: viejas.map((p: any) => p.texto) }) };
    writeJson(file, next);
    return c.json({ borrador: conSobre(next, body.id) });
  });

  app.post('/api/planner/x/borrador/estado', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || '')) || !ESTADOS.has(body.estado)) return c.json({ error: 'Pedido inválido' }, 400);
    const { file, actual } = leerBorrador(body.id);
    if (!actual) return c.json({ error: 'Ese borrador ya no está' }, 404);
    if (ocupado(actual)) return c.json({ error: 'Ya está agendado: pedile a Claude Code que lo mueva o lo saque' }, 409);
    const next: any = { ...actual, estado: body.estado, historial: conHistorial(actual, { accion: body.estado }) };
    if (body.motivo) next.motivo = String(body.motivo).slice(0, 300);
    if (body.estado === 'aprobado') next.aprobado = new Date().toISOString();
    else delete next.fecha; // lo que vuelve a revisión o se descarta suelta su lugar en la semana
    writeJson(file, next);
    return c.json({ borrador: conSobre(next, body.id) });
  });

  // Lugar en la semana (fecha y hora locales, `YYYY-MM-DDTHH:MM`) de un borrador aprobado; `fecha: null` lo devuelve a
  // «Para agendar». Es una propuesta: nada se agenda hasta que pegás el pedido en Claude Code.
  app.post('/api/planner/x/borrador/fecha', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || '')) || !(body.fecha === null || FECHA.test(String(body.fecha)))) return c.json({ error: 'Pedido inválido' }, 400);
    const { file, actual } = leerBorrador(body.id);
    if (!actual) return c.json({ error: 'Ese borrador ya no está' }, 404);
    if (actual.estado !== 'aprobado') return c.json({ error: ocupado(actual) ? 'Ya está agendado: pedile a Claude Code que lo mueva' : 'Primero aprobalo' }, 409);
    const next: any = { ...actual, historial: conHistorial(actual, { accion: 'fecha', fecha: body.fecha }) };
    if (body.fecha) next.fecha = body.fecha; else delete next.fecha;
    writeJson(file, next);
    return c.json({ borrador: conSobre(next, body.id) });
  });

  // Feedback sobre un tweet, escrito o grabado, como en Guiones: queda pendiente hasta que Claude Code lo aplica.
  app.post('/api/planner/x/feedback', async c => {
    try {
      const raw = await c.req.json();
      if (!ID.test(String(raw?.id || '')) || !(TWEET.test(raw.id) || leerBorrador(raw.id).actual)) return c.json({ error: 'Borrador inválido' }, 400);
      const body = validatePlannerFeedback(raw);
      const dir = feedbackDir(raw.id); mkdirSync(dir, { recursive: true });
      const now = new Date(), stamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18) + '-' + randomUUID().slice(0, 4);
      let audio = null;
      if (body.audio) {
        const target = resolve(dir, stamp + '-planner' + body.audio.ext), tmp = resolve(dir, '.' + stamp + '-raw' + body.audio.ext);
        writeFileSync(tmp, body.audio.buf);
        // MediaRecorder deja el webm sin duración: una copia con ffmpeg la escribe. Si falla, queda el original.
        try { await exec('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-c', 'copy', target], { timeout: 30000 }); if (!existsSync(target) || !statSync(target).size) throw new Error('vacío'); } catch { renameSync(tmp, target); }
        audio = rel(target);
      }
      writeJson(resolve(dir, stamp + '-planner.json'), { borrador: raw.id, created_at: now.toISOString(), by: 'el planner', text: body.text || null,
        audio, audio_mime: body.audio?.mime || null, audio_seconds: body.audio_seconds, transcript: null, estado: 'pendiente' });
      return c.json({ feedback: feedback(raw.id) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });

  // Borrar una nota la mueve, con su audio, a .borradas: nada se pierde.
  app.post('/api/planner/x/feedback/remove', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || '')) || !FB_FILE.test(String(body.file || ''))) return c.json({ error: 'Nota inválida' }, 400);
    const dir = feedbackDir(body.id), src = resolve(dir, body.file);
    if (!existsSync(src)) return c.json({ error: 'Esa nota ya no está.' }, 404);
    const nota = readJson(src, {});
    if (nota.estado === 'aplicado') return c.json({ error: 'Esa nota ya se aplicó.' }, 409);
    const trash = resolve(dir, '.borradas'); mkdirSync(trash, { recursive: true });
    if (nota.audio) { const a = resolve(paths().root, nota.audio); if (within(dir, a) && existsSync(a)) renameSync(a, resolve(trash, a.split(/[\\/]/).pop()!)); }
    renameSync(src, resolve(trash, body.file));
    return c.json({ feedback: feedback(body.id) });
  });

  // «Mandar feedback a Claude Code»: las notas sin aplicar de todos los tweets y las ediciones a mano sin aprender, en un
  // mensaje para pegar. Las notas pasan a «enviado».
  app.post('/api/planner/x/feedback/copiar', async c => {
    const lista = borradores();
    const conNotas = lista.filter(b => b.feedback.some((n: any) => n.estado !== 'aplicado'));
    const editados = lista.filter(b => b.editado_por === 'usuario' && b.texto_original && (!b.aprendido_en || b.aprendido_en < b.editado));
    if (!conNotas.length && !editados.length) return c.json({ error: 'No hay feedback ni ediciones para mandar.' }, 400);
    const titulo = conNotas.length === 1 && !editados.length ? `Corregir el tweet ${nombreMensaje(conNotas[0].partes[0]?.texto)}` : conNotas.length ? `Corregir ${cantidad(conNotas.length, 'tweet')}` : `Aprender de ${cantidad(editados.length, 'edición', 'ediciones')} de tweets`;
    const lineas = [tituloMensaje('Feedback', titulo), '', 'Aplicá mi feedback de Twitter con la skill x-borradores (sección «Aprender de cada corrección»). Corré `python3 engine/x/aprender.py pendientes`: junta todo y transcribe los audios.', ''];
    for (const b of conNotas) {
      lineas.push(`- ${b.id} · «${String(b.partes[0]?.texto || '').split('\n')[0].slice(0, 70)}»`);
      for (const n of b.feedback.filter((n: any) => n.estado !== 'aplicado')) lineas.push(`  · ${n.text ? `«${n.text}»` : ''}${n.audio ? `${n.text ? ' + ' : ''}audio ${n.audio}${n.audio_seconds ? ` (${Math.round(n.audio_seconds)} s)` : ''}` : ''}`);
    }
    if (editados.length) lineas.push('', `Ediciones a mano sin aprender: ${editados.map(b => b.id).join(', ')}.`);
    lineas.push('', 'Reescribí cada tweet según su nota, pasá cada corrección de manera de escribir a mi guía de voz (voz.md en la carpeta de X) y marcá todo como aprendido. No agendes nada.');
    const now = new Date().toISOString();
    for (const b of conNotas) for (const n of b.feedback.filter((n: any) => n.estado === 'pendiente')) {
      const f = resolve(feedbackDir(b.id), n.file); writeJson(f, { ...readJson(f, {}), estado: 'enviado', enviado_at: now });
    }
    return c.json({ prompt: lineas.join('\n') });
  });

  // «Copiar pedido para Claude Code» de la semana: los aprobados con horario, en orden. Pegarlo es tu OK para agendarlos.
  app.post('/api/planner/x/pedido', async c => {
    const lista = borradores().filter(b => b.estado === 'aprobado' && b.fecha).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    if (!lista.length) return c.json({ error: 'No hay tweets aprobados con horario.' }, 400);
    const cuenta = tuCuenta(), tipoTxt = (b: any) => b.tipo === 'sobre' ? 'cita' : b.tipo === 'hilo' ? `hilo de ${b.partes.length}` : 'post';
    const lineas = lista.map(b => `- ${String(b.fecha).replace('T', ' ')} · ${b.id} · ${tipoTxt(b)} · «${String(b.partes[0]?.texto || '').split('\n')[0].slice(0, 70)}»`);
    const prompt = [tituloMensaje('Agenda', `Agendar ${lista.length === 1 ? 'un tweet' : `${lista.length} tweets`} ${diasMensaje(lista.map(b => b.fecha))}`), '',
      `Agendá estos ${lista.length} tweets de Twitter${cuenta.handle ? ` (@${cuenta.handle})` : ''} con la skill x-borradores (\`python3 engine/x/agendar.py ${lista.map(b => b.id).join(' ')}\`), a la hora indicada (${paths().timezone}). Es mi OK para esta tanda:`,
      ...lineas].join('\n');
    return c.json({ prompt, n: lista.length });
  });

  // «Me interesa» espera a que Claude Code redacte el tweet; `descartado` es el «No me interesa»; `estado: null` lo vuelve a la bandeja.
  app.post('/api/planner/x/bookmark', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!TWEET.test(String(body.id || '')) || ![null, 'descartado', 'interesa'].includes(body.estado)) return c.json({ error: 'Pedido inválido' }, 400);
    const file = resolve(DIR(), 'estado.json');
    const est = readJson(file, {});
    est.bookmarks = est.bookmarks || {};
    if (body.estado) est.bookmarks[body.id] = { estado: body.estado, at: new Date().toISOString() };
    else delete est.bookmarks[body.id];
    writeJson(file, est);
    return c.json({ estado: est.bookmarks });
  });

  // ¿Querés tomar el tono de esta cuenta? La skill x-borradores lee estas respuestas; `voz: null` borra la respuesta.
  app.post('/api/planner/x/cuenta', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!HANDLE.test(String(body.handle || '')) || ![true, false, null].includes(body.voz)) return c.json({ error: 'Pedido inválido' }, 400);
    const file = resolve(DIR(), 'estado.json');
    const est = readJson(file, {});
    est.cuentas = est.cuentas || {};
    const k = String(body.handle).toLowerCase();
    if (body.voz === null) delete est.cuentas[k]; else est.cuentas[k] = { voz: body.voz, at: new Date().toISOString() };
    writeJson(file, est);
    return c.json({ handle: body.handle, voz: body.voz });
  });
}
