// Referencias, sobre la marca de la barra (con «Todas», todo junto):
// - Selección: todo lo seleccionado, por estado. Lo que propone Claude (hasta 20 candidatas y hasta 50 en total, en
//   tarjetas con su gancho en tu idioma, su razón y dos acciones: Hacer y Paso) y lo que tocaste con Hacer. No depende de
//   las fechas de la Bandeja.
// - Bandeja: lo que falta decidir: el research (referencias.json), los outliers de la base de competidores y las
//   referencias que pasaste vos, sin repetir. Por defecto en foco (oculta lo de afuera y lo flojo de la base, con el
//   número a la vista). La lista a la izquierda y el detalle con la decisión a la derecha. Elegir es un solo paso: Hacer
//   deja la referencia lista, clonada y en el formato del original; qué se toma, reel o carrusel y una nota son
//   secundarios, dentro del detalle. Teclado: ↑↓ moverse, L hacer, X paso, R reel, C carrusel, 1 2 3 qué tomar, N nota;
//   O abre el original, V el video acá. Además de la lista, el Mapa: la diana (del comprador hacia afuera, con los temas
//   alrededor) y una grilla de dos ejes a elección; tocar un anillo, una fila o una columna filtra, y una celda abre su lista.
// - Competidores: la base (skill competidores) con la ficha del catálogo de cada cuenta y sus contenidos, que también se eligen.
// «Pedir guiones», en la barra de abajo cuando hay elegidas, las congela y copia el pedido para Claude Code. Desde acá no se
// genera ni se gasta nada. Usa las utilidades globales de planner.js ($, api, esc, toast, copyText, mediaUrl, store, week,
// marcas…) y gvMenu de guiones.js.
const rfLista = v => Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
const rf = {
  seccion: store.get('rfSeccion2', 'seleccion'), 
  data: null, loading: false, sele: null, seleLoading: false, comp: null, compLoading: false, cuenta: null, cuentaLoading: false, pedidos: null,
  sel: null, sSel: null, cambiar: null, cuentaSel: store.get('rfCuentaSel', null), contSel: null, nota: {}, saving: {}, hasta: store.get('rfHasta', 'audio'),
  s: { estado: store.get('rfSEstado', 'seleccionadas'), nivel: store.get('rfSNivel', 'candidata'), mensaje: store.get('rfSMensaje', ''), pasadas: false },
  f: { foco: store.get('rfFoco', true), masAbierto: store.get('rfMasAbierto', false), fuentes: store.get('rfFuentes', ['semana', 'base', 'tuya']), dias: store.get('rfDias', 14), cuenta: store.get('rfCuenta', ''), estado: store.get('rfEstado2', 'por_decidir'),
    minx: store.get('rfMinx', 3), idioma: store.get('rfIdioma', ''), pautados: false, orden: store.get('rfOrden2', 'puntaje'),
    tema: rfLista(store.get('rfTema', [])), formato: rfLista(store.get('rfFormato', [])), anillo: rfLista(store.get('rfAnillo', [])) },
  vista: store.get('rfVista', 'lista'), mapa: { filas: store.get('rfMapaFilas', 'formato'), columnas: store.get('rfMapaCols', 'tema') },
  c: { tipo: store.get('rfCTipo', ''), cuadrante: store.get('rfCCuad', ''), red: '', idioma: '', prioridad: '', recientes: false, orden: store.get('rfCOrden2', 'relevancia'), dir: -1, formato: '' },
};
if (!['seleccion', 'bandeja', 'competidores'].includes(rf.seccion)) rf.seccion = 'seleccion';
// La Bandeja es lo que falta decidir: lo elegido y lo que está en producción pasaron a Selección.
if (rf.f.estado !== 'descartadas') rf.f.estado = 'por_decidir';
if (rf.f.orden === 'peso') rf.f.orden = 'puntaje';  // el orden por peso pasó a ser el puntaje
const RF_RED = { instagram: 'Instagram', tiktok: 'TikTok', x: 'X', youtube: 'YouTube', linkedin: 'LinkedIn' };
const RF_FUENTE = { semana: 'Research de la semana', base: 'Base de competidores', tuya: 'Tus referencias' };
const RF_FUENTE_CORTA = { semana: 'Research', base: 'Base', tuya: 'Tuyas' };
const RF_FUENTE_LADO = { semana: 'Research', base: 'Competidores', tuya: 'Tus referencias' };
const RF_ORIGEN = { guardados: 'Guardado', bookmarks: 'Bookmark de X', sandcastles: 'Sandcastles', competidores: 'Competidor', carruseles: 'Carrusel del nicho', last30days: 'last30days', nicho: 'Nicho', radar: 'Radar', propio: 'Propio', plan: 'Del plan', tuya: 'Tuya' };
// Qué se toma de una referencia. Los valores internos siguen siendo recrear, idea y formato.
const RF_TOMAR = { recrear: ['Clonarla', 'Mismo gancho, misma visual y mismo contenido, en tu voz y en tu idioma'], idea: ['Sólo el tema', 'Hablamos de lo mismo, con otro formato nuestro'], formato: ['Sólo el formato', 'Su estructura y su gancho, con un tema nuestro'] };
// A qué apunta cada una de la Selección.
// Es texto libre (un producto, una oferta o «alcance»): se muestra con mayúscula y la clase dice si vende o suma alcance.
const rfMensajeTxt = m => m ? m.charAt(0).toUpperCase() + m.slice(1) : '';
const rfMensajeClase = m => m === 'alcance' ? 'm-alcance' : 'm-venta';
const RF_ETAPA = { por_decidir: 'Por decidir', elegidas: 'Seleccionada', pedidas: 'Pedida', en_guiones: 'En guiones', aprobadas: 'En producción', descartadas: 'Descartada' };
// Las opciones de cada filtro: [valor, nombre, aclaración del menú].
const RF_SESTADOS = [['seleccionadas', 'Seleccionadas', 'Lo que te propongo y lo que tocaste con Hacer, antes de ser guion'], ['guiones', 'En guiones', 'Ya es pieza y se está trabajando el guion o el audio'], ['produccion', 'En producción', 'Con el audio aprobado, corte o final']];
const RF_CUENTAS = [['', 'Todas'], ['relevantes', 'Las más relevantes', 'Relevancia de 55 o más'], ['similares', 'Las más similares', 'Similarity de 70 o más'], ['competidor', 'Competidores directos'],
  ['explicativos', 'Reels explicativos'], ['referente', 'Referentes'], ['nicho', 'Nicho']];
const RF_IDIOMAS = [['', 'Todos'], ['es', 'Castellano'], ['en', 'Inglés']];
const RF_ORDEN = [['puntaje', 'Mejor puntaje', 'Viralidad por encaje con tu nicho: cuánto supera su mediana y sus views, por su anillo y su cuenta'], ['x', 'Más sobre su mediana'], ['vistas', 'Más vistas'],
  ['relevancia', 'Cuenta más relevante'], ['fecha', 'Más recientes'], ['research', 'Orden del research']];
const RF_CTIPOS = [['', 'Todas'], ['Competidor directo', 'Competidores directos'], ['explicativos', 'Reels explicativos'], ['referente', 'Referentes'], ['Nicho', 'Nicho']];
// Similarity score: oferta (qué tan directa es la competencia) y contenido (qué tan parecido), de 0 a 10; el puntaje es
// su promedio de 0 a 100. Cada eje cuenta como alto con 7 o más.
const RF_CUADRANTES = [['', 'Todos'], ['Compite de frente', 'Compite de frente', 'Vende lo mismo y su contenido se parece'], ['Vende lo mismo', 'Vende lo mismo', 'Con otro contenido'],
  ['Contenido parecido', 'Contenido parecido', 'Vende otra cosa'], ['Más lejos', 'Más lejos', 'Ni la oferta ni el contenido se parecen tanto']];
const RF_REDES = [['', 'Todas'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']];
const RF_CIDIOMAS = [['', 'Todos'], ['es', 'Castellano'], ['en', 'Inglés'], ['pt', 'Portugués']];
const RF_PRIORIDAD = [['', 'Toda'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
const RF_DEF = { minx: 3, dias: 14 };
const RF_FOCO_MINX = 5;
const rfMinVista = () => rf.f.foco ? Math.max(RF_FOCO_MINX, rf.f.minx) : rf.f.minx;
function rfSetFoco(v) { rf.sel = null; rf.f.foco = v; rfSave('rfFoco', v); }
// Relevancia: el similarity pesado por el alcance (tamaño, views típicas, tope de 90 días y crecimiento). La calcula la
// skill competidores.
const RF_REL_ALTA = 55, RF_SIM_ALTA = 70;
const RF_IC = {
  volver: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6.5 3 3 3-3"/></svg>',
  sort: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.5v11M2.5 11 5 13.5 7.5 11M11 13.5v-11M8.5 5 11 2.5 13.5 5"/></svg>',
  carr: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4.5" width="8.5" height="9.5" rx="1.5"/><path d="M5 2h7a2 2 0 0 1 2 2v8"/></svg>',
  doc: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13M6.5 8.5h4M6.5 11h4"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
  up: '<svg class="ord" viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 10 3.5-3.5 3.5 3.5"/></svg>',
  down: '<svg class="ord" viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6 3.5 3.5 3.5-3.5"/></svg>',
  mas: '<svg class="ti" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H3m9 14H3M14 3v4m2 10v4m5-9h-9m9 7h-5m5-14h-7m-6 5v4m0-2H3"/></svg>',
  lista: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01"/></svg>',
  grilla: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
  mapa: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3.5"/><circle cx="8" cy="8" r="1"/></svg>',
};
// Un ícono por tema y por formato. Trazos de Lucide; los anillos se dibujan con el suyo marcado.
const RF_TAX_IC = {
  _animado: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  sistemas: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  contenido: '<path d="m12.296 3.464l3.02 3.956M20.2 6L3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3zM3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm3.18-5.724l3.1 3.899"/>',
  video: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18m0-13.5h4m-4 9h4"/>',
  edicion: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12L12 12m8-8L8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8L20 20"/>',
  imagen: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  ia: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4m2-2h-4"/><circle cx="4" cy="20" r="2"/>',
  negocio: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  productividad: '<path d="M13 5h8m-8 7h8m-8 7h8M3 17l2 2l4-4M3 7l2 2l4-4"/>',
  ciencia: '<circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9c-4.54-4.52-9.87-6.54-11.9-4.5c-2.04 2.03-.02 7.36 4.5 11.9c4.54 4.52 9.87 6.54 11.9 4.5"/><path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9c-2.03-2.04-7.36-.02-11.9 4.5c-4.52 4.54-6.54 9.87-4.5 11.9c2.03 2.04 7.36.02 11.9-4.5"/>',
  cultura: '<path d="M10 11h.01M14 6h.01M18 6h.01M6.5 13.1h.01M22 5c0 9-4 12-6 12s-6-3-6-12q0-3 6-3c6 0 6 1 6 3"/><path d="M17.4 9.9c-.8.8-2 .8-2.8 0m-4.5-2.8C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6c4.5 7.8 9.5 8.4 11.2 7.4c.9-.5 1.9-2.1 1.9-4.7"/><path d="M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4"/>',
  comp: '<path d="M12 3v18m7-13l3 8a5 5 0 0 1-6 0zV7"/><path d="M3 7h1a17 17 0 0 0 8-2a17 17 0 0 0 8 2h1M5 8l3 8a5 5 0 0 1-6 0zV7m2 14h10"/>',
  reto: '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2M6.453 15h11.094M8.5 2h7"/>',
  tuto: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  caso: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77a4 4 0 0 1 6.74 0a4 4 0 0 1 4.78 4.78a4 4 0 0 1 0 6.74a4 4 0 0 1-4.77 4.78a4 4 0 0 1-6.75 0a4 4 0 0 1-4.78-4.77a4 4 0 0 1 0-6.76"/><path d="m16 9l-5.5 5.5L8 12"/>',
  explica: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4"/>',
  expl: '<path d="M15 18h-5m8-4h-8m-6 8h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/>',
  lista: '<path d="M10 14.66V17a1 1 0 0 1-1 1a2 2 0 0 0-2 2v2m7-7.34V17a1 1 0 0 0 1 1a2 2 0 0 1 2 2v2m.916-12H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/>',
  rubro: '<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5m8.774-10.69a1.12 1.12 0 0 0-1.549 0a2.5 2.5 0 0 1-3.451 0a1.12 1.12 0 0 0-1.548 0a2.5 2.5 0 0 1-3.452 0a1.12 1.12 0 0 0-1.549 0a2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/>',
  opinion: '<path d="M12 19v3m7-12v2a7 7 0 0 1-14 0v-2"/><rect width="6" height="13" x="9" y="2" rx="3"/>',
  historia: '<path d="M12 5v16m8.001-2A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2a5 5 0 0 1 4-2z"/>',
  humor: '<circle cx="12" cy="12" r="10"/><path d="M18 13a6 6 0 0 1-6 5a6 6 0 0 1-6-5zM9 9h.01M15 9h.01"/>',
  oferta: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
};
// El anillo: los cinco aros con el suyo pintado, del centro (1, el comprador) hacia afuera.
const rfAnilloIc = n => `<svg class="ti ti-anillo a${n}" viewBox="0 0 24 24" aria-hidden="true">${[11, 8.8, 6.6, 4.4, 2.2].map((r, i) => `<circle cx="12" cy="12" r="${r}"${5 - i === Number(n) ? ' class="on"' : ''}/>`).join('')}</svg>`;
RF_TAX_IC.animado = RF_TAX_IC._animado;  // el reel explicativo de la clasificación es el mismo formato que el filtro de cuentas
const rfIcono = (k, v) => k === 'anillo' ? rfAnilloIc(v) : RF_TAX_IC[v] ? `<svg class="ti" viewBox="0 0 24 24" aria-hidden="true">${RF_TAX_IC[v]}</svg>` : '';
const rfNivel = v => v == null ? '' : v >= 70 ? 's4' : v >= 55 ? 's3' : v >= 40 ? 's2' : 's1';
// La insignia de una cuenta es su relevancia; si todavía no tiene alcance medido, su similarity.
function rfRel(f, grande) {
  if (!f || (f.relevancia == null && f.similarity == null)) return '';
  const v = f.relevancia ?? f.similarity, tip = f.relevancia != null ? `Relevancia ${f.relevancia}: similarity ${f.similarity} con un alcance de ${f.alcance}` : `Similarity ${f.similarity} (sin alcance medido)`;
  return `<span class="rf-sim ${rfNivel(v)}${grande ? ' big' : ''}${f.relevancia == null ? ' sin' : ''}" title="${esc(tip + (f.cuadrante ? ' · ' + f.cuadrante : ''))}">${v}</span>`;
}
// La insignia de un contenido en la Bandeja es su puntaje (viralidad por encaje, competidores.ts), con su anillo al
// lado.
function rfPuntajeTip(r) {
  const p = r.puntaje_det;
  if (!p || p.puntaje == null) return 'Sin puntaje: no trae views ni múltiplo';
  return `Puntaje ${p.puntaje}: viralidad ${p.viralidad} y encaje ${p.encaje} (${p.anillo ? `anillo ${p.anillo}` : 'sin anillo'}, cuenta ${p.cuenta ?? 'sin medir'})`;
}
function rfPuntaje(r) {
  const v = r.puntaje, a = r.puntaje_det?.anillo;
  return `<span class="rf-pt" title="${esc(rfPuntajeTip(r))}"><span class="rf-sim ${rfNivel(v)}${v == null ? ' sin' : ''}">${v ?? '–'}</span>${a ? rfAnilloIc(a) : ''}</span>`;
}

// Para quién se elige: la marca de la barra lateral, como slug; con «Todas las marcas» (o una sola marca), «todas». De
// quién son el research, las decisiones y los competidores que se ven: cada marca tiene los suyos y lo que no tiene marca
// es de todas.
const rfSlug = m => String(m || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const rfPerfil = () => perfilActual === 'all' ? 'todas' : rfSlug(perfilActual) || 'todas';
const rfPerfilNombre = () => perfilActual === 'all' ? 'tus marcas' : BRAND_LABEL[perfilActual] || perfilActual;
// Una cuenta sin marcas es de todas.
const rfCuentaDeAca = x => perfilActual === 'all' || !(x.marcas || []).length || x.marcas.includes(rfPerfil());
// Qué entró, por fechas y no por semanas: el research por el día en que se armó y la base por el día en que encontró
// cada contenido. Lo decidido se ve siempre. El calendario es el de Métricas (rangoMenu, metricas.js).
const RF_ATAJOS = [['semana', 'Esta semana'], ['semana-1', 'Semana pasada'], ['dias14', 'Últimos 14 días'], ['dias30', 'Últimos 30 días'], ['mes', 'Este mes'], ['todo', 'Todo']];
const rfRango = () => rf.rango || (rf.rango = rangoGuardado('rfRango', 'dias14'));
function rfPeriodo() { const r = rfRango(), hoy = todayStr(); return r.tipo === 'todo' ? { desde: '2000-01-01', hasta: hoy } : { desde: r.desde, hasta: r.hasta > hoy ? hoy : r.hasta }; }
function rfSetRango(r) { r = rangoNormal(r); rf.rango = r; store.set('rfRango', r); rf.sel = null; rf.data = null; renderReferencias(true); }
// Las flechas ← → corren el período en la Bandeja; en la Selección, que no depende de fechas, pasan de tarjeta.
function rfCorrer(s) { if (rf.seccion === 'seleccion') return rfMover(s); if (rf.seccion !== 'bandeja') return; const n = rangoCorrido(rfRango(), s); if (n) rfSetRango(n); }
// La semana a la que van los guiones de un pedido: por defecto, la que viene.
const rfSemanasPedido = () => { const lu = monday(todayStr()); return [[lu, 'Esta semana'], [dateAdd(lu, 7), 'La que viene'], [dateAdd(lu, 14), 'La siguiente']]; };
const rfKey = () => { const P = rfPeriodo(); return `${rfPerfil()}|${P.desde}|${P.hasta}|${rf.f.dias}`; };
const rfSemana = wk => { const d0 = new Date(wk + 'T12:00:00Z'), d6 = new Date(dateAdd(wk, 6) + 'T12:00:00Z'), m0 = d0.toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' }), m6 = d6.toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });
  return `Semana del ${d0.getUTCDate()}${m0 !== m6 ? ` de ${m0}` : ''} al ${d6.getUTCDate()} de ${m6}`; };
const rfNum = v => v == null ? '' : v >= 1e6 ? (Math.round(v / 1e5) / 10).toLocaleString('es-AR') + ' M' : v >= 1e4 ? Math.round(v / 1e3).toLocaleString('es-AR') + ' mil' : Math.round(v).toLocaleString('es-AR');
const rfXtxt = v => v == null ? '' : '×' + (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('es-AR');
const rfBanda = x => x == null ? '' : x >= 8 ? 'hot' : x >= 3 ? 'warm' : '';
// Tema, formato y anillo: los nombres vienen con los datos (<research>/taxonomia.json).
const rfTax = () => rf.data?.taxonomia || rf.sele?.taxonomia || { temas: [], formatos: [], anillos: [] };
const RF_DIMS = ['tema', 'formato', 'anillo'];
const rfDe = (k, r) => k === 'anillo' ? (r.clase?.anillo ? String(r.clase.anillo) : null) : r.clase?.[k] ?? null;
function rfDim(k) {
  const t = rfTax();
  return k === 'tema' ? { nombre: 'Tema', valores: t.temas.map(x => [x.id, x.nombre, x.que, x.largo]) }
    : k === 'formato' ? { nombre: 'Formato', valores: t.formatos.map(x => [x.id, x.nombre, x.que]) }
    : { nombre: 'Anillo', valores: t.anillos.map(x => [String(x.n), `${x.n} · ${x.corto}`, x.nombre]) };
}
// El reel explicativo animado. No sale del texto como los demás formatos: son los contenidos de las cuentas marcadas
// como de reels explicativos en la base de competidores. Va primero en el filtro de formato.
const RF_ANIMADO = ['_animado', 'Explicativo animado', 'Animación con voz en off que cuenta un tema: los contenidos de las cuentas de reels explicativos de la base'];
// Las cuentas de reels explicativos de la base y lo que la clasificación puso como reel explicativo
// (engine/research/temas.py).
const rfAnimado = r => !!(r.ficha?.explicativos || r.ficha?.hace_explicativos || r.clase?.formato === 'animado');
const rfValores = k => k === 'formato' ? [RF_ANIMADO, ...rfDim(k).valores.filter(v => v[0] !== 'animado')] : rfDim(k).valores;
const rfTiene = (k, r, v) => k === 'formato' && v === '_animado' ? rfAnimado(r) : rfDe(k, r) === v;
const rfDimNombre = (k, v) => (rfValores(k).find(x => x[0] === v) || rfDim(k).valores.find(x => x[0] === v) || [])[1] || '';
const rfFecha = (t, o = { day: 'numeric', month: 'short' }) => new Date(t).toLocaleDateString('es-AR', { timeZone: TZ, ...o }).replace('.', '');
// El múltiplo de la base (contra la mediana del mismo formato en la cuenta, medido hace poco) manda sobre el del
// research.
const rfXOf = r => r.base?.multiplo ?? r.metricas?.multiplo ?? null;
const rfXBase = r => r.base?.multiplo != null ? r.base.base : r.metricas?.base || '';
const rfThumb = src => /\.(mp4|mov|webm)$/i.test(src) ? '/api/planner/poster?path=' + encodeURIComponent(src) : mediaUrl(src);
const rfSrc = r => r.media?.poster || r.media?.video || r.media?.laminas?.[0] || null;
const rfTitulo = r => r.seleccion?.hook_es || r.hook?.texto || r.titulo || r.caption || r.url;
const rfEtapa = r => r.decision?.decision === 'descartar' ? 'descartadas' : r.usos?.some(u => u.estado !== 'descartado' && (u.estado === 'aprobado' || u.produccion)) ? 'aprobadas' : r.usos?.some(u => u.estado !== 'descartado') ? 'en_guiones' : r.decision?.pedido ? 'pedidas' : r.decision?.decision === 'adaptar' ? 'elegidas' : 'por_decidir';
// Hacer deja la referencia lista: se clona, salvo que la Selección diga otra cosa, y en el formato del original. Las
// elegidas de antes, sin esos dos datos, también están listas: el pedido las completa igual (conDefaults en
// referencias.ts).
const rfDefaults = r => ({ como: r.decision?.como || r.seleccion?.como?.reel_o_carrusel || (r.tipo === 'carrusel' ? 'carrusel' : 'reel'), tomar: r.decision?.tomar || r.seleccion?.como?.tomar || 'recrear' });
const rfComoTxt = r => { const x = rfDefaults(r); return `${RF_TOMAR[x.tomar]?.[0] || ''} · ${x.como === 'carrusel' ? 'Carrusel' : 'Reel'}`; };
const rfEnEstado = (r, e) => e === 'todas' || rfEtapa(r) === e;
const rfSele = () => rf.sele?.perfil === rfPerfil() ? rf.sele : null;
const rfTodas = () => [...(rf.data?.referencias || []), ...(rfSele()?.referencias || []), ...(rf.cuenta?.contenidos || [])];
const rfRef = key => rfTodas().find(r => r.id === key);
// Lo que se puede pedir: la Bandeja y la Selección, sin repetir (lo elegido en la Selección puede no estar en las
// fechas de la Bandeja).
const rfElegibles = () => [...new Map([...(rfSele()?.referencias || []), ...(rf.data?.key === rfKey() ? rf.data.referencias || [] : [])].map(r => [r.id, r])).values()];
const rfCuentaPasa = (f, k) => !k || (f && (k === 'relevantes' ? (f.relevancia ?? 0) >= RF_REL_ALTA : k === 'similares' ? (f.similarity ?? 0) >= RF_SIM_ALTA : k === 'competidor' ? f.tipo === 'Competidor directo'
  : k === 'explicativos' ? f.explicativos || f.hace_explicativos : k === 'referente' ? /^Referente/.test(f.tipo || '') : k === 'nicho' ? f.tipo === 'Nicho' : true));
const rfIdiomaPasa = (r, k) => !k || (r.ficha?.idioma || r.idioma || '') === k;
const rfSave = (k, v) => store.set(k, v);
const rfNombre = (opciones, v) => (opciones.find(([k]) => k === v) || opciones[0])[1];

// ---------- carga ----------
async function loadReferencias() {
  if (rf.loading) return; rf.loading = true;
  const key = rfKey(), perfil = rfPerfil(), P = rfPeriodo();
  try { const d = await api(`referencias?perfil=${encodeURIComponent(perfil)}&desde=${P.desde}&hasta=${P.hasta}&dias=${rf.f.dias}&minx=2`); rf.data = { key, ...d, at: Date.now() }; }
  catch (e) { rf.data = { key, error: e.message, referencias: [], weeks: [], at: Date.now() }; }
  finally { rf.loading = false; }
  if (view === 'referencias') renderReferencias(true);
}
async function loadSeleccion() {
  if (rf.seleLoading) return; rf.seleLoading = true;
  const perfil = rfPerfil();
  try { rf.sele = { perfil, at: Date.now(), ...(await api(`referencias/seleccion?perfil=${encodeURIComponent(perfil)}`)) }; rf.seleReintentos = 0; }
  catch (e) {
    // Lo que ya se veía sigue a la vista; si no había nada, se avisa y se vuelve a probar en unos segundos.
    if (rf.sele?.perfil === perfil && rf.sele.seleccion) rf.sele.at = Date.now();
    else rf.sele = { perfil, at: Date.now(), error: e.message, seleccion: null, referencias: [] };
    if ((rf.seleReintentos = (rf.seleReintentos || 0) + 1) <= 3) setTimeout(() => { if (view === 'referencias') loadSeleccion(); }, 3000);
  }
  finally { rf.seleLoading = false; }
  if (view === 'referencias') renderReferencias(true);
}
async function loadCompetidores() {
  if (rf.compLoading) return; rf.compLoading = true;
  try { rf.comp = { ...(await api('competidores')), at: Date.now() }; } catch (e) { rf.comp = { error: e.message, cuentas: [], at: Date.now() }; }
  finally { rf.compLoading = false; }
  if (view === 'referencias') renderReferencias(true);
}
async function loadCuenta(id) {
  if (!id) { rf.cuenta = null; return; }
  rf.cuentaLoading = true; if (view === 'referencias') renderReferencias(true);
  try { rf.cuenta = { id, key: rfKey(), ...(await api(`competidores/cuenta?id=${encodeURIComponent(id)}&perfil=${encodeURIComponent(rfPerfil())}`)) }; }
  catch (e) { rf.cuenta = { id, key: rfKey(), error: e.message, contenidos: [] }; }
  finally { rf.cuentaLoading = false; }
  if (view === 'referencias') renderReferencias(true);
}
async function loadPedidos() {
  try { rf.pedidos = { key: rfKey(), ...(await api(`referencias/pedidos?perfil=${encodeURIComponent(rfPerfil())}`)) }; } catch (e) { rf.pedidos = { key: rfKey(), pedidos: [], error: e.message }; }
  if ($('rfPedido').open) rfOpenPedido();
}

// ---------- marco ----------
function renderReferencias(fresh) {
  const P = rfPeriodo();
  $('referenciasView').dataset.seccion = rf.seccion;
  $('rfWeekTitle').innerHTML = `<span>${esc(mtTitulo(rfRango()))}</span><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6.5 3 3 3-3"/></svg>`;
  $('rfWeekTitle').title = rfRango().tipo === 'todo' ? 'Todo lo que entró, de cualquier fecha' : `Lo que entró del ${mtTramo(P.desde, P.hasta)}: el research armado y lo que encontró la base en esos días. Lo decidido se ve siempre.`;
  $('rfPrev').disabled = rfRango().tipo === 'todo'; $('rfNext').disabled = rfRango().tipo === 'todo' || P.hasta >= todayStr(); $('rfToday').disabled = rfRango().tipo === 'todo' || !!rfRango().vivo;
  $('rfQuien').textContent = perfilActual === 'all' && marcas().length > 1 ? 'Todas las marcas: elegí una en la barra para ver lo suyo' : '';
  document.querySelectorAll('[data-rfseccion]').forEach(b => { b.classList.toggle('on', b.dataset.rfseccion === rf.seccion); b.setAttribute('aria-selected', String(b.dataset.rfseccion === rf.seccion)); });
  const d = rf.data?.key === rfKey() ? rf.data : null;
  // Lo cargado hace menos de 15 s se reusa: el planner vuelve a dibujar seguido.
  if (!rf.loading && (!d || Date.now() - d.at > 15000 || !fresh)) { if (!d || Date.now() - d.at > 15000) loadReferencias(); }
  if (!rf.seleLoading && (!rfSele() || Date.now() - rf.sele.at > 15000)) loadSeleccion();
  if (!rf.compLoading && (!rf.comp || Date.now() - rf.comp.at > 60000)) loadCompetidores();
  if (rf.cuentaSel && rf.cuenta?.key !== rfKey() && !rf.cuentaLoading && rf.comp?.cuentas?.length) loadCuenta(rf.cuentaSel);
  rfContadores(d);
  const typing = document.activeElement?.dataset?.rfnota, caret = typing ? document.activeElement.selectionStart : 0;
  const rollos = ['.rfb-rows', '.rf-panel', '.rfc-wrap', '.rfm-body', '.rfs-grid'], scrolls = rollos.map(s => document.querySelector(s)?.scrollTop || 0);
  // Lo plegado del detalle que estaba abierto sigue abierto al volver a dibujar.
  const abiertos = new Set([...document.querySelectorAll('.rf-panel details[open]')].map(x => x.dataset.k));
  $('rfMain').innerHTML = rf.seccion === 'seleccion' ? rfSeleccion(rfSele()) : rf.seccion === 'competidores' ? rfCompetidores() : rfBandeja(d);
  rollos.forEach((s, i) => { const el = document.querySelector(s); if (el) el.scrollTop = scrolls[i]; });
  document.querySelectorAll('.rf-panel details[data-k]').forEach(x => { if (abiertos.has(x.dataset.k)) x.open = true; });
  // Si un menú de filtro quedó abierto, sigue anclado a su botón nuevo.
  if (typeof gv !== 'undefined' && gv.menuAnchor?.dataset?.rfdd && !gv.menuAnchor.isConnected)
    gv.menuAnchor = [...document.querySelectorAll(`[data-rfdd="${gv.menuAnchor.dataset.rfdd}"]`)].find(b => b.offsetParent) || gv.menuAnchor;
  rfAjustarAlto();
  const back = typing && document.querySelector(`[data-rfnota="${CSS.escape(typing)}"]`);
  if (back) { back.focus({ preventScroll: true }); back.setSelectionRange(caret, caret); }
}
// La lista y el detalle llegan hasta el borde de la ventana y scrollean adentro; en pantallas angostas va todo en
// columna.
function rfAjustarAlto() {
  const g = document.querySelector('#rfMain > .rfb, #rfMain > .rfc, #rfMain > .rfs');
  if (!g) return;
  g.style.height = innerWidth <= 820 ? '' : Math.max(480, innerHeight - (g.getBoundingClientRect().top + scrollY) - 16) + 'px';
}
function rfContadores(d) {
  const xs = d?.referencias || [], s = rfSele();
  $('rfNSeleccion').textContent = s?.referencias ? rfsCuantas(s, 'seleccionadas') || '' : '';
  $('rfNBandeja').textContent = d ? xs.filter(r => rfPasa(r, 'estado') && rfEtapa(r) === 'por_decidir').length || '' : '';
  $('rfNComp').textContent = (rf.comp?.cuentas || []).filter(rfCuentaDeAca).length || '';
  // Lo que ya es pieza en Guiones no se vuelve a pedir, aunque se haya elegido antes de que existieran los pedidos.
  const todas = rfElegibles(), n = todas.filter(r => rfEtapa(r) === 'elegidas').length, ya = todas.filter(r => rfEtapa(r) === 'pedidas').length;
  // Con elegidas, el pedido está en la barra de abajo; arriba queda para volver a copiar lo ya pedido o desde
  // Competidores.
  const pedir = $('rfPedir'), enBarra = n && rfConBarra();
  pedir.hidden = !!enBarra || (!n && !ya); pedir.disabled = !n && !ya; $('rfPedirCount').textContent = n;
  pedir.title = n ? `${n} para hacer` : 'Lo que pediste: podés volver a copiar el pedido';
}
const rfConBarra = () => (rf.seccion === 'seleccion' && rf.s.estado === 'seleccionadas') || (rf.seccion === 'bandeja' && rf.vista !== 'mapa');
// La barra de abajo: cuántas hay para hacer, de un vistazo, y el paso a guiones.
function rfBarra() {
  const xs = rfElegibles().filter(r => rfEtapa(r) === 'elegidas');
  if (!xs.length) return '';
  return `<footer class="rf-barra" role="status"><span class="rf-barra-thumbs" aria-hidden="true">${xs.filter(rfSrc).slice(0, 5).map(r => `<img src="${rfThumb(rfSrc(r))}" alt="" loading="lazy">`).join('')}</span>
    <button class="rf-barra-n" data-rfelegidas title="Verlas en Selección"><b>${xs.length}</b> para hacer</button><button class="primary" data-rfpedirbarra>Pedir guiones</button></footer>`;
}

// ---------- filtros: un botón por filtro y su menú ----------
function rfDd(key, val, o = {}) {
  return `<button class="rf-dd${o.on ? ' on' : ''}${o.main ? ' main' : ''}" data-rfdd="${key}" aria-haspopup="menu"${o.tip ? ` title="${esc(o.tip)}"` : ''}>${o.icon || ''}${o.k ? `<span class="k">${esc(o.k)}</span>` : ''}<b>${esc(val)}</b>${o.n != null ? `<span class="n">${o.n}</span>` : ''}${RF_IC.chev}</button>`;
}
const rfOpt = (v, label, on, n, sub) => `<button class="gv-pop-opt rf-opt${on ? ' on' : ''}" data-v="${esc(v)}" role="menuitemradio" aria-checked="${!!on}">${on ? ICON.check : '<i></i>'}<span class="t">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
// Un menú de una sola opción: tilde en la elegida y cuántas quedan con cada una (con el resto de los filtros); elegir
// lo cierra.
const rfUno = (opciones, actual, elegir, contar) => ({
  html: () => (typeof opciones === 'function' ? opciones() : opciones).map(([k, l, sub]) => rfOpt(k, l, actual() === k, contar ? contar(k) : null, sub)).join(''),
  click: e => { const b = e.target.closest('[data-v]'); if (!b) return; elegir(b.dataset.v); renderReferencias(true); return true; },
});
const rfRefs = () => rf.data?.referencias || [];
// Tema, formato y anillo admiten varios a la vez: cada opción con su ícono y cuántas quedan con el resto de los
// filtros; tildar no cierra el menú.
const rfMulti = k => ({
  html: () => `<div class="rf-pop-h"><b>${esc(rfDim(k).nombre)}</b>${rf.f[k].length ? '<button class="link" data-v="">Ver todos</button>' : ''}</div>`
    + rfValores(k).map(([v, l, que, largo]) => { const on = rf.f[k].includes(v), n = rfCuantas(k, v);
      return `<button class="gv-pop-opt rf-opt rf-multi${on ? ' on' : ''}${n ? '' : ' cero'}" data-v="${esc(v)}" role="menuitemcheckbox" aria-checked="${on}" title="${esc(que || '')}"><span class="rf-caja">${on ? ICON.check : ''}</span>${rfIcono(k, v)}<span class="t">${esc(largo || l)}</span><span class="n">${n}</span></button>`; }).join(''),
  click: e => { const b = e.target.closest('[data-v]'); if (!b) return; const v = b.dataset.v;
    rfDimElegir(k, v === '' ? [] : rf.f[k].includes(v) ? rf.f[k].filter(x => x !== v) : [...rf.f[k], v]); renderReferencias(true); return false; },
});
const RF_MENUS = {
  // Hace cuánto se publicó y cuánto superó su mediana: menús de la fila de filtros, como los demás.
  dias: rfUno([['7', 'Últimos 7 días'], ['14', 'Últimos 14 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días']], () => String(rf.f.dias), v => { rf.sel = null; rf.f.dias = Number(v); rfSave('rfDias', rf.f.dias); rf.data = null; }),
  // En foco el mínimo de lo que trae la base es ×5: elegir uno menor pasa a Todo.
  minx: rfUno(() => [['2', '×2 su mediana', rf.f.foco ? 'Pasa a Todo' : 'Lo que la duplica'], ['3', '×3 su mediana', rf.f.foco ? 'Pasa a Todo' : ''], ['5', '×5 su mediana'], ['10', '×10 su mediana', 'Sólo los muy salidos de lo normal']], () => String(rfMinVista()), v => { rf.sel = null; rf.f.minx = Number(v); rfSave('rfMinx', rf.f.minx); if (rf.f.foco && rf.f.minx < RF_FOCO_MINX) rfSetFoco(false); }),
  orden: rfUno(RF_ORDEN, () => rf.f.orden, v => { rf.f.orden = v; rfSave('rfOrden2', v); }),
  tema: rfMulti('tema'), formato: rfMulti('formato'), anillo: rfMulti('anillo'),
  // Lo que pesa menos: el tipo de cuenta, el idioma, de dónde viene y los pautados, juntos.
  mas: {
    html: () => { const f = rf.f, cuenta = k => rfRefs().filter(r => rfPasa(r, 'cuenta') && rfCuentaPasa(r.ficha, k)).length;
      return `<div class="rf-pop-sec rf-mas"><h5>Cuenta</h5>${RF_CUENTAS.map(([k, l, sub]) => `<button class="gv-pop-opt rf-opt${f.cuenta === k ? ' on' : ''}" data-rfmcuenta="${esc(k)}">${f.cuenta === k ? ICON.check : '<i></i>'}<span class="t">${esc(l)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="n">${cuenta(k)}</span></button>`).join('')}
        <h5>Idioma</h5><div class="segmented">${RF_IDIOMAS.map(([k, l]) => `<button class="${f.idioma === k ? 'on' : ''}" data-rfmidioma="${k}">${esc(l)}</button>`).join('')}</div>
        <h5>De dónde viene</h5>${Object.entries(RF_FUENTE).map(([k, l]) => `<label class="gv-pop-row"><input type="checkbox" data-rffuente="${k}" ${f.fuentes.includes(k) ? 'checked' : ''}><span>${esc(l)}</span><span class="muted">${rfRefs().filter(r => rfPasa(r, 'fuentes') && r.fuentes?.includes(k)).length}</span></label>`).join('')}
        <label class="toggle rf-mas-paut"><input type="checkbox" data-rfpautados ${f.pautados ? 'checked' : ''}> Incluir los pautados</label></div>`; },
    click: e => { const t = e.target;
      const cu = t.closest('[data-rfmcuenta]'); if (cu) { rf.sel = null; rf.f.cuenta = cu.dataset.rfmcuenta; rfSave('rfCuenta', rf.f.cuenta); renderReferencias(true); return false; }
      const id = t.closest('[data-rfmidioma]'); if (id) { rf.sel = null; rf.f.idioma = id.dataset.rfmidioma; rfSave('rfIdioma', rf.f.idioma); renderReferencias(true); return false; }
      if (t.matches('[data-rffuente]')) { const xs = [...e.currentTarget.querySelectorAll('[data-rffuente]:checked')].map(x => x.dataset.rffuente);
        if (!xs.length) { t.checked = true; return; } rf.sel = null; rf.f.fuentes = xs; rfSave('rfFuentes', xs); renderReferencias(true); return false; }
      if (t.matches('[data-rfpautados]')) { rf.sel = null; rf.f.pautados = t.checked; renderReferencias(true); return false; } },
  },
  // Los ejes de la grilla del Mapa.
  mfilas: rfUno(() => RF_DIMS.map(k => [k, rfDim(k).nombre]), () => rf.mapa.filas, v => rfMapaEje('filas', v)),
  mcols: rfUno(() => RF_DIMS.map(k => [k, rfDim(k).nombre]), () => rf.mapa.columnas, v => rfMapaEje('columnas', v)),
  ctipo: rfUno(RF_CTIPOS, () => rf.c.tipo, v => { rf.c.tipo = v; rfSave('rfCTipo', v); }, k => rfCompFiltradas('tipo').filter(x => rfTipoPasa(x, k)).length),
  ccuad: rfUno(RF_CUADRANTES, () => rf.c.cuadrante, v => { rf.c.cuadrante = v; rfSave('rfCCuad', v); }, k => rfCompFiltradas('cuadrante').filter(x => !k || x.cuadrante === k).length),
  cred: rfUno(RF_REDES, () => rf.c.red, v => { rf.c.red = v; }, k => rfCompFiltradas('red').filter(x => !k || x.red === k).length),
  cidioma: rfUno(RF_CIDIOMAS, () => rf.c.idioma, v => { rf.c.idioma = v; }, k => rfCompFiltradas('idioma').filter(x => !k || x.idioma === k).length),
  cpri: rfUno(RF_PRIORIDAD, () => rf.c.prioridad, v => { rf.c.prioridad = v; }, k => rfCompFiltradas('prioridad').filter(x => !k || x.prioridad === k).length),
};
const rfCuantas = (k, v) => rfRefs().filter(r => rfPasa(r, k) && (!v || rfTiene(k, r, v))).length;
function rfDimElegir(k, v) { rf.sel = null; rf.f[k] = v; rfSave({ tema: 'rfTema', formato: 'rfFormato', anillo: 'rfAnillo' }[k], v); }
function rfMapaEje(eje, v) {
  const otro = eje === 'filas' ? 'columnas' : 'filas';
  if (rf.mapa[otro] === v) rf.mapa[otro] = rf.mapa[eje];
  rf.mapa[eje] = v; rfSave('rfMapaFilas', rf.mapa.filas); rfSave('rfMapaCols', rf.mapa.columnas);
}
function rfMenuAbrir(btn) {
  const key = btn.dataset.rfdd, M = RF_MENUS[key];
  if (!M || typeof gvMenu !== 'function') return;
  const html = () => `<div class="rf-pop rf-pop-${key}" role="menu">${M.html()}</div>`;
  gvMenu(btn, html(), e => {
    const r = M.click(e);
    if (r === true) gvMenuClose();
    else if (r === false) { const p = document.getElementById('gvPop'); if (p && !p.hidden) p.innerHTML = html(); }
  });
}

// ---------- Bandeja ----------
// Pasa los filtros de la Bandeja; `sin` deja afuera uno, para contar las opciones de su menú.
function rfPasa(r, sin) {
  const f = rf.f, q = $('search').value.toLowerCase().trim(), sinEste = k => k === sin || (Array.isArray(sin) && sin.includes(k));
  if (!sinEste('fuentes') && !r.fuentes?.some(x => f.fuentes.includes(x))) return false;
  if (!formatoPasa(r.tipo === 'carrusel' ? 'carrusel' : 'reel')) return false;
  if (!sinEste('cuenta') && !rfCuentaPasa(r.ficha, f.cuenta)) return false;
  if (!sinEste('idioma') && !rfIdiomaPasa(r, f.idioma)) return false;
  // Con un tema, un formato o un anillo elegido, lo que todavía no se clasificó queda afuera.
  for (const k of RF_DIMS) if (!sinEste(k) && f[k].length && !f[k].some(v => rfTiene(k, r, v))) return false;
  if (!f.pautados && (r.pautado || r.base?.pautado)) return false;
  // El mínimo vale para lo que trae la base; el research y lo tuyo ya vienen elegidos.
  if (!r.fuentes.includes('semana') && !r.fuentes.includes('tuya') && (rfXOf(r) ?? 0) < f.minx) return false;
  // En foco: lo decide el servidor (enFoco, referencias.ts). Lo que ya decidiste no se oculta nunca.
  if (!sinEste('foco') && f.foco && r.en_foco === false && rfEtapa(r) === 'por_decidir') return false;
  if (!sinEste('estado') && !rfEnEstado(r, f.estado)) return false;
  return !q || [r.cuenta, r.hook?.texto, r.titulo, r.caption, r.analisis?.por_que, r.recomendacion?.nota, r.ficha?.tema, r.ficha?.nombre].some(x => String(x || '').toLowerCase().includes(q));
}
function rfVisibles() {
  const xs = (rf.data?.referencias || []).filter(r => rfPasa(r)), o = rf.f.orden;
  const val = r => o === 'puntaje' ? (r.puntaje ?? -1) : o === 'vistas' ? (r.base?.vistas ?? r.metricas?.vistas ?? r.metricas?.likes ?? -1) : o === 'fecha' ? (r.fecha || '') : o === 'research' ? -r.orden
    : o === 'relevancia' ? (r.ficha?.relevancia ?? r.ficha?.similarity ?? -1) * 1e4 + (rfXOf(r) ?? 0) : (rfXOf(r) ?? -1);
  return xs.sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? 1 : va > vb ? -1 : a.orden - b.orden; });
}
const rfMasN = () => (rf.f.cuenta ? 1 : 0) + (rf.f.idioma ? 1 : 0) + (['semana', 'base', 'tuya'].every(k => rf.f.fuentes.includes(k)) ? 0 : 1) + (rf.f.pautados ? 1 : 0);
// Cuántos filtros detallados hay puestos: se ven plegados en «Más filtros».
const rfDetallados = () => RF_DIMS.filter(k => rf.f[k].length).length + rfMasN() + (rfMinVista() !== (rf.f.foco ? RF_FOCO_MINX : RF_DEF.minx) ? 1 : 0) + (rf.f.dias !== RF_DEF.dias ? 1 : 0);
const rfFiltrosActivos = () => rfDetallados() > 0;
// El botón de tema, formato o anillo: los íconos de lo elegido y, si es uno solo, su nombre.
function rfDdMulti(k) {
  const sel = rf.f[k], nombre = rfDim(k).nombre, txt = !sel.length ? 'Todos' : sel.length === 1 ? rfDimNombre(k, sel[0]) : String(sel.length);
  return `<button class="rf-dd rf-ddm${sel.length ? ' on' : ''}" data-rfdd="${k}" aria-haspopup="menu" title="${esc(sel.length ? `${nombre}: ${sel.map(v => rfDimNombre(k, v)).join(', ')}` : `Filtrar por ${nombre.toLowerCase()}`)}"><span class="k">${esc(nombre)}</span>${sel.length ? `<span class="rf-ics">${sel.slice(0, 4).map(v => rfIcono(k, v)).join('')}</span>` : ''}<b>${esc(txt)}</b>${RF_IC.chev}</button>`;
}
// Los filtros de la Bandeja, arriba. Primero qué se mira: el interruptor En foco / Todo con cuántas quedaron afuera.
// Sin pestañas de estado desde el 2026-11-04: lo seleccionado se ve en Selección y lo que pasaste, a un toque, para
// poder recuperarlo. Tema, formato, anillo, fechas, mínimo y lo demás, plegados en «Más filtros»: compiten por atención
// con lo importante.
function rfFiltros(d) {
  const f = rf.f, listo = !!d && !d.error, masN = rfMasN(), t = d?.base?.ultima_medicion, det = rfDetallados(), abierto = f.masAbierto;
  const pasadas = listo ? rfRefs().filter(r => rfPasa(r, 'estado') && rfEnEstado(r, 'descartadas')).length : 0, otraCosa = f.estado !== 'por_decidir';
  const tip = `Vale para lo que trae la base de competidores${t ? ` (medida el ${rfFecha(t)})` : ''}; el research y tus referencias entran siempre.`;
  const fuera = listo ? rfRefs().filter(r => r.en_foco === false && rfEtapa(r) === 'por_decidir' && rfPasa(r, 'foco')).length : 0;
  const focoTip = false ? ''
    : `En foco oculta lo que no vino de vos y es de los anillos 4 o 5 o de una cuenta fuera de nicho, y lo de la base que no llega a ×${RF_FOCO_MINX} su mediana. Lo que guardaste y lo que ya decidiste entran siempre.`;
  return `<div class="rf-filtros" role="toolbar" aria-label="Filtros de la Bandeja">
    <div class="rf-fila">${otraCosa ? `<button class="link rf-volver" data-rfestado="por_decidir">${RF_IC.volver}Volver a lo que falta decidir</button>` : ''}
      <div class="segmented rf-foco" role="group" aria-label="Cuánto mostrar" title="${esc(focoTip)}"><button class="${f.foco ? 'on' : ''}" data-rffoco="1" aria-pressed="${f.foco}">En foco</button><button class="${f.foco ? '' : 'on'}" data-rffoco="0" aria-pressed="${!f.foco}">Todo</button></div>
      ${fuera ? `<span class="rf-afuera" title="${esc(focoTip)}">${fuera} ${f.foco ? 'afuera' : 'fuera de foco'}</span>` : ''}
      ${pasadas && !otraCosa ? `<button class="link rf-pasadas" data-rfestado="descartadas" title="Lo que tocaste con Paso: desde ahí se recupera">${pasadas} que pasaste</button>` : ''}
      <button class="rf-dd rf-masf${det ? ' on' : ''}" data-rfmasfiltros aria-expanded="${abierto}">${RF_IC.mas}<b>Más filtros</b>${det ? `<span class="n">${det}</span>` : ''}${RF_IC.chev}</button>
    </div>
    ${abierto ? `<div class="rf-fila rf-fila-mas">${RF_DIMS.map(rfDdMulti).join('')}${d?.base?.disponible === false ? '' : rfDd('dias', `${f.dias} días`, { k: 'Publicadas hace', tip: tip, on: f.dias !== RF_DEF.dias }) + rfDd('minx', `×${rfMinVista()}`, { k: 'Mínimo', tip: `Cuánto supera la mediana de su cuenta. ${tip}`, on: rfMinVista() !== (f.foco ? RF_FOCO_MINX : RF_DEF.minx) })}${rfDd('mas', masN ? String(masN) : '', { k: 'Cuenta, idioma y origen', on: masN > 0 })}${rfFiltrosActivos() ? '<button class="link rf-limpiar" data-rflimpiar>Limpiar filtros</button>' : ''}</div>` : ''}
  </div>`;
}
function rfBandeja(d) {
  // Arriba de la lista: cuántas quedan, la lectura del research y el orden.
  const vista = `<div class="segmented rf-vista" role="group" aria-label="Vista">${[['lista', 'Lista', 'Ver la lista'], ['grilla', 'Grilla', 'Ver las portadas más grandes'], ['mapa', 'Mapa', 'Agrupar por tema, formato y anillo']].map(([k, l, tip]) =>
    `<button class="${rf.vista === k ? 'on' : ''}" data-rfvista="${k}" aria-pressed="${rf.vista === k}" title="${tip}">${RF_IC[k]}${l}</button>`).join('')}</div>`;
  if (d && !d.error && rf.vista === 'mapa') return `${rfFiltros(d)}<div class="rfb mapa"><section class="rfm" aria-label="Mapa de referencias">
    <header class="rfb-head">${vista}<span class="rfm-ejes">Filas ${rfDd('mfilas', rfDim(rf.mapa.filas).nombre, {})} Columnas ${rfDd('mcols', rfDim(rf.mapa.columnas).nombre, {})}</span>
      <span class="rfb-head-fin">${rfVisibles().length} referencias</span></header>${rfMapa()}</section></div>`;
  const cab = n => `<header class="rfb-head">${vista}<span>${n == null ? '' : `<b>${n}</b> referencia${n === 1 ? '' : 's'}`}</span><span class="rfb-head-fin">${d?.doc?.lectura?.length ? `<button class="ghost rf-lect" data-rflectura title="Lectura del research de la semana">${RF_IC.doc}<span class="rf-lect-t">Lectura del research</span></button>` : ''}${rfDd('orden', rfNombre(RF_ORDEN, rf.f.orden), { icon: RF_IC.sort, tip: 'Ordenar la lista' })}</span></header>`;
  if (!d) return `${rfFiltros(null)}<div class="rfb"><section class="rfb-list">${cab(null)}${skeleton('list')}</section><aside class="rf-panel vacio"></aside></div>`;
  if (d.error) return `<p class="gv-empty">${esc(d.error)}</p>`;
  const xs = rfVisibles();
  if (rf.sel && !xs.some(r => r.id === rf.sel) && !rfRef(rf.sel)) rf.sel = null;
  if (!rf.sel && xs.length) rf.sel = xs[0].id;
  const r = rf.sel && rfRef(rf.sel);
  const vacio = rf.f.estado === 'por_decidir' && (d.referencias || []).length ? 'No queda nada por decidir con estos filtros.' : rf.f.estado === 'descartadas' ? 'No pasaste ninguna con estos filtros.' : (d.referencias || []).length ? `Todavía no hay referencias de ${rfPerfilNombre()} con estos filtros.` : 'Todavía no hay referencias. Pedile a Claude Code «armá el research de referencias de esta semana» (skill referencias) o sumá cuentas en Competidores: lo que más les funciona entra acá solo.';
  return `${rfFiltros(d)}
    <div class="rfb">
      <section class="rfb-list" aria-label="Referencias">${cab(xs.length)}${xs.length ? rf.vista === 'grilla' ? `<div class="rfb-rows rfb-cards" role="listbox" aria-label="Referencias para decidir">${xs.map(rfCarta).join('')}</div>` : `<div class="rfb-rows" role="listbox" aria-label="Referencias para decidir">${xs.map(rfFila).join('')}</div>`
        : `<div class="gv-empty"><p>${esc(vacio)}</p><p><button class="secondary" data-rfvertodas>Sacar los filtros</button></p></div>`}${rfBarra()}</section>
      <aside class="rf-panel${r ? '' : ' vacio'}" aria-label="Detalle">${r ? rfDetalle(r) : '<p class="muted">Elegí una referencia de la lista.</p>'}</aside>
    </div>`;
}
// ---------- Mapa ----------
// La diana (también la usa Métricas): del centro hacia afuera, qué tan cerca está cada contenido de tu comprador
// (los anillos del Audience Bullseye); alrededor, su tema. Cada punto es un contenido: `o` dice su tamaño, su nivel
// (hot o warm), su título y con qué atributos se tocan el punto, el anillo y el tema.
function dianaSvg(xs, tax, o) {
  const { temas, anillos } = tax, W = 440, H = 330, cx = 220, cy = 165, R = 122, paso = R / anillos.length, sector = 2 * Math.PI / temas.length;
  const idx = Object.fromEntries(temas.map((t, i) => [t.id, i])), en = (sel, v) => Array.isArray(sel) ? sel.includes(v) : sel === v, pasa = (sel, v) => !sel || !sel.length || en(sel, v);
  // Posición estable por contenido: el mismo punto no salta entre una vista y otra.
  const azar = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
  const pt = (rad, ang) => `cx="${(cx + rad * Math.cos(ang)).toFixed(1)}" cy="${(cy + rad * Math.sin(ang)).toFixed(1)}"`;
  const aros = anillos.slice().reverse().map(a => `<circle class="rfm-aro a${a.n}${en(o.selA, String(a.n)) ? ' on' : ''}" cx="${cx}" cy="${cy}" r="${(a.n * paso).toFixed(1)}" ${o.attrAnillo}="${a.n}"><title>${esc(`${a.n} · ${a.corto}: ${a.nombre}`)}</title></circle>`).join('');
  const rayos = temas.map((t, i) => { const ang = i * sector - Math.PI / 2; return `<line class="rfm-rayo" x1="${cx}" y1="${cy}" x2="${(cx + R * Math.cos(ang)).toFixed(1)}" y2="${(cy + R * Math.sin(ang)).toFixed(1)}"/>`; }).join('')
    + anillos.map(a => `<text class="rfm-num" x="${cx + 4}" y="${(cy - (a.n - .5) * paso).toFixed(1)}" dominant-baseline="middle">${a.n}</text>`).join('');
  const puntos = xs.slice().sort((a, b) => o.tam(a) - o.tam(b)).map(r => {
    const i = idx[r.clase.tema], a = r.clase.anillo;
    if (i == null || !a) return '';
    const on = pasa(o.selT, r.clase.tema) && pasa(o.selA, String(a)), nv = o.nivel(r);
    return `<circle class="rfm-punto a${a}${nv ? ' ' + nv : ''}${on ? '' : ' off'}" ${pt((a - 1 + .2 + .6 * azar(r.id + 'r')) * paso, (i + .1 + .8 * azar(r.id)) * sector - Math.PI / 2)} r="${o.tam(r).toFixed(1)}" ${o.attrPunto}="${esc(r.id)}"><title>${esc(o.titulo(r))}</title></circle>`;
  }).join('');
  const nombres = temas.map((t, i) => {
    const ang = (i + .5) * sector - Math.PI / 2, c = Math.cos(ang), x = cx + (R + 12) * c, y = cy + (R + 12) * Math.sin(ang);
    return `<text class="rfm-tema${en(o.selT, t.id) ? ' on' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${Math.abs(c) < .2 ? 'middle' : c > 0 ? 'start' : 'end'}" dominant-baseline="middle" ${o.attrTema}="${t.id}"><title>${esc(t.largo + ': ' + t.que)}</title>${esc(t.nombre)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || 'Por anillo y por tema')}">${aros}${rayos}${puntos}${nombres}</svg>`;
}
// Los anillos con cuántos contenidos tiene cada uno (con el tema elegido).
const dianaLeyenda = (xs, tax, selT, selA, attr) => tax.anillos.map(a => { const k = String(a.n), varios = v => Array.isArray(v) ? v : v ? [v] : [];
  const n = xs.filter(r => String(r.clase.anillo) === k && (!varios(selT).length || varios(selT).includes(r.clase.tema))).length;
  return `<button class="rfm-ley${varios(selA).includes(k) ? ' on' : ''}" ${attr}="${k}" title="${esc(a.que || a.nombre)}">${rfAnilloIc(k)}<span class="t">${k} · ${esc(a.corto)}</span><span class="n">${n}</span></button>`; }).join('');
// En la Bandeja cada punto es una referencia: crece y se colorea con su viralidad (el anillo ya es su lugar en la
// diana). Respeta los filtros salvo tema y anillo, que se eligen ahí mismo.
function rfDiana() {
  const xs = rfRefs().filter(r => r.clase && rfPasa(r, ['tema', 'anillo'])), p = r => r.puntaje_det?.viralidad ?? 0;
  const svg = dianaSvg(xs, rfTax(), { selT: rf.f.tema, selA: rf.f.anillo, tam: r => 2.2 + p(r) / 22, nivel: r => p(r) >= 60 ? 'hot' : p(r) >= 40 ? 'warm' : '',
    titulo: r => `${rfTitulo(r)} · ${r.cuenta || ''} · ${rfPuntajeTip(r)}`, attrPunto: 'data-rfpunto', attrAnillo: 'data-rfanillo', attrTema: 'data-rftemaset', aria: 'Referencias por anillo y por tema' });
  return `<figure class="rfm-diana">${svg}
    <figcaption>Del centro hacia afuera, qué tan cerca está de tu comprador; alrededor, de qué habla. El color es el anillo y el tamaño, la viralidad. Tocá un anillo o un tema para filtrar.</figcaption>
    <div class="rfm-leyenda">${dianaLeyenda(xs, rfTax(), rf.f.tema, rf.f.anillo, 'data-rfanillo')}</div></figure>`;
}
// La grilla: dos ejes a elección (formato, tema o anillo). Cada celda dice cuántas hay, las mejores y su mayor
// múltiplo; el color suma el puntaje de lo que tiene. Respeta los filtros salvo los de sus dos ejes.
function rfGrilla() {
  const F = rf.mapa.filas, C = rf.mapa.columnas, filas = rfDim(F).valores, cols = rfDim(C).valores;
  const xs = rfRefs().filter(r => rfDe(F, r) && rfDe(C, r) && rfPasa(r, [F, C])), celda = {};
  for (const r of xs) (celda[rfDe(F, r) + '|' + rfDe(C, r)] ||= []).push(r);
  const sum = v => v.reduce((s, r) => s + (r.puntaje ?? 0), 0), max = Math.max(1, ...Object.values(celda).map(sum));
  const nivel = v => { const z = sum(v) / max; return z > .6 ? ' g4' : z > .35 ? ' g3' : z > .15 ? ' g2' : z > 0 ? ' g1' : ''; };
  const tot = (eje, k) => xs.filter(r => rfDe(eje, r) === k).length;
  const cabeza = `<tr><th class="rfm-esq"></th>${cols.map(([k, l, que]) =>
    `<th class="${rf.f[C].includes(k) ? 'on' : ''}" data-rfeje="${C}|${k}" title="${esc(que || '')}">${rfIcono(C, k)}<span>${esc(l)}</span><small>${tot(C, k)}</small></th>`).join('')}</tr>`;
  const cuerpo = filas.map(([fk, fl, fque]) => `<tr><th class="${rf.f[F].includes(fk) ? 'on' : ''}" data-rfeje="${F}|${fk}" title="${esc(fque || '')}"><span class="rfm-th">${rfIcono(F, fk)}<span>${esc(fl)}</span></span><small>${tot(F, fk)}</small></th>${cols.map(([ck, cl]) => {
    const v = (celda[fk + '|' + ck] || []).sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0));
    if (!v.length) return '<td class="rfm-celda vacia"></td>';
    const xmax = Math.max(...v.map(r => rfXOf(r) ?? 0));
    return `<td class="rfm-celda${nivel(v)}${rf.f[F].includes(fk) && rf.f[C].includes(ck) ? ' on' : ''}" data-rfcelda="${F}|${fk}|${C}|${ck}" title="${esc(`${fl} × ${cl}: ${v.length} referencia${v.length === 1 ? '' : 's'}`)}">
      <b>${v.length}</b>${xmax ? `<small>${esc(rfXtxt(xmax))}</small>` : ''}<span class="rfm-thumbs">${v.slice(0, 3).map(r => rfSrc(r) ? `<img src="${rfThumb(rfSrc(r))}" alt="" loading="lazy">` : '<i></i>').join('')}</span></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="rfm-grilla"><table><thead>${cabeza}</thead><tbody>${cuerpo}</tbody></table></div>`;
}
function rfMapa() {
  if (!rfTax().temas.length) return '<p class="gv-empty muted">Falta la taxonomía de temas y formatos (<research>/taxonomia.json).</p>';
  const sin = rfRefs().filter(r => !r.clase && rfPasa(r)).length;
  return `<div class="rfm-body">${rfDiana()}${rfGrilla()}</div>${sin ? `<p class="hint rfm-pie">${sin} sin clasificar todavía: entran cuando corre engine/research/temas.py.</p>` : ''}`;
}
// Hacer y Paso en cada fila y cada portada, para decidir sin abrir el detalle. Lo ya decidido queda marcado.
const RF_VOTO = { si: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  no: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' };
function rfVoto(r) {
  const d = r.decision?.decision, si = d === 'adaptar', no = d === 'descartar';
  return `<span class="rf-voto${si || no ? ' hecho' : ''}"><button class="${si ? 'on si' : ''}" data-rfvoto="si" data-key="${esc(r.id)}" title="${si ? 'Para hacer (tocá para quitarla)' : 'Hacer (L)'}" aria-pressed="${si}">${RF_VOTO.si}</button><button class="${no ? 'on no' : ''}" data-rfvoto="no" data-key="${esc(r.id)}" title="${no ? 'Pasaste (tocá para recuperarla)' : 'Paso (X)'}" aria-pressed="${no}">${RF_VOTO.no}</button></span>`;
}
// En la grilla, cada referencia es su portada grande con el múltiplo, el título y la cuenta.
function rfCarta(r) {
  const x = rfXOf(r), et = rfEtapa(r), src = rfSrc(r), m = r.metricas || {}, vistas = r.base?.vistas ?? m.vistas, likes = r.base?.likes ?? m.likes;
  return `<div class="rfcard e-${et}${rf.sel === r.id ? ' on' : ''}" role="option" aria-selected="${rf.sel === r.id}" data-rfsel="${esc(r.id)}" tabindex="-1">
    <span class="rfcard-img">${src ? `<img src="${rfThumb(src)}" alt="" loading="lazy">` : ''}${x != null ? `<b class="rf-x over ${rfBanda(x)}">${esc(rfXtxt(x))}</b>` : ''}${r.tipo === 'carrusel' ? `<i title="Carrusel">${RF_IC.carr}</i>` : ''}${et !== 'por_decidir' ? `<span class="rf-etapa e-${et}">${esc(RF_ETAPA[et])}</span>` : ''}${rfVoto(r)}</span>
    <span class="rfcard-t">${esc(rfTitulo(r))}</span>
    <small>${rfPuntaje(r)}<span class="who">${esc(r.cuenta || '')}</span><span class="n">${vistas != null ? rfNum(vistas) : likes != null ? rfNum(likes) + ' likes' : ''}</span></small></div>`;
}
// Por qué para vos, en una frase: lo que dije en la Selección, lo que sugirió el research o por qué funcionó.
const rfPorque = r => r.seleccion?.razon || r.recomendacion?.nota || r.analisis?.por_que || '';
function rfFila(r) {
  const x = rfXOf(r), et = rfEtapa(r), src = rfSrc(r), m = r.metricas || {}, sel = r.seleccion, por = rfPorque(r);
  const vistas = r.base?.vistas ?? m.vistas, likes = r.base?.likes ?? m.likes;
  const meta = [r.cuenta && `<span class="who">${esc(r.cuenta)}</span>`, NET_ICON[r.red] && `<span class="net" title="${esc(RF_RED[r.red])}">${NET_ICON[r.red]}</span>`, r.fecha && `<span>${esc(fmt(r.fecha, { day: 'numeric', month: 'short' }))}</span>`].filter(Boolean).join('');
  const marcas = [sel && `<span class="rf-src sele" title="En tu Selección, puesto ${sel.puesto}">Selección ${sel.puesto}</span>`, et !== 'por_decidir' && `<span class="rf-etapa e-${et}">${esc(RF_ETAPA[et])}${et === 'elegidas' || et === 'pedidas' ? ` · ${esc(rfComoTxt(r))}` : ''}</span>`,
    r.fuentes.includes('tuya') && '<span class="rf-src tuya">Tuya</span>', (r.pautado || r.base?.pautado) && '<span class="rf-src paid">Pautado</span>'].filter(Boolean).join('');
  return `<div class="rfr e-${et}${rf.sel === r.id ? ' on' : ''}" role="option" aria-selected="${rf.sel === r.id}" data-rfsel="${esc(r.id)}" tabindex="-1">
    <span class="rfr-thumb">${src ? `<img src="${rfThumb(src)}" alt="" loading="lazy">` : ''}${r.tipo === 'carrusel' ? `<i title="Carrusel">${RF_IC.carr}</i>` : ''}</span>
    <span class="rfr-txt"><b>${esc(rfTitulo(r))}</b>${por ? `<span class="rfr-por">${esc(por)}</span>` : ''}<small>${meta}${marcas}${rfPuntaje(r)}</small></span>
    <span class="rfr-num">${x != null ? `<b class="rf-x ${rfBanda(x)}">${esc(rfXtxt(x))}</b>` : ''}<small>${vistas != null ? rfNum(vistas) + ' vistas' : likes != null ? rfNum(likes) + ' likes' : ''}</small></span>${rfVoto(r)}
  </div>`;
}

// ---------- Selección ----------
// Todo lo seleccionado, por estado. En Seleccionadas, lo que tocaste con Hacer y lo que propongo: la curaduría que
// escribe Claude, con el foco y cuántas revisé, Candidatos o Top 50 y el mensaje al que apunta cada una. Lo que pasás
// se va abajo de todo, plegado. Tocar la tarjeta abre el detalle al costado.
const RF_NIVELES = [['candidata', 'Candidatos'], ['top', 'Top 50']];
const rfsDelFormato = s => s.referencias.filter(r => formatoPasa(r.tipo === 'carrusel' ? 'carrusel' : 'reel'));
// En qué estado de la Selección está cada una. Lo que no propuse y no decidiste (una pieza descartada, por ejemplo) no
// está.
const rfsEstadoDe = r => { const t = rfEtapa(r); return t === 'en_guiones' ? 'guiones' : t === 'aprobadas' ? 'produccion' : t === 'descartadas' ? 'pasadas' : t !== 'por_decidir' || r.seleccion ? 'seleccionadas' : null; };
const rfsPropuestas = s => rfsDelFormato(s).filter(r => r.seleccion && rfEtapa(r) === 'por_decidir');
// Las propuestas con el nivel elegido. Sin candidatas marcadas, el Top 50.
function rfsNivel(s) { const xs = rfsDelFormato(s).filter(r => r.seleccion && rfsEstadoDe(r) === 'seleccionadas'), c = xs.filter(r => r.seleccion.nivel === 'candidata'); return rf.s.nivel === 'candidata' && c.length ? { nivel: 'candidata', xs: c } : { nivel: 'top', xs }; }
const rfsTuyas = s => rfsDelFormato(s).filter(r => ['elegidas', 'pedidas'].includes(rfEtapa(r)));
// Cuántas hay en un estado. En Seleccionadas: lo tuyo y las candidatas que faltan decidir.
function rfsCuantas(s, e) {
  if (e !== 'seleccionadas') return rfsDelFormato(s).filter(r => rfsEstadoDe(r) === e).length;
  const ps = rfsPropuestas(s), c = ps.filter(r => r.seleccion.nivel === 'candidata');
  return rfsTuyas(s).length + (c.length || ps.length);
}
// Las tarjetas que se ven: primero lo que tocaste con Hacer, después lo que propongo con el nivel y el mensaje
// elegidos.
const rfsDelMensaje = (s, m) => [...new Map([...rfsTuyas(s), ...rfsNivel(s).xs].filter(r => !m || r.seleccion?.mensaje === m).map(r => [r.id, r])).values()];
function rfsVisibles(s = rfSele()) {
  if (!s?.referencias) return [];
  return rf.s.estado === 'seleccionadas' ? rfsDelMensaje(s, rf.s.mensaje) : rfsDelFormato(s).filter(r => rfsEstadoDe(r) === rf.s.estado);
}
function rfsCarta(r, conCandidata) {
  const e = r.seleccion || {}, x = rfXOf(r), src = rfSrc(r), et = rfEtapa(r), m = r.metricas || {}, vistas = r.base?.vistas ?? m.vistas, likes = r.base?.likes ?? m.likes, c = e.como || {}, id = esc(r.id), uso = r.usos?.find(u => u.estado !== 'descartado');
  // El tacho, en cualquier etapa. Lo que todavía no se decidió ya lo tiene: es Paso.
  const tacho = `<button class="secondary rfs-tacho" data-rfvoto="no" data-key="${id}" title="Descartar (X): sale de acá y se recupera abajo, en Descartadas" aria-label="Descartar">${ICON.trash}</button>`;
  const acciones = et === 'descartadas' ? `<button class="secondary rfs-recupera" data-rfquitar="${id}">Recuperar</button>`
    : uso ? `<button class="rfs-guion" data-rfguion="${esc(uso.week)}" data-pieza="${esc(uso.id)}" title="Ver «${esc(uso.titulo || uso.id)}» en Guiones"><span class="rfs-guion-e">${esc(RF_ETAPA[et])} ·</span><span class="rfs-guion-v">Ver</span><span>${esc(uso.id)}</span>${ICON.right}</button>${tacho}`
    : et === 'elegidas' ? `<button class="rfs-ok" data-rfvoto="si" data-key="${id}" aria-pressed="true" title="Tocá para quitarla">${RF_VOTO.si}Para hacer</button>${tacho}`
    : et === 'pedidas' ? `<span class="rfs-ok ped">${RF_VOTO.si}Pedida</span>${tacho}`
    : `<button class="primary rfs-hacer" data-rfvoto="si" data-key="${id}" title="Hacer (L): ${esc(rfComoTxt(r))}">Hacer</button><button class="secondary rfs-paso" data-rfvoto="no" data-key="${id}" title="Paso (X)">Paso</button>`;
  return `<article class="rfs-card e-${et}${e.nivel === 'candidata' ? ' candidata' : ''}${rf.sSel === r.id ? ' on' : ''}" data-rfssel="${id}" tabindex="0" aria-label="${esc(rfTitulo(r))}">
    <div class="rfs-img">${src ? `<img src="${rfThumb(src)}" alt="" loading="lazy">` : ''}
      ${e.puesto ? `<span class="rfs-puesto" title="Puesto ${e.puesto}${e.nivel === 'candidata' ? ': candidata' : ''}">${e.puesto}</span>` : ''}${conCandidata && e.nivel === 'candidata' ? '<span class="rfs-marca">Candidata</span>' : ''}
      ${x != null ? `<b class="rfs-x ${rfBanda(x)}" title="${esc(rfXtxt(x) + ' ' + (rfXBase(r) || 'contra su mediana'))}">${esc(rfXtxt(x))}</b>` : ''}
      <span class="rfs-vistas">${r.tipo === 'carrusel' ? RF_IC.carr : ''}${vistas != null ? rfNum(vistas) + ' vistas' : likes != null ? rfNum(likes) + ' likes' : ''}</span></div>
    <div class="rfs-body">
      <h3 class="rfs-hook">${esc(rfTitulo(r))}</h3>
      <p class="rfs-cuenta">${NET_ICON[r.red] ? `<span class="net" title="${esc(RF_RED[r.red] || '')}">${NET_ICON[r.red]}</span>` : ''}<span class="who">${esc(r.cuenta || '')}</span></p>
      ${e.razon ? `<p class="rfs-razon" title="${esc(e.razon)}">${esc(e.razon)}</p>` : ''}
      <p class="rfs-chips">${c.formato ? `<span class="rfs-chip">${esc(c.formato)}</span>` : ''}${e.mensaje ? `<span class="rfs-chip ${rfMensajeClase(e.mensaje)}">${esc(rfMensajeTxt(e.mensaje))}</span>` : ''}</p>
      <div class="rfs-acc">${acciones}</div>
    </div></article>`;
}
function rfSeleccion(s) {
  if (!s) return `<div class="rfs-carga">${skeleton('posters')}</div>`;
  if (s.error) return `<p class="gv-empty">${esc(s.error)}</p>`;
  const e = s.seleccion, estado = rf.s.estado, enSel = estado === 'seleccionadas';
  if (!s.referencias.length) return `<div class="gv-empty rfs-vacia"><p>Todavía no hay nada seleccionado de ${esc(rfPerfilNombre())}.</p><p class="muted">Tocá Hacer en la Bandeja, o pedile a Claude Code «armá la selección de referencias de esta semana» (skill referencias): te propone hasta 20 candidatas con su porqué.</p><p><button class="secondary" data-rfseccion="bandeja">Ir a la Bandeja</button></p></div>`;
  const { nivel } = rfsNivel(s), todas = rfsDelFormato(s).filter(r => r.seleccion), faltan = rfsPropuestas(s), cand = faltan.filter(r => r.seleccion.nivel === 'candidata').length;
  const cuantas = m => rfsDelMensaje(s, m).length;
  if (rf.s.mensaje && !cuantas(rf.s.mensaje)) rf.s.mensaje = '';
  const activas = rfsVisibles(s).filter(r => rfEtapa(r) !== 'descartadas'), pasadas = rfsDelFormato(s).filter(r => rfEtapa(r) === 'descartadas' && (!enSel || !rf.s.mensaje || r.seleccion?.mensaje === rf.s.mensaje));
  const r = rf.sSel && s.referencias.find(x => x.id === rf.sSel), rev = e?.pool?.revisadas;
  const pills = [['', 'Todos'], ...[...new Set(todas.map(x => x.seleccion?.mensaje).filter(Boolean))].map(k => [k, rfMensajeTxt(k)])].filter(([k]) => !k || cuantas(k)).map(([k, l]) => `<button class="rfs-pill${rf.s.mensaje === k ? ' on' : ''}" data-rfsmensaje="${k}" aria-pressed="${rf.s.mensaje === k}">${esc(l)}<span class="n">${cuantas(k)}</span></button>`).join('');
  const cuenta = rev != null ? `Revisé ${rev.toLocaleString('es-AR')}, te propongo ${todas.length}` : `Te propongo ${todas.length}`;
  const sin = { seleccionadas: 'No queda nada seleccionado. Tocá Hacer en la Bandeja.', guiones: 'Ninguna referencia está en guiones.', produccion: 'Ninguna referencia está en producción.' }[estado];
  return `${e && enSel ? `<header class="rfs-foco"><p class="rfs-foco-t">${esc(e.foco || e.titulo || '')}</p>
      <p class="rfs-foco-m">${esc(cuenta)}${e.motivos?.length ? ` · <button class="link" data-rfafuera aria-haspopup="true">Qué dejé afuera</button>` : ''}</p></header>` : ''}
    <div class="rfs-ctrl"><div class="segmented rf-estado" role="group" aria-label="En qué estado">${RF_SESTADOS.map(([k, l, tip]) => `<button class="${estado === k ? 'on' : ''}" data-rfsestado="${k}" aria-pressed="${estado === k}" title="${esc(tip)}">${esc(l)}<span class="n">${rfsCuantas(s, k) || ''}</span></button>`).join('')}</div>
      ${e && enSel && faltan.length ? `<div class="segmented" role="group" aria-label="Cuáles de las que propongo">${RF_NIVELES.filter(([k]) => k !== 'candidata' || cand).map(([k, l]) => `<button class="${nivel === k ? 'on' : ''}" data-rfsnivel="${k}" aria-pressed="${nivel === k}">${esc(k === 'top' ? 'Top' : l)}<span class="n">${k === 'candidata' ? cand : faltan.length}</span></button>`).join('')}</div>
      <div class="rfs-pills" role="group" aria-label="Qué comunica">${pills}</div>` : ''}</div>
    <div class="rfs${r ? '' : ' solo'}">
      <section class="rfs-lista" aria-label="Selección"><div class="rfs-grid">${activas.map(x => rfsCarta(x, nivel === 'top')).join('') || `<p class="gv-empty rfs-sin">${esc(sin)}</p>`}
        ${pasadas.length ? `<div class="rfs-pasadas"><button class="link" data-rfspasadas aria-expanded="${rf.s.pasadas}">${rf.s.pasadas ? 'Ocultar' : 'Ver'} ${pasadas.length === 1 ? 'la descartada' : `las ${pasadas.length} descartadas`}</button></div>${rf.s.pasadas ? pasadas.map(x => rfsCarta(x, nivel === 'top')).join('') : ''}` : ''}</div>${enSel ? rfBarra() : ''}</section>
      ${r ? `<aside class="rf-panel rfs-panel" aria-label="Detalle">${rfDetalle(r, false, true)}</aside>` : ''}
    </div>`;
}
// Qué dejé afuera, a un toque.
function rfsAfuera(btn) {
  const e = rfSele()?.seleccion; if (!e || typeof gvMenu !== 'function') return;
  const f = e.pool?.filtradas;
  gvMenu(btn, `<div class="rfs-afuera-pop"><b>Qué dejé afuera${f != null ? ` <span class="muted">${f.toLocaleString('es-AR')}</span>` : ''}</b><ul>${(e.motivos || []).map(m => `<li>${esc(m)}</li>`).join('')}</ul><button class="link" data-rfsbandeja>Ver todo en la Bandeja</button></div>`, ev => {
    if (ev.target.closest('[data-rfsbandeja]')) { gvMenuClose(); rf.seccion = 'bandeja'; rfSave('rfSeccion2', 'bandeja'); renderReferencias(true); } });
}

// ---------- el video, acá ----------
// Casi ninguna referencia trae el video bajado, sólo la portada: se ve con el reproductor que cada red deja insertar
// (Instagram, TikTok, YouTube), en una ventana, sin iniciar sesión.
function rfEmbed(r) {
  const u = String(r?.url || '');
  let m = u.match(/instagram\.com\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/);
  if (m) return { src: `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed/`, red: 'instagram', w: 400, h: 760 };
  m = u.match(/tiktok\.com\/@[\w.-]+\/(?:video|photo)\/(\d+)/);
  if (m) return { src: `https://www.tiktok.com/player/v1/${m[1]}?autoplay=1&rel=0&description=1`, red: 'tiktok', w: 380, h: 676 };
  m = u.match(/(?:youtube\.com\/shorts\/|youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (m) return /shorts/.test(u) ? { src: `https://www.youtube.com/embed/${m[1]}?autoplay=1`, red: 'youtube', w: 380, h: 676 } : { src: `https://www.youtube.com/embed/${m[1]}?autoplay=1`, red: 'youtube', w: 720, h: 405 };
  return null;
}
// Cada red con su reproductor, en la ventana y sin bajar nada. Si el video ya está bajado (por el análisis), se ve ése.
function rfVer(r) {
  const e = rfEmbed(r), dl = $('rfPlayer'); if (!e) return;
  const cab = `<div class="rf-player-h"><span class="net">${NET_ICON[e.red] || ''}</span><b>${esc(r.cuenta || '')}</b><a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir en ${esc(RF_RED[e.red] || 'la red')}</a><button class="icon close" data-rfx aria-label="Cerrar"><svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div>`;
  const pie = r.decision?.decision === 'adaptar' || r.decision?.decision === 'descartar' ? '' : `<div class="rf-player-pie">${rfVoto(r)}<span class="hint">L hacer · X paso · Esc cierra</span></div>`;
  const video = r.media?.video ? `<video class="rf-player-v" src="${esc(mediaUrl(r.media.video))}" controls autoplay playsinline style="height:min(${e.h - 80}px, calc(100vh - 140px))"></video>`
    : `<iframe src="${esc(e.src)}" style="width:min(${e.w}px, 92vw);height:min(${e.h}px, calc(100vh - 140px))" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="Video de ${esc(r.cuenta || 'la referencia')}"></iframe>`;
  dl.innerHTML = cab + video + pie; dl.dataset.key = r.id;
  if (!dl.open) dl.showModal();
}

// ---------- detalle ----------
// La jerarquía del detalle: el video, el gancho, los números con su contexto, por qué para vos, cómo la haría y la
// decisión siempre a la vista, pegada abajo. El análisis largo y la transcripción, plegados; el original, a un clic.
function rfDetalle(r, conVolver, conCerrar) {
  const m = r.media || {}, a = r.analisis || {}, h = r.hook || {}, f = r.ficha, met = r.metricas || {}, x = rfXOf(r), e = r.seleccion;
  const media = m.video ? `<video src="${esc(mediaUrl(m.video))}" ${m.poster ? `poster="${esc(rfThumb(m.poster))}"` : ''} controls playsinline preload="metadata"></video>`
    : m.laminas?.length ? `<div class="rf-laminas">${m.laminas.map((l, i) => `<a href="${esc(mediaUrl(l))}" target="_blank" rel="noopener"><img src="${esc(mediaUrl(l))}" alt="Lámina ${i + 1}" loading="lazy"></a>`).join('')}</div>`
    : rfEmbed(r) ? `<button class="rfd-play" data-rfplay="${esc(r.id)}" title="Ver el video acá (V)">${m.poster ? `<img src="${esc(rfThumb(m.poster))}" alt="">` : ''}<span class="rfd-play-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>Ver acá</span></button>`
    : m.poster ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" title="Abrir el original"><img src="${esc(rfThumb(m.poster))}" alt=""></a>` : `<a class="rf-sinmedia" href="${esc(r.url)}" target="_blank" rel="noopener">Abrir en ${esc(RF_RED[r.red] || 'la red')}</a>`;
  const vistas = r.base?.vistas ?? met.vistas, likes = r.base?.likes ?? met.likes;
  // Los números con su contexto: cuánto superó lo normal de esa cuenta y cuánto es lo normal.
  const xb = rfXBase(r), sobre = /sandcastles/i.test(xb) ? 'de su promedio' : 'de su mediana', medU = /likes/.test(xb) ? 'likes' : 'vistas', stat = (v, t, c = '') => `<div class="rfd-stat${c}"><b>${v}</b><span>${t}</span></div>`;
  const stats = [x != null && stat(esc(rfXtxt(x)), `${sobre}${met.mediana_cuenta ? ` de ${rfNum(met.mediana_cuenta)} ${medU}` : ''}`, rfBanda(x) ? ' ' + rfBanda(x) : ''), vistas != null ? stat(rfNum(vistas), 'vistas') : likes != null ? stat(rfNum(likes), 'likes') : ''].filter(Boolean).join('');
  const nums = [vistas != null && likes != null && `${rfNum(likes)} likes`, met.comentarios != null && `${rfNum(met.comentarios)} comentarios`, met.guardados != null && `${rfNum(met.guardados)} guardados`, met.compartidos != null && `${rfNum(met.compartidos)} compartidos`].filter(Boolean).join(' · ');
  const sec = (t, v) => v ? `<section class="rfd-sec"><h4>${esc(t)}</h4><p>${esc(v)}</p></section>` : '';
  const via = r.fuentes.includes('semana') && (RF_ORIGEN[r.origen] || r.origen);
  const meta = [f ? `<button class="link rfd-cta" data-rfvercuenta="${esc(f.id)}" title="Ver la cuenta">${esc(r.cuenta)}</button>` : esc(r.cuenta || ''), esc(RF_RED[r.red] || ''), r.tipo === 'carrusel' ? 'Carrusel' + (r.slides ? ` de ${r.slides}` : '') : 'Reel',
    r.fecha && esc(fmt(r.fecha, { day: 'numeric', month: 'short', year: 'numeric' })), via && `vía ${esc(via)}`].filter(Boolean).join(' · ');
  const original = h.texto && h.texto !== rfTitulo(r) ? h.texto : '';
  const por = e?.razon || r.recomendacion?.nota || a.por_que || (f?.que_tomar ? `De esta cuenta: ${f.que_tomar}` : '');
  const clase = r.clase ? [['tema', r.clase.tema], ['formato', r.clase.formato], ['anillo', r.clase.anillo && String(r.clase.anillo)]].filter(([, v]) => v).map(([k, v]) => `<span>${rfIcono(k, v)}${esc((k === 'anillo' ? 'Anillo ' : '') + rfDimNombre(k, v))}</span>`).join('') : '';
  const largo = [sec('Por qué funcionó', a.por_que !== por ? a.por_que : ''), sec('La idea', a.idea), sec('Qué se copia', a.copiar), sec('Qué no se copia', a.no_copiar), sec('El twist', a.twist), sec('Mecanismo', a.mecanismo || r.formato?.mecanismo),
    r.formato?.detalle || r.formato?.estructura_txt ? sec('Formato', [r.formato.detalle, r.formato.estructura_txt].filter(Boolean).join('\n')) : '', sec('Lo que se ve en el gancho', h.visual), sec('El gancho para completar', h.madlib), sec('Para vos', por !== r.recomendacion?.nota ? r.recomendacion?.nota : '')].join('');
  const cuenta = conVolver && (rf.comp?.cuentas || []).find(c => c.id === rf.cuentaSel);
  return `${conVolver ? `<button class="link rf-volver" data-rfcback>${ICON.left} ${esc(cuenta?.cuenta || 'La cuenta')}</button>` : ''}${conCerrar ? `<button class="icon rfd-cerrar" data-rfscerrar title="Cerrar (Esc)" aria-label="Cerrar el detalle">${RF_IC.x}</button>` : ''}
    <div class="rfd-head">
      <div class="rfd-media">${media}</div>
      <div class="rfd-info">
        <p class="rfd-titulo">${esc(rfTitulo(r))}</p>
        ${original ? `<p class="rfd-original" title="El gancho original">«${esc(original)}»</p>` : ''}
        ${stats ? `<div class="rfd-stats">${stats}</div>` : ''}
        ${nums ? `<p class="rfd-nums">${nums}</p>` : ''}
        <p class="rfd-meta">${meta}</p>
        <p class="rfd-links"><a class="link" href="${esc(r.url)}" target="_blank" rel="noopener">Ver el original</a>${h.texto || e?.hook_es ? `<button class="link" data-rfcopiar="${esc(r.id)}">Copiar el gancho</button>` : ''}</p>
        ${r.pautado || r.base?.pautado ? '<p class="hint warn">Pautado: tuvo bastante menos likes por vista que lo habitual en la cuenta.</p>' : ''}
      </div>
    </div>
    ${por || clase || e?.mensaje ? `<section class="rfd-bloque"><h4>Por qué para vos</h4>${por ? `<p>${esc(por)}</p>` : ''}${clase || e?.mensaje ? `<p class="rfd-clase" title="Tema, formato y anillo (engine/research/temas.py)">${e?.mensaje ? `<span class="rfs-chip ${rfMensajeClase(e.mensaje)}">${esc(rfMensajeTxt(e.mensaje))}</span>` : ''}${clase}</p>` : ''}</section>` : ''}
    ${rfComoBloque(r)}
    ${r.analizada === 'en_cola' ? '<p class="rfd-analiza">Analizando el video: en unos minutos aparecen la transcripción, el gancho y la idea.</p>' : ''}
    ${r.usos?.length > 1 ? `<section class="rfd-bloque"><h4>En Guiones</h4>${rfUsos(r)}</section>` : ''}
    <div class="rfd-plegados">
      ${largo ? `<details class="rfd-sec" data-k="analisis"><summary>Análisis</summary>${largo}</details>` : ''}
      ${a.transcripcion ? `<details class="rfd-sec" data-k="transcripcion"><summary>Transcripción</summary><p>${esc(a.transcripcion)}</p></details>` : ''}
      ${r.caption ? `<details class="rfd-sec" data-k="caption"><summary>Caption</summary><p>${esc(r.caption)}</p></details>` : ''}
      ${r.puntaje_det?.puntaje != null ? `<details class="rfd-sec" data-k="puntaje"><summary>Puntaje ${r.puntaje_det.puntaje}</summary>${rfPuntajeDet(r)}</details>` : ''}
      ${f && !conVolver ? `<details class="rfd-sec" data-k="cuenta"><summary>La cuenta</summary>${rfFichaMini(f)}</details>` : ''}
    </div>
    ${rfDecision(r)}`;
}
// Qué se toma y reel o carrusel: una opción secundaria, no un paso. Se ve lo que va a pasar en una frase; las opciones,
// al tocar Cambiar o una vez elegida. Tocar una opción en una sin decidir ya la deja para hacer con esa opción.
function rfComoBloque(r) {
  const d = r.decision?.decision === 'adaptar' ? r.decision : null, x = rfDefaults(r), c = r.seleccion?.como || {}, id = esc(r.id), abierto = !!d || rf.cambiar === r.id, fmtP = c.formato || r.formato?.propio;
  const como = k => `<button class="rf-op${x.como === k ? ' on' : ''}" data-rfcomo="${k}" data-key="${id}" aria-pressed="${x.como === k}">${k === 'reel' ? 'Reel' : 'Carrusel'}<kbd>${k === 'reel' ? 'R' : 'C'}</kbd></button>`;
  const tomar = (t, i) => `<button class="rf-op${x.tomar === t ? ' on' : ''}" data-rftomar="${t}" data-key="${id}" title="${esc(RF_TOMAR[t][1])}" aria-pressed="${x.tomar === t}">${esc(RF_TOMAR[t][0])}<kbd>${i + 1}</kbd></button>`;
  return `<section class="rfd-bloque rfd-como"><h4>Cómo la haría</h4>
    ${c.detalle ? `<p>${esc(c.detalle)}</p>` : ''}
    <p class="rfd-def"><b>${esc(RF_TOMAR[x.tomar][0])}</b> · ${x.como === 'carrusel' ? 'Carrusel' : 'Reel'}${fmtP ? ` · ${esc(fmtP)}` : ''}. <span>${esc(RF_TOMAR[x.tomar][1])}.</span>${abierto ? '' : ` <button class="link" data-rfcambiar="${id}">Cambiar</button>`}</p>
    ${abierto ? `<div class="rfd-opciones"><div class="rf-seg" role="group" aria-label="Qué tomar">${['recrear', 'idea', 'formato'].map(tomar).join('')}</div>
      <div class="rf-seg" role="group" aria-label="Hacer como">${como('reel')}${como('carrusel')}</div>
      ${d ? `<input class="rf-nota" type="text" data-rfnota="${id}" placeholder="Una nota para el guion (N)" value="${esc(rf.nota[r.id] ?? d.nota ?? '')}">` : ''}</div>` : ''}
  </section>`;
}
// El puntaje desarmado: la viralidad y el encaje con el nicho, cada uno con su barra.
function rfPuntajeDet(r) {
  const p = r.puntaje_det;
  if (!p || p.puntaje == null) return '';
  const fila = (l, v, sub, cls) => `<div class="rf-simrow"><span>${esc(l)}</span><span class="rf-simbar${cls}"><i style="width:${v}%"></i></span><b>${v}</b></div>${sub ? `<small class="rfd-pt-sub">${esc(sub)}</small>` : ''}`;
  return `<div class="rfd-pt" title="${esc(rfPuntajeTip(r))}"><span class="rf-sim big ${rfNivel(p.puntaje)}">${p.puntaje}</span><div>
    ${fila('Viralidad', p.viralidad, 'Cuánto supera su mediana y sus views', ' c')}${fila('Encaje', p.encaje, `${p.anillo ? `Anillo ${rfDimNombre('anillo', String(p.anillo))}` : 'Sin anillo'} · cuenta ${p.cuenta ?? 'sin medir'}`, '')}</div></div>`;
}
// La cuenta, en corto: su relevancia, de qué va y qué tomarle. El resto está en su ficha.
function rfFichaMini(f) {
  return `<section class="rfd-cuenta">
    <div class="rfd-cuenta-h">${rfRel(f)}<b>${esc(f.cuenta)}</b><span class="muted">${esc([f.seguidores != null && `${rfNum(f.seguidores)} seguidores`, f.cuadrante].filter(Boolean).join(' · '))}</span><button class="link" data-rfvercuenta="${esc(f.id)}">Ver la cuenta</button></div>
    ${f.resumen ? `<p class="clamp">${esc(f.resumen)}</p>` : ''}
    ${f.que_tomar ? `<p class="clamp3"><span class="muted">Qué tomar:</span> ${esc(f.que_tomar)}</p>` : ''}
  </section>`;
}
// La decisión, siempre a la vista al pie del detalle: Hacer o Paso; si ya es pieza, el enlace a Guiones.
function rfDecision(r) {
  const et = rfEtapa(r), id = esc(r.id), ped = r.decision?.pedido, uso = r.usos?.find(u => u.estado !== 'descartado');
  const paso = `<button class="secondary rfd-paso" data-rfvoto="no" data-key="${id}">Paso<kbd>X</kbd></button>`;
  const descartar = `<button class="secondary rfd-paso" data-rfvoto="no" data-key="${id}" title="Sale de acá y se recupera abajo, en Descartadas">${ICON.trash}Descartar<kbd>X</kbd></button>`;
  const cuerpo = et === 'descartadas' ? `<span class="rf-etapa e-descartadas">Descartada</span><button class="secondary" data-rfquitar="${id}">${ICON.restore}Recuperar</button>`
    : uso ? `<button class="primary rfd-hacer" data-rfguion="${esc(uso.week)}" data-pieza="${esc(uso.id)}" title="${esc(uso.titulo || '')}">${esc(RF_ETAPA[et])} · ${esc(uso.id)}${ICON.right}</button>${descartar}`
    : et === 'pedidas' ? `<span class="rfd-ok ped">${RF_VOTO.si}Pedida el ${esc(new Date(ped.at).toLocaleString('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''))}</span><button class="ghost" data-rfquitar="${id}">Quitar</button>${descartar}`
    : et === 'elegidas' ? `<span class="rfd-ok">${RF_VOTO.si}Para hacer</span><button class="ghost" data-rfquitar="${id}" title="Vuelve a Por decidir">Quitar</button>${descartar}`
    : `<button class="primary rfd-hacer" data-rfvoto="si" data-key="${id}">${RF_VOTO.si}Hacer<kbd>L</kbd></button>${paso}`;
  return `<section class="rfd-acciones e-${et}" aria-label="Decisión">${cuerpo}</section>`;
}
function rfUsos(r) {
  if (!r.usos?.length) return '';
  const st = { aprobado: 'Aprobado', descartado: 'Descartado', pausado: 'Pausado', en_guiones: 'En Guiones' };
  return `<div class="rf-usos">${r.usos.map(u => `<button class="rf-uso" data-rfguion="${esc(u.week)}" data-pieza="${esc(u.id)}" title="Ver en Guiones">${esc(u.id)} · «${esc(u.titulo.length > 60 ? u.titulo.slice(0, 60) + '…' : u.titulo)}» <span class="tag ${u.estado === 'aprobado' ? 'ok' : u.estado === 'en_guiones' ? 'accent' : 'muted'}">${esc(st[u.estado] || u.estado)}</span></button>`).join('')}</div>`;
}

// ---------- Competidores ----------
const rfTipoPasa = (x, k) => !k || (k === 'explicativos' ? x.explicativos || x.hace_explicativos : k === 'referente' ? /^Referente/.test(x.tipo || '') : x.tipo === k);
function rfCompFiltradas(sin) {
  const c = rf.c, q = $('search').value.toLowerCase().trim(), soloCarr = !formatoPasa('reel'), soloReel = !formatoPasa('carrusel');
  return (rf.comp?.cuentas || []).filter(x => rfCuentaDeAca(x) && (sin === 'tipo' || rfTipoPasa(x, c.tipo)) && (sin === 'cuadrante' || !c.cuadrante || x.cuadrante === c.cuadrante)
    && (sin === 'red' || !c.red || x.red === c.red) && (sin === 'idioma' || !c.idioma || x.idioma === c.idioma) && (sin === 'prioridad' || !c.prioridad || x.prioridad === c.prioridad)
    && (!c.recientes || x.outliers_30d > 0) && (!soloCarr || (x.carruseles || 0) >= 2) && (!soloReel || (x.reels || 0) >= 2)
    && (!q || [x.cuenta, x.nombre, x.tema, x.resumen, x.formato_principal, x.oferta].some(v => String(v || '').toLowerCase().includes(q))));
}
function rfBarComp(n) {
  const c = rf.c, todas = rf.comp?.cuentas?.length || 0, t = rf.comp?.ultima_medicion;
  return `<div class="rf-bar" role="toolbar" aria-label="Filtros de Competidores">
    ${rfDd('ctipo', rfNombre(RF_CTIPOS, c.tipo), { k: 'Tipo', on: !!c.tipo })}
    ${rfDd('ccuad', rfNombre(RF_CUADRANTES, c.cuadrante), { k: 'Similitud', on: !!c.cuadrante })}
    ${rfDd('cred', rfNombre(RF_REDES, c.red), { k: 'Red', on: !!c.red })}
    ${rfDd('cidioma', rfNombre(RF_CIDIOMAS, c.idioma), { k: 'Idioma', on: !!c.idioma })}
    ${rfDd('cpri', rfNombre(RF_PRIORIDAD, c.prioridad), { k: 'Prioridad', on: !!c.prioridad })}
    <button class="rf-dd rf-tg${c.recientes ? ' on' : ''}" data-rfcrecientes aria-pressed="${c.recientes}">${c.recientes ? ICON.check : ''}Con outliers en 30 días</button>
    ${c.tipo || c.cuadrante || c.red || c.idioma || c.prioridad || c.recientes ? '<button class="link rf-limpiar" data-rfclimpiar>Limpiar</button>' : ''}
    <span class="rf-bar-fin muted" title="Medidas por ScrapeCreators y catalogadas con el criterio de tus guardados. Para sumar cuentas, medir o catalogar: skill competidores en Claude Code.">${n === todas ? `${n} cuentas` : `${n} de ${todas} cuentas`}${t ? ` · medidas el ${esc(rfFecha(t))}` : ''}</span>
  </div>`;
}
// La tabla, una línea por cuenta: lo que sirve para comparar de un vistazo. Lo demás está en la ficha.
const RF_COLS = [['cuenta', 'Cuenta', 'c-cuenta'], ['relevancia', 'Relevancia', 'n', 'El similarity pesado por el alcance: una cuenta parecida pero chica pesa menos'],
  ['similarity', 'Similarity', 'n c-sim', 'Qué tan parecida es: oferta y contenido, de 0 a 100'], ['alcance', 'Alcance', 'n c-al', 'Tamaño, views típicas, tope de 90 días y crecimiento, de 0 a 100'],
  ['seguidores', 'Seguidores', 'n'], ['views_tipicas', 'Mediana', 'n c-med', 'Views por reel (o likes por carrusel)'],
  ['views_tope', 'Tope 90 d', 'n c-top', 'Su contenido más visto en los 90 días anteriores a la medición'], ['outliers_30d', 'Outliers 30 d', 'n c-out', 'Contenidos de los últimos 30 días sobre ×3 su mediana, y el mejor'],
  ['rol', 'Rol', 'c-rol']];
const rfPct = v => (v > 0 ? '+' : '') + Math.round(v * 100) + ' %';
function rfCompetidores() {
  if (!rf.comp) return skeleton('list');
  if (!rf.comp.disponible) return `<div class="gv-empty"><p>Todavía no hay base de competidores (<code>research/radar.db</code>). Pedile a Claude Code: «sumá estas cuentas a mis competidores y medilas» con sus links o @usuarios; lo hace la skill competidores (necesita <code>SCRAPECREATORS_API_KEY</code> en tu <code>.env</code>).</p></div>`;
  const c = rf.c, txt = c.orden === 'cuenta' || c.orden === 'rol';
  const val = x => c.orden === 'rol' ? (x.rol || x.tipo || '') : c.orden === 'cuenta' ? x.cuenta : x[c.orden] ?? -1;
  const xs = rfCompFiltradas().sort((a, b) => (txt ? String(val(a)).localeCompare(String(val(b)), 'es') : val(a) - val(b)) * c.dir || (b.relevancia ?? -1) - (a.relevancia ?? -1) || (b.seguidores || 0) - (a.seguidores || 0));
  const th = ([k, l, cls, tip]) => `<th class="${cls}" aria-sort="${c.orden === k ? (c.dir > 0 ? 'ascending' : 'descending') : 'none'}"${tip ? ` title="${esc(tip)}"` : ''}><button data-rfcsort="${k}">${esc(l)}${c.orden === k ? (c.dir > 0 ? RF_IC.up : RF_IC.down) : ''}</button></th>`;
  const fila = x => `<tr class="${rf.cuentaSel === x.id ? 'on' : ''}" data-rfcta="${esc(x.id)}" tabindex="0">
      <td class="c-cuenta"><span class="rf-quien"><span class="net" title="${esc(RF_RED[x.red])}">${NET_ICON[x.red] || ''}</span><b>${esc(x.cuenta)}</b>${x.nombre ? `<span>${esc(x.nombre)}</span>` : ''}</span></td>
      <td class="n">${rfRel(x)}</td>
      <td class="n c-sim" title="${esc(x.similarity != null ? `Oferta ${x.sim_oferta}/10 · contenido ${x.sim_contenido}/10 · ${x.cuadrante}` : '')}">${x.similarity ?? ''}</td>
      <td class="n c-al">${x.alcance ?? ''}</td>
      <td class="n">${rfNum(x.seguidores)}${x.crecimiento_30d != null ? `<small class="${x.crecimiento_30d >= 0 ? 'sube' : 'baja'}" title="En 30 días">${rfPct(x.crecimiento_30d)}</small>` : ''}</td>
      <td class="n c-med">${x.reel_views != null ? `${rfNum(x.reel_views)}<small>views</small>` : x.carrusel_likes != null ? `${rfNum(x.carrusel_likes)}<small>likes</small>` : ''}</td>
      <td class="n c-top">${x.views_tope ? rfNum(x.views_tope) : ''}</td>
      <td class="n c-out">${x.outliers_30d ? `${x.outliers_30d}<b class="rf-x ${rfBanda(x.mejor_x_30d)}">${esc(rfXtxt(x.mejor_x_30d))}</b>` : ''}</td>
      <td class="c-rol"><span>${esc(x.rol || x.tipo)}</span>${x.rol && x.rol !== x.tipo ? `<i class="rf-difiere" title="En el radar figura como ${esc(x.tipo)}"></i>` : ''}</td></tr>`;
  const sel = (rf.comp.cuentas || []).find(x => x.id === rf.cuentaSel && rfCuentaDeAca(x));
  return `${rfBarComp(xs.length)}
    <div class="rfc${sel ? '' : ' solo'}">
      <div class="rfc-wrap"><table class="rfc-table"><thead><tr>${RF_COLS.map(th).join('')}</tr></thead>
        <tbody>${xs.map(fila).join('') || `<tr><td colspan="${RF_COLS.length}" class="rfc-vacia">Ninguna cuenta con estos filtros.</td></tr>`}</tbody></table></div>
      ${sel ? `<aside class="rf-panel" aria-label="Ficha de la cuenta">${rfPanelCuenta(sel)}</aside>` : ''}
    </div>`;
}
function rfPanelCuenta(x) {
  if (rf.contSel) { const r = (rf.cuenta?.contenidos || []).find(c => c.id === rf.contSel); if (r) return rfDetalle(r, true); }
  const cont = rf.cuenta?.id === x.id ? rf.cuenta.contenidos || [] : [], fmtC = rf.c.formato;
  const ys = cont.filter(r => !fmtC || r.tipo === fmtC).sort((a, b) => (rfXOf(b) ?? -1) - (rfXOf(a) ?? -1));
  const region = /no se sabe|desconoc|sin dato/i.test(x.region || '') ? '' : x.region;
  const datos = [x.rol || x.tipo, x.anillo && `anillo ${x.anillo}`, x.bucket, x.prioridad && `prioridad ${x.prioridad}`, [x.idioma, region].filter(Boolean).join(', '), x.explicativos && 'reels explicativos'].filter(Boolean);
  const dl = [['Vende', x.oferta], ['Tema', x.tema], ['Convierte con', x.cta], ['Formato', x.formato_principal], ['Estilo', x.estilo_visual], ['Ganchos', x.ganchos], ['Qué tomar', x.que_tomar]].filter(([, v]) => v);
  const crec = x.crecimiento_30d != null ? ['Crecimiento', `${rfPct(x.crecimiento_30d)} de seguidores en 30 días`] : x.views_por_seguidor != null ? ['Llegada', `cada reel llega a ${x.views_por_seguidor >= 10 ? Math.round(x.views_por_seguidor) : (Math.round(x.views_por_seguidor * 100) / 100).toLocaleString('es-AR')} veces sus seguidores`] : null;
  const alcance = [['Seguidores', rfNum(x.seguidores)], ['Mediana', x.reel_views != null ? `${rfNum(x.reel_views)} views por reel` : x.carrusel_likes != null ? `${rfNum(x.carrusel_likes)} likes por carrusel` : ''],
    ['Tope 90 días', x.views_tope ? (x.tope_url ? `<a href="${esc(x.tope_url)}" target="_blank" rel="noopener">${rfNum(x.views_tope)} views</a>` : `${rfNum(x.views_tope)} views`) : ''], crec].filter(v => v?.[1]);
  const tiles = ys.map(r => { const et = rfEtapa(r), src = rfSrc(r), xx = rfXOf(r);
    return `<button class="rfk-tile e-${et}" data-rfcont="${esc(r.id)}" title="${esc(rfTitulo(r))}">${src ? `<img src="${rfThumb(src)}" alt="" loading="lazy">` : `<span class="sin">${esc(rfTitulo(r))}</span>`}
      ${xx != null ? `<b class="rf-x over sm ${rfBanda(xx)}">${esc(rfXtxt(xx))}</b>` : ''}${r.tipo === 'carrusel' ? `<i class="carr">${RF_IC.carr}</i>` : ''}
      ${et !== 'por_decidir' ? `<span class="rf-etapa e-${et}">${esc(RF_ETAPA[et])}</span>` : r.pautado ? '<span class="rf-src paid">Pautado</span>' : ''}</button>`; }).join('');
  return `<div class="rfk">
    <div class="rfk-h">
      <div class="rfk-id"><a class="rfk-handle" href="${esc(x.perfil)}" target="_blank" rel="noopener"><span class="net">${NET_ICON[x.red] || ''}</span>${esc(x.cuenta)}</a>
        <p>${esc([x.nombre, x.medido && `medida el ${rfFecha(x.medido + 'T12:00:00Z')}`].filter(Boolean).join(' · '))}</p></div>
      <button class="icon" data-rfccerrar title="Cerrar la ficha (Esc)" aria-label="Cerrar la ficha">${RF_IC.x}</button>
    </div>
    <p class="rfk-datos">${esc(datos.join(' · '))}${x.rol && x.rol !== x.tipo ? ` <span class="tag warn" title="El catálogo propone otro rol que el tipo del radar">En el radar: ${esc(x.tipo)}</span>` : ''}</p>
    ${marcas().length > 1 ? `<div class="rfk-perfiles" role="group" aria-label="De qué marca es"><span>Marca</span>${marcas().map(m => { const k = rfSlug(m), on = (x.marcas || []).includes(k); return `<button class="rfs-pill${on ? ' on' : ''}" data-rfcperfil="${esc(k)}" data-cuenta="${esc(x.id)}" aria-pressed="${on}" title="${on ? 'Sacarla de' : 'Sumarla a'} ${esc(BRAND_LABEL[m] || m)}">${esc(BRAND_LABEL[m] || m)}</button>`; }).join('')}<small class="muted">${(x.marcas || []).length ? '' : 'Sin marcar: es de todas'}</small></div>` : ''}
    ${x.similarity != null || x.alcance != null ? `<section class="rfk-scores">
      <div class="rfk-rel">${rfRel(x, true)}<div><b>Relevancia</b><span>${esc(x.relevancia != null ? `Similarity ${x.similarity} con un alcance de ${x.alcance}` : 'Sin alcance medido todavía')}</span></div></div>
      ${x.similarity != null ? `<div class="rfk-sc"><h4>Similarity <b>${x.similarity}</b>${x.cuadrante ? `<span>${esc(x.cuadrante)}</span>` : ''}</h4>
        <div class="rf-simrow"><span>Oferta</span><span class="rf-simbar"><i style="width:${x.sim_oferta * 10}%"></i></span><b>${x.sim_oferta}</b></div>${x.sim_por_oferta ? `<p>${esc(x.sim_por_oferta)}</p>` : ''}
        <div class="rf-simrow"><span>Contenido</span><span class="rf-simbar c"><i style="width:${x.sim_contenido * 10}%"></i></span><b>${x.sim_contenido}</b></div>${x.sim_por_contenido ? `<p>${esc(x.sim_por_contenido)}</p>` : ''}</div>` : ''}
      ${x.alcance != null ? `<div class="rfk-sc"><h4>Alcance <b>${x.alcance}</b></h4><dl class="rfk-dl">${alcance.map(([k, v]) => `<dt>${k}</dt><dd>${k === 'Tope 90 días' ? v : esc(v)}</dd>`).join('')}</dl></div>` : ''}
    </section>` : ''}
    <section class="rfk-conts">
      <div class="rfk-conts-h"><h4>Contenidos${cont.length ? ` <span class="muted">${ys.length}</span>` : ''}</h4>
        <div class="segmented" role="group" aria-label="Formato">${[['', 'Todos'], ['reel', 'Reels'], ['carrusel', 'Carruseles']].map(([k, l]) => `<button class="${fmtC === k ? 'on' : ''}" data-rfcfmt="${k}">${l}</button>`).join('')}</div></div>
      ${x.muestra ? `<p class="hint">De sus últimas ${x.muestra} publicaciones: ${x.reels || 0} reels y ${x.carruseles || 0} carruseles.</p>` : ''}
      ${rf.cuentaLoading && !cont.length ? '<p class="muted">Cargando…</p>' : ys.length ? `<div class="rfk-grid">${tiles}</div>` : '<p class="muted">Sin contenidos medidos.</p>'}
    </section>
    <section class="rfk-ficha">
      ${x.resumen ? `<p>${esc(x.resumen)}</p>` : ''}
      ${dl.length ? `<dl class="rfk-dl">${dl.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${x.motivo ? `<details class="rfd-sec"><summary>Por qué está en el radar</summary><p>${esc(x.motivo)}</p>${x.evidencia ? `<p><a class="link" href="${esc(x.evidencia)}" target="_blank" rel="noopener">El contenido que lo justifica</a></p>` : ''}</details>` : ''}
    </section>
  </div>`;
}

// ---------- Pedidos ----------
// Lo elegido para la semana: arriba el recorrido con cuántas hay en cada etapa y abajo la lista por etapa, una fila por
// referencia con su pieza en Guiones; al costado, los pedidos ya copiados y la tanda de la semana.

// ---------- decisiones ----------
async function rfDecidir(r, body, msg) {
  if (rf.saving[r.id]) return; rf.saving[r.id] = true;
  const prev = r.decision;
  try {
    const res = await api('referencias/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil: rfPerfil(), id: r.id, ...body }) });
    for (const x of rfTodas().filter(x => x.id === r.id)) { x.decision = res.decision; if (res.analizada) x.analizada = res.analizada; }
    if (!rf.data?.referencias?.some(x => x.id === r.id) && rf.data) rf.data.at = 0; // lo elegido desde una cuenta aparece en la Bandeja y en Pedidos
    if (msg) toast(msg, () => rfDeshacer(r, prev));
  } catch (e) { toast(e.message); }
  finally { rf.saving[r.id] = false; }
  rfRerender();
}
function rfDeshacer(r, prev) {
  const x = rfRef(r.id) || r;
  if (!prev?.decision) return rfDecidir(x, { decision: 'quitar' });
  rfDecidir(x, prev.decision === 'adaptar' ? { decision: 'adaptar', como: prev.como || null, tomar: prev.tomar || null } : { decision: prev.decision });
}
// Hacer es un solo toque: queda lista con los defaults (rfDefaults). Elegir reel o carrusel o qué tomar en una sin
// decidir también la deja para hacer. Cada uno guarda sin tocar el otro.
const rfParaHacer = (como, tomar) => `Para hacer: ${RF_TOMAR[tomar]?.[0] || ''}, ${como === 'carrusel' ? 'carrusel' : 'reel'}.`;
function rfComo(r, como) {
  const d = r.decision?.decision === 'adaptar' ? r.decision : null, x = rfDefaults(r); if (d?.como === como) return;
  rfDecidir(r, { decision: 'adaptar', como, tomar: x.tomar }, rfParaHacer(como, x.tomar));
}
function rfTomar(r, t) {
  const d = r.decision?.decision === 'adaptar' ? r.decision : null, x = rfDefaults(r); if (d?.tomar === t) return;
  rfDecidir(r, { decision: 'adaptar', como: x.como, tomar: t }, rfParaHacer(x.como, t));
}
// Hacer o Paso: pasa a la siguiente sin decidir. Tocar de nuevo lo ya marcado lo devuelve a Por decidir.
function rfVotar(r, v) {
  const d = r.decision?.decision;
  if ((v === 'si' && d === 'adaptar') || (v === 'no' && d === 'descartar')) return rfDecidir(r, { decision: 'quitar' }, rfVuelta(r));
  if (rf.seccion === 'bandeja') rfSiguiente(r.id);
  else if (rf.seccion === 'seleccion') rfsSiguiente(r.id);
  if (v === 'si') { const x = rfDefaults(r); return rfDecidir(r, { decision: 'adaptar', como: x.como, tomar: x.tomar }, rfParaHacer(x.como, x.tomar)); }
  rfDecidir(r, { decision: 'descartar' }).then(() => rfMotivos(r));
}
// Por qué no. Opcional y de un toque: después de descartar aparecen los motivos unos segundos; si no se elige ninguno,
// queda sin motivo. La planificación los pesa poco. Si ya es pieza, en vez de los motivos ofrece descartarla también:
// descartar la referencia sólo la saca de acá, porque podés querer dejar de verla (la pieza sigue) o no querer
// hacerla.
const RF_MOTIVOS = [['tema', 'El tema'], ['formato', 'El formato'], ['dificil', 'Difícil de hacer'], ['visto', 'Ya está visto']];
let rfMotivoTimer = null;
const rfVivas = r => (r.usos || []).filter(u => u.estado !== 'descartado' && u.run);
const rfVuelta = r => r.decision?.decision === 'descartar' && (r.decision.antes || rfVivas(r).length) ? 'Recuperada.' : 'Volvió a Por decidir.';
function rfMotivos(r) {
  let bar = $('rfMotivos');
  if (!bar) { bar = document.createElement('div'); bar.id = 'rfMotivos'; bar.className = 'rf-motivos'; bar.setAttribute('role', 'status'); document.body.appendChild(bar);
    bar.addEventListener('click', e => { const b = e.target.closest('[data-rfmotivo]'), x = rfRef(bar.dataset.key); clearTimeout(rfMotivoTimer); bar.hidden = true; if (!x) return;
      if (b) rfDecidir(x, { decision: 'descartar', motivo: b.dataset.rfmotivo }, 'Anotado.'); else if (e.target.closest('[data-rfpiezas]')) rfDescartarPiezas(x); else if (e.target.closest('[data-rfdeshacer]')) rfDecidir(x, { decision: 'quitar' }, rfVuelta(x)); }); }
  const vivas = rfVivas(r), ids = vivas.map(u => u.id).join(' y ');
  bar.dataset.key = r.id;
  bar.innerHTML = vivas.length ? `<span>Salió de acá. ${esc(ids)} ${vivas.length > 1 ? 'siguen' : 'sigue'} en Guiones.</span><button data-rfpiezas>Descartar ${esc(ids)} también</button><button class="link" data-rfdeshacer>Deshacer</button>`
    : `<span>${r.decision?.antes ? 'Descartada' : 'Paso'}. ¿Por qué?</span>${RF_MOTIVOS.map(([k, l]) => `<button data-rfmotivo="${k}">${esc(l)}</button>`).join('')}<button class="link" data-rfdeshacer>Deshacer</button>`;
  bar.hidden = false; clearTimeout(rfMotivoTimer); rfMotivoTimer = setTimeout(() => { bar.hidden = true; }, vivas.length ? 12000 : 7000);
}
// El mismo descarte de Guiones: no borra el run ni toca lo agendado, la pieza baja en gris y se recupera.
async function rfDescartarPiezas(r) {
  const vivas = rfVivas(r), runs = vivas.map(u => u.run), previo = new Map(vivas.map(u => [u.run, u.estado]));
  const poner = async (accion, estado) => {
    try { await Promise.all(runs.map(run => api('guiones/descartar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run, accion }) }))); }
    catch (e) { toast(e.message); return false; }
    for (const x of rfTodas().filter(x => x.id === r.id)) for (const u of x.usos || []) if (runs.includes(u.run)) u.estado = estado(u);
    rfRerender();
    return true;
  };
  if (await poner('descartar', () => 'descartado')) toast(`${vivas.map(u => u.id).join(' y ')} en gris en Guiones: se recupera ahí.`, () => poner('recuperar', u => previo.get(u.run)));
}
function rfRerender() { renderReferencias(true); }
const rfGuardarNota = async inp => { const r = rfRef(inp.dataset.rfnota); if (!r) return; const v = inp.value.trim(); if (v === (r.decision?.nota || '')) return; delete rf.nota[r.id]; await rfDecidir(r, { decision: 'nota', nota: v }, v ? 'Nota guardada.' : 'Nota borrada.'); };

// Decidir pasa a la siguiente por decidir, así se recorre sin el mouse. En la Selección, ↑↓ abren el detalle de la
// tarjeta.
function rfMover(paso) {
  const enSele = rf.seccion === 'seleccion', xs = enSele ? rfsVisibles().filter(r => rfEtapa(r) !== 'descartadas') : rfVisibles(); if (!xs.length) return;
  const i = xs.findIndex(r => r.id === (enSele ? rf.sSel : rf.sel)), sig = xs[i < 0 ? 0 : Math.min(xs.length - 1, Math.max(0, i + paso))].id;
  if (enSele) rf.sSel = sig; else rf.sel = sig;
  rfRerender();
  document.querySelector('.rfr.on, .rfcard.on, .rfs-card.on')?.scrollIntoView({ block: 'nearest' });
  document.querySelector('.rf-panel')?.scrollTo({ top: 0 });
}
// Con el detalle abierto en esa tarjeta, sigue con la próxima sin decidir (en guiones y en producción, con la próxima);
// si no quedan, se cierra.
function rfsSiguiente(id) {
  if (rf.sSel !== id) return;
  const xs = rfsVisibles(), i = xs.findIndex(r => r.id === id), libre = r => rf.s.estado !== 'seleccionadas' || rfEtapa(r) === 'por_decidir';
  const sig = xs.slice(i + 1).find(libre) || xs.slice(0, Math.max(i, 0)).reverse().find(libre);
  rf.sSel = sig ? sig.id : null;
}
function rfSiguiente(id) {
  if (rf.f.estado !== 'por_decidir') return;
  const xs = rfVisibles(), i = xs.findIndex(r => r.id === id);
  const sig = xs.slice(i + 1).find(r => rfEtapa(r) === 'por_decidir') || xs.slice(0, i).reverse().find(r => rfEtapa(r) === 'por_decidir');
  if (sig) rf.sel = sig.id;
}

// ---------- pedido ----------
// Los pedidos ya copiados de la semana: cuándo, cuántas referencias, si Claude Code ya los aplicó y dónde está cada
// una.
function rfPedidosAnteriores() {
  const ps = rf.pedidos?.key === rfKey() ? rf.pedidos.pedidos || [] : null;
  if (!ps) return '<p class="muted rfp-ant">Cargando los pedidos anteriores…</p>';
  if (!ps.length) return '';
  return `<details class="rfp-ant"><summary>Pedidos anteriores de esta semana <span class="muted">${ps.length}</span></summary>${ps.map(p => `<div class="rfp-ped">
    <div class="rfp-ped-h"><span>${esc(new Date(p.created_at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))} · ${p.piezas.length} referencia${p.piezas.length === 1 ? '' : 's'}</span>
      <span class="tag ${p.estado === 'aplicado' ? 'ok' : 'warn'}">${p.estado === 'aplicado' ? 'Ya están en Guiones' : 'Claude Code todavía no lo aplicó'}</span><button class="ghost" data-rfpedcopiar="${esc(p.id)}">${ICON.copy} Copiar de nuevo</button></div>
    <div class="rfp-ped-refs">${p.piezas.map(x => { const r = rfRef(x.ref_id); return `<span class="rfp-ped-ref" title="${esc(r ? rfTitulo(r) : x.url || '')}">${r && rfSrc(r) ? `<img src="${rfThumb(rfSrc(r))}" alt="" loading="lazy">` : '<i></i>'}${r ? `<em>${esc(RF_ETAPA[rfEtapa(r)])}</em>` : ''}</span>`; }).join('')}</div></div>`).join('')}</details>`;
}
function rfOpenPedido() {
  // La semana de la Selección, si se puede; si no, la que viene.
  const sems = rfSemanasPedido(), deDoc = rfSele()?.seleccion?.semana;
  if (!sems.some(([wk]) => wk === rf.semanaPedido)) rf.semanaPedido = sems.some(([wk]) => wk === deDoc) ? deDoc : sems[1][0];
  if (rf.pedidos?.key !== rfKey()) loadPedidos();
  const all = rfElegibles(), nuevas = all.filter(r => rfEtapa(r) === 'elegidas'), ya = all.filter(r => rfEtapa(r) === 'pedidas');
  const incluir = !nuevas.length;
  const lista = xs => ['reel', 'carrusel'].map(c => { const ys = xs.filter(r => rfDefaults(r).como === c); return ys.length ? `<h3>${c === 'reel' ? 'Reels' : 'Carruseles'} <span class="muted">${ys.length}</span></h3><ul>${ys.map(r => `<li><b>«${esc(rfTitulo(r))}»</b><span class="muted"> · ${esc(r.cuenta || '')} · ${esc(RF_TOMAR[rfDefaults(r).tomar]?.[0] || '')}</span>${r.decision.nota ? `<br><span class="hint">Nota: ${esc(r.decision.nota)}</span>` : ''}</li>`).join('')}</ul>` : ''; }).join('');
  const dl = $('rfPedido');
  dl.innerHTML = `<div class="modal-head"><h2 id="rfpTitle">Pedir guiones${perfilActual === 'all' ? '' : ' · ' + esc(rfPerfilNombre())}</h2><button class="icon close" data-rfx aria-label="Cerrar"><svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div>
    <p class="modal-sub">Se copia un pedido para pegar en Claude Code; desde acá no se genera nada.</p>
    <div class="rfp-hasta"><span class="label">Para la semana</span><div class="segmented" role="group" aria-label="Semana de los guiones">${sems.map(([wk, l]) => `<button data-rfpsemana="${wk}" class="${rf.semanaPedido === wk ? 'on' : ''}" title="${esc(rfSemana(wk))}">${esc(l)}</button>`).join('')}</div></div>
    <div class="rfp-list">${nuevas.length ? lista(nuevas) : '<p class="muted">Lo elegido ya se pidió. Podés volver a copiar el pedido con todas.</p>'}
      ${ya.length && nuevas.length ? `<label class="toggle"><input type="checkbox" id="rfpTodas"> Sumar las ${ya.length} que ya pediste</label>` : ''}
      ${incluir && ya.length ? lista(ya) : ''}</div>
    <div class="rfp-hasta"><span class="label">Frenar en</span><div class="segmented" role="group" aria-label="Frenar en">
      <button data-rfhasta="audio" class="${rf.hasta === 'audio' ? 'on' : ''}" title="Guion y voz de cada reel; lo escuchás en Guiones antes de cualquier imagen o video">Guion y audio</button>
      <button data-rfhasta="guion" class="${rf.hasta === 'guion' ? 'on' : ''}" title="Sólo el texto; la voz se genera después de que lo apruebes">Sólo el guion</button></div></div>
    <div id="rfpResult" hidden></div>
    ${rfPedidosAnteriores()}
    <div class="modal-foot"><span class="muted">${nuevas.length + (incluir ? ya.length : 0)} referencia${nuevas.length + (incluir ? ya.length : 0) === 1 ? '' : 's'}</span><button id="rfpCopiar" class="primary" data-todas="${incluir ? '1' : ''}">Copiar pedido para Claude Code</button></div>`;
  if (!dl.open) dl.showModal();
}
async function rfCopiarPedido(btn) {
  const todas = btn.dataset.todas === '1' || !!$('rfpTodas')?.checked;
  btn.disabled = true;
  try {
    const x = await api('referencias/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week: rf.semanaPedido, perfil: rfPerfil(), hasta: rf.hasta, todas }) });
    await copyText(x.prompt, 'Pedido copiado: pegalo en Claude Code.');
    const out = $('rfpResult'); out.hidden = false;
    out.innerHTML = `<p class="hint">Quedó congelado en <code>${esc(x.path)}</code>. Si no se copió, seleccioná el texto:</p><textarea class="rfp-prompt" readonly>${esc(x.prompt)}</textarea>`;
    btn.textContent = 'Copiado';
  } catch (e) { toast(e.message); btn.disabled = false; return; }
  rf.pedidos = null; loadReferencias(); loadSeleccion();
}
function rfLectura() {
  const ls = rf.data?.doc?.lectura || [], dl = $('rfDetalle');
  dl.innerHTML = `<div class="modal-head"><h2 id="rfdTitle">Lectura del research · ${esc(mtTitulo(rfRango()))}</h2><button class="icon close" data-rfx aria-label="Cerrar"><svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div>
    <div class="rf-lectura">${ls.map(s => `<section><h3>${esc(s.titulo)}</h3><p class="hint">${esc(s.fuente || '')}</p><ul>${(s.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}</div>`;
  if (!dl.open) dl.showModal();
}

// Cambiar las marcas de una cuenta desde su ficha: lo que trae la Bandeja cambia con ella. Sin ninguna, es de todas.
async function rfMoverCuenta(id, marca) {
  const x = (rf.comp?.cuentas || []).find(c => c.id === id); if (!x) return;
  const actuales = x.marcas || [], nuevas = actuales.includes(marca) ? actuales.filter(p => p !== marca) : [...actuales, marca];
  try {
    const res = await api('competidores/marcas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, marcas: nuevas }) });
    x.marcas = res.marcas; rf.data = null; renderReferencias(true);
  } catch (e) { toast(e.message); }
}

// ---------- eventos ----------
function rfCerrarCuenta() { rf.cuentaSel = null; rf.contSel = null; rfSave('rfCuentaSel', null); renderReferencias(true); }
$('referenciasView').addEventListener('click', e => {
  const t = e.target;
  const se = t.closest('[data-rfseccion]'); if (se) { rf.seccion = se.dataset.rfseccion; rfSave('rfSeccion2', rf.seccion); renderReferencias(true); return; }
  const dd = t.closest('[data-rfdd]'); if (dd) { rfMenuAbrir(dd); return; }
  // La Selección.
  const af = t.closest('[data-rfafuera]'); if (af) { rfsAfuera(af); return; }
  const se2 = t.closest('[data-rfsestado]'); if (se2) { rf.s.estado = se2.dataset.rfsestado; rf.sSel = null; rfSave('rfSEstado', rf.s.estado); renderReferencias(true); return; }
  const sn = t.closest('[data-rfsnivel]'); if (sn) { rf.s.nivel = sn.dataset.rfsnivel; rfSave('rfSNivel', rf.s.nivel); renderReferencias(true); return; }
  const sm = t.closest('[data-rfsmensaje]'); if (sm) { rf.s.mensaje = sm.dataset.rfsmensaje; rfSave('rfSMensaje', rf.s.mensaje); renderReferencias(true); return; }
  if (t.closest('[data-rfspasadas]')) { rf.s.pasadas = !rf.s.pasadas; renderReferencias(true); return; }
  if (t.closest('[data-rfscerrar]')) { rf.sSel = null; renderReferencias(true); return; }
  // Lo que se pide y el foco, en la Selección y en la Bandeja.
  if (t.closest('[data-rfpedirbarra]')) { rfOpenPedido(); return; }
  if (t.closest('[data-rfelegidas]')) { rf.seccion = 'seleccion'; rf.s.estado = 'seleccionadas'; rf.s.mensaje = ''; rfSave('rfSeccion2', 'seleccion'); rfSave('rfSEstado', 'seleccionadas'); renderReferencias(true); return; }
  const fo = t.closest('[data-rffoco]'); if (fo) { rfSetFoco(fo.dataset.rffoco === '1'); renderReferencias(true); return; }
  if (t.closest('[data-rfmasfiltros]')) { rf.f.masAbierto = !rf.f.masAbierto; rfSave('rfMasAbierto', rf.f.masAbierto); renderReferencias(true); return; }
  const cb = t.closest('[data-rfcambiar]'); if (cb) { rf.cambiar = cb.dataset.rfcambiar; renderReferencias(true); return; }
  const vi = t.closest('[data-rfvista]'); if (vi) { rf.vista = vi.dataset.rfvista; rfSave('rfVista', rf.vista); renderReferencias(true); return; }
  // En el Mapa: un anillo, un tema, una fila o una columna filtran ahí mismo; una celda o un punto abren la lista.
  const alterna = (k, v) => { rfDimElegir(k, rf.f[k].includes(v) ? rf.f[k].filter(x => x !== v) : [...rf.f[k], v]); renderReferencias(true); };
  const an = t.closest('[data-rfanillo]'); if (an) { alterna('anillo', an.dataset.rfanillo); return; }
  const tm = t.closest('[data-rftemaset]'); if (tm) { alterna('tema', tm.dataset.rftemaset); return; }
  const ej = t.closest('[data-rfeje]'); if (ej) { const [k, v] = ej.dataset.rfeje.split('|'); alterna(k, v); return; }
  const ds = t.closest('#rfMain [data-rfdias]'); if (ds) { rf.sel = null; rf.f.dias = Number(ds.dataset.rfdias); rfSave('rfDias', rf.f.dias); rf.data = null; renderReferencias(true); return; }
  const mx = t.closest('#rfMain [data-rfminx]'); if (mx) { rf.sel = null; rf.f.minx = Number(mx.dataset.rfminx); rfSave('rfMinx', rf.f.minx); renderReferencias(true); return; }
  const ce = t.closest('[data-rfcelda]'); if (ce) { const [k1, v1, k2, v2] = ce.dataset.rfcelda.split('|'); rfDimElegir(k1, [v1]); rfDimElegir(k2, [v2]);
    rf.vista = 'lista'; rfSave('rfVista', 'lista'); renderReferencias(true); return; }
  const pu = t.closest('[data-rfpunto]'); if (pu) { rf.sel = pu.dataset.rfpunto; rf.vista = 'lista'; rfSave('rfVista', 'lista'); renderReferencias(true); return; }
  const es = t.closest('[data-rfestado]'); if (es) { rf.sel = null; rf.f.estado = es.dataset.rfestado; rfSave('rfEstado2', rf.f.estado); renderReferencias(true); return; }
  if (t.closest('[data-rflimpiar]')) { rf.sel = null; Object.assign(rf.f, { cuenta: '', idioma: '', tema: [], formato: [], anillo: [], fuentes: ['semana', 'base', 'tuya'], minx: RF_DEF.minx, dias: RF_DEF.dias, pautados: false });
    rfSave('rfCuenta', ''); rfSave('rfIdioma', ''); rfSave('rfTema', []); rfSave('rfFormato', []); rfSave('rfAnillo', []); rfSave('rfFuentes', rf.f.fuentes); rfSave('rfMinx', RF_DEF.minx); rfSave('rfDias', RF_DEF.dias); renderReferencias(true); return; }
  if (t.closest('[data-rfvertodas]')) { rfSetFoco(false); rf.f.estado = 'por_decidir'; rf.f.cuenta = ''; rf.f.idioma = ''; rf.f.tema = []; rf.f.formato = []; rf.f.anillo = []; rf.f.minx = 2; rf.f.fuentes = ['semana', 'base', 'tuya'];
    rfSave('rfEstado2', 'por_decidir'); rfSave('rfCuenta', ''); rfSave('rfIdioma', ''); rfSave('rfTema', []); rfSave('rfFormato', []); rfSave('rfAnillo', []); rfSave('rfMinx', 2); rfSave('rfFuentes', rf.f.fuentes); renderReferencias(true); return; }
  if (t.closest('[data-rflectura]')) { rfLectura(); return; }
  if (t.closest('[data-rfcrecientes]')) { rf.c.recientes = !rf.c.recientes; renderReferencias(true); return; }
  if (t.closest('[data-rfclimpiar]')) { Object.assign(rf.c, { tipo: '', cuadrante: '', red: '', idioma: '', prioridad: '', recientes: false }); rfSave('rfCTipo', ''); rfSave('rfCCuad', ''); renderReferencias(true); return; }
  if (t.closest('[data-rfccerrar]')) { rfCerrarCuenta(); return; }
  const cs = t.closest('[data-rfcsort]'); if (cs) { const k = cs.dataset.rfcsort; rf.c.dir = rf.c.orden === k ? -rf.c.dir : ['cuenta', 'rol'].includes(k) ? 1 : -1; rf.c.orden = k; rfSave('rfCOrden2', k); renderReferencias(true); return; }
  const cf = t.closest('[data-rfcfmt]'); if (cf) { rf.c.formato = cf.dataset.rfcfmt; renderReferencias(true); return; }
  if (t.closest('[data-rfcback]')) { rf.contSel = null; renderReferencias(true); return; }
  const cp = t.closest('[data-rfcperfil]'); if (cp) { rfMoverCuenta(cp.dataset.cuenta, cp.dataset.rfcperfil); return; }
  const vc = t.closest('[data-rfvercuenta]'); if (vc) { rfAbrirCuenta(vc.dataset.rfvercuenta); return; }
  const pc = t.closest('[data-rfpedcopiar]'); if (pc) { const p = rf.pedidos?.pedidos?.find(x => x.id === pc.dataset.rfpedcopiar); if (p) copyText(p.prompt, 'Pedido copiado de nuevo.'); return; }
  if (rfClickComun(e)) return;
  const ir = t.closest('[data-rfir]'); if (ir) { rf.seccion = 'bandeja'; rf.f.estado = 'todas'; rf.sel = ir.dataset.rfir; rfSave('rfSeccion2', 'bandeja'); renderReferencias(true); return; }
  const ca = t.closest('[data-rfssel]'); if (ca) { rf.sSel = rf.sSel === ca.dataset.rfssel ? null : ca.dataset.rfssel; rf.cambiar = null; renderReferencias(true); document.querySelector('.rf-panel')?.scrollTo({ top: 0 }); return; }
  const co = t.closest('[data-rfcont]'); if (co) { rf.contSel = co.dataset.rfcont; renderReferencias(true); document.querySelector('.rf-panel')?.scrollTo({ top: 0 }); return; }
  const cta = t.closest('[data-rfcta]'); if (cta) { rfAbrirCuenta(cta.dataset.rfcta, true); return; }
  const fila = t.closest('[data-rfsel]'); if (fila) { rf.sel = fila.dataset.rfsel; rf.cambiar = null; renderReferencias(true); document.querySelector('.rf-panel')?.scrollTo({ top: 0 }); return; }
});
$('referenciasView').addEventListener('change', e => {
  const t = e.target;
});
function rfAbrirCuenta(id, quedarse) {
  rf.cuentaSel = id; rf.contSel = null; rfSave('rfCuentaSel', id);
  if (!quedarse) { rf.seccion = 'competidores'; rfSave('rfSeccion2', 'competidores'); }
  if (rf.cuenta?.id !== id || rf.cuenta?.key !== rfKey()) { rf.cuenta = null; loadCuenta(id); } else renderReferencias(true);
  document.querySelector('.rf-panel')?.scrollTo({ top: 0 });
}
// Lo que se toca igual en la lista, el detalle y la ficha de una cuenta.
function rfClickComun(e) {
  const t = e.target;
  const cg = t.closest('[data-rfcopiar]'); if (cg) { const r = rfRef(cg.dataset.rfcopiar); if (r) copyText(rfTitulo(r), 'Gancho copiado.'); return true; }
  const vo = t.closest('[data-rfvoto]'); if (vo) { const r = rfRef(vo.dataset.key); if (r) rfVotar(r, vo.dataset.rfvoto); return true; }
  const pl = t.closest('[data-rfplay]'); if (pl) { const r = rfRef(pl.dataset.rfplay); if (r) rfVer(r); return true; }
  const co = t.closest('[data-rfcomo]'); if (co) { const r = rfRef(co.dataset.key); if (r) rfComo(r, co.dataset.rfcomo); return true; }
  const to = t.closest('[data-rftomar]'); if (to) { const r = rfRef(to.dataset.key); if (r) rfTomar(r, to.dataset.rftomar); return true; }
  const ds = t.closest('[data-rfdescartar]'); if (ds) { const r = rfRef(ds.dataset.rfdescartar); if (r) rfVotar(r, 'no'); return true; }
  const qu = t.closest('[data-rfquitar]'); if (qu) { const r = rfRef(qu.dataset.rfquitar); if (r) rfDecidir(r, { decision: 'quitar' }, rfVuelta(r)); return true; }
  const gu = t.closest('[data-rfguion]'); if (gu) { rfIrAPieza(gu.dataset.rfguion, gu.dataset.pieza); return true; }
  return false;
}
// Va a la pieza en Guiones y la marca. Si con el período y la etapa elegidos no se ve, los abre sólo por esta vez.
function rfIrAPieza(wk, id) {
  if ($('rfDetalle').open) $('rfDetalle').close();
  week = monday(wk); view = 'guiones'; store.set('view', view); render();
  if (!id) return;
  const buscar = () => document.querySelector(`#guionesView [data-gvid="${CSS.escape(id)}"], #guionesView [data-gvid$="·${CSS.escape(id)}"]`);
  let vueltas = 0, abierto = false;
  const mirar = () => {
    const el = buscar();
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('rf-flash'); setTimeout(() => el.classList.remove('rf-flash'), 1800); return; }
    if (++vueltas === 12 && !abierto && typeof gv !== 'undefined' && typeof renderGuiones === 'function') { abierto = true; gv.periodo = 'todo'; gv.fase = 'todas'; renderGuiones(true); }
    if (vueltas < 30 && view === 'guiones') setTimeout(mirar, 200);
  };
  setTimeout(mirar, 200);
}
$('referenciasView').addEventListener('keydown', e => { const t = e.target.closest?.('[data-rfcta],[data-rfir],[data-rfssel]'); if (t && t === e.target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); } });
// El teclado. En la Selección y la Bandeja: ↑↓ (o J K) se mueven y las letras deciden; en Competidores, Esc vuelve o
// cierra la ficha. Las flechas ← → cambian de período en la Bandeja (planner.js) y de tarjeta en la Selección.
document.addEventListener('keydown', e => {
  if (view !== 'referencias' || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.target.closest('input, textarea, select')) return;
  if (rf.seccion === 'competidores') {
    if (e.key === 'Escape' && document.getElementById('gvPop')?.hidden !== false) { if (rf.contSel) { rf.contSel = null; renderReferencias(true); } else if (rf.cuentaSel) rfCerrarCuenta(); }
    return;
  }
  if (rf.seccion === 'bandeja' && rf.vista === 'mapa') return;
  if (rf.seccion === 'seleccion' && e.key === 'Escape' && rf.sSel && document.getElementById('gvPop')?.hidden !== false) { rf.sSel = null; renderReferencias(true); return; }
  const actual = rf.seccion === 'seleccion' ? rf.sSel : rf.sel, r = actual && rfRef(actual), k = e.key.toLowerCase();
  if (k === 'arrowdown' || k === 'j') { e.preventDefault(); rfMover(1); }
  else if (k === 'arrowup' || k === 'k') { e.preventDefault(); rfMover(-1); }
  else if (!r) return;
  else if (k === 'l') { if (r.decision?.decision !== 'adaptar') rfVotar(r, 'si'); }
  else if (k === 'x') { if (r.decision?.decision !== 'descartar') rfVotar(r, 'no'); }
  else if (k === 'r' || k === 'c') rfComo(r, k === 'r' ? 'reel' : 'carrusel');
  else if (['1', '2', '3'].includes(k)) rfTomar(r, ['recrear', 'idea', 'formato'][Number(k) - 1]);
  else if (k === 'v') { if (rfEmbed(r)) rfVer(r); }
  else if (k === 'n') { const n = document.querySelector(`[data-rfnota="${CSS.escape(r.id)}"]`); if (n) { e.preventDefault(); n.focus(); } }
  else if (k === 'o') window.open(r.url, '_blank', 'noopener');
});
for (const id of ['referenciasView']) {
  $(id).addEventListener('input', e => { const t = e.target.closest('[data-rfnota]'); if (t) rf.nota[t.dataset.rfnota] = t.value; });
  $(id).addEventListener('keydown', e => { const t = e.target.closest('[data-rfnota]'); if (!t) return; e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); rfGuardarNota(t); t.blur(); } else if (e.key === 'Escape') t.blur(); });
  $(id).addEventListener('focusout', e => { const t = e.target.closest?.('[data-rfnota]'); if (t) rfGuardarNota(t); });
}
$('rfDetalle').addEventListener('click', e => { if (e.target === $('rfDetalle') || e.target.closest('[data-rfx]')) $('rfDetalle').close(); });
$('rfPedido').addEventListener('click', e => {
  if (e.target === $('rfPedido') || e.target.closest('[data-rfx]')) { $('rfPedido').close(); return; }
  const ps = e.target.closest('[data-rfpsemana]'); if (ps) { rf.semanaPedido = ps.dataset.rfpsemana; $('rfPedido').querySelectorAll('[data-rfpsemana]').forEach(b => b.classList.toggle('on', b === ps)); return; }
  const h = e.target.closest('[data-rfhasta]'); if (h) { rf.hasta = h.dataset.rfhasta; rfSave('rfHasta', rf.hasta); $('rfPedido').querySelectorAll('[data-rfhasta]').forEach(b => b.classList.toggle('on', b === h)); return; }
  const c = e.target.closest('#rfpCopiar'); if (c && !c.disabled) rfCopiarPedido(c);
  const pc = e.target.closest('[data-rfpedcopiar]'); if (pc) { const x = rf.pedidos?.pedidos?.find(y => y.id === pc.dataset.rfpedcopiar); if (x) copyText(x.prompt, 'Pedido copiado de nuevo.'); }
});
$('rfPedir').onclick = rfOpenPedido;
// El reproductor: cerrar corta el video; votar desde ahí cierra y pasa a la siguiente.
$('rfPlayer').addEventListener('click', e => {
  if (e.target === $('rfPlayer') || e.target.closest('[data-rfx]')) { $('rfPlayer').close(); return; }
  const vo = e.target.closest('[data-rfvoto]'); if (vo) { const r = rfRef(vo.dataset.key); $('rfPlayer').close(); if (r) rfVotar(r, vo.dataset.rfvoto); }
});
$('rfPlayer').addEventListener('keydown', e => { const k = e.key.toLowerCase(), r = rfRef($('rfPlayer').dataset.key); if (!r || !['l', 'x'].includes(k)) return; e.preventDefault(); $('rfPlayer').close(); rfVotar(r, k === 'l' ? 'si' : 'no'); });
$('rfPlayer').addEventListener('close', () => { $('rfPlayer').innerHTML = ''; });
// TikTok arranca sin sonido: cuando su reproductor avisa que está listo, se le pide que lo active y que reproduzca.
addEventListener('message', e => {
  if (e.origin !== 'https://www.tiktok.com' || !e.data?.['x-tiktok-player'] || e.data.type !== 'onPlayerReady') return;
  const w = $('rfPlayer').querySelector('iframe')?.contentWindow; if (!w || e.source !== w) return;
  for (const type of ['unMute', 'play']) w.postMessage({ type, 'x-tiktok-player': true }, 'https://www.tiktok.com');
});
$('rfPrev').onclick = () => rfCorrer(-1);
$('rfNext').onclick = () => rfCorrer(1);
$('rfToday').onclick = () => rfSetRango(rangoDeHoy(rfRango()));
$('rfWeekTitle').onclick = () => rangoMenu($('rfWeekTitle'), { rango: rfRango, periodo: rfPeriodo, atajos: RF_ATAJOS, set: rfSetRango });
let rfResize = 0;
addEventListener('resize', () => { cancelAnimationFrame(rfResize); rfResize = requestAnimationFrame(() => { if (view === 'referencias') rfAjustarAlto(); }); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && view === 'referencias' && !document.activeElement?.dataset?.rfnota) { rf.data && (rf.data.at = 0); loadReferencias(); loadSeleccion(); } });
// Después de que cargue metricas.js (el calendario de rango vive ahí).
if (view === 'referencias') setTimeout(() => renderReferencias(), 0);
