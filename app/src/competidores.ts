// Base de competidores leída desde <research>/radar.db, sólo lectura. Las altas, la medición y la ficha de cada cuenta las
// hace el motor (engine/research/competidores.py, skill competidores); el planner muestra, filtra y deja elegir contenidos
// para producir. Lo único que escribe es a qué marcas pertenece una cuenta (moverCuenta).
import type { Hono } from 'hono';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { config, paths } from './config.ts';
import { posix, within } from './publication-planner.ts';

const TIPO: Record<string, string> = { competitor: 'Competidor directo', format: 'Referente de formato', topic: 'Referente de tema', reference: 'Referente', niche: 'Nicho' };
const ROL: Record<string, string> = { competidor_directo: 'Competidor directo', referente_formato: 'Referente de formato', referente_tema: 'Referente de tema',
  inspiracion_estetica: 'Inspiración estética', marca_herramienta: 'Marca o herramienta', fuera_de_nicho: 'Fuera de nicho' };
export const dbPath = () => resolve(paths().research, 'radar.db');
export const portadasDir = () => resolve(paths().research, 'portadas');

// La marca de la barra viaja como slug: «Mi Marca» → «mi-marca». Una cuenta se asigna con el tag marca-<slug>; sin ninguno,
// es de todas las marcas. «todas» es la vista de todas las marcas juntas (y la única cuando hay una sola).
export const slugMarca = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const marcasConfig = () => (Array.isArray(config().brands) ? config().brands : []).map((b: unknown) => ({ id: slugMarca(b), nombre: String(b) })).filter((b: any) => b.id);
export const marcaNombre = (perfil: string) => marcasConfig().find((b: any) => b.id === perfil)?.nombre || '';
export const perfilValido = (v: unknown) => typeof v === 'string' && /^[a-z0-9-]{1,60}$/.test(v) ? v : 'todas';

// node:sqlite avisa que es experimental al cargarse: ese aviso, y sólo ése, no va al log del servicio.
let sqlite: any = null;
const emitWarning = process.emitWarning;
process.emitWarning = ((w: any, ...rest: any[]) => /SQLite is an experimental/.test(String(w?.message ?? w)) ? undefined : (emitWarning as any).call(process, w, ...rest)) as any;
try { sqlite = await import('node:sqlite'); } catch { sqlite = null; } finally { process.emitWarning = emitWarning; }
let cache: { at: number, file: string, mtime: number, data: any } | null = null;

export function abrir() {
  const f = dbPath();
  if (!sqlite || !existsSync(f)) return null;
  // Mientras el motor mide, la base se traba un momento: se espera en vez de devolver un error en la pantalla.
  try { const db = new sqlite.DatabaseSync(f, { readOnly: true }); db.exec('PRAGMA busy_timeout = 2000'); return db; } catch { return null; }
}
const tieneTablas = (db: any) => db.prepare("select count(*) n from sqlite_master where type='table' and name in ('competidores_contenidos','competidores_catalogo','competidores_mediciones')").get().n === 3;
const tieneAlcance = (db: any) => !!db.prepare("select 1 from sqlite_master where type='table' and name='competidores_alcance'").get();
const json = (v: unknown, fb: any) => { try { return typeof v === 'string' ? JSON.parse(v) : fb; } catch { return fb; } };
const ident = (url: string) => (/\/p\/([\w-]+)/.exec(url) || /\/(?:video|photo)\/(\d+)/.exec(url) || [])[1] || '';
// La portada de un contenido, como ruta dentro de la carpeta de contenido (la que sirve el planner).
function portada(red: string, url: string) {
  const f = resolve(portadasDir(), `${red}-${ident(url)}.jpg`);
  return ident(url) && within(paths().root, f) && existsSync(f) && statSync(f).isFile() ? posix(relative(paths().root, f)) : null;
}

// El alcance y la relevancia los calcula el motor al medir (engine/research/base.py, calcular_alcance).
const CUENTAS_SQL = (alcance: boolean) => `select a.id, a.platform red, a.handle, a.purpose, a.tags, a.rationale, a.evidence_url, a.classified_at,
  c.rol, c.anillo, c.bucket, c.prioridad, c.idioma, c.region, c.tema, c.oferta, c.cta, c.formato_principal, c.estilo_visual, c.ganchos, c.que_tomar,
  c.hace_explicativos, c.resumen, c.sim_oferta, c.sim_contenido, c.similarity, c.sim_por_oferta, c.sim_por_contenido, m.medido_at, m.nombre, m.seguidores, m.publicaciones, m.muestra, m.reels, m.carruseles, m.imagenes,
  lr.views_mediana reel_views, lr.views_promedio reel_promedio, lr.likes_mediana reel_likes, lc.likes_mediana carrusel_likes, e.estilo exp_estilo, e.notas exp_notas,
  ${alcance ? 'x.alcance, x.relevancia, x.views_tipicas, x.views_tope, x.views_por_seguidor, x.crecimiento_30d, x.crecimiento_desde, x.componentes alcance_comp, tc.url tope_url'
    : 'null alcance, null relevancia, null views_tipicas, null views_tope, null views_por_seguidor, null crecimiento_30d, null crecimiento_desde, null alcance_comp, null tope_url'}
  from radar_accounts a
  left join competidores_catalogo c on c.account_id=a.id
  left join competidores_mediciones m on m.account_id=a.id and m.medido_at=(select max(medido_at) from competidores_mediciones where account_id=a.id)
  left join competidores_lineas_base lr on lr.account_id=a.id and lr.medido_at=m.medido_at and lr.formato='reel'
  left join competidores_lineas_base lc on lc.account_id=a.id and lc.medido_at=m.medido_at and lc.formato='carrusel'
  left join competidores_explicativos e on e.account_id=a.id
  ${alcance ? 'left join competidores_alcance x on x.account_id=a.id left join competidores_contenidos tc on tc.id=x.tope_id' : ''}
  where a.enabled=1 and a.platform in ('instagram','tiktok')`;
// La última medición de cada contenido. `cond` filtra (ventana, mínimo, origen).
const CONTENIDOS_SQL = (cond: string) => `select c.id cid, c.account_id, c.platform red, c.formato, c.url, c.publicado_at, c.texto, c.duracion_s, c.slides, c.origen,
  c.primera_vez_at, m.medido_at, m.views, m.likes, m.comentarios, m.guardados, m.compartidos, m.x_mediana, m.x_sobre, m.pautado,
  (select count(*) from competidores_contenido_mediciones where contenido_id=c.id) corridas
  from competidores_contenidos c join competidores_contenido_mediciones m on m.contenido_id=c.id
  where m.medido_at=(select max(medido_at) from competidores_contenido_mediciones where contenido_id=c.id) and (${cond})`;

// El puntaje de un contenido en la Bandeja, de 0 a 100: la viralidad del contenido por cuánto encaja con el nicho.
// - Viralidad: cuánto supera su mediana (×1 a ×100) y sus views absolutas (5 mil a 5 millones; un like de carrusel vale
//   30), mitad y mitad, en escala logarítmica; con uno solo de los dos, ése.
// - Encaje: el anillo del contenido (engine/research/temas.py; si no está, el del research o el de su cuenta) en un 75 % y
//   la relevancia de su cuenta (similarity por alcance; sin puntaje, 30) en un 25 %.
// - Puntaje: la media geométrica de los dos, así un viral fuera del nicho o uno del nicho que no anduvo no suben solos.
// Sin views ni múltiplo no hay puntaje.
const log01 = (v: number | null | undefined, desde: number, hasta: number) => !v || v <= 0 ? 0 : Math.max(0, Math.min(1, (Math.log10(v) - desde) / (hasta - desde)));
const ENCAJE_ANILLO: Record<number, number> = { 1: 100, 2: 85, 3: 65, 4: 40, 5: 15 };
export function puntajeContenido(x: number | null | undefined, views: number | null | undefined, likes: number | null | undefined, anillo: number | null | undefined, relevancia: number | null | undefined) {
  const v = views || (likes || 0) * 30, partes = [x ? log01(x, 0, 2) : null, v ? log01(v, 3.7, 6.7) : null].filter((p): p is number => p != null);
  const viralidad = partes.length ? Math.round(100 * partes.reduce((s, p) => s + p, 0) / partes.length) : null;
  const a = anillo ? ENCAJE_ANILLO[anillo] : undefined, cuenta = relevancia ?? 30, encaje = Math.round(a == null ? cuenta : .75 * a + .25 * cuenta);
  return { puntaje: viralidad == null ? null : Math.round(Math.sqrt(viralidad * encaje)), viralidad, encaje, anillo: a == null ? null : anillo!, cuenta: relevancia ?? null };
}

// Similarity score: la oferta dice qué tan directa es la competencia; el contenido, qué tan parecido es.
function cuadrante(of: number | null, co: number | null) {
  if (of == null || co == null) return null;
  return of >= 7 && co >= 7 ? 'Compite de frente' : of >= 7 ? 'Vende lo mismo' : co >= 7 ? 'Contenido parecido' : 'Más lejos';
}

const marcasDe = (tags: string[]) => tags.filter(t => t.startsWith('marca-')).map(t => t.slice(6));

function cuentaDe(r: any, stats: any) {
  const tags: string[] = json(r.tags, []);
  return {
    id: r.id, red: r.red, handle: r.handle, cuenta: '@' + r.handle, marcas: marcasDe(tags), perfil: r.red === 'tiktok' ? `https://www.tiktok.com/@${r.handle}` : `https://www.instagram.com/${r.handle}`,
    tipo: TIPO[r.purpose] || r.purpose, rol: ROL[r.rol] || r.rol || null, anillo: r.anillo ?? null, bucket: r.bucket || null, prioridad: r.prioridad || null,
    idioma: r.idioma || null, region: r.region || null, tema: r.tema || null, oferta: r.oferta || null, cta: r.cta || null, formato_principal: r.formato_principal || null,
    estilo_visual: r.estilo_visual || r.exp_estilo || null, ganchos: r.ganchos || null, que_tomar: r.que_tomar || null, resumen: r.resumen || null,
    explicativos: tags.includes('reels-explicativos'), hace_explicativos: r.hace_explicativos == null ? null : !!r.hace_explicativos, tags,
    motivo: r.rationale || null, evidencia: r.evidence_url || null, nombre: r.nombre || null, seguidores: r.seguidores ?? null, publicaciones: r.publicaciones ?? null,
    muestra: r.muestra ?? null, reels: r.reels ?? null, carruseles: r.carruseles ?? null, imagenes: r.imagenes ?? null,
    reel_views: r.reel_views ?? null, reel_promedio: r.reel_promedio ?? null, reel_likes: r.reel_likes ?? null, carrusel_likes: r.carrusel_likes ?? null,
    medido: r.medido_at ? String(r.medido_at).slice(0, 10) : null, outliers_30d: stats?.n ?? 0, mejor_x_30d: stats?.best ?? null,
    similarity: r.similarity ?? null, sim_oferta: r.sim_oferta ?? null, sim_contenido: r.sim_contenido ?? null, sim_por_oferta: r.sim_por_oferta || null,
    sim_por_contenido: r.sim_por_contenido || null, cuadrante: cuadrante(r.sim_oferta, r.sim_contenido),
    alcance: r.alcance ?? null, relevancia: r.relevancia ?? null, views_tipicas: r.views_tipicas ?? null, views_tope: r.views_tope ?? null, tope_url: r.tope_url || null,
    views_por_seguidor: r.views_por_seguidor ?? null, crecimiento_30d: r.crecimiento_30d ?? null, crecimiento_desde: r.crecimiento_desde || null, alcance_comp: json(r.alcance_comp, null),
  };
}

// Todo lo que el planner necesita de la base, en una sola lectura que se reusa 20 s o hasta que cambie el archivo. Las
// cuentas propias (tag «propia») no son competidores.
export function base() {
  const f = dbPath(), mtime = existsSync(f) ? statSync(f).mtimeMs : 0;
  if (cache && cache.file === f && cache.mtime === mtime && Date.now() - cache.at < 20000) return cache.data;
  const db = abrir();
  if (!db) return { disponible: false, cuentas: [], porId: new Map(), ultima_medicion: null };
  try {
    if (!tieneTablas(db)) return { disponible: false, cuentas: [], porId: new Map(), ultima_medicion: null };
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    const stats = new Map(db.prepare(`select account_id, count(*) n, max(x_mediana) best from (${CONTENIDOS_SQL("coalesce(m.pautado,0)=0 and m.x_mediana>=3 and c.publicado_at>=?")}) group by account_id`).all(desde).map((s: any) => [s.account_id, s]));
    const cuentas = db.prepare(CUENTAS_SQL(tieneAlcance(db))).all().filter((r: any) => !json(r.tags, []).includes('propia')).map((r: any) => cuentaDe(r, stats.get(r.id)));
    const data = { disponible: true, cuentas, porId: new Map(cuentas.map((c: any) => [c.id, c])), ultima_medicion: db.prepare('select max(medido_at) t from competidores_mediciones').get().t || null };
    cache = { at: Date.now(), file: f, mtime, data };
    return data;
  } finally { db.close(); }
}

// Un contenido de la base con la forma de una referencia del planner (la de normRef), más su cuenta. `origen` marca lo que
// pasaste vos (un link suelto que sumaste a la base): ésas son «tuyas».
export function contenidoRef(r: any, cuenta: any, urlKey: (u: string) => string) {
  const texto = String(r.texto || '').replace(/\s+/g, ' ').trim(), titulo = texto.split(/(?<=[.!?¿?])\s/)[0].slice(0, 180);
  const sobre = r.x_sobre === 'likes' ? `likes contra la mediana de sus ${r.formato === 'carrusel' ? 'carruseles' : 'reels'}` : `views contra la mediana de sus ${r.formato === 'carrusel' ? 'carruseles' : 'reels'}`;
  const mediana = r.formato === 'carrusel' ? cuenta?.carrusel_likes : r.x_sobre === 'likes' ? cuenta?.reel_likes : cuenta?.reel_views;
  return {
    id: urlKey(r.url), url: r.url, red: r.red, origen: r.origen ? 'tuya' : 'competidores', origen_detalle: r.origen || 'Base de competidores', tambien_en: [],
    entro: String(r.primera_vez_at || '').slice(0, 10),
    cuenta: cuenta?.cuenta || '', seguidores: cuenta?.seguidores ?? null, fecha: String(r.publicado_at || '').slice(0, 10), tipo: r.formato === 'carrusel' ? 'carrusel' : 'reel',
    idioma: cuenta?.idioma || '', titulo, caption: texto.slice(0, 1200),
    media: { poster: portada(r.red, r.url), video: null, laminas: [] },
    metricas: { vistas: r.views ?? null, likes: r.likes ?? null, comentarios: r.comentarios ?? null, guardados: r.guardados ?? null, compartidos: r.compartidos ?? null,
      multiplo: r.x_mediana ?? null, mediana_cuenta: mediana ?? null, base: sobre, duracion_s: r.duracion_s ?? null },
    hook: { texto: '', visual: '', tipo: '', madlib: '' }, formato: { fila: '', columna: '', familia: '', estructura: '', presentacion: '', propio: '', skill: '', detalle: '', mecanismo: '', estructura_txt: '' },
    analisis: { idea: '', por_que: '', mecanismo: '', copiar: '', no_copiar: '', twist: '', creencia: '', contraria: '', transcripcion: '' },
    encaje: { pilar: '', anillo: cuenta?.anillo ?? null, anillo_estimado: true, bucket: '', bucket_estimado: false, oferta: '', objetivo: '', comprador: '' },
    veredicto: '', score: null, recomendacion: { como: r.formato === 'carrusel' ? 'carrusel' : 'reel', tomar: null, nota: '' }, estado_research: '', tags: [],
    pautado: !!r.pautado, corridas: r.corridas ?? 1, medido: String(r.medido_at || '').slice(0, 10), slides: r.slides ?? null,
  };
}

// De qué marca es una cuenta: la de sus tags o, sin ninguno, de todas.
export const cuentaDelPerfil = (c: any, perfil: string) => !!c && (perfil === 'todas' || !c.marcas?.length || c.marcas.includes(perfil));
// Los contenidos de la base para la Bandeja: lo publicado en los últimos `dias` que supera `minx` veces su mediana (con los
// pautados marcados, para que la vista decida) y los que pasaste vos. Con `entro`, sólo lo que la base encontró entre esas
// fechas. Con `perfil`, sólo lo de las cuentas de esa marca.
export function contenidosBase(dias: number, minx: number, urlKey: (u: string) => string, entro?: { desde: string; hasta: string }, perfil = 'todas') {
  const b = base();
  if (!b.disponible) return [];
  const db = abrir();
  if (!db) return [];
  try {
    const desde = new Date(Date.now() - dias * 864e5).toISOString();
    const rango = entro ? ' and substr(c.primera_vez_at,1,10) between ? and ?' : '';
    return db.prepare(CONTENIDOS_SQL(`((c.publicado_at>=? and m.x_mediana>=?) or c.origen is not null)${rango}`)).all(desde, minx, ...(entro ? [entro.desde, entro.hasta] : []))
      .filter((r: any) => b.porId.has(r.account_id) && cuentaDelPerfil(b.porId.get(r.account_id), perfil)).map((r: any) => contenidoRef(r, b.porId.get(r.account_id), urlKey));
  } finally { db.close(); }
}

// Cambia las marcas de una cuenta desde su ficha. Sin ninguna, la cuenta es de todas.
export function moverCuenta(id: string, marcas: string[]) {
  const f = dbPath();
  if (!sqlite || !existsSync(f)) return false;
  const db = new sqlite.DatabaseSync(f);
  try {
    db.exec('PRAGMA busy_timeout = 4000');
    const r = db.prepare('select tags from radar_accounts where id=?').get(id);
    if (!r) return false;
    const validas = new Set(marcasConfig().map((b: any) => b.id));
    const tags = [...json(r.tags, []).filter((t: string) => !t.startsWith('marca-')), ...marcas.filter(m => validas.has(m)).map(m => 'marca-' + m)];
    db.prepare('update radar_accounts set tags=? where id=?').run(JSON.stringify(tags), id);
  } finally { db.close(); }
  cache = null;
  return true;
}

// Todos los contenidos de una cuenta (los últimos publicados primero), para su ficha.
export function contenidosDeCuenta(id: string, urlKey: (u: string) => string) {
  const b = base(), cuenta = b.porId.get(id);
  if (!cuenta) return null;
  const db = abrir();
  if (!db) return null;
  try { return { cuenta, contenidos: db.prepare(CONTENIDOS_SQL('c.account_id=?') + ' order by c.publicado_at desc limit 80').all(id).map((r: any) => contenidoRef(r, cuenta, urlKey)) }; }
  finally { db.close(); }
}

// Busca un contenido de la base por el id del planner (urlKey). Sirve para decidir y pedir lo que no vino en el research.
export function contenidoPorId(key: string, urlKey: (u: string) => string) {
  const b = base();
  if (!b.disponible) return null;
  const m = /^ig:([\w-]+)$/.exec(key) || /^tt:(\d+)$/.exec(key);
  const db = abrir();
  if (!db || !m) { db?.close(); return null; }
  try {
    const r = db.prepare(CONTENIDOS_SQL("c.url like ?")).all(`%/${m[1]}`).find((x: any) => urlKey(x.url) === key);
    return r && b.porId.has(r.account_id) ? contenidoRef(r, b.porId.get(r.account_id), urlKey) : null;
  } finally { db.close(); }
}

// Varios contenidos de la base por su id del planner, en una sola lectura: la Selección trae hasta 50.
export function contenidosPorIds(keys: string[], urlKey: (u: string) => string) {
  const out = new Map<string, any>(), codigos = keys.map(k => (/^ig:([\w-]+)$/.exec(k) || /^tt:(\d+)$/.exec(k) || [])[1]).filter(Boolean);
  const b = base();
  if (!b.disponible || !codigos.length) return out;
  const db = abrir();
  if (!db) return out;
  try {
    const quiero = new Set(keys);
    for (const r of db.prepare(CONTENIDOS_SQL(codigos.map(() => 'c.url like ?').join(' or '))).all(...codigos.map(k => `%/${k}%`)) as any[]) {
      const k = urlKey(r.url);
      if (quiero.has(k) && b.porId.has(r.account_id)) out.set(k, contenidoRef(r, b.porId.get(r.account_id), urlKey));
    }
    return out;
  } finally { db.close(); }
}

// La ficha de la cuenta de una referencia del research, si está en la base (por red y usuario).
export function fichaDe(red: string, cuenta: string) {
  const h = String(cuenta || '').replace(/^@/, '').toLowerCase();
  if (!h) return null;
  return base().cuentas.find((c: any) => c.handle === h && (!red || c.red === red)) || null;
}

// Tema, formato y anillo de cada contenido (engine/research/temas.py, tabla contenido_clase) por la clave del planner, y la
// taxonomía con sus nombres (<research>/taxonomia.json, editable; si falta, la de ejemplo del motor).
export function taxonomia() {
  try { return JSON.parse(readFileSync(resolve(paths().research, 'taxonomia.json'), 'utf8')); } catch {}
  try { return JSON.parse(readFileSync(new URL('../../engine/research/taxonomia.ejemplo.json', import.meta.url), 'utf8')); } catch { return null; }
}
export function clases(): Map<string, any> {
  const db = abrir();
  if (!db) return new Map();
  try {
    if (!db.prepare("select 1 from sqlite_master where type='table' and name='contenido_clase'").get()) return new Map();
    return new Map(db.prepare('select id, tema, formato, anillo from contenido_clase').all().map((r: any) => [r.id, { tema: r.tema, formato: r.formato, anillo: r.anillo }]));
  } finally { db.close(); }
}

export function registerCompetidores(app: Hono) {
  app.get('/api/planner/competidores', c => {
    const b = base();
    return c.json({ disponible: b.disponible, ultima_medicion: b.ultima_medicion, cuentas: b.cuentas, marcas: marcasConfig() });
  });
  app.post('/api/planner/competidores/marcas', async c => {
    const body = await c.req.json().catch(() => null), marcas = Array.isArray(body?.marcas) ? body.marcas.filter((m: unknown) => typeof m === 'string') : null;
    if (typeof body?.id !== 'string' || !marcas) return c.json({ error: 'Cuenta o marcas inválidas.' }, 400);
    try { if (!moverCuenta(body.id, marcas)) return c.json({ error: 'No encuentro esa cuenta en la base.' }, 404); }
    catch { return c.json({ error: 'La base está ocupada midiendo: probá de nuevo en un momento.' }, 503); }
    const validas = new Set(marcasConfig().map((b: any) => b.id));
    return c.json({ ok: true, marcas: marcas.filter((m: string) => validas.has(m)) });
  });
}
