// Referencias: el research, el análisis, el filtro, la elección y el pedido a producción, en el planner.
// Cada semana investigada deja <referencias>/<lunes>/[<carpeta>/]referencias.json (lo arma Claude Code con la skill
// referencias, o engine/research/semana.py desde la base). El planner sólo lo lee. Lo que decidís (hacerla como reel o
// carrusel, clonarla o tomar el tema o el formato, pasarla, una nota) queda en <publicar>/.planner/referencias-estado.json, y
// «Pedir guiones» congela lo elegido en referencias-pedido-<id>.json con el mensaje para Claude Code.
// La Selección es un referencias.json más, en <referencias>/<lunes>/seleccion-<AAAAMMDD>/, con `seleccion` arriba y en cada
// referencia: los candidatos que propone Claude (hasta 20, de un top de 50), que el planner lee por su endpoint.
// La marca de la barra viaja como `perfil` (su slug, o «todas»): un documento con `marca` es de esa marca; sin `marca`, de todas.
import type { Hono } from 'hono';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { CONFIG_PATH, ENGINE_DIR, PYTHON, REPO_DIR, paths } from './config.ts';
import { fileRead, plannerMediaPath, ROOT, STATE } from './publication-planner.ts';
import { guionesPlans, rel, writeJson } from './guiones.ts';
import { cantidad, conTitulo, diaCorto, listaNatural, tieneTitulo, tituloMensaje } from './titulo-mensaje.ts';
import { base, clases, contenidosBase, contenidoPorId, contenidosDeCuenta, contenidosPorIds, cuentaDelPerfil, fichaDe, marcaNombre, perfilValido, puntajeContenido, registerCompetidores, slugMarca, taxonomia } from './competidores.ts';

const ESTADO = () => resolve(STATE(), 'referencias-estado.json');
const str = (v: unknown, max = 4000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;

export const COMO = ['reel', 'carrusel'] as const;
// Qué se toma de la referencia: todo en tu voz, el tema o la estructura.
export const TOMAR = ['recrear', 'idea', 'formato'] as const;
// Hasta dónde avanza el pedido sin volver a vos: guion solo, o guion y audio.
export const HASTA = ['guion', 'audio'] as const;
export const SEL_CANDIDATAS = 20, SEL_TOTAL = 50;
// En foco, lo que trae la base tiene que superar esto contra su mediana.
export const FOCO_MINX = 5;

// Una media de la referencia vale si está dentro de la carpeta de contenido (lo descargado para el análisis, por ejemplo).
function mediaOk(p: unknown) {
  if (typeof p !== 'string' || p.includes('..')) return null;
  return plannerMediaPath(p) ? p : null;
}

// La misma publicación con otra forma de URL (/reel/ o /p/, con o sin parámetros) es la misma referencia.
export function urlKey(u: unknown) {
  if (typeof u !== 'string' || !u) return '';
  try {
    const x = new URL(u.trim()), host = x.hostname.replace(/^(www|m|mobile)\./, '').replace('twitter.com', 'x.com');
    const ig = /^\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/.exec(x.pathname);
    if (host === 'instagram.com' && ig) return 'ig:' + ig[1];
    const tt = /\/video\/(\d+)/.exec(x.pathname);
    if (host.endsWith('tiktok.com') && tt) return 'tt:' + tt[1];
    const tw = /\/status\/(\d+)/.exec(x.pathname);
    if (host === 'x.com' && tw) return 'x:' + tw[1];
    const rd = /\/comments\/(\w+)/.exec(x.pathname);
    if (host.endsWith('reddit.com') && rd) return 'rd:' + rd[1];
    const yt = host === 'youtu.be' ? x.pathname.slice(1) : x.searchParams.get('v') || (/\/shorts\/([\w-]+)/.exec(x.pathname) || [])[1];
    if (host.endsWith('youtube.com') || host === 'youtu.be') return yt ? 'yt:' + yt : host + x.pathname;
    return host + x.pathname.replace(/\/$/, '');
  } catch { return u.trim(); }
}

// Los referencias.json de todas las semanas: <referencias>/<lunes>/referencias.json o <referencias>/<lunes>/<carpeta>/referencias.json.
export function referenciasDocs() {
  const dirBase = paths().referencias, out: any[] = [];
  if (!existsSync(dirBase)) return out;
  for (const week of readdirSync(dirBase)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) continue;
    const dir = resolve(dirBase, week);
    if (!statSync(dir).isDirectory()) continue;
    for (const sub of ['', ...readdirSync(dir).filter(x => !x.startsWith('.') && statSync(resolve(dir, x)).isDirectory())]) {
      const f = resolve(dir, sub, 'referencias.json');
      if (!existsSync(f)) continue;
      const d = fileRead(f, null);
      if (!d || !Array.isArray(d.referencias)) continue;
      out.push({ week: d.semana || week, perfil: d.marca ? slugMarca(d.marca) : 'todas', path: rel(f), referencias: d.referencias.length, mtime: statSync(f).mtimeMs, data: d });
    }
  }
  return out.sort((a, b) => a.week < b.week ? -1 : a.week > b.week ? 1 : b.mtime - a.mtime);
}
// Un documento sin marca se ve en todas; en «todas» se ven todos.
const docDe = (d: any, perfil: string) => perfil === 'todas' || d.perfil === 'todas' || d.perfil === perfil;

// Lo que ves de cada referencia. El archivo puede traer más campos: pasan sólo los que la vista usa, con las medias verificadas.
export function normRef(r: any, i: number) {
  const m = r?.metricas || {}, h = r?.hook || {}, f = r?.formato || {}, a = r?.analisis || {}, e = r?.encaje || {}, rec = r?.recomendacion || {}, med = r?.media || {};
  const laminas = (Array.isArray(med.laminas) ? med.laminas : []).map(mediaOk).filter(Boolean).slice(0, 20);
  // Lo de la Selección se identifica por su URL, como en la base: así es el mismo contenido, con la misma decisión y una sola
  // fila en la Bandeja, aunque el archivo le haya puesto otro id.
  const clave = r?.seleccion ? urlKey(r?.url) : '';
  return {
    id: (clave && clave.length <= 120 && clave) || str(r?.id, 120) || urlKey(r?.url) || `ref-${i + 1}`,
    url: str(r?.url, 600), red: str(r?.red, 20).toLowerCase(), origen: str(r?.origen, 40), origen_detalle: str(r?.origen_detalle, 200),
    tambien_en: Array.isArray(r?.tambien_en) ? r.tambien_en.filter((t: unknown) => typeof t === 'string').slice(0, 6) : [],
    cuenta: str(r?.cuenta, 120), seguidores: num(r?.seguidores), fecha: str(r?.fecha, 10), tipo: str(r?.tipo, 20) || 'reel', idioma: str(r?.idioma, 20),
    titulo: str(r?.titulo, 300), caption: str(r?.caption, 1200),
    media: { poster: mediaOk(med.poster), video: mediaOk(med.video), laminas },
    metricas: { vistas: num(m.vistas), likes: num(m.likes), comentarios: num(m.comentarios), guardados: num(m.guardados), compartidos: num(m.compartidos),
      multiplo: num(m.multiplo), mediana_cuenta: num(m.mediana_cuenta), base: str(m.base, 200), duracion_s: num(m.duracion_s ?? f.duracion_s) },
    hook: { texto: str(h.texto ?? (typeof r?.hook === 'string' ? r.hook : ''), 600), visual: str(h.visual, 900), tipo: str(h.tipo, 60), madlib: str(h.madlib, 400) },
    // fila y columna son la celda de una grilla de formatos (estructura × presentación).
    formato: { fila: str(f.fila, 40), columna: str(f.columna, 40), familia: str(f.familia, 60), estructura: str(f.estructura, 80), presentacion: str(f.presentacion, 80),
      propio: str(f.propio, 80), skill: str(f.skill, 60), detalle: str(f.detalle, 600), mecanismo: str(f.mecanismo, 300), estructura_txt: str(f.estructura_txt, 1200) },
    analisis: { idea: str(a.idea, 1200), por_que: str(a.por_que, 1600), mecanismo: str(a.mecanismo, 1600), copiar: str(a.copiar, 1200), no_copiar: str(a.no_copiar, 1200), twist: str(a.twist, 1200),
      creencia: str(a.creencia, 600), contraria: str(a.contraria, 600), transcripcion: str(a.transcripcion, 8000) },
    encaje: { pilar: str(e.pilar, 80), anillo: num(e.anillo), anillo_estimado: e.anillo_estimado === true, bucket: str(e.bucket, 80), bucket_estimado: e.bucket_estimado === true,
      oferta: str(e.oferta, 40), objetivo: str(e.objetivo, 40), comprador: str(e.comprador, 200) },
    veredicto: str(r?.veredicto, 40), score: num(r?.score),
    recomendacion: { como: (COMO as readonly string[]).includes(rec.como) ? rec.como : null, tomar: (TOMAR as readonly string[]).includes(rec.tomar) ? rec.tomar : null, nota: str(rec.nota, 1200) },
    estado_research: str(r?.estado, 80), tags: Array.isArray(r?.tags) ? r.tags.filter((t: unknown) => typeof t === 'string').slice(0, 12) : [],
    ...(r?.seleccion ? { seleccion: normSeleccion(r.seleccion) } : {}),
  };
}

// Lo que Claude dice de cada referencia de la Selección. Un valor fuera de las opciones no pasa. `mensaje` es a qué apunta
// (un producto, una oferta o «alcance»), en texto corto.
function normSeleccion(s: any) {
  const c = s?.como || {};
  return { puesto: num(s?.puesto), nivel: s?.nivel === 'candidata' ? 'candidata' : 'top', mensaje: str(s?.mensaje, 40).toLowerCase() || null,
    razon: str(s?.razon, 400), hook_es: str(s?.hook_es, 400), pieza: str(s?.pieza, 40) || null,
    como: { tomar: (TOMAR as readonly string[]).includes(c.tomar) ? c.tomar : null, reel_o_carrusel: (COMO as readonly string[]).includes(c.reel_o_carrusel) ? c.reel_o_carrusel : null, formato: str(c.formato, 80), detalle: str(c.detalle, 600) } };
}
const esSeleccion = (d: any) => !!d?.data?.seleccion && typeof d.data.seleccion === 'object';

// La Selección vigente de una marca: la del doc más nuevo que tenga `seleccion`, de cualquier fecha. Ordenada por puesto, con
// hasta 50 referencias y hasta 20 candidatas (las que sobran pasan a top). Null si todavía no hay.
export function seleccionVigente(perfil: string, docs = referenciasDocs()) {
  const cuando = (d: any) => String(d.data.generado || d.data.seleccion?.fecha || d.week);
  const d = docs.filter(x => esSeleccion(x) && (x.perfil === perfil || x.perfil === 'todas' || perfil === 'todas')).sort((a, b) => cuando(b).localeCompare(cuando(a)) || b.mtime - a.mtime)[0];
  if (!d) return null;
  const s = d.data.seleccion, vistas = new Set<string>(), refs: any[] = [];
  (d.data.referencias as any[]).forEach((r, i) => { const x: any = normRef(r, i); if (!vistas.has(x.id)) { vistas.add(x.id); refs.push({ ...x, seleccion: x.seleccion || normSeleccion(null), orden_doc: i }); } });
  refs.sort((a, b) => (a.seleccion.puesto ?? 1e6 + a.orden_doc) - (b.seleccion.puesto ?? 1e6 + b.orden_doc));
  let candidatas = 0;
  const referencias = refs.slice(0, SEL_TOTAL).map((x, i) => { const { orden_doc: _o, ...y } = x; y.seleccion.puesto ??= i + 1; if (y.seleccion.nivel === 'candidata' && ++candidatas > SEL_CANDIDATAS) y.seleccion.nivel = 'top'; return y; });
  return { doc: { semana: d.week, perfil, path: d.path, generado: d.data.generado || null, titulo: str(d.data.titulo, 200), fecha: str(s.fecha, 10) || String(d.data.generado || '').slice(0, 10), foco: str(s.foco, 600),
    pool: { revisadas: num(s.pool?.revisadas), filtradas: num(s.pool?.filtradas) }, motivos: (Array.isArray(s.motivos) ? s.motivos : []).map((m: unknown) => str(m, 300)).filter(Boolean).slice(0, 12) }, referencias };
}

// En foco: fuera queda lo que no pasaste vos y es de los anillos de afuera o de una cuenta fuera de nicho, y lo que trae la
// base sin superar ×5 su mediana. Lo tuyo y lo de la Selección entran siempre; la vista suma lo ya decidido, que tampoco se oculta.
export function enFoco(x: any) {
  if (x.fuentes?.includes('tuya') || x.origen === 'guardados' || x.origen === 'tuya' || x.seleccion) return true;
  if ((Number(x.clase?.anillo ?? x.encaje?.anillo) || 0) >= 4 || x.ficha?.rol === 'Fuera de nicho') return false;
  return !!x.fuentes?.includes('semana') || (x.base?.multiplo ?? x.metricas?.multiplo ?? 0) >= FOCO_MINX;
}

// Las referencias que cita una pieza de un plan de guiones (por `ref_ids` o por la URL de `referencias`/`fuentes`/`referencia`).
const clavesDePieza = (p: any) => new Set<string>([...(Array.isArray(p.ref_ids) ? p.ref_ids : []),
  ...(Array.isArray(p.referencias) ? p.referencias.map((x: any) => urlKey(typeof x === 'string' ? x : x?.url)) : []),
  ...(Array.isArray(p.fuentes) ? p.fuentes.map(urlKey) : []), urlKey(p.referencia?.url)].filter(Boolean));
// Está en producción si ya pasó el guion: algo aprobado, o ya tiene corte o final.
const hayCorte = (run: unknown) => { try { return typeof run === 'string' && readdirSync(resolve(ROOT(), run)).some(f => /^(rough_cut|final)([_-].*)?\.mp4$/.test(f)); } catch { return false; } };
// Las piezas que citan cada referencia, para ver qué ya se volvió guion y en qué estado está.
function usosPorReferencia() {
  const map = new Map<string, any[]>(), est = fileRead(resolve(STATE(), 'guiones-estado.json'), {});
  for (const pl of guionesPlans()) for (const p of pl.data.piezas || []) {
    const keys = clavesDePieza(p);
    if (!keys.size) continue;
    const st = est[p.run] || {}, uso = { id: p.id, titulo: p.titulo || p.hook || '', tipo: p.tipo === 'carrusel' ? 'carrusel' : 'reel', week: pl.week, perfil: pl.perfil, run: p.run || null,
      estado: st.descartado ? 'descartado' : st.pausado ? 'pausado' : st.estado === 'aprobado' ? 'aprobado' : 'en_guiones', produccion: st.estado === 'aprobado' || hayCorte(p.run) };
    for (const k of keys) map.set(k, [...(map.get(k) || []), uso]);
  }
  return map;
}
// Los planes de guiones de una marca: los de su subcarpeta (por slug) y los que no tienen subcarpeta; con «todas», todos.
const planDe = (pl: any, perfil: string) => perfil === 'todas' || !pl.perfil || slugMarca(pl.perfil) === perfil || slugMarca(pl.data?.marca) === perfil;

// La decisión es de la marca y la referencia, no de la semana: `perfil|id`.
const estadoKey = (perfil: string, id: string) => `${perfil}|${id}`;
export function decisionDe(estado: Record<string, any>, perfil: string, id: string) {
  return estado[estadoKey(perfil, id)] || null;
}
// Las decisiones de una marca, con su id.
const decisionesDe = (estado: Record<string, any>, perfil: string) => Object.entries(estado).filter(([k, d]) => d && k.startsWith(perfil + '|')).map(([k, d]) => [k.slice(perfil.length + 1), d] as [string, any]);
const enRango = (d: string, r?: { desde: string; hasta: string }) => !r || (!!d && d >= r.desde && d <= r.hasta);

// Lo que la Bandeja y la Selección le agregan a cada referencia: su decisión, sus usos en Guiones, su cuenta, su clase, su
// puntaje (viralidad por encaje con el nicho, competidores.ts), si está en foco y su lugar en la Selección.
function adornador(perfil: string, seleccion?: Map<string, any>) {
  const estado = fileRead(ESTADO(), {}), usos = usosPorReferencia(), cl = clases();
  return (x: any, orden: number) => { const ficha = fichaDe(x.red, x.cuenta), m = x.base || x.metricas || {}, clase = cl.get(x.id) || null;
    const p = puntajeContenido(m.multiplo, m.vistas, m.likes, Number(clase?.anillo ?? x.encaje?.anillo) || null, ficha?.relevancia);
    const sel = x.seleccion || seleccion?.get(x.id) || null;
    const y = { ...x, orden, ficha, clase, puntaje: p.puntaje, puntaje_det: p, decision: decisionDe(estado, perfil, x.id), analizada: analizadaDe(x.id), ...(sel ? { seleccion: sel } : {}),
      usos: [...new Map([...(usos.get(x.id) || []), ...(usos.get(urlKey(x.url)) || [])].map(p => [p.week + p.perfil + p.id, p])).values()] };
    return { ...y, en_foco: enFoco(y) }; };
}

export function validateDecision(body: any) {
  if (!body || (body.week != null && (typeof body.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.week))) || typeof body.perfil !== 'string' || !/^[a-z0-9-]{1,60}$/.test(body.perfil) || typeof body.id !== 'string' || !body.id || body.id.length > 120) throw new Error('Referencia inválida');
  if (!['adaptar', 'descartar', 'quitar', 'nota'].includes(body.decision)) throw new Error('Decisión inválida');
  if (body.decision === 'adaptar' && ((body.como != null && !(COMO as readonly string[]).includes(body.como)) || (body.tomar != null && !(TOMAR as readonly string[]).includes(body.tomar)))) throw new Error('Elegí reel o carrusel y qué tomar.');
  // Por qué no interesa, opcional: el tema, el formato, difícil de hacer o ya visto.
  if (body.motivo != null && !['tema', 'formato', 'dificil', 'visto'].includes(body.motivo)) throw new Error('Motivo inválido');
  const nota = typeof body.nota === 'string' ? body.nota.trim() : undefined;
  if (nota !== undefined && nota.length > 4000) throw new Error('La nota es demasiado larga.');
  return { week: body.week || null, motivo: body.decision === 'descartar' ? body.motivo || null : null, perfil: body.perfil, id: body.id, decision: body.decision, como: body.como || null, tomar: body.tomar || null, nota };
}

// Los valores internos son recrear, idea y formato.
const TOMAR_TXT: Record<string, string> = { recrear: 'Clonarla: mismo gancho, misma visual y mismo contenido, en tu voz y en tu idioma. El gancho va exacto (traducido si hace falta), la visual es la misma y lo que se dice es lo mismo; el desarrollo se puede adaptar un poco', idea: 'Sólo el tema: hablamos de lo mismo, con otro formato tuyo', formato: 'Sólo el formato: su estructura y su gancho, con un tema tuyo' };
// Lo elegido sin reel o carrusel ni qué tomar sale con los defaults: clonarla, en el formato del original. Lo mismo hace «Hacer» en la vista.
const conDefaults = (st: any, ref: any) => ({ como: st?.como || ref?.seleccion?.como?.reel_o_carrusel || (ref?.tipo === 'carrusel' ? 'carrusel' : 'reel'), tomar: st?.tomar || ref?.seleccion?.como?.tomar || 'recrear' });
const n = (v: number | null) => v == null ? null : v >= 1e6 ? (Math.round(v / 1e5) / 10).toString().replace('.', ',') + ' M' : v >= 1e4 ? Math.round(v / 1e3) + ' mil' : String(v);
const quienDe = (perfil: string) => perfil === 'todas' ? '' : marcaNombre(perfil);

// «Armar 3 reels y 1 carrusel de Mi Marca para la semana del 9 nov».
const pedidoTitulo = (perfil: string, semana: string, comos: string[]) => {
  const reels = comos.filter(c => c === 'reel').length, carruseles = comos.length - reels, q = quienDe(perfil);
  return tituloMensaje('Planificación', `Armar ${listaNatural([reels ? cantidad(reels, 'reel') : '', carruseles ? cantidad(carruseles, 'carrusel', 'carruseles') : ''].filter(Boolean))}${q ? ` de ${q}` : ''} para la semana del ${diaCorto(semana)}`);
};

export function pedidoPrompt(id: string, file: string, doc: any, sel: any[], hasta: string) {
  const perfil = doc.perfil, quien = quienDe(perfil), lines: string[] = [];
  let k = 0;
  for (const como of COMO) {
    const xs = sel.filter(s => s.como === como);
    if (!xs.length) continue;
    lines.push('', `## ${como === 'reel' ? 'Reels' : 'Carruseles'} (${xs.length})`);
    for (const s of xs) {
      const r = s.ref, m = r.metricas;
      k++;
      lines.push(`${k}. «${r.hook.texto || r.titulo || r.url}» · ${[r.cuenta, r.red, r.tipo, m.vistas != null && `${n(m.vistas)} vistas`, m.vistas == null && m.likes != null && `${n(m.likes)} likes`, m.multiplo != null && `×${String(m.multiplo).replace('.', ',')} su mediana`].filter(Boolean).join(' · ')}`,
        `   ${r.url}`, `   ${TOMAR_TXT[s.tomar]}.`);
      const e = r.seleccion;
      if (e?.hook_es && e.hook_es !== r.hook.texto) lines.push(`   El gancho en tu idioma: «${e.hook_es}»`);
      if (e?.razon) lines.push(`   Por qué la elegiste: ${e.razon}`);
      if (e?.como?.formato || e?.como?.detalle) lines.push(`   Cómo la harías: ${[e.como.formato, e.como.detalle].filter(Boolean).join(' · ')}`);
      const f = r.ficha;
      if (f) lines.push(`   La cuenta: ${[f.rol || f.tipo, f.formato_principal, f.que_tomar && `qué tomar: ${f.que_tomar}`].filter(Boolean).join(' · ')}`);
      if (!r.analisis?.por_que && !r.hook?.texto) lines.push('   Sin análisis todavía: mirá el video o las láminas antes de escribir (engine/research/analizar.py lo hace si hay GEMINI_API_KEY).');
      if (s.nota) lines.push(`   Mi nota: «${s.nota}»`);
      if (r.formato.propio || r.formato.skill) lines.push(`   Formato propio sugerido: ${[r.formato.propio, r.formato.skill && `skill ${r.formato.skill}`].filter(Boolean).join(' · ')}`);
      if (r.analisis.por_que) lines.push(`   Por qué: ${r.analisis.por_que}`);
      lines.push(`   ref_id: ${r.id}`);
    }
  }
  const sub = perfil === 'todas' ? '' : `${perfil}/`;
  return [
    pedidoTitulo(perfil, doc.semana, sel.map(s => s.como)),
    '',
    `Pedido desde el planner (pestaña Referencias): adaptar ${sel.length} referencia${sel.length === 1 ? '' : 's'} para la semana del ${doc.semana}${quien ? ` de ${quien}` : ''}.`,
    '',
    `Carpeta de contenido: ${ROOT()}`,
    `Planner: ${REPO_DIR}`,
    doc.path ? `Referencias: ${doc.path} (hook, formato, análisis y media de cada una)` : 'Referencias: base de competidores (radar.db, skill competidores); cada una con su cuenta y su múltiplo arriba.',
    ...(doc.seleccion_path && sel.some(s => s.ref.seleccion) ? [`Selección: ${doc.seleccion_path} (la curaduría de la semana: su foco y por qué cada una)`] : []),
    `Pedido congelado: ${file}`,
    ...lines,
    '',
    'Cómo seguir:',
    `- Seguí ${resolve(REPO_DIR, '.claude/skills/guiones/SKILL.md')} y el análisis de cada referencia${doc.path ? ' en el archivo de arriba' : ''}. Mirá la media antes de escribir.`,
    `- Cada pieza entra al plan de guiones de esa semana (${rel(paths().guiones)}/${doc.semana}/${sub}plan.json) con su carpeta. Si el plan ya existe, sumá piezas con ids nuevos sin tocar las que ya tienen audio, corte o aprobación.`,
    '- En cada pieza poné `ref_ids` con el ref_id de su referencia, `referencias` con la URL y la cuenta, y `referencia` (url, cuenta, vistas, multiplo, tomar, hook_original): así el planner la muestra como usada en la pestaña Referencias, en «Por qué» y en su tarjeta de Guiones.',
    '- Clonar es seguirla al pie de la letra: el gancho va exacto, traducido si hace falta; la visual es la misma y lo que se dice es lo mismo; el desarrollo se puede adaptar un poco. No se nombra la cuenta de referencia.',
    hasta === 'audio'
      ? '- Escribí el guion de cada reel y generá su audio con la voz que uso. Frená ahí: nada de imagen ni video pago hasta que apruebe el audio en la pestaña Guiones.'
      : '- Frená en el guion: escribí guion.txt de cada reel y el texto de cada carrusel, sin generar voz. Lo reviso en la pestaña Guiones.',
    '- Antes de cualquier generación paga, avisame cuánto cuesta.',
    '- Al terminar, en el pedido congelado poné estado «aplicado», aplicado_at y por cada referencia el id de la pieza que salió.',
    '- No agendes, muevas ni publiques nada.',
  ].join('\n');
}

// El análisis de lo que marcás «Hacer»: el planner deja la referencia en una cola y corre engine/research/analizar.py en
// segundo plano; el script baja el video (ScrapeCreators), lo mira con Gemini y deja la transcripción, el gancho y la idea en
// <research>/analizadas/<id>.json. Sin las claves, la cola espera y el pedido avisa que falta el análisis.
const COLA = () => resolve(STATE(), 'referencias-analizar.json');
const archivoAnalisis = (id: string) => resolve(paths().research, 'analizadas', id.replace(/[^\w-]/g, '_') + '.json');
const vacio = (a: any) => !a || !Object.values(a).some(v => String(v || '').trim());
function analizadaDe(id: string) {
  if (existsSync(archivoAnalisis(id))) return 'lista';
  return (fileRead(COLA(), { pendientes: [] }).pendientes || []).some((x: any) => x.id === id) ? 'en_cola' : null;
}
function conAnalisis(r: any) {
  if (r.analizada !== 'lista' || !vacio(r.analisis)) return r;
  const a = fileRead(archivoAnalisis(r.id), null); if (!a) return r;
  const m = { ...r.media }; if (!m.video && mediaOk(a.media?.video)) m.video = a.media.video; if (!m.poster && mediaOk(a.media?.poster)) m.poster = a.media.poster;
  return { ...r, hook: { ...r.hook, ...(a.hook || {}) }, analisis: { ...r.analisis, ...(a.analisis || {}) }, media: m, analizada_at: a.analizado_at || null };
}
let analisisTimer: ReturnType<typeof setTimeout> | null = null;
function encolarAnalisis(r: any, perfil: string) {
  if (!r?.url || existsSync(archivoAnalisis(r.id)) || !vacio(r.analisis)) return false;
  const cola = fileRead(COLA(), { pendientes: [] }); cola.pendientes = cola.pendientes || [];
  if (!cola.pendientes.some((x: any) => x.id === r.id)) { cola.pendientes.push({ id: r.id, url: r.url, red: r.red, perfil, at: new Date().toISOString() }); writeJson(COLA(), cola); }
  // Unos segundos de espera juntan varios «Hacer» seguidos en una sola corrida.
  if (analisisTimer) clearTimeout(analisisTimer);
  analisisTimer = setTimeout(() => {
    analisisTimer = null;
    const script = resolve(ENGINE_DIR, 'research/analizar.py');
    if (!existsSync(script) || process.env.PLANNER_SIN_ANALISIS) return;
    try { spawn(PYTHON, [script, '--cola'], { cwd: REPO_DIR, env: { ...process.env, PLANNER_CONFIG: CONFIG_PATH }, detached: true, stdio: 'ignore' }).unref(); } catch { /* la próxima elección lo retoma */ }
  }, 20000);
  analisisTimer.unref?.();
  return true;
}

export function registerReferencias(app: Hono) {
  // La Bandeja: lo que entró en un rango de fechas: el research armado en esas fechas (referencias.json, por la fecha en que se
  // generó) y lo que la base de competidores encontró en esas fechas (outliers de los últimos `dias` sobre `minx` veces su
  // mediana, y lo que pasaste vos), sin repetir el mismo contenido. Lo ya decidido se ve siempre. Sin `desde` y `hasta`, todo;
  // con `week`, el research de esa semana.
  app.get('/api/planner/referencias', c => {
    const docs = referenciasDocs(), perfil = perfilValido(c.req.query('perfil')), week = c.req.query('week') || '';
    const dias = Math.min(400, Math.max(1, num(c.req.query('dias')) ?? 14)), minx = Math.min(1000, Math.max(0, num(c.req.query('minx')) ?? 2));
    const fecha = (v?: string) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v! : '', desde = fecha(c.req.query('desde')), hasta = fecha(c.req.query('hasta'));
    const rango = desde && hasta ? { desde, hasta } : undefined;
    // La Selección no es research: tiene su sección y su endpoint. Lo elegido ahí se ve en la Bandeja una sola vez, en su fila
    // de siempre y con su marca, porque se identifica por la URL como el resto.
    const research = docs.filter(d => !esSeleccion(d));
    const weeks = research.map(d => ({ week: d.week, perfil: d.perfil, referencias: d.referencias, path: d.path, generado: d.data.generado || null }));
    const entroDoc = (d: any) => String(d.data.generado || d.week).slice(0, 10);
    const enFecha = week && !rango ? research.filter(d => d.week === week) : research.filter(d => enRango(entroDoc(d), rango)), elegidos = enFecha.filter(d => docDe(d, perfil));
    // Cada referencia se ve en la marca de su cuenta, venga del research que venga. Una cuenta que no está en la base sigue en
    // la marca de su research; lo que pasaste vos se ve siempre.
    const deEstePerfil = (x: any, d: any) => { const f = fichaDe(x.red, x.cuenta); return f ? (x.origen === 'guardados' || x.origen === 'tuya' || cuentaDelPerfil(f, perfil)) : docDe(d, perfil); };
    const lista = new Map<string, any>();
    // El research más nuevo primero: si una referencia vino en dos semanas, queda la última lectura.
    for (const d of [...enFecha].reverse()) (d.data.referencias || []).forEach((r: any, i: number) => { const x = normRef(r, i); if (!lista.has(x.id) && deEstePerfil(x, d)) lista.set(x.id, { ...x, fuentes: ['semana'], entro: entroDoc(d), semana_research: d.week }); });
    for (const x of contenidosBase(dias, minx, urlKey, rango, perfil)) {
      const prev = lista.get(x.id);
      if (!prev) { lista.set(x.id, { ...x, fuentes: [x.origen === 'tuya' ? 'tuya' : 'base'] }); continue; }
      prev.fuentes.push(x.origen === 'tuya' ? 'tuya' : 'base');
      prev.base = { multiplo: x.metricas.multiplo, base: x.metricas.base, vistas: x.metricas.vistas, likes: x.metricas.likes, pautado: x.pautado, medido: x.medido, corridas: x.corridas };
      if (!prev.media.poster && !prev.media.video) prev.media.poster = x.media.poster;
    }
    const estado = fileRead(ESTADO(), {}), vigente = seleccionVigente(perfil, docs), marcas = new Map<string, any>((vigente?.referencias || []).map((x: any) => [x.id, x.seleccion]));
    // Lo ya decidido se ve aunque haya entrado fuera del rango: el research de cualquier fecha, la Selección o la base.
    const todas = new Map<string, any>(); for (const d of docs) (d.data.referencias || []).forEach((r: any, i: number) => { const x = normRef(r, i); todas.set(x.id, { ...x, entro: entroDoc(d), semana_research: d.week }); });
    for (const [id] of decisionesDe(estado, perfil)) {
      if (lista.has(id)) continue;
      const x = todas.get(id) || contenidoPorId(id, urlKey);
      if (x) lista.set(x.id, { ...x, fuentes: [todas.has(id) ? 'semana' : x.origen === 'tuya' ? 'tuya' : 'base'], fuera_de_ventana: true });
    }
    const referencias = [...lista.values()].map(adornador(perfil, marcas)).map(conAnalisis);
    const b = base();
    // La lectura del research de cada semana que entró en el rango, la más nueva primero.
    const lecturas = [...elegidos].reverse().map(d => ({ semana: d.week, path: d.path, generado: d.data.generado || null, titulo: d.data.titulo || '', lectura: d.data.lectura || null }));
    const pick = elegidos[elegidos.length - 1], dd = pick?.data || {};
    const doc = pick ? { semana: pick.week, perfil, path: pick.path || null, generado: dd.generado || null, titulo: dd.titulo || '', lectura: lecturas.flatMap(l => l.lectura || []), fuentes: dd.fuentes || null, diana: dd.diana || null, formatos: dd.formatos || null } : null;
    return c.json({ weeks, doc, lecturas, rango: rango || null, referencias, taxonomia: taxonomia(), base: { disponible: b.disponible, ultima_medicion: b.ultima_medicion, dias, minx } });
  });
  // La Selección de la marca, con cada referencia adornada igual que en la Bandeja: lo que propuso Claude (la curaduría
  // vigente, si hay), lo que tocaste con Hacer y lo que ya es pieza en los planes de la marca. No depende de las fechas de la
  // Bandeja. Si el archivo no trae el análisis o la métrica, se completan con lo que dicen el research y la base.
  app.get('/api/planner/referencias/seleccion', c => {
    const perfil = perfilValido(c.req.query('perfil')), docs = referenciasDocs(), vigente = seleccionVigente(perfil, docs);
    const research = new Map<string, any>();
    for (const d of docs.filter(x => !esSeleccion(x))) (d.data.referencias || []).forEach((r: any, i: number) => { const x = normRef(r, i); research.set(x.id, x); });
    const delDoc = new Set<string>((vigente?.referencias || []).map((x: any) => x.id)), estado = fileRead(ESTADO(), {}), piezas = guionesPlans().filter(pl => planDe(pl, perfil)).reverse();
    // Lo elegido y después descartado sigue acá, plegado, para poder recuperarlo.
    const otras = new Set<string>([...decisionesDe(estado, perfil).filter(([, d]) => d?.decision === 'adaptar' || d?.antes).map(([id]) => id),
      ...piezas.flatMap(pl => (pl.data.piezas || []).flatMap((p: any) => [...clavesDePieza(p)]))].filter(id => !delDoc.has(id)));
    const deBase = contenidosPorIds([...delDoc, ...otras], urlKey);
    const completa = (x: any) => { const r = research.get(x.id), b = deBase.get(x.id), med = x.media.poster || x.media.video || x.media.laminas.length ? x.media : r?.media?.poster || r?.media?.video ? r.media : { ...x.media, poster: b?.media.poster || null };
      const fuentes = ['semana', ...(x.origen === 'tuya' ? ['tuya'] : [])];
      return { ...x, media: med, fuentes, hook: x.hook.texto || !r ? x.hook : r.hook, analisis: vacio(x.analisis) && r ? r.analisis : x.analisis, formato: x.formato.propio || x.formato.familia || !r ? x.formato : r.formato,
        metricas: x.metricas.vistas != null || x.metricas.multiplo != null || !r ? x.metricas : r.metricas,
        ...(b ? { base: { multiplo: b.metricas.multiplo, base: b.metricas.base, vistas: b.metricas.vistas, likes: b.metricas.likes, pautado: b.pautado, medido: b.medido, corridas: b.corridas } } : {}) }; };
    const adornar = adornador(perfil);
    // Si Claude dice qué pieza salió de una referencia, cuenta como usada aunque el plan no la cite.
    const propuestas = (vigente?.referencias || []).map(completa).map(adornar).map(conAnalisis).map((x: any) => {
      const id = x.seleccion.pieza; if (!id || x.usos.some((u: any) => u.id === id)) return x;
      const pl = piezas.find(l => (l.data.piezas || []).some((p: any) => p.id === id)), p = pl && (pl.data.piezas || []).find((y: any) => y.id === id);
      return p ? { ...x, usos: [...x.usos, { id: p.id, titulo: p.titulo || p.hook || '', tipo: p.tipo === 'carrusel' ? 'carrusel' : 'reel', week: pl.week, perfil: pl.perfil, run: p.run || null, estado: 'en_guiones', produccion: hayCorte(p.run) }] } : x; });
    const resto = [...otras].map(id => { const r = research.get(id), b = deBase.get(id) || (r ? null : contenidoPorId(id, urlKey)); return r ? { ...completa(r), fuentes: ['semana'] } : b ? { ...b, fuentes: [b.origen === 'tuya' ? 'tuya' : 'base'] } : null; })
      .filter(Boolean).map(adornar).map(conAnalisis);
    return c.json({ seleccion: vigente?.doc || null, referencias: [...propuestas, ...resto], taxonomia: taxonomia() });
  });
  // Los pedidos congelados de una semana y una marca, del más nuevo al más viejo.
  app.get('/api/planner/referencias/pedidos', c => {
    const week = c.req.query('week') || '', perfil = c.req.query('perfil') || '';
    const out = existsSync(STATE()) ? readdirSync(STATE()).filter(f => /^referencias-pedido-[\w-]+\.json$/.test(f)).map(f => fileRead(resolve(STATE(), f), null)).filter(Boolean)
      .filter((p: any) => (!week || p.semana === week) && (!perfil || p.perfil === perfil))
      .map((p: any) => ({ id: p.id, estado: p.estado || 'pendiente', created_at: p.created_at, aplicado_at: p.aplicado_at || null, hasta: p.hasta, semana: p.semana, perfil: p.perfil,
        path: rel(resolve(STATE(), `referencias-pedido-${p.id}.json`)), piezas: (p.piezas || []).map((x: any) => ({ ref_id: x.ref_id, url: x.url, como: x.como, tomar: x.tomar, pieza: x.pieza || null })), prompt: !p.prompt ? '' : tieneTitulo(p.prompt) ? p.prompt : conTitulo(pedidoTitulo(p.perfil, p.semana, (p.piezas || []).map((x: any) => x.como)), p.prompt) })) : [];
    return c.json({ pedidos: out.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at))) });
  });
  app.post('/api/planner/referencias/decision', async c => {
    let b; try { b = validateDecision(await c.req.json()); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
    const enDocs = referenciasDocs().some(d => d.data.referencias.some((r: any, i: number) => normRef(r, i).id === b.id));
    if (!enDocs && !contenidoPorId(b.id, urlKey)) return c.json({ error: 'No encuentro esa referencia.' }, 404);
    const estado = fileRead(ESTADO(), {}), key = estadoKey(b.perfil, b.id), prev = decisionDe(estado, b.perfil, b.id) || {}, at = new Date().toISOString();
    // Descartar recuerda si estaba para hacer o pedida, y Recuperar la deja como estaba: una pedida no vuelve a pedirse.
    const { antes: antesPrev, ...sinAntes } = prev, antes = prev.decision === 'adaptar' ? { como: prev.como ?? null, tomar: prev.tomar ?? null, pedido: prev.pedido || null } : antesPrev;
    if (b.decision === 'quitar') { if (prev.decision === 'descartar' && antesPrev) estado[key] = { ...sinAntes, ...antesPrev, decision: 'adaptar', motivo: null, at }; else if (prev.nota) estado[key] = { nota: prev.nota, at }; else delete estado[key]; }
    else if (b.decision === 'nota') { if (b.nota) estado[key] = { ...prev, nota: b.nota, at }; else { const { nota: _n, ...r } = prev; if (r.decision) estado[key] = { ...r, at }; else delete estado[key]; } }
    else estado[key] = { ...sinAntes, ...(b.decision === 'descartar' && antes ? { antes } : {}), decision: b.decision, como: b.decision === 'adaptar' ? b.como : null, tomar: b.decision === 'adaptar' ? b.tomar : null, motivo: b.decision === 'descartar' ? b.motivo || (prev.decision === 'descartar' ? prev.motivo || null : null) : null, ...(b.nota !== undefined ? { nota: b.nota } : {}), at, by: 'el planner', pedido: b.decision === 'adaptar' && prev.decision === 'adaptar' && prev.como === b.como && prev.tomar === b.tomar ? prev.pedido || null : null };
    writeJson(ESTADO(), estado);
    if (b.decision === 'adaptar' && prev.decision !== 'adaptar') {
      const r = referenciasDocs().reverse().flatMap(d => (d.data.referencias || []).map((x: any, i: number) => normRef(x, i))).find((x: any) => x.id === b.id) || contenidoPorId(b.id, urlKey);
      encolarAnalisis(r, b.perfil);
    }
    return c.json({ ok: true, decision: estado[key] || null, analizada: analizadaDe(b.id) });
  });
  // «Pedir guiones»: congela las elegidas que todavía no se pidieron y devuelve el mensaje para Claude Code.
  app.post('/api/planner/referencias/pedido', async c => {
    const body = await c.req.json().catch(() => null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.week || '') || !/^[a-z0-9-]{1,60}$/.test(body?.perfil || '')) return c.json({ error: 'Semana o marca inválidas.' }, 400);
    // La semana del pedido es a la que van los guiones; las elegidas son de la marca, de cualquier fecha.
    const delPerfil = referenciasDocs().filter(d => docDe(d, body.perfil)), research = delPerfil.filter(d => !esSeleccion(d)), doc = research.filter(d => d.week === body.week).pop() || research[research.length - 1] || null, vigente = seleccionVigente(body.perfil, delPerfil);
    const hasta = (HASTA as readonly string[]).includes(body?.hasta) ? body.hasta : 'guion';
    const estado = fileRead(ESTADO(), {}), incluir = body?.todas === true;
    const refs = new Map<string, any>(); for (const d of referenciasDocs().filter(x => !esSeleccion(x))) (d.data.referencias || []).forEach((r: any, i: number) => { const x = normRef(r, i); refs.set(x.id, { ...x, orden: i }); });
    // Las de la Selección van primero y con lo que dijo Claude de cada una; si también están en el research, conservan su análisis.
    (vigente?.referencias || []).forEach((x: any) => { const prev = refs.get(x.id); refs.set(x.id, { ...(prev || x), seleccion: x.seleccion, orden: x.seleccion.puesto - 1000 }); });
    // Lo que ya es pieza en Guiones no se vuelve a pedir (salvo que se pidan todas de nuevo). Si esa pieza se descartó, se
    // puede volver a pedir.
    const usos = usosPorReferencia();
    const sel = decisionesDe(estado, body.perfil).filter(([id, st]) => st?.decision === 'adaptar' && (incluir || (!st.pedido && !usos.get(id)?.some((u: any) => u.estado !== 'descartado'))))
      .map(([id, st]) => { const ref = refs.get(id) || contenidoPorId(id, urlKey);
        return ref ? { ref: conAnalisis({ ...ref, analizada: analizadaDe(id), ficha: fichaDe(ref.red, ref.cuenta) }), ...conDefaults(st, ref), nota: st.nota || '', orden: refs.has(id) ? refs.get(id).orden : 1e6 } : null; })
      .filter(Boolean).sort((a: any, b: any) => a.orden - b.orden) as any[];
    if (!sel.length) return c.json({ error: 'No hay nada elegido para pedir: tocá Hacer en alguna referencia.' }, 400);
    const id = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 6), abs = resolve(STATE(), `referencias-pedido-${id}.json`), file = rel(abs);
    const d = { ...(doc?.data || {}), path: doc?.path || null, seleccion_path: vigente?.doc.path || null, semana: body.week, perfil: body.perfil };
    const prompt = pedidoPrompt(id, file, d, sel, hasta);
    writeJson(abs, { id, estado: 'pendiente', created_at: new Date().toISOString(), by: 'el planner', semana: body.week, perfil: body.perfil, marca: quienDe(body.perfil) || null, referencias_path: doc?.path || null, hasta,
      piezas: sel.map((s: any) => ({ ref_id: s.ref.id, url: s.ref.url, cuenta: s.ref.cuenta, como: s.como, tomar: s.tomar, nota: s.nota, hook: s.ref.hook.texto || s.ref.titulo, formato: s.ref.formato, pieza: null })), prompt });
    if (body?.marcar !== false) {
      const at = new Date().toISOString();
      for (const s of sel) { const key = estadoKey(body.perfil, s.ref.id), prev = decisionDe(estado, body.perfil, s.ref.id); estado[key] = { ...prev, como: s.como, tomar: s.tomar, pedido: { id, at, hasta, semana: body.week } }; }
      writeJson(ESTADO(), estado);
    }
    return c.json({ id, path: file, prompt, n: sel.length });
  });
  registerCompetidores(app);
  // La ficha de una cuenta de la base con todos sus contenidos, cada uno con su decisión para la marca y su uso en Guiones:
  // desde acá también se elige qué producir.
  app.get('/api/planner/competidores/cuenta', c => {
    const r = contenidosDeCuenta(c.req.query('id') || '', urlKey), perfil = perfilValido(c.req.query('perfil'));
    if (!r) return c.json({ error: 'No encuentro esa cuenta en la base.' }, 404);
    const estado = fileRead(ESTADO(), {}), usos = usosPorReferencia(), cl = clases();
    const contenidos = r.contenidos.map((x: any, orden: number) => ({ ...x, orden, fuentes: [x.origen === 'tuya' ? 'tuya' : 'base'], ficha: r.cuenta, clase: cl.get(x.id) || null,
      decision: decisionDe(estado, perfil, x.id),
      usos: [...new Map([...(usos.get(x.id) || [])].map(p => [p.week + p.perfil + p.id, p])).values()] }));
    return c.json({ cuenta: r.cuenta, contenidos });
  });
}
