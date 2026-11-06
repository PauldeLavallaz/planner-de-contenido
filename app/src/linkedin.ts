// Sección LinkedIn: lo que se publica en tu perfil y la búsqueda activa de quien necesita lo que vendés. Todo vive en
// <publicar>/linkedin/ (config `linkedin.carpeta`) y lo arman las skills linkedin-posts, linkedin-prospectos y video-a-medida.
// - Prospectos: prospectos.json, que arma engine/linkedin/prospectos.py con fuentes públicas (posteos de LinkedIn por palabra
//   clave, avisos laborales, fichas de empresa). Nunca con tu sesión de LinkedIn.
// - Videos: contactos.json, cada contacto con su video a medida; el recorrido elegir → generando → revisar → enviar → enviados se
//   guarda en estado.json → videos. Un prospecto de la búsqueda entra al mismo recorrido cuando lo pasás a «Para contactar».
// - Lo que decidís sobre cada prospecto (para contactar, contactado, respondió, agendó o descartado) va a estado.json.
// - Posts: borradores/<id>.json, los mini artículos que escribe la skill linkedin-posts. Aprobar no agenda. Programar, con día y
//   hora, es tu OK para esa publicación: llama a engine/linkedin/agendar.py, que la pasa por la cola (cola.py listo y agendar).
//   Las notas, escritas o grabadas, van a feedback/<id>/ y viajan con «Mandar a Claude».
// - Referencias: referencias.json, los posts del research de lo viral en tu nicho.
// Nada se envía a nadie desde acá: invitar, comentar y mandar mensajes lo hacés vos desde tu cuenta.
import type { Hono } from 'hono';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { CONFIG_PATH, ENGINE_DIR, PYTHON, REPO_DIR, config, paths } from './config.ts';
import { plannerMediaPath, posix, rel, validatePlannerFeedback, within } from './publication-planner.ts';
import { cantidad, nombreMensaje, tituloMensaje } from './titulo-mensaje.ts';

const exec = promisify(execFile);

const DIR = () => paths().linkedin;
const ID = /^[a-z0-9][a-z0-9-]{0,120}$/;
const ESTADOS_PROSPECTO = new Set(['nuevo', 'para_contactar', 'contactado', 'respondio', 'agendo', 'descartado']);
const ESTADOS_POST = new Set(['borrador', 'aprobado', 'descartado']);
const MAX_TEXTO = 3000; // el tope de LinkedIn para un post

const readJson = (p: string, fallback: any) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (target: string, data: unknown) => { mkdirSync(resolve(target, '..'), { recursive: true }); const tmp = target + '.' + randomUUID() + '.tmp'; writeFileSync(tmp, JSON.stringify(data, null, 2)); renameSync(tmp, target); };
const conHistorial = (b: any, entrada: any) => [...(b.historial || []), { at: new Date().toISOString(), ...entrada }].slice(-30);
const cfgLi = () => config()?.linkedin || {};

// Tu perfil, como se ve arriba del post: `linkedin.cuenta` en la config o cuenta.json en la carpeta de LinkedIn.
function cuenta() {
  const c = { nombre: '', titular: '', avatar: null, pagina: '', ...(cfgLi().cuenta || {}), ...readJson(resolve(DIR(), 'cuenta.json'), {}) };
  if (c.avatar && !/^https?:/.test(c.avatar) && !plannerMediaPath(c.avatar)) c.avatar = null;
  return c;
}

const FB_FILE = /^[\w.-]+-planner\.json$/;
const feedbackDir = (id: string) => resolve(DIR(), 'feedback', id);
function feedback(id: string) {
  const dir = feedbackDir(id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => FB_FILE.test(f)).sort().map(f => ({ ...readJson(resolve(dir, f), {}), file: f }));
}
// La imagen se rehace en la misma ruta: con su fecha en la URL, el planner muestra la nueva sin recargar a mano.
const fechaImagen = (b: any) => { try { const p = b.imagen && plannerMediaPath(b.imagen); return p ? statSync(p).mtimeMs : null; } catch { return null; } };

function borradores() {
  const dir = resolve(DIR(), 'borradores');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json') && ID.test(f.slice(0, -5)))
    .map(f => { const b = readJson(resolve(dir, f), {}), id = f.slice(0, -5); return { ...b, id, feedback: feedback(id), imagen_v: fechaImagen(b) }; })
    .filter(b => typeof b.texto === 'string')
    .sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')) || String(b.creado || '').localeCompare(String(a.creado || '')));
}

export function linkedinData() {
  const radar = readJson(resolve(DIR(), 'prospectos.json'), { prospectos: [], descartes: [] });
  const estado = readJson(resolve(DIR(), 'estado.json'), {});
  const decisiones = estado.prospectos || {};
  // Los contactos para video van en su propio archivo: prospectos.py reescribe prospectos.json y no sabe de ellos.
  // Lo que cambia del video (pedido, en producción, listo, aprobado, notas) vive en estado.json → videos, sobre lo que trae contactos.json.
  const contactos = readJson(resolve(DIR(), 'contactos.json'), { contactos: [] });
  const videos = estado.videos || {};
  const todos = [...(Array.isArray(contactos.contactos) ? contactos.contactos.map((f: any) => ({ ...f, senal: 'contacto', video: { ...(f.video || {}), ...(videos[f.id] || {}) } })) : []),
    ...(Array.isArray(radar.prospectos) ? radar.prospectos.map((p: any) => videos[p.id] ? { ...p, video: videos[p.id] } : p) : [])];
  const prospectos = todos.filter((p: any) => p && ID.test(String(p.id || ''))).map((p: any) => ({ ...p, estado: decisiones[p.id]?.estado || 'nuevo', decision: decisiones[p.id] || null }));
  const refs = readJson(resolve(DIR(), 'referencias.json'), {});
  const posts = Array.isArray(refs) ? refs : Array.isArray(refs.posts) ? refs.posts : [];
  return {
    cuenta: cuenta(),
    radar: { actualizado: radar.actualizado || null, ventana_dias: radar.ventana_dias || null, paises: radar.paises || [],
      avisos_leidos: radar.avisos_leidos || 0, posteos_leidos: radar.posteos_leidos || 0, posteos_por_tipo: radar.posteos_por_tipo || {},
      creditos: radar.creditos || 0, descartes: radar.descartes || [] },
    prospectos,
    borradores: borradores(),
    referencias: { carpeta: rel(resolve(DIR(), 'referencias.json')), actualizado: Array.isArray(refs) ? null : refs.actualizado || null,
      fuente: Array.isArray(refs) ? null : refs.fuente || null, notas: Array.isArray(refs) ? null : refs.notas || null, posts },
    // Cuánto sale un video a medida con tus proveedores (`linkedin.video.costo_usd`), para mostrarlo antes de pedirlo.
    video: { costo_usd: Number(cfgLi().video?.costo_usd) > 0 ? Number(cfgLi().video.costo_usd) : null },
  };
}

// Videos a medida (skill video-a-medida): el panel deja el pedido y las notas en estado.json; los toma una sesión de Claude Code.
const EN_CURSO = new Set(['pedido', 'produciendo', 'corrigiendo']);
const CAMPOS_PROGRESO = ['estado', 'paso', 'run', 'archivo', 'guion', 'duracion_s', 'error', 'mensaje'];
function escribirVideo(id: string, cambio: (actual: any) => any) {
  const file = resolve(DIR(), 'estado.json');
  const est = readJson(file, {});
  est.videos = est.videos || {};
  est.videos[id] = cambio(est.videos[id] || {});
  writeJson(file, est);
  return est.videos[id];
}
const contactoDe = (id: string) => linkedinData().prospectos.find((p: any) => p.id === id);

function leerBorrador(id: string) {
  const file = resolve(DIR(), 'borradores', id + '.json');
  return { file, actual: existsSync(file) ? readJson(file, null) : null };
}

export function registerLinkedin(app: Hono) {
  app.get('/api/planner/linkedin', c => c.json(linkedinData()));

  // En qué quedó un prospecto. `nota` es opcional (por qué se descarta, qué contestó).
  app.post('/api/planner/linkedin/prospecto', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || '')) || !ESTADOS_PROSPECTO.has(body.estado)) return c.json({ error: 'Pedido inválido' }, 400);
    const file = resolve(DIR(), 'estado.json');
    const est = readJson(file, {});
    est.prospectos = est.prospectos || {};
    const antes = est.prospectos[body.id] || {};
    if (body.estado === 'nuevo') delete est.prospectos[body.id];
    else est.prospectos[body.id] = { ...antes, estado: body.estado, at: new Date().toISOString(),
      ...(body.nota !== undefined ? { nota: String(body.nota || '').slice(0, 500) } : {}),
      historial: conHistorial(antes, { estado: body.estado }) };
    writeJson(file, est);
    return c.json({ id: body.id, decision: est.prospectos[body.id] || null });
  });

  // Pedir los videos de los contactos elegidos. Lo que ya tiene video o está en curso se saltea: nunca se paga dos veces.
  app.post('/api/planner/linkedin/video/pedir', async c => {
    const body = await c.req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.filter((x: any) => ID.test(String(x))) : [];
    if (!ids.length) return c.json({ error: 'Elegí al menos un contacto' }, 400);
    const pedidos: string[] = [], salteados: string[] = [];
    for (const id of ids) {
      const f: any = contactoDe(id), v = f?.video || {};
      if (!f || EN_CURSO.has(v.estado) || (v.archivo && v.estado !== 'error')) { salteados.push(id); continue; }
      const conNotas = v.archivo && (v.notas || []).some((n: any) => !n.aplicada);
      escribirVideo(id, x => ({ ...x, estado: conNotas ? 'corrigiendo' : 'pedido', paso: null, error: null, pedido_at: new Date().toISOString() }));
      pedidos.push(id);
    }
    return c.json({ pedidos, salteados });
  });

  // Una nota sobre el video es también el OK para rehacerlo.
  app.post('/api/planner/linkedin/video/feedback', async c => {
    const body = await c.req.json().catch(() => ({}));
    const texto = String(body.texto || '').trim().slice(0, 2000);
    if (!ID.test(String(body.id || '')) || !texto) return c.json({ error: 'Escribí qué cambiarías' }, 400);
    const f: any = contactoDe(body.id);
    if (!f?.video?.archivo) return c.json({ error: 'Ese contacto todavía no tiene video' }, 404);
    if (EN_CURSO.has(f.video.estado)) return c.json({ error: 'Ese video ya se está rehaciendo' }, 409);
    return c.json({ video: escribirVideo(body.id, v => ({ ...v, run: v.run || f.video.run || null, estado: 'corrigiendo', paso: null, error: null, pedido_at: new Date().toISOString(), notas: [...(v.notas || []), { at: new Date().toISOString(), texto, aplicada: false }].slice(-30) })) });
  });

  app.post('/api/planner/linkedin/video/aprobar', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || ''))) return c.json({ error: 'Pedido inválido' }, 400);
    const f: any = contactoDe(body.id);
    if (!f?.video?.archivo) return c.json({ error: 'Ese contacto todavía no tiene video' }, 404);
    const aprobado = body.aprobado !== false;
    return c.json({ video: escribirVideo(body.id, v => ({ ...v, estado: aprobado ? 'aprobado' : 'listo', aprobado_at: aprobado ? new Date().toISOString() : null })) });
  });

  // Lo que reporta la producción (engine/linkedin/videos.py escribe lo mismo directo en estado.json, con el planner cerrado).
  // El archivo tiene que estar en tu carpeta de contenido o en la de publicar.
  app.post('/api/planner/linkedin/video/progreso', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || '')) || !contactoDe(body.id)) return c.json({ error: 'Pedido inválido' }, 400);
    if (body.archivo !== undefined) {
      const p = typeof body.archivo === 'string' && body.archivo ? resolve(paths().root, body.archivo) : '';
      if (!p || body.archivo.split(/[\\/]/).includes('..') || ![paths().root, paths().publish].some(r => within(r, p))) return c.json({ error: 'Archivo inválido' }, 400);
    }
    return c.json({ video: escribirVideo(body.id, v => {
      const n: any = { ...v };
      for (const k of CAMPOS_PROGRESO) if (body[k] !== undefined) n[k] = body[k];
      if (body.estado === 'listo') { n.version = (v.version || 1) + (v.notas?.some((x: any) => !x.aplicada) ? 1 : 0); n.notas = (v.notas || []).map((x: any) => ({ ...x, aplicada: true })); n.paso = null; n.error = null; n.listo_at = new Date().toISOString(); }
      return n;
    }) });
  });

  // Texto editado de un mini artículo. Si cambió en disco desde que se abrió (`editado`), no se pisa.
  app.post('/api/planner/linkedin/borrador', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || ''))) return c.json({ error: 'Borrador inválido' }, 400);
    const { file, actual } = leerBorrador(body.id);
    if (!actual) return c.json({ error: 'Ese borrador ya no está' }, 404);
    if (typeof body.texto !== 'string' || !body.texto.trim() || body.texto.length > MAX_TEXTO) return c.json({ error: 'El texto no es válido' }, 400);
    if (actual.estado === 'agendado' || actual.estado === 'publicado') return c.json({ error: 'Ya está en Postiz: pedile a Claude que lo cambie' }, 409);
    if (body.editado !== undefined && (actual.editado || null) !== (body.editado || null))
      return c.json({ error: 'Lo cambiaron mientras lo editabas. Recargá para ver la última versión.', borrador: { ...actual, id: body.id } }, 409);
    const next = { ...actual, texto: body.texto.replace(/\r\n/g, '\n'), editado: new Date().toISOString(), editado_por: 'usuario',
      historial: conHistorial(actual, { accion: 'texto', antes: actual.texto }) };
    writeJson(file, next);
    return c.json({ borrador: { ...next, id: body.id } });
  });

  // Feedback sobre un post, escrito o grabado: queda pendiente hasta que Claude Code lo aplica.
  app.post('/api/planner/linkedin/borrador/feedback', async c => {
    try {
      const raw = await c.req.json();
      if (!ID.test(String(raw?.id || '')) || !leerBorrador(raw.id).actual) return c.json({ error: 'Borrador inválido' }, 400);
      const body = validatePlannerFeedback(raw);
      if (!body.text && !body.audio) return c.json({ error: 'Escribí o grabá qué cambiarías' }, 400);
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
  app.post('/api/planner/linkedin/borrador/feedback/remove', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || '')) || !FB_FILE.test(String(body.file || ''))) return c.json({ error: 'Nota inválida' }, 400);
    const dir = feedbackDir(body.id), src = resolve(dir, body.file);
    if (!existsSync(src)) return c.json({ error: 'Esa nota ya no está.' }, 404);
    const nota = readJson(src, {});
    if (nota.estado === 'aplicado') return c.json({ error: 'Esa nota ya se aplicó.' }, 409);
    const trash = resolve(dir, '.borradas'); mkdirSync(trash, { recursive: true });
    if (nota.audio) { const a = resolve(paths().root, nota.audio); if (a.startsWith(dir + sep) && existsSync(a)) renameSync(a, resolve(trash, basename(a))); }
    renameSync(src, resolve(trash, body.file));
    return c.json({ feedback: feedback(body.id) });
  });

  // «Mandar a Claude»: las notas sin aplicar y las ediciones a mano sin aprender, en un mensaje para pegar en Claude Code. El planner no arranca a Claude por su cuenta.
  app.post('/api/planner/linkedin/borrador/feedback/copiar', async c => {
    const lista = borradores();
    const conNotas = lista.filter(b => b.feedback.some((n: any) => n.estado !== 'aplicado'));
    const editados = lista.filter(b => b.editado_por === 'usuario' && (!b.aprendido_en || b.aprendido_en < b.editado));
    if (!conNotas.length && !editados.length) return c.json({ error: 'No hay feedback ni ediciones para mandar.' }, 400);
    const titulo = conNotas.length === 1 && !editados.length ? `Corregir el post de LinkedIn ${nombreMensaje(conNotas[0].texto)}` : conNotas.length ? `Corregir ${cantidad(conNotas.length, 'post')} de LinkedIn` : `Aprender de ${cantidad(editados.length, 'edición', 'ediciones')} de LinkedIn`;
    const script = posix(relative(REPO_DIR, resolve(ENGINE_DIR, 'linkedin/posts.py')));
    const lineas = [tituloMensaje('Feedback', titulo), '', `Aplicá mi feedback de LinkedIn con la skill linkedin-posts (sección «Aplicar el feedback»). Corré \`python3 ${script} pendientes\` desde ${REPO_DIR}: transcribe los audios y junta todo.`, ''];
    for (const b of conNotas) {
      lineas.push(`- ${b.id} · «${String(b.texto).split('\n')[0].slice(0, 70)}»`);
      for (const n of b.feedback.filter((n: any) => n.estado !== 'aplicado')) lineas.push(`  · ${n.text ? `«${n.text}»` : ''}${n.audio ? `${n.text ? ' + ' : ''}audio ${n.audio}${n.audio_seconds ? ` (${Math.round(n.audio_seconds)} s)` : ''}` : ''}`);
    }
    if (editados.length) lineas.push('', `Ediciones a mano sin aprender: ${editados.map(b => b.id).join(', ')}.`);
    lineas.push('', 'Corregí texto o imagen de cada post según su nota, pasá lo que enseñe a la guía de la skill y marcá todo como aplicado. No programes nada.');
    const now = new Date().toISOString();
    for (const b of conNotas) for (const n of b.feedback.filter((n: any) => n.estado === 'pendiente')) {
      const f = resolve(feedbackDir(b.id), n.file); writeJson(f, { ...readJson(f, {}), estado: 'enviado', enviado_at: now });
    }
    return c.json({ prompt: lineas.join('\n') });
  });

  // Programar: el clic, con día y hora, es tu OK para esa publicación. engine/linkedin/agendar.py la pasa por la cola
  // (guarda el intento antes de enviarlo y no duplica) y deja el borrador como agendado.
  app.post('/api/planner/linkedin/borrador/programar', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || '')) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(body.cuando || ''))) return c.json({ error: 'Pedido inválido' }, 400);
    const { actual } = leerBorrador(body.id);
    if (!actual) return c.json({ error: 'Ese borrador ya no está' }, 404);
    if (actual.estado !== 'aprobado') return c.json({ error: 'Primero aprobalo' }, 409);
    if (!actual.imagen) return c.json({ error: 'Le falta la imagen' }, 409);
    const script = resolve(ENGINE_DIR, 'linkedin/agendar.py');
    const fallo = await new Promise<string | null>(ok => execFile(PYTHON, [script, body.id, '--cuando', body.cuando],
      { cwd: REPO_DIR, timeout: 300000, env: { ...process.env, PLANNER_CONFIG: CONFIG_PATH } },
      (error, _out, err) => ok(error ? (String(err || '').trim().split('\n').filter(Boolean).pop() || 'No se pudo programar. Volvé a intentar.') : null)));
    if (fallo) return c.json({ error: fallo.replace(/^error:\s*/i, '') }, 409);
    return c.json({ borrador: { ...leerBorrador(body.id).actual, id: body.id } });
  });

  app.post('/api/planner/linkedin/borrador/estado', async c => {
    const body = await c.req.json().catch(() => ({}));
    if (!ID.test(String(body.id || '')) || !ESTADOS_POST.has(body.estado)) return c.json({ error: 'Pedido inválido' }, 400);
    const { file, actual } = leerBorrador(body.id);
    if (!actual) return c.json({ error: 'Ese borrador ya no está' }, 404);
    if (actual.estado === 'agendado' || actual.estado === 'publicado') return c.json({ error: 'Ya está en Postiz: pedile a Claude que lo mueva' }, 409);
    const next: any = { ...actual, estado: body.estado, historial: conHistorial(actual, { accion: body.estado }) };
    if (body.motivo) next.motivo = String(body.motivo).slice(0, 300);
    if (body.estado === 'aprobado') next.aprobado = new Date().toISOString();
    writeJson(file, next);
    return c.json({ borrador: { ...next, id: body.id } });
  });
}
