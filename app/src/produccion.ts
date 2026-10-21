// Editor de producción de cada pieza de Guiones: el look del avatar y el tipo de título del gancho, además del estilo del
// B-roll (que vive en guiones.ts). Los dos van al plan.json de la pieza (`look` y `titulo_tipo`), que es lo que lee quien
// produce el video. Si la pieza ya tiene corte o final, queda una nota para rehacerlo, como al cambiar el estilo.
//
// Looks: una carpeta (guiones.looks en planner.config.json, por defecto <contenido>/looks) con una imagen o un video por
// look; looks.json en esa carpeta (opcional) les pone nombre, con qué combinan y cuál es el default. Títulos: los estilos
// de título que el planner sabe dibujar (TITULOS); guiones.titulos en la config puede sumar otros con su imagen.
import type { Hono } from 'hono';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { paths, CONFIG_PATH } from './config.ts';
import { ROOT, STATE, exec, fileRead, within, TYPES } from './publication-planner.ts';
import { guionesPlans, piezaEnPlan, writeJson, notaDeCambio, rel } from './guiones.ts';

const ELEGIDO = () => resolve(STATE(), 'guiones-produccion.json');
const LOOK_IMG = () => resolve(STATE(), 'cache/looks');
const IMG = /\.(jpe?g|png|webp)$/i, VID = /\.(mp4|mov|webm)$/i;

// Tipos de título que el planner dibuja con CSS sobre la muestra del estilo y el look (las clases están en guiones.css).
export const TITULOS = [
  { id: 'condensada-caja', clase: 't-condensada t-caja', nombre: 'Condensada en caja', nota: 'Letra alta y angosta sobre una caja del color de acento.' },
  { id: 'condensada', clase: 't-condensada', nombre: 'Condensada', nota: 'Letra alta y angosta, sin caja.' },
  { id: 'black-caja', clase: 't-black t-caja', nombre: 'Negrita en caja', nota: 'Letra ancha y pesada sobre caja.' },
  { id: 'black', clase: 't-black', nombre: 'Negrita', nota: 'Letra ancha y pesada, sin caja.' },
  { id: 'serif', clase: 't-serif', nombre: 'Serif editorial', nota: 'Serif itálica, tono de revista.' },
  { id: 'serif-caja', clase: 't-serif t-caja', nombre: 'Serif en caja', nota: 'Serif itálica sobre caja.' },
  { id: 'grotesk-resaltado', clase: 't-grotesk t-resaltado', nombre: 'Grotesk resaltado', nota: 'Sans geométrica con resaltador detrás.' },
  { id: 'bricolage', clase: 't-bricolage', nombre: 'Bricolage', nota: 'Sans con personalidad, en minúsculas.' },
  { id: 'mono', clase: 't-mono', nombre: 'Mono', nota: 'Letra de máquina, alineada a la izquierda.' },
];
// Los de la config: { id, nombre, nota?, imagen } con la imagen relativa a la carpeta de contenido.
function titulosConfig() {
  const cfg = fileRead(CONFIG_PATH, {}), xs = Array.isArray(cfg?.guiones?.titulos) ? cfg.guiones.titulos : [];
  return xs.filter((t: any) => t && typeof t.id === 'string' && typeof t.nombre === 'string').map((t: any) => {
    const img = typeof t.imagen === 'string' ? resolve(ROOT(), t.imagen) : null;
    return { id: t.id, nombre: t.nombre, nota: t.nota || '', imagen: img && within(ROOT(), img) && existsSync(img) ? rel(img) : null, clase: typeof t.clase === 'string' ? t.clase : null };
  });
}
const titulosTodos = () => [...TITULOS, ...titulosConfig()];
const tituloDe = (t: any) => Object.fromEntries(Object.entries({ id: t.id, nombre: t.nombre, clase: t.clase, imagen: t.imagen }).filter(([, v]) => v));

// Cada imagen o video de la carpeta de looks es un look; el nombre sale de looks.json o del archivo.
function looksLibrary() {
  const dir = paths().looks; if (!existsSync(dir)) return [];
  const meta = fileRead(resolve(dir, 'looks.json'), {}), usos = new Map<string, number>();
  for (const pl of guionesPlans()) for (const p of pl.data.piezas) { const id = p?.look?.id; if (id) usos.set(id, (usos.get(id) || 0) + 1); }
  return readdirSync(dir).filter(f => !f.startsWith('.') && (IMG.test(f) || VID.test(f))).sort().map(f => {
    const id = f.replace(/\.[^.]+$/, ''), m = meta[f] || meta[id] || {};
    const nombre = m.nombre || id.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
    return { id, nombre, combina: m.combina || '', archivo: rel(resolve(dir, f)), fuente: resolve(dir, f), usos: usos.get(id) || 0, default: !!m.default, prohibido: !!m.prohibido };
  }).filter(l => !l.prohibido);
}
const lookDe = (l: any) => ({ id: l.id, nombre: l.nombre, combina: l.combina || undefined, archivo: l.archivo });

async function lookImg(l: any) {
  const m = Math.round(statSync(l.fuente).mtimeMs), out = resolve(LOOK_IMG(), `${createHash('sha1').update(l.fuente + m).digest('hex').slice(0, 16)}.jpg`);
  if (existsSync(out)) return out;
  mkdirSync(LOOK_IMG(), { recursive: true });
  const tmp = out + '.' + randomUUID().slice(0, 6) + '.jpg';
  await exec('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...(VID.test(l.fuente) ? ['-ss', '1'] : []), '-i', l.fuente, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', '-threads', '2', tmp], { timeout: 30000 });
  renameSync(tmp, out);
  return out;
}

// Lo elegido en el planner manda mientras el plan siga con lo de antes o con lo elegido; con un tercero, ganó el plan.
export function conProduccion(p: any) {
  const ov = fileRead(ELEGIDO(), {})[p.run] || {}, out = { ...p };
  for (const k of ['look', 'titulo_tipo'] as const) {
    const o = ov[k]; if (!o) continue;
    const cur = p[k]?.id || null, de = o.de?.id || null;
    if (cur === de) out[k] = o.a;
    if (cur === de || cur === (o.a?.id || null)) out[k + '_antes'] = o.de ? { id: de, nombre: o.de.nombre || de } : { id: null, nombre: k === 'look' ? 'el del plan' : 'el del estilo' };
  }
  return out;
}

export function registerProduccion(app: Hono) {
  app.get('/api/planner/guiones/produccion', c => {
    const looks = looksLibrary().map(({ fuente: _f, ...l }: any) => ({ ...l, img: `/api/planner/guiones/looks/img?id=${encodeURIComponent(l.id)}` }));
    return c.json({ looks, titulos: titulosTodos(), carpeta_looks: rel(paths().looks) });
  });
  app.get('/api/planner/guiones/looks/img', async c => {
    const l = looksLibrary().find((x: any) => x.id === c.req.query('id'));
    if (!l) return c.text('No disponible', 404);
    try { return new Response(readFileSync(await lookImg(l)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } }); }
    catch {
      // Sin ffmpeg, una imagen se sirve tal cual.
      if (IMG.test(l.fuente)) return new Response(readFileSync(l.fuente), { headers: { 'Content-Type': TYPES[extname(l.fuente).toLowerCase()] || 'image/jpeg' } });
      return c.text('No disponible', 404);
    }
  });
  // Elegir el look o el título de una pieza. `valor: null` vuelve a lo del plan (en el título, a lo que diga el estilo).
  app.post('/api/planner/guiones/produccion', async c => {
    const body = await c.req.json().catch(() => null), campo = body?.campo as 'look' | 'titulo_tipo';
    const pick = guionesPlans().find(x => x.path === body?.plan), pz = pick?.data.piezas.find((x: any) => x.run === body?.run);
    if (!pz || !['look', 'titulo_tipo'].includes(campo) || pz.tipo === 'carrusel') return c.json({ error: 'Pieza inválida' }, 400);
    const idDe = (x: any) => x?.id || null;
    const todo = fileRead(ELEGIDO(), {}), ov = todo[body.run]?.[campo];
    const actual = conProduccion(pz)[campo] || null, original = ov && [idDe(ov.de), idDe(ov.a)].includes(idDe(pz[campo])) ? ov.de : (pz[campo] || null);
    let nuevo: any;
    if (body.valor === null || body.valor === idDe(original)) nuevo = original;
    else if (campo === 'look') { const l = looksLibrary().find((x: any) => x.id === body.valor); if (!l) return c.json({ error: 'Ese look no está en la carpeta de looks.' }, 400); nuevo = lookDe(l); }
    else { const t = titulosTodos().find(x => x.id === body.valor); if (!t) return c.json({ error: 'Ese título no está en el catálogo.' }, 400); nuevo = tituloDe(t); }
    if (idDe(actual) === idDe(nuevo)) return c.json({ ok: true, valor: actual });
    const { raw, target } = piezaEnPlan(pick, body.run);
    if (!target) return c.json({ error: 'El plan cambió mientras tanto. Recargá y volvé a elegir.' }, 409);
    if (nuevo) target[campo] = nuevo; else delete target[campo];
    writeJson(pick!.file, raw);
    if (idDe(nuevo) === idDe(original)) { if (todo[body.run]) { delete todo[body.run][campo]; if (!Object.keys(todo[body.run]).length) delete todo[body.run]; } }
    else todo[body.run] = { ...todo[body.run], [campo]: { de: original, a: nuevo, plan: pick!.path, pieza: pz.id, at: new Date().toISOString(), by: 'el planner' } };
    writeJson(ELEGIDO(), todo);
    const nombre = (x: any) => x?.nombre || idDe(x) || (campo === 'look' ? 'el del plan' : 'el del estilo');
    const que = campo === 'look' ? 'el look del avatar' : 'el título', ref = (x: any) => x ? { id: idDe(x), nombre: nombre(x) } : null;
    const nota = notaDeCambio(body.run, pz.id, campo === 'look' ? 'look' : 'titulo', ref(actual), ref(nuevo), `Cambiar ${que} a «${nombre(nuevo)}» (plan.json → ${campo}).`);
    return c.json({ ok: true, valor: nuevo, antes: ref(actual), nota: !!nota });
  });
}
