// Pestaña Guiones: los guiones, audios, rough cuts, finales y carruseles de la semana para revisar antes de publicar.
// Cada pieza con su título en pantalla, estilo, audio o video, guion, copy, Aprobar y feedback escrito o grabado, que se
// copia para Claude Code. Va por la semana en que se planificó; la fecha de publicación se asigna después, en Semana.
// Formato de los planes y de las carpetas en docs/guiones.md.
// Usa las utilidades globales de planner.js ($, api, esc, toast, copyText, mediaUrl, blobB64, clock, ICON, week…).
const gv = { data: null, loading: false, open: {}, arch: {}, rec: null, saving: {}, text: {}, copy: {},
  rango: store.get('gvRango', 'semana'), etapas: store.get('gvEtapas', []), lastWeek: null };
const GV_ESTADO = { aprobado: ['Aprobado', 'ok'], cambios: ['Con feedback', 'accent'], por_escuchar: ['Por escuchar', 'warn'], por_revisar: ['Rough cut por revisar', 'warn'], final_por_revisar: ['Final por revisar', 'warn'], sin_audio: ['Sin audio', 'nofinal'], borrador_por_revisar: ['Borrador por revisar', 'warn'], sin_laminas: ['Sin láminas', 'nofinal'], texto_por_revisar: ['Texto por revisar', 'warn'] };
// Las notas de una pieza descartada no cuentan ni viajan en «Copiar feedback».
const gvFb = p => p.descartado || p.pausado ? [] : (p.feedback || []).filter(e => e.estado !== 'aplicado' && e.estado !== 'en_curso');
// Filtro por estado. Cada pieza cae en una etapa; sin ninguna marcada se ven todas.
// Publicado gana a todo.
const GV_ETAPAS = [['guion', 'Guion y audio'], ['rough', 'Rough cut o borrador'], ['final', 'Final por revisar'], ['cambios', 'Con feedback'], ['aprobado', 'Aprobado'], ['publicado', 'Publicado'], ['pausado', 'Pausado'], ['descartado', 'Descartado']];
const GV_POR_REVISAR = ['guion', 'rough', 'final'];
const gvEtapa = p => p.publicado ? 'publicado' : p.descartado ? 'descartado' : p.pausado ? 'pausado' : p.estado === 'aprobado' ? 'aprobado' : p.estado === 'final_por_revisar' ? 'final'
  : ['por_revisar', 'borrador_por_revisar'].includes(p.estado) ? 'rough' : p.estado === 'cambios' ? 'cambios' : 'guion';
const gvEtapaOk = p => !gv.etapas.length || gv.etapas.includes(gvEtapa(p));
const gvSemana = wk => { const d0 = new Date(wk + 'T12:00:00Z'), d6 = new Date(dateAdd(wk, 6) + 'T12:00:00Z'); return `${d0.getUTCDate()} – ${d6.getUTCDate()} de ${d6.toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' })}`; };
// Qué semanas se ven: «semana» es la de las flechas; si no, «todas» o una lista de lunes.
const gvRangoKey = () => gv.rango === 'semana' ? week : gv.rango === 'todas' ? 'todas' : gv.rango.join(',');
const gvKey = () => gvRangoKey();
const gvConPlanes = weeks => [...new Set((weeks || []).map(w => w.week))].filter(wk => gvPlanes(weeks, wk).length).sort().reverse();
const gvSemanas = weeks => gv.rango === 'semana' ? [week] : gv.rango === 'todas' ? gvConPlanes(weeks) : [...gv.rango].sort().reverse();
function gvSetRango(r) {
  gv.rango = Array.isArray(r) && r.length === 1 ? 'semana' : Array.isArray(r) && !r.length ? 'semana' : r;
  if (Array.isArray(r) && r.length === 1) week = r[0];
  store.set('gvRango', gv.rango); gv.lastWeek = week; render();
}
// Los planes de una semana: uno por subcarpeta (o el de la carpeta de la semana).
const gvPlanes = (weeks, wk) => (weeks || []).filter(w => w.week === wk).sort((a, b) => a.perfil.localeCompare(b.perfil));
// El formato de la barra lateral también separa videos de carruseles.
const gvFormatoOk = p => formatoPasa(p.tipo === 'carrusel' ? 'carrusel' : 'reel');

const gvDia = d => new Date(d + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
function gvRangoLabel(d) {
  if (gv.rango === 'semana') return gvSemana(week);
  if (gv.rango === 'todas') return 'Todas las semanas';
  const xs = [...gv.rango].sort();
  return `${xs.length} semanas · ${gvDia(xs[0])} al ${gvDia(dateAdd(xs.at(-1), 6))}`;
}
const gvEtapasLabel = () => !gv.etapas.length ? 'Todos los estados' : gv.etapas.length === 1 ? GV_ETAPAS.find(x => x[0] === gv.etapas[0])?.[1] || 'Estado'
  : GV_POR_REVISAR.length === gv.etapas.length && GV_POR_REVISAR.every(x => gv.etapas.includes(x)) ? 'Por revisar' : `${gv.etapas.length} estados`;
function gvSetEtapas(xs) { gv.etapas = xs.filter(x => GV_ETAPAS.some(e => e[0] === x)); store.set('gvEtapas', gv.etapas); renderGuiones(true); }
const gvAprobable = p => !!(p.audio || p.video || p.laminas?.length || (p.mudo && p.guion?.texto));

// Un menú chico anclado a un botón (semanas, estados, estado de una pieza). Se cierra al tocar afuera o con Escape.
function gvMenu(anchor, html, onClick) {
  let pop = document.getElementById('gvPop');
  if (!pop) {
    pop = document.createElement('div'); pop.id = 'gvPop'; pop.className = 'popover gv-pop'; pop.hidden = true; document.body.appendChild(pop);
    document.addEventListener('pointerdown', e => { const p = document.getElementById('gvPop'); if (p && !p.hidden && !p.contains(e.target) && !gv.menuAnchor?.contains(e.target)) gvMenuClose(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('gvPop')?.hidden) { e.stopPropagation(); gvMenuClose(); } }, true);
    window.addEventListener('scroll', () => { if (!document.getElementById('gvPop')?.hidden) gvMenuClose(); }, { passive: true });
  }
  if (!pop.hidden && gv.menuAnchor === anchor) { gvMenuClose(); return; }
  gv.menuAnchor = anchor; pop.innerHTML = html; pop.hidden = false; pop.onclick = onClick;
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  pop.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : r.bottom + 6) + 'px';
}
function gvMenuClose() { const p = document.getElementById('gvPop'); if (p) { p.hidden = true; p.innerHTML = ''; } gv.menuAnchor = null; }

// El calendario de semanas: los guiones van por la semana en que se planificaron. Tocar un día abre su semana; la casilla
// de cada semana la suma a las elegidas; «Hoy» vuelve a la semana de hoy y «Todas las semanas» muestra todo. Cada semana
// con guiones dice cuántas piezas tiene. Lo elegido se guarda (gvRango y la semana en la dirección).
function gvMenuSemanas(anchor) {
  const weeks = gv.data?.weeks || [], hoy = todayStr(), n = wk => gvPlanes(weeks, wk).reduce((t, w) => t + (w.piezas || 0), 0);
  let mes = (gv.rango === 'todas' ? monday(hoy) : gvSemanas(weeks)[0] || week).slice(0, 7);
  const html = () => {
    const sel = gv.rango === 'todas' ? [] : gvSemanas(weeks), primero = mes + '-01', fin = new Date(primero + 'T12:00:00Z');
    fin.setUTCMonth(fin.getUTCMonth() + 1); fin.setUTCDate(0);
    const filas = []; for (let wk = monday(primero); wk <= fin.toISOString().slice(0, 10); wk = dateAdd(wk, 7)) filas.push(wk);
    const titulo = new Date(primero + 'T12:00:00Z').toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `<div class="gv-cal">
      <div class="gv-cal-h"><button class="icon" data-mes="-1" aria-label="Mes anterior"><svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg></button><b>${esc(titulo)}</b><button class="icon" data-mes="1" aria-label="Mes siguiente"><svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></button></div>
      <div class="gv-cal-dias"><span></span>${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span>${d}</span>`).join('')}<span></span></div>
      ${filas.map(wk => { const k = n(wk), on = gv.rango === 'todas' ? !!k : sel.includes(wk);
        return `<div class="gv-cal-sem${on ? ' on' : ''}"><input type="checkbox" data-wk="${wk}" ${sel.includes(wk) ? 'checked' : ''} title="Sumar esta semana a las que se ven" aria-label="Sumar la semana del ${esc(gvSemana(wk))}">${[0, 1, 2, 3, 4, 5, 6].map(i => { const d = dateAdd(wk, i);
          return `<button class="gv-cal-d${d.slice(0, 7) !== mes ? ' fuera' : ''}${d === hoy ? ' hoy' : ''}" data-dia="${d}" title="Ver la semana del ${esc(gvSemana(wk))}">${Number(d.slice(8))}</button>`; }).join('')}<span class="gv-cal-n" title="${k ? `${k} pieza${k === 1 ? '' : 's'}` : 'Sin guiones'}">${k || ''}</span></div>`; }).join('')}
      <div class="gv-pop-quick gv-cal-pie"><button class="ghost${gv.rango === 'semana' && week === monday(hoy) ? ' on' : ''}" data-r="hoy">Hoy</button><button class="ghost${gv.rango === 'todas' ? ' on' : ''}" data-r="todas">Todas las semanas</button></div>
    </div>`;
  };
  gvMenu(anchor, html(), e => {
    const t = e.target, pop = document.getElementById('gvPop');
    const m = t.closest('[data-mes]'); if (m) { const d = new Date(mes + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + Number(m.dataset.mes)); mes = d.toISOString().slice(0, 7); pop.innerHTML = html(); return; }
    const r = t.closest('[data-r]'); if (r) { gvSetRango(r.dataset.r === 'todas' ? 'todas' : [monday(hoy)]); gvMenuClose(); return; }
    const dia = t.closest('[data-dia]'); if (dia) { gvSetRango([monday(dia.dataset.dia)]); gvMenuClose(); return; }
    const c = t.closest('[data-wk]'); if (!c) return;
    const antes = gv.rango === 'todas' ? [] : gvSemanas(weeks), marcadas = c.checked ? [...new Set([...antes, c.dataset.wk])] : antes.filter(x => x !== c.dataset.wk);
    if (!marcadas.length) { c.checked = true; return; }
    gvSetRango(marcadas); if (pop && !pop.hidden) pop.innerHTML = html();
  });
}

// Estados: casillas con cuántas piezas hay en cada uno (en las semanas y el formato que se ven) y «Por revisar».
function gvMenuEtapas(anchor) {
  const ps = (gv.data?.piezas || []).filter(gvFormatoOk), n = k => ps.filter(p => gvEtapa(p) === k).length;
  const html = () => `<div class="gv-pop-quick"><button class="ghost${!gv.etapas.length ? ' on' : ''}" data-e="">Todos</button><button class="ghost${gvEtapasLabel() === 'Por revisar' ? ' on' : ''}" data-e="${GV_POR_REVISAR.join(',')}" title="Guion, rough cut y final por revisar">Por revisar</button></div>
    <div class="gv-pop-list">${GV_ETAPAS.map(([k, l]) => `<label class="gv-pop-row"><input type="checkbox" data-et="${k}" ${gv.etapas.includes(k) ? 'checked' : ''}><span>${esc(l)}</span><span class="muted">${n(k)}</span></label>`).join('')}</div>`;
  gvMenu(anchor, html(), e => {
    const b = e.target.closest('[data-e]');
    if (b) { gvSetEtapas(b.dataset.e ? b.dataset.e.split(',') : []); gvMenuClose(); return; }
    if (!e.target.closest('[data-et]')) return;
    gvSetEtapas([...e.currentTarget.querySelectorAll('[data-et]:checked')].map(x => x.dataset.et));
    e.currentTarget.querySelectorAll('[data-e]').forEach(x => x.classList.toggle('on', (x.dataset.e ? 'Por revisar' : 'Todos los estados') === gvEtapasLabel()));
  });
}

// El estado de la tarjeta, arriba a la derecha, se cambia desde ahí. La etapa (guion, rough cut,
// final) la da lo que hay en la carpeta; a mano se elige revisar, aprobado, pausado o descartado.
const gvActual = p => p.descartado ? 'descartado' : p.pausado ? 'pausado' : p.estado === 'aprobado' ? 'aprobado' : 'revisar';
// Abre la carpeta de la pieza con el video o el audio seleccionado (revealInFinder vive en planner.js).
const gvFinder = path => `<button class="gv-finder" data-gvfinder="${esc(path)}" title="Abrir en el Finder" aria-label="Abrir en el Finder">${ICON.folder}</button>`;
function gvEstadoTag(p, fecha) {
  // Una pieza publicada ya no cambia de estado desde acá: la publicación se maneja en Publicadas.
  if (p.publicado) return `<span class="tag ok gv-st" title="Publicada${p.publicado.redes?.length ? ' en ' + esc(p.publicado.redes.join(', ')) : ''}">Publicado${p.publicado.fecha ? ' · ' + esc(p.publicado.fecha.slice(8, 10) + '-' + p.publicado.fecha.slice(5, 7)) : ''}</span>`;
  const st = GV_ESTADO[p.estado] || ['', ''], a = gvActual(p);
  const [label, cls] = a === 'descartado' ? ['Descartada', 'muted'] : a === 'pausado' ? ['Pausada', 'muted'] : st;
  return `<button class="tag ${cls} gv-st" data-gvst="${esc(p.key)}" title="Cambiar el estado">${esc(label)}${fecha ? ' · ' + esc(fecha) : ''}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6.5 3 3 3-3"/></svg></button>`;
}
function gvMenuEstado(anchor, p) {
  const a = gvActual(p), rev = a === 'revisar' ? (GV_ESTADO[p.estado]?.[0] || 'Por revisar') : 'Volver a revisión';
  const op = [['revisar', rev], ['aprobado', 'Aprobado', !gvAprobable(p)], ['pausado', 'Pausado'], ['descartado', 'Descartado']];
  gvMenu(anchor, `<div class="gv-pop-list">${op.map(([k, l, off]) => `<button class="gv-pop-opt${k === a ? ' on' : ''}" data-to="${k}" ${off ? 'disabled title="Todavía no hay nada para aprobar"' : ''}>${k === a ? ICON.check : '<i></i>'}${esc(l)}</button>`).join('')}</div>`, e => {
    const b = e.target.closest('[data-to]'); if (!b || b.disabled) return;
    gvMenuClose(); gvCambiarEstado(p, b.dataset.to);
  });
}
async function gvCambiarEstado(p, to) {
  const de = gvActual(p); if (to === de) return;
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: p.run, ...body }) });
  try {
    if (to === 'aprobado') await post('guiones/estado', { estado: 'aprobado' });
    else if (to === 'pausado' || to === 'descartado') await post('guiones/descartar', { accion: to === 'pausado' ? 'pausar' : 'descartar' });
    else {
      if (p.descartado) await post('guiones/descartar', { accion: 'recuperar' });
      if (p.pausado) await post('guiones/descartar', { accion: 'reanudar' });
      if (p.estado === 'aprobado') await post('guiones/estado', { estado: 'por_escuchar' });
    }
  } catch (e) { toast(e.message); await loadGuiones(); return; }
  const ok = p.video?.final ? 'Final aprobado.' : 'Aprobado.';
  toast({ aprobado: ok, pausado: 'Pausada: quedó al final, en gris.', descartado: 'Descartada: quedó al final, en gris.', revisar: 'Volvió a revisión.' }[to],
    () => { const q = gvPiece(p.key); if (q) gvCambiarEstado(q, de); });
  await loadGuiones();
}

async function loadGuiones() {
  if (gv.loading) return; gv.loading = true;
  const key = gvKey(), wk = week;
  try {
    // El endpoint devuelve un plan y la lista de todos: primero la lista, después cada plan de las semanas que se ven.
    const [lista, prod] = await Promise.all([api(`guiones?week=${wk}`), gv.prod ? gv.prod : api('guiones/produccion').catch(() => null)]);
    gv.prod = prod;
    const semanas = gvSemanas(lista.weeks), ws = semanas.flatMap(s => gvPlanes(lista.weeks, s));
    const res = await Promise.all(ws.map(w => lista.plan?.path === w.path ? lista : api(`guiones?perfil=${encodeURIComponent(w.perfil)}&week=${w.week}&path=${encodeURIComponent(w.path)}`)));
    const planes = res.map((r, k) => ({ perfil: ws[k].perfil, week: ws[k].week, path: ws[k].path, plan: r.plan, piezas: (r.piezas || []).map(p => ({ ...p, planPath: r.plan?.path })) }))
      .filter(x => x.plan && x.piezas.length);
    // Dos planes pueden repetir un id (R01 de dos semanas): la tarjeta se identifica por `key`, que en el segundo lleva el
    // plan y la semana adelante. El id va tal cual al servidor.
    const ids = new Set();
    for (const x of planes) for (const p of x.piezas) { p.key = ids.has(p.id) ? `${x.path}·${p.id}` : p.id; ids.add(p.key); }
    gv.data = { key, weeks: lista.weeks, carpeta: lista.carpeta, semanas, planes, piezas: planes.flatMap(x => x.piezas) };
  } catch (e) { gv.data = { key, error: e.message, weeks: [], planes: [], piezas: [] }; }
  finally { gv.loading = false; }
  if (view === 'guiones') renderGuiones(true);
}

function renderGuiones(fresh) {
  // Las flechas (o ← →) mueven una semana: si había varias elegidas, vuelve a ver de a una.
  if (gv.rango !== 'semana' && gv.lastWeek && gv.lastWeek !== week) { gv.rango = 'semana'; store.set('gvRango', 'semana'); }
  gv.lastWeek = week;
  const d = gv.data?.key === gvKey() ? gv.data : null;
  $('gvWeekTitle').textContent = gvRangoLabel(d);
  $('gvEstado').textContent = gvEtapasLabel(); $('gvEstado').classList.toggle('on', !!gv.etapas.length);
  if (!fresh || !d) { if (!gv.loading) loadGuiones(); if (!d) { $('gvGrid').innerHTML = '<p class="muted gv-empty">Cargando…</p>'; return; } }
  if (d.error) { $('gvCopy').hidden = true; $('gvGrid').innerHTML = `<p class="gv-empty">${esc(d.error)}</p>`; return; }
  const conFormato = d.planes.map(x => ({ ...x, piezas: x.piezas.filter(gvFormatoOk) })).filter(x => x.piezas.length);
  const planes = conFormato.map(x => ({ ...x, piezas: x.piezas.filter(gvEtapaOk) })).filter(x => x.piezas.length);
  if (!planes.length) {
    const otras = gvConPlanes(d.weeks).filter(wk => !d.semanas.includes(wk)).sort();
    const que = !formatoPasa('reel') ? 'carruseles' : !formatoPasa('carrusel') ? 'reels' : 'guiones';
    const donde = gv.rango === 'semana' ? 'esta semana' : 'en estas semanas';
    $('gvCopy').hidden = true;
    $('gvGrid').innerHTML = conFormato.length
      ? `<div class="gv-empty"><p>Ninguna pieza ${gv.etapas.length === 1 ? `en «${esc(GV_ETAPAS.find(x => x[0] === gv.etapas[0])[1])}»` : 'en esos estados'} ${donde}.</p><p><button class="secondary" data-gvetapas="">Ver todos los estados</button>${gv.rango !== 'todas' ? ' <button class="secondary" data-gvrango="todas">Buscar en todas las semanas</button>' : ''}</p></div>`
      : `<div class="gv-empty"><p>No hay ${que} planificados ${donde}.</p>${otras.length ? `<p>${gv.rango !== 'todas' ? '<button class="secondary" data-gvrango="todas">Todas las semanas</button> ' : ''}${otras.map(wk => `<button class="secondary" data-gvweek="${wk}">${esc(gvSemana(wk))}</button>`).join(' ')}</p>` : ''}</div>`;
    return;
  }
  const fbN = planes.reduce((s, x) => s + x.piezas.reduce((t, p) => t + gvFb(p).length, 0), 0);
  $('gvCopy').hidden = false; $('gvCopy').disabled = !fbN; $('gvCopyCount').textContent = fbN;
  // El campo de feedback está siempre a la vista: si se redibuja mientras escribís en otra pieza, no pierde el foco.
  const typing = document.activeElement?.dataset?.gvtext, caret = typing ? document.activeElement.selectionStart : 0;
  const vivos = new Map([...$('gvGrid').querySelectorAll('video[data-gvvid]')].filter(v => v.currentTime > 0).map(v => [v.dataset.gvvid, v]));
  // Lo mismo con los audios (el de la pieza y los de las notas): aprobar o mandar feedback no corta lo que suena.
  // Van por src, que cambia si el archivo cambió: un audio nuevo arranca de cero.
  const sonando = new Map([...$('gvGrid').querySelectorAll('audio[src]')].filter(a => a.currentTime > 0).map(a => [a.getAttribute('src'), a]));
  // Con más de un plan en la semana, cada uno con su nombre arriba; con varias semanas,
  // cada semana con su título. Las pausadas y las descartadas bajan al final de su plan.
  const semanas = [...new Set(planes.map(x => x.week))], multi = d.semanas.length > 1;
  const orden = p => p.descartado ? 2 : p.pausado ? 1 : 0;
  $('gvGrid').innerHTML = semanas.map(wk => { const ps = planes.filter(x => x.week === wk); return `<div class="gv-week">${multi ? `<h2 class="gv-week-h">${esc(gvSemana(wk))}</h2>` : ''}${ps.map(({ perfil, plan, piezas }) => `<section class="gv-plan">${ps.length > 1 ? `<h2 class="gv-plan-h${multi ? ' sub' : ''}">${esc(plan.titulo || perfil || 'Plan')}</h2>` : ''}
    <div class="gv-cards">${[...piezas].sort((a, b) => orden(a) - orden(b)).map(gvCard).join('')}</div></section>`).join('')}</div>`; }).join('');
  const back = typing && document.querySelector(`[data-gvtext="${CSS.escape(typing)}"]`);
  if (back && !back.disabled) { back.focus({ preventScroll: true }); back.setSelectionRange(caret, caret); }
  // Un video que estás mirando sigue andando aunque la tarjeta se redibuje (al guardar una nota, por ejemplo): se
  // vuelve a poner el mismo elemento en el mismo paso, antes de que el navegador lo pause.
  for (const [k, v] of vivos) $('gvGrid').querySelector(`video[data-gvvid="${CSS.escape(k)}"]`)?.replaceWith(v);
  for (const [src, a] of sonando) [...$('gvGrid').querySelectorAll('audio[src]')].find(x => x.getAttribute('src') === src)?.replaceWith(a);
}

function gvCard(p) {
  const e = p.estilo || {}, o = gv.open[p.key] || '';
  const pal = (e.paleta || []).slice(0, 5);
  const t = e.titulo_css || {};
  const posterStyle = `--gv-bg:${pal[0] || '#1d1b18'};--gv-fg:${t.color || pal[1] || '#fff'};--gv-ac:${t.acento || pal[2] || pal[1] || '#e4572e'}`;
  // Con rough cut, el corte reemplaza a la portada y al audio: se revisa el video con su sonido, ahí mismo en la tarjeta.
  // La portada es un cuadro real del corte, para que la visual se vea siempre aunque el navegador no pinte el primero.
  const m0 = (p.muestras || []).find(m => m.tipo === 'imagen') || (p.muestras || [])[0];
  const media = p.laminas?.length
    ? `<div class="gv-video gv-slides"><button class="gv-video-open gv-slide-open" data-gvslides="${esc(p.key)}" data-i="0" title="Ver el carrusel en grande"><img src="${esc(mediaUrl(p.laminas[0].png))}&v=${Math.round(p.laminas[0].modified || 0)}" alt="Portada de ${esc(p.titulo || p.id)}" loading="lazy"><span class="gv-count">${p.laminas.length} láminas</span></button>
      <div class="gv-thumbs">${p.laminas.slice(1, 9).map((l, i) => `<button data-gvslides="${esc(p.key)}" data-i="${i + 1}" title="Lámina ${l.n}"><img src="${esc(mediaUrl(l.png))}&v=${Math.round(l.modified || 0)}" alt="Lámina ${l.n}" loading="lazy"></button>`).join('')}</div></div>`
    : p.video
    ? `<div class="gv-video"><video data-gvvid="${esc(p.key + '|' + p.video.path + '|' + Math.round(p.video.modified || 0))}" src="${esc(mediaUrl(p.video.path))}&v=${Math.round(p.video.modified || 0)}" poster="/api/planner/poster?path=${encodeURIComponent(p.video.path)}&v=${Math.round(p.video.modified || 0)}" controls playsinline preload="none"></video><span class="muted">${p.video.final ? 'Final' : 'Rough cut'}${p.video.versiones > 1 ? ' · v' + p.video.versiones : ''}${p.video.seconds ? ' · ' + clock(p.video.seconds) : ''} · <a class="link" href="${esc(mediaUrl(p.video.path))}" target="_blank" rel="noopener">abrir archivo</a>${gvFinder(p.video.path)}</span></div>`
    : `<div class="gv-poster ${esc(t.clase || '')}${m0 ? ' has-sample' : ''}" style="${posterStyle}" title="Título en pantalla · ${esc(e.nombre || '')}${m0 ? ' · fondo: muestra del estilo' : ''}">
      ${m0 ? `<img class="gv-sample" src="/api/planner/poster?path=${encodeURIComponent(m0.path)}" alt="" loading="lazy">` : ''}
      <span class="gv-poster-t">${gvTitLineas(p.titulo_pantalla || p.titulo || '').filter(Boolean).map(esc).join('<br>')}</span><span class="gv-poster-s">${esc(e.nombre || '')}</span>
    </div>`;
  // Una pieza descartada o pausada baja al final, en gris, con «Recuperar» o «Reanudar».
  if (p.descartado || p.pausado) return gvDescartada(p, media);
  return `<article class="gv-card st-${p.estado}${p.video || p.laminas?.length ? ' has-video' : ''}${p.laminas?.length ? ' is-carrusel' : ''}" data-gvid="${esc(p.key)}">
    ${media}
    <div class="gv-body">
      <div class="gv-top">${gvEstadoTag(p)}</div>
      <h3 class="gv-title">${esc(p.titulo || '')}</h3>
      <div class="gv-chips">${gvProdBtns(p)}</div>
      <p class="gv-hook">${esc(p.hook || '')}</p>
      ${p.portadas?.length ? gvPortadas(p) : ''}
      ${p.video || (p.tipo === 'carrusel' && p.run_ok) ? '' : p.audio ? `<div class="gv-audio"><audio controls preload="none" src="${esc(mediaUrl(p.audio.path))}&v=${Math.round(p.audio.modified || 0)}"></audio><span class="muted">${p.audio.seconds ? clock(p.audio.seconds) : ''}${p.guion ? ` · ${p.guion.palabras} palabras` : ''}</span>${gvFinder(p.audio.path)}</div>` : `<p class="muted gv-noaudio">${!p.run_ok ? (p.tipo === 'carrusel' ? 'Borrador en preparación.' : 'Falta el run de esta pieza.') : p.mudo ? 'Va mudo a propósito: revisá el texto en pantalla en «Guion».' : 'Audio en preparación.'}</p>`}
      <div class="gv-acts">
        ${p.estado === 'aprobado' ? `<button class="secondary on-ok" data-gvok="${esc(p.key)}" data-v="por_escuchar" title="Deshacer la aprobación">${ICON.check} Aprobado</button>` : `<button class="secondary" data-gvok="${esc(p.key)}" data-v="aprobado" ${gvAprobable(p) ? '' : 'disabled'}>${ICON.check} ${p.laminas?.length || p.tipo === 'carrusel' ? 'Aprobar borrador' : p.mudo && !p.video ? 'Aprobar texto' : p.video?.final ? 'Aprobar final' : p.video ? 'Aprobar corte' : 'Aprobar audio'}</button>`}
        <button class="ghost ${o === 'guion' ? 'on' : ''}" data-gvopen="guion" data-id="${esc(p.key)}">${p.tipo === 'carrusel' ? 'Texto' : 'Guion'}</button>
        ${p.run_ok ? `<button class="ghost ${o === 'copy' ? 'on' : ''}" data-gvopen="copy" data-id="${esc(p.key)}" title="${p.copy || gvCopyNota(p) ? 'El copy que se sube con la pieza' : 'Todavía no tiene copy'}">Copy${p.copy || gvCopyNota(p) ? '' : '<i class="gv-falta" aria-label="sin copy"></i>'}</button>` : ''}
        ${(p.muestras || []).length ? `<button class="ghost ${o === 'estilo' ? 'on' : ''}" data-gvopen="estilo" data-id="${esc(p.key)}">Estilo</button>` : ''}
        <button class="ghost ${o === 'why' ? 'on' : ''}" data-gvopen="why" data-id="${esc(p.key)}">Por qué</button>
        <button class="ghost gv-desc" data-gvdesc="${esc(p.key)}" data-v="descartar" title="Descartar: baja al final en gris y la podés recuperar">${ICON.trash} Descartar</button>
      </div>
      ${o === 'guion' ? gvGuion(p) : o === 'copy' ? gvCopy(p) : o === 'estilo' ? gvEstilo(p) : o === 'why' ? gvWhy(p) : ''}
      ${gvFeedback(p)}
    </div>
  </article>`;
}

// Las tres portadas del carrusel lado a lado; tocar una la abre en grande y «Elegir» la deja como lámina 1.
function gvPortadas(p) {
  const el = p.portadas.find(x => x.elegida);
  return `<div class="gv-portadas"><div class="gv-port-head"><b>Portadas</b><span class="muted">${el ? `ganadora: ${esc(el.id.toUpperCase())}` : 'elegí la ganadora'}</span></div>
    <div class="gv-port-row">${p.portadas.map((x, i) => `<figure class="${x.elegida ? 'on' : ''}">
      <button class="gv-port-img" data-gvportview="${esc(p.key)}" data-i="${i}" title="Ver en grande"><img src="${esc(mediaUrl(x.path))}&v=${Math.round(x.modified || 0)}" alt="Portada ${esc(x.id.toUpperCase())}" loading="lazy"><span class="gv-port-id">${esc(x.id.toUpperCase())}</span></button>
      ${x.titulo || x.idea ? `<figcaption>${esc(x.titulo || x.idea)}</figcaption>` : ''}
      <button class="${x.elegida ? 'secondary on-ok' : 'secondary'}" data-gvport="${esc(p.key)}" data-v="${esc(x.id)}" ${x.elegida ? 'disabled' : ''}>${x.elegida ? `${ICON.check} Ganadora` : 'Elegir'}</button>
    </figure>`).join('')}</div></div>`;
}

async function gvElegirPortada(p, id) {
  try { const r = await api('guiones/portada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: p.run, id }) }); p.portadas = r.portadas; toast(`Portada ${id.toUpperCase()} elegida: ya es la lámina 1.`); }
  catch (e) { toast(e.message); return; }
  await loadGuiones();
}

function gvGuion(p) {
  const txt = p.guion?.texto || '';
  const html = esc(txt).replace(/\[([^\]]*)\]/g, '<span class="gv-tag">[$1]</span>').split(/\n\s*\n/).map(x => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');
  return `<div class="gv-panel gv-guion">${html || '<p class="muted">Sin guion.</p>'}
    ${p.cta ? `<p class="muted">CTA: ${esc(p.cta)}</p>` : ''}${p.edicion ? `<p class="muted">Edición: ${esc(p.edicion)}</p>` : ''}
    <button class="link" data-gvcopy="${esc(p.key)}">Copiar guion</button></div>`;
}

// El copy del post. Sale de publish_kit.md («## Caption»);
// editarlo deja una nota de copy que viaja con «Copiar feedback para Claude Code».
const gvCopyNota = p => [...(p.feedback || [])].reverse().find(e => typeof e.copy === 'string' && e.estado !== 'aplicado');
const gvCopyBase = p => gvCopyNota(p)?.copy ?? (p.copy || '');
const gvCopyDirty = p => gv.copy?.[p.key] != null && gv.copy[p.key].trim() !== gvCopyBase(p).trim();
function gvCopy(p) {
  const n = gvCopyNota(p), base = gvCopyBase(p), val = gv.copy?.[p.key] ?? base;
  return `<div class="gv-panel gv-copy">
    <div class="gv-copy-head">${n ? `<span class="tag ${n.estado === 'en_curso' ? 'warn' : 'accent'}">Editado · ${{ en_curso: 'en curso', enviado: 'copiado' }[n.estado] || 'pendiente'}</span>` : base ? '' : '<span class="muted">Todavía no tiene copy: se escribe al pasar a producción final. Podés escribirlo vos acá.</span>'}</div>
    <textarea class="gv-copytext" data-gvcopytext="${esc(p.key)}" placeholder="El copy que se sube con la pieza…" aria-label="Copy de ${esc(p.titulo || p.id)}">${esc(val)}</textarea>
    <div class="gv-copy-acts" ${gvCopyDirty(p) ? '' : 'hidden'}><button class="secondary" data-gvcopysave="${esc(p.key)}">Guardar copy</button><button class="ghost" data-gvcopyundo="${esc(p.key)}">Deshacer</button><span class="hint">Queda como feedback: se aplica cuando lo pegás en Claude Code.</span></div>
  </div>`;
}
async function gvSaveCopy(p) {
  const text = (gv.copy?.[p.key] || '').trim(); if (!text) return toast('El copy no puede quedar vacío.');
  try {
    const r = await api('guiones/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: p.run, pieza: p.id, tipo: p.tipo, copy: text }) });
    p.feedback = r.entries; delete gv.copy[p.key]; toast('Copy guardado: se aplica cuando pegues el feedback en Claude Code.');
  } catch (e) { return toast('No se guardó el copy: ' + e.message); }
  await loadGuiones();
}

// Muestras del estilo: cuadros o clips de reels ya hechos en ese estilo, o la referencia guardada que lo inspira. En la
// portada va siempre un cuadro fijo; los clips sólo corren acá y con play.
function gvEstilo(p) {
  const e = p.estilo || {};
  return `<div class="gv-panel"><p class="muted">${esc([e.nombre, e.titulo && 'Título: ' + e.titulo, e.ritmo && 'Ritmo: ' + e.ritmo].filter(Boolean).join(' · '))}</p>
    <div class="gv-samples">${p.muestras.map(m => `<figure>${m.tipo === 'video' ? `<video src="${esc(mediaUrl(m.path))}" controls muted loop playsinline preload="metadata"></video>` : `<a href="${esc(mediaUrl(m.path))}" target="_blank" rel="noopener"><img src="${esc(mediaUrl(m.path))}" alt="" loading="lazy"></a>`}${m.nota ? `<figcaption>${esc(m.nota)}</figcaption>` : ''}</figure>`).join('')}</div></div>`;
}

function gvWhy(p) {
  const e = p.estilo || {};
  return `<div class="gv-panel">${p.porque ? `<p>${esc(p.porque)}</p>` : ''}
    ${(p.referencias || []).length ? `<ul class="gv-refs">${p.referencias.map(r => `<li><a class="link" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.cuenta || r.url)}</a> ${r.nota ? `<span class="muted">· ${esc(r.nota)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    <p class="muted">${[p.formato?.detalle, e.titulo && 'Título: ' + e.titulo, e.ritmo && 'Ritmo: ' + e.ritmo].filter(Boolean).map(esc).join('<br>')}</p></div>`;
}

// Las notas ya aplicadas se pliegan en «N notas aplicadas», arriba de las abiertas. Siguen en feedback/ de la pieza;
// sólo dejan de ocupar la tarjeta.
function gvFeedback(p) {
  const rec = gv.rec?.id === p.key ? gv.rec : null, saving = gv.saving[p.key];
  const fb = p.feedback || [], hechas = fb.filter(e => e.estado === 'aplicado'), abiertas = fb.filter(e => e.estado !== 'aplicado');
  const entry = e => `<div class="fb-entry ${e.estado === 'aplicado' ? 'done' : ''}"><div class="fb-head"><span>${esc(new Date(e.created_at).toLocaleString('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''))}</span><span class="tag ${e.estado === 'aplicado' ? 'ok' : e.estado === 'en_curso' ? 'warn' : 'accent'}">${{ aplicado: 'Aplicado', en_curso: 'En curso', enviado: 'Copiado' }[e.estado] || 'Pendiente'}</span><button class="icon fb-del" data-gvdel="${esc(e.file)}" data-id="${esc(p.key)}" aria-label="Borrar nota">${ICON.trash}</button></div>${typeof e.copy === 'string' ? `<p class="fb-text"><b>Copy editado:</b> ${esc(e.copy.length > 140 ? e.copy.slice(0, 140) + '…' : e.copy)}</p>` : ''}${e.text ? `<p class="fb-text">${esc(e.text)}</p>` : ''}${e.audio ? `<audio src="${esc(mediaUrl(e.audio))}" controls preload="metadata"></audio>` : ''}${e.cambio ? `<p class="hint">${esc(e.cambio)}</p>` : ''}</div>`;
  return `<div class="gv-panel gv-fbp">${hechas.length ? `<details class="gv-arch" data-gvarch="${esc(p.key)}" ${gv.arch[p.key] ? 'open' : ''}><summary>${hechas.length === 1 ? '1 nota aplicada' : hechas.length + ' notas aplicadas'}</summary><div class="fb-list">${hechas.map(entry).join('')}</div></details>` : ''}${abiertas.length ? `<div class="fb-list">${abiertas.map(entry).join('')}</div>` : ''}
    <div class="gv-fb-in"><input type="text" data-gvtext="${esc(p.key)}" placeholder="Escribí y apretá Enter" value="${esc(gv.text[p.key] || '')}" ${saving ? 'disabled' : ''}>
    ${rec ? `<button class="secondary rec on" data-gvrec="${esc(p.key)}" title="Detener y guardar">${ICON.stop}<span data-gvclock>${clock((performance.now() - rec.start) / 1000)}</span></button>` : `<button class="secondary rec" data-gvrec="${esc(p.key)}" title="Grabar audio" aria-label="Grabar audio" ${saving ? 'disabled' : ''}>${ICON.mic}</button>`}</div>
    ${saving ? `<p class="hint">Guardando…</p>` : ''}</div>`;
}

const gvPiece = key => gv.data?.piezas?.find(p => p.key === key);

// Carrusel en grande: lámina por lámina con ← →; si la lámina ya está animada, se ve el MP4.
function gvOpenSlides(p, i) {
  let box = document.getElementById('gvPlayer');
  if (!box) { box = document.createElement('div'); box.id = 'gvPlayer'; box.className = 'gv-player'; document.body.appendChild(box); }
  const ls = p.laminas || [], l = ls[i]; if (!l) return;
  box.innerHTML = `<div class="gv-player-in"><div class="gv-player-head"><b>${esc(p.id)} · ${esc(p.titulo || '')}</b><span class="muted">${esc(p.estilo?.nombre || '')}</span><button class="icon gv-player-x" data-gvx title="Cerrar">✕</button></div>
    ${l.mp4 ? `<video class="gv-slide-big" controls autoplay loop playsinline src="${esc(mediaUrl(l.mp4))}&v=${Math.round(l.modified || 0)}" ${l.png ? ` poster="${esc(mediaUrl(l.png))}"` : ''}></video>` : `<img class="gv-slide-big" src="${esc(mediaUrl(l.png))}&v=${Math.round(l.modified || 0)}" alt="Lámina ${l.n}">`}
    <div class="gv-player-nav"><button class="secondary" data-gvsl="${i - 1}" ${i > 0 ? '' : 'disabled'}>← Anterior</button><span class="muted">${i + 1} de ${ls.length}</span><button class="secondary" data-gvsl="${i + 1}" ${i < ls.length - 1 ? '' : 'disabled'}>Siguiente →</button></div></div>`;
  box.hidden = false; box.onclick = e => {
    if (e.target === box || e.target.closest('[data-gvx]')) { gvClosePlayer(); return; }
    const n = e.target.closest('[data-gvsl]'); if (n) gvOpenSlides(p, Number(n.dataset.gvsl));
  };
}
function gvClosePlayer() { const box = document.getElementById('gvPlayer'); if (box) { box.querySelector('video')?.pause(); box.hidden = true; box.innerHTML = ''; } }

// Biblioteca de estilos: cada estilo se ve con cuadros reales de un video terminado en ese estilo o, si todavía no hay,
// con su muestra. Tocar uno lo deja en el plan; «Ver» lo abre en grande. ★ y ⊘ arman el catálogo: favoritos arriba,
// descartados abajo y plegados, y lo elegido para cada formato primero. El audio, la aprobación y las notas no cambian.
// Es un <dialog> no modal para que el visor (gvPlayer) quede encima y las flechas no muevan la semana de atrás.
const GV_STAR = '<svg viewBox="0 0 16 16"><path d="m8 2.3 1.75 3.6 3.95.55-2.86 2.77.68 3.93L8 11.3l-3.52 1.85.68-3.93L2.3 6.45l3.95-.55z"/></svg>';
const GV_NO = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="m4.1 11.9 7.8-7.8"/></svg>';
const gvPosterHtml = (s, texto) => {
  const pal = s.paleta || [], t = s.titulo_css || {};
  return `<span class="gv-poster ${esc(t.clase || '')}" style="--gv-bg:${esc(pal[0] || '#1d1b18')};--gv-fg:${esc(t.color || pal[1] || '#fff')};--gv-ac:${esc(t.acento || pal[2] || pal[1] || '#e4572e')}"><span class="gv-poster-t">${esc(texto)}</span></span>`;
};
const gvEstIds = s => [s.id, ...(s.alias || [])];
const gvQ = x => /[«»]/.test(x) ? x : `«${x}»`;
const gvEstPf = s => ({ fav: !!gv.est.prefs.favoritos?.[s.id], desc: !!gv.est.prefs.descartados?.[s.id] });
const gvEstListos = lib => lib.reduce((n, s) => n + (s.videos || []).filter(v => v.cuadros).length, 0);
// El cuadro que representa al estilo: el que elegiste en «Ver» o, si no, el primero del video terminado.
const gvCuadroUrl = f => `/api/planner/guiones/estilos/cuadro?f=${f}`;
function gvEstVisual(s, texto) {
  const vs = (s.videos || []).filter(x => x.cuadros?.length), v = vs.find(x => x.exacto) || vs[0], m = (s.muestras || []).find(x => x.tipo === 'imagen') || (s.muestras || [])[0];
  const elegido = gv.est.prefs.portadas?.[s.id]?.cuadro, todos = vs.flatMap(x => x.cuadros);
  const hero = (elegido && todos.find(c => c.url === gvCuadroUrl(elegido))) || (v && (v.cuadros.find(c => !c.caras) || v.cuadros[0]));
  const hv = hero && (vs.find(x => x.cuadros.includes(hero)) || v);
  if (hero) return { img: hero.url, tira: hv.cuadros.filter(c => c !== hero).slice(0, 3).map(c => c.url), badge: hv.exacto ? 'Video terminado' : 'Video parecido', visto: hv.exacto ? hv.titulo : null };
  const prep = (s.videos || []).some(x => !x.cuadros);
  if (m) return { img: `/api/planner/poster?path=${encodeURIComponent(m.path)}`, tira: [], badge: prep ? 'Preparando cuadros…' : /\/ref-/.test(m.path) ? 'Referencia de tus guardados' : 'Muestra' };
  return { html: gvPosterHtml(s, texto), tira: [], badge: prep ? 'Preparando cuadros…' : 'Sin video todavía' };
}

async function gvOpenEstilos(p, tab = 'broll') {
  let r, prod;
  try { [r, prod] = await Promise.all([api('guiones/estilos'), api('guiones/produccion')]); } catch (e) { toast(e.message); return; }
  clearTimeout(gv.est?.timer);
  gv.est = { lib: r.estilos, prefs: r.preferencias || {}, analizando: r.analizando, id: p.key, ver: null, vid: 0, y: 0, prod, tab: gvTabs(p).some(t => t[0] === tab) ? tab : 'broll' };
  let box = document.getElementById('gvEstilos');
  if (!box) {
    box = document.createElement('dialog'); box.id = 'gvEstilos'; box.className = 'gv-est'; document.body.appendChild(box);
    box.addEventListener('click', gvEstilosClick);
    box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); if (gv.est?.ver) { gv.est.ver = null; gvRenderEstilos(gv.est.y); } else box.close(); } });
    box.addEventListener('close', () => clearTimeout(gv.est?.timer));
  }
  gvRenderEstilos(0);
  if (!box.open) box.show();
  box.querySelector('.gv-est-in').focus({ preventScroll: true });
  gvEstPoll();
}

// Mientras se sacan los cuadros de los videos (en segundo plano, de a uno), la biblioteca se actualiza sola cuando
// aparecen nuevos, sin perder el lugar.
function gvEstPoll() {
  clearTimeout(gv.est.timer);
  if (!gv.est.analizando) return;
  gv.est.timer = setTimeout(async () => {
    if (!document.getElementById('gvEstilos')?.open) return;
    try {
      const r = await api('guiones/estilos'), antes = gvEstListos(gv.est.lib);
      Object.assign(gv.est, { lib: r.estilos, prefs: r.preferencias || {}, analizando: r.analizando });
      if (gvEstListos(r.estilos) !== antes || !r.analizando) gvRenderEstilos();
    } catch {}
    gvEstPoll();
  }, 5000);
}

function gvRenderEstilos(y) {
  const box = document.getElementById('gvEstilos'), p = gvPiece(gv.est?.id); if (!box || !p) return;
  const prev = box.querySelector('.gv-est-in')?.scrollTop || 0;
  const tab = gv.est.tab, tabs = gvTabs(p);
  const nav = tabs.length > 1 ? `<nav class="gv-ed-tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-gvtab="${k}">${n}</button>`).join('')}</nav>` : '';
  box.innerHTML = `<div class="gv-est-in${nav ? ' has-tabs' : ''}" tabindex="-1">${nav}${tab === 'look' ? gvLookGrilla(p) : tab === 'titulo' ? gvTituloGrilla(p) : gv.est.ver ? gvEstDetalle(p) : gvEstGrilla(p)}</div>`;
  box.querySelector('.gv-est-in').scrollTop = y ?? prev;
}

// El editor de producción de la pieza: el look del avatar, el estilo del B-roll y el tipo de título, en pestañas del
// mismo diálogo. El look sólo en los videos y si hay looks en la carpeta (o la pieza ya tiene uno); el título, en los videos.
const gvConAvatar = p => p.tipo !== 'carrusel' && !p.sin_avatar && !!(gv.prod?.looks?.length || p.look);
const gvTabs = p => [...(gvConAvatar(p) ? [['look', 'Avatar']] : []), ['broll', 'B-roll'], ...(p.tipo !== 'carrusel' ? [['titulo', 'Título']] : [])];
const gvLookImg = l => l?.id ? `/api/planner/guiones/looks/img?id=${encodeURIComponent(l.id)}` : '';
// Tres botones chicos, uno por pestaña del editor. El ícono ya dice lo elegido (la cara del look y la paleta del estilo);
// el nombre va en el tooltip.
const GV_IC = {
  avatar: '<svg viewBox="0 0 16 16"><circle cx="8" cy="5.6" r="2.6"/><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/></svg>',
  broll: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M2 6h12M2 10h12M5.5 3v3M10.5 3v3M5.5 10v3M10.5 10v3"/></svg>',
  titulo: '<svg viewBox="0 0 16 16"><path d="M3.5 4.5V3h9v1.5M8 3v10M6 13h4"/></svg>',
};
function gvProdBtns(p) {
  const e = p.estilo || {}, pal = (e.paleta || []).slice(0, 4);
  const btn = (attrs, cls, tip, ic, label) => `<button class="gv-pb${cls}" ${attrs} title="${esc(tip)}" aria-label="${esc(tip)}"><span class="gv-pb-ic">${ic}</span>${label}</button>`;
  const look = gvConAvatar(p) ? btn(`data-gvprod="look" data-id="${esc(p.key)}"`, p.look_antes ? ' changed' : '',
    ['Avatar: ' + (p.look?.nombre || 'sin elegir'), p.look?.combina && 'combina con ' + p.look.combina, p.look_antes && 'antes: ' + p.look_antes.nombre].filter(Boolean).join(' · '),
    p.look?.id ? `<img src="${esc(gvLookImg(p.look))}" alt="" loading="lazy">` : GV_IC.avatar, 'Avatar') : '';
  const broll = btn(`data-gvestilo="${esc(p.key)}"`, (p.estilo_antes ? ' changed' : '') + (p.estilo_descartado ? ' descartado' : ''),
    [p.estilo_descartado ? 'Descartaste este estilo: tocá para cambiarlo' : (p.tipo === 'carrusel' ? 'Estilo: ' : 'B-roll: ') + (e.nombre || 'sin elegir'), p.estilo_antes && 'antes: ' + p.estilo_antes.nombre].filter(Boolean).join(' · '),
    pal.length ? `<span class="gv-pb-pal">${pal.map(c => `<i style="background:${esc(c)}"></i>`).join('')}</span>` : GV_IC.broll, p.tipo === 'carrusel' ? 'Estilo' : 'B-roll');
  const tit = p.tipo !== 'carrusel' ? btn(`data-gvprod="titulo" data-id="${esc(p.key)}"`, p.titulo_tipo_antes ? ' changed' : '',
    ['Título: ' + (p.titulo_tipo?.nombre || 'el del estilo'), p.titulo_tipo_antes && 'antes: ' + p.titulo_tipo_antes.nombre].filter(Boolean).join(' · '), GV_IC.titulo, 'Título') : '';
  return look + broll + tit;
}
const gvEdHecho = p => p.video ? `<p class="hint">Ya tiene ${p.video.final ? 'final' : 'rough cut'}: si lo cambiás queda una nota para rehacerlo.</p>` : '';

function gvLookGrilla(p) {
  const cur = p.look?.id, looks = [...(gv.est.prod?.looks || [])].sort((a, b) => (b.usos || 0) - (a.usos || 0));
  const card = l => { const act = l.id === cur; return `<figure class="gv-est-card${act ? ' on' : ''}">
      <button class="gv-est-pick gv-look-pick" data-gvlook="${esc(l.id)}" ${act ? 'disabled' : ''} aria-label="${esc((act ? 'Look actual: ' : 'Usar ') + l.nombre)}"><img class="gv-est-img" src="${esc(l.img)}" alt="" loading="lazy"></button>
      <figcaption><b>${esc(l.nombre)}</b>${l.combina ? `<span class="muted">Combina con ${esc(l.combina)}</span>` : ''}
        <span class="gv-est-usos">${l.usos ? `${l.usos} ${l.usos === 1 ? 'pieza' : 'piezas'}` : 'Sin usar'}</span>
        <span class="gv-est-meta">${act ? '<span class="tag ok">Actual</span>' : ''}${l.default ? '<span class="tag">Default</span>' : ''}</span></figcaption>
    </figure>`; };
  return `<div class="gv-est-head"><div class="gv-est-title"><b>Look del avatar · ${esc(p.id)}</b><span class="muted">${esc(p.titulo || '')}</span></div>
      ${p.look_antes ? `<button class="secondary" data-gvlook="${esc(p.look_antes.id || '')}">Volver al del plan</button>` : ''}
      <button class="icon" data-gvestx aria-label="Cerrar">✕</button></div>
    <p class="hint">Tocá un look para usarlo en esta pieza.${p.estilo?.nombre ? ` El B-roll va en «${esc(p.estilo.nombre)}»: elegí uno que combine.` : ''}</p>
    ${cur ? '' : '<p class="hint">El plan todavía no le asignó look.</p>'}${gvEdHecho(p)}
    ${looks.length ? `<div class="gv-est-grid gv-look-grid">${looks.map(card).join('')}</div>` : `<p class="hint">No hay looks en <code>${esc(gv.est.prod?.carpeta_looks || 'looks')}</code>: poné ahí una foto o un video corto de cada look (ver docs/guiones.md).</p>`}`;
}

// Tipos de título: cada uno dibujado con el título de la pieza sobre la costura del split, con la muestra del estilo
// arriba y el look elegido abajo, como queda en el gancho. Los de la config con imagen se muestran con su imagen.
function gvTitLineas(s) {
  const parts = String(s || '').split(/\s*\/\s*|\n/).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(' ')];
  const w = String(s || '').split(/\s+/).filter(Boolean); if (w.length < 2) return [w[0] || '', ''];
  let best = 1; for (let i = 1; i < w.length; i++) if (Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length) < Math.abs(w.slice(0, best).join(' ').length - w.slice(best).join(' ').length)) best = i;
  return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
}
function gvTitPrev(p, t) {
  if (t.imagen) return `<img class="gv-tit-prev" src="${esc(mediaUrl(t.imagen))}" alt="" loading="lazy">`;
  const e = p.estilo || {}, pal = e.paleta || [], tc = e.titulo_css || {}, m0 = (p.muestras || []).find(x => x.tipo === 'imagen') || (p.muestras || [])[0];
  const [l1, l2] = gvTitLineas(p.titulo_pantalla || p.titulo || p.id), clase = t.clase ?? tc.clase ?? '';
  return `<span class="gv-tit-prev" style="--gv-bg:${esc(pal[0] || '#1d1b18')};--gv-fg:${esc(tc.color || pal[1] || '#fff')};--gv-ac:${esc(tc.acento || pal[2] || pal[1] || '#e4572e')}">
    <span class="gv-tit-top">${m0 ? `<img src="/api/planner/poster?path=${encodeURIComponent(m0.path)}" alt="" loading="lazy">` : ''}</span>
    <span class="gv-tit-bot">${p.look?.id ? `<img src="${esc(gvLookImg(p.look))}" alt="" loading="lazy">` : ''}</span>
    <span class="gv-poster ${esc(clase)}"><span class="gv-poster-t">${esc(l1)}${l2 ? '<br>' + esc(l2) : ''}</span></span></span>`;
}
function gvTituloGrilla(p) {
  const cur = p.titulo_tipo?.id || '', e = p.estilo || {}, texto = p.titulo_pantalla || p.titulo || p.id;
  const card = t => { const act = t.id === cur; return `<figure class="gv-est-card${act ? ' on' : ''}">
      <button class="gv-est-pick" data-gvtit="${esc(t.id)}" ${act ? 'disabled' : ''} aria-label="${esc((act ? 'Título actual: ' : 'Usar ') + t.nombre)}">${gvTitPrev(p, t)}</button>
      <figcaption><b>${esc(t.nombre)}</b><span class="muted">${esc(t.nota || '')}</span><span class="gv-est-meta">${act ? '<span class="tag ok">Actual</span>' : ''}</span></figcaption>
    </figure>`; };
  const tipos = [{ id: '', nombre: 'Del estilo', nota: e.titulo || 'El que diga la ficha del estilo.', clase: null }, ...(gv.est.prod?.titulos || [])];
  return `<div class="gv-est-head"><div class="gv-est-title"><b>Título · ${esc(p.id)}</b><span class="muted">${esc(texto.replace(/\s*\/\s*/g, ' · '))}</span></div>
      ${p.titulo_tipo_antes ? `<button class="secondary" data-gvtit="${esc(p.titulo_tipo_antes.id || '')}">Volver al de antes</button>` : ''}
      <button class="icon" data-gvestx aria-label="Cerrar">✕</button></div>
    <p class="hint">Así se ve el título del gancho con cada tipo, con la paleta del estilo. Tocá uno para usarlo.</p>${gvEdHecho(p)}
    <div class="gv-est-grid gv-tit-grid">${tipos.map(card).join('')}</div>`;
}

async function gvSetProd(p, campo, valor, undo) {
  const antes = campo === 'look' ? p.look?.id || null : p.titulo_tipo?.id || null;
  let r;
  try { r = await api('guiones/produccion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: p.planPath, run: p.run, campo: campo === 'look' ? 'look' : 'titulo_tipo', valor }) }); }
  catch (e) { toast(e.message); return; }
  const nombre = r.valor?.nombre || (campo === 'look' ? 'el del plan' : 'el del estilo'), que = campo === 'look' ? 'Look' : 'Título';
  toast(`${undo ? 'Volvió a' : que + ':'} «${nombre}».${r.nota ? ' Quedó una nota para rehacerlo.' : ''}`, !undo && antes !== (valor || null) ? () => gvSetProd(p, campo, antes, true) : null);
  await loadGuiones();
  if (document.getElementById('gvEstilos')?.open && gv.est?.id === p.key) gvRenderEstilos();
}

function gvEstGrilla(p) {
  const lib = gv.est.lib, tipo = p.tipo === 'carrusel' ? 'carrusel' : 'reel', cur = p.estilo?.id, texto = p.titulo_pantalla || p.titulo || p.id;
  const aqui = (gv.est.prefs.elecciones || []).filter(e => e.formato?.id && e.formato.id === p.formato?.id);
  const elegido = s => aqui.filter(e => gvEstIds(s).includes(e.a?.id)).length, sacado = s => aqui.filter(e => gvEstIds(s).includes(e.de?.id)).length;
  const card = s => {
    const vis = gvEstVisual(s, texto), pf = gvEstPf(s), ids = gvEstIds(s), act = ids.includes(cur), el = elegido(s), sa = sacado(s);
    const visto = vis.visto;
    return `<figure class="gv-est-card${act ? ' on' : ''}${pf.desc ? ' desc' : ''}">
      <button class="gv-est-pick" data-gvpick="${esc(s.id)}" ${act ? 'disabled' : ''} aria-label="${esc((act ? 'Estilo actual: ' : 'Usar ') + s.nombre)}">${vis.html || `<img class="gv-est-img" src="${esc(vis.img)}" alt="" loading="lazy">`}<span class="gv-est-badge">${esc(vis.badge)}</span>${pf.fav ? `<span class="gv-est-star">${GV_STAR}</span>` : ''}</button>
      ${vis.tira.length ? `<div class="gv-est-tira">${vis.tira.map(u => `<button data-gvver="${esc(s.id)}" title="Ver en grande"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
      <figcaption><span class="gv-est-pal">${(s.paleta || []).slice(0, 5).map(c => `<i style="background:${esc(c)}"></i>`).join('')}</span><b>${esc(s.nombre)}</b>${visto ? `<span class="gv-est-visto">Como en ${esc(gvQ(visto))}</span>` : s.titulo ? `<span class="muted">${esc(s.titulo)}</span>` : ''}
        <span class="gv-est-usos" title="Piezas planificadas con este estilo en todas las semanas${s.terminados ? ', y cuántas tienen final' : ''}">${s.usos ? `${s.usos} ${s.usos === 1 ? 'pieza' : 'piezas'}${s.terminados ? ` · ${s.terminados} ${s.terminados === 1 ? 'terminada' : 'terminadas'}` : ''}` : 'Sin usar'}</span>
        <span class="gv-est-meta">${act ? '<span class="tag ok">Actual</span>' : ''}${el ? `<span class="tag ok">Lo elegiste para este formato${el > 1 ? ' · ' + el : ''}</span>` : sa ? '<span class="tag">Lo sacaste de este formato</span>' : ''}</span></figcaption>
      <div class="gv-est-acts"><button class="ghost" data-gvver="${esc(s.id)}">Ver</button>
        <button class="icon gv-est-fav${pf.fav ? ' on' : ''}" data-gvpref="${esc(s.id)}" data-v="${pf.fav ? 'quitar_favorito' : 'favorito'}" aria-pressed="${pf.fav}" aria-label="${pf.fav ? 'Sacar de favoritos' : 'Marcar como favorito'}" title="${pf.fav ? 'Sacar de favoritos' : 'Favorito'}">${GV_STAR}</button>
        <button class="icon gv-est-no${pf.desc ? ' on' : ''}" data-gvpref="${esc(s.id)}" data-v="${pf.desc ? 'recuperar' : 'descartar'}" aria-label="${pf.desc ? 'Recuperar' : 'Descartar'}" title="${pf.desc ? 'Recuperar' : 'Descartar: no me convence'}">${pf.desc ? ICON.restore : GV_NO}</button></div>
    </figure>`;
  };
  const vivos = lib.filter(s => !gvEstPf(s).desc), favs = vivos.filter(s => gvEstPf(s).fav), resto = vivos.filter(s => !gvEstPf(s).fav);
  // De más usado a menos usado, y a igual uso, el más elegido para este formato.
  const orden = (a, b) => (b.usos || 0) - (a.usos || 0) || (b.terminados || 0) - (a.terminados || 0) || elegido(b) - elegido(a) || String(a.nombre).localeCompare(String(b.nombre), 'es');
  const propios = resto.filter(s => s.tipos.includes(tipo)).sort(orden), otros = resto.filter(s => !s.tipos.includes(tipo)).sort(orden), desc = lib.filter(s => gvEstPf(s).desc);
  const hecho = p.laminas?.length ? 'láminas' : p.video ? (p.video.final ? 'final' : 'rough cut') : '';
  const grid = (h, xs) => xs.length ? `${h ? `<h4 class="gv-est-sub">${h}</h4>` : ''}<div class="gv-est-grid">${xs.map(card).join('')}</div>` : '';
  return `<div class="gv-est-head"><div class="gv-est-title"><b>Estilo · ${esc(p.id)}</b><span class="muted">${esc(p.titulo || '')}</span></div>
      ${p.estilo_antes?.id ? `<button class="secondary" data-gvpick="${esc(p.estilo_antes.id)}" title="${esc(p.estilo_antes.nombre)}">Volver al original</button>` : ''}
      <button class="icon" data-gvestx aria-label="Cerrar">✕</button></div>
    <p class="hint">De más usado a menos usado. Tocá un estilo para usarlo; en «Ver» elegís el cuadro que lo representa. ★ y ⊘ arman tu catálogo: la próxima semana se planifica con eso.${gv.est.analizando ? ' Sacando cuadros de los videos terminados…' : ''}</p>
    ${cur && !lib.some(s => gvEstIds(s).includes(cur)) ? `<p class="hint">Actual: ${esc(p.estilo.nombre || cur)}</p>` : ''}
    ${hecho ? `<p class="hint">Ya tiene ${hecho}: si lo cambiás queda una nota para rehacerlo.</p>` : ''}
    ${grid(favs.length ? 'Favoritos' : '', favs)}${grid(favs.length ? 'Todos' : '', propios)}${grid(tipo === 'reel' ? 'Estilos de carrusel' : 'Estilos de reel', otros)}
    ${desc.length ? `<details class="gv-est-desc"><summary>Descartados (${desc.length})</summary><div class="gv-est-grid">${desc.map(card).join('')}</div></details>` : ''}`;
}

// Un estilo en grande: los cuatro cuadros del video terminado, de qué video salen, el video completo, título, ritmo y
// paleta, y las mismas acciones.
function gvEstDetalle(p) {
  const s = gv.est.lib.find(x => x.id === gv.est.ver);
  if (!s) { gv.est.ver = null; return gvEstGrilla(p); }
  const vids = (s.videos || []).filter(v => v.cuadros?.length), k = Math.min(gv.est.vid, Math.max(vids.length - 1, 0)), v = vids[k], pf = gvEstPf(s), act = gvEstIds(s).includes(p.estilo?.id);
  const port = gv.est.prefs.portadas?.[s.id]?.cuadro, heroUrl = gvEstVisual(s, '').img;
  const frames = v ? v.cuadros.map(c => { const f = c.url.split('f=')[1], on = c.url === heroUrl; return `<figure class="gv-est-frame${on ? ' on' : ''}"><img src="${esc(c.url)}" alt="" loading="lazy"><button class="${on ? 'secondary on-ok' : 'secondary'}" data-gvportada="${esc(s.id)}" data-f="${esc(on && port === f ? '' : f)}" title="${on ? (port === f ? 'Volver al cuadro automático' : 'Es el que se ve en la biblioteca') : 'Mostrar este cuadro en la biblioteca'}">${on ? `${ICON.check} Portada` : 'Usar de portada'}</button></figure>`; })
    : (s.muestras || []).map(m => m.tipo === 'video' ? `<video src="${esc(mediaUrl(m.path))}" controls muted playsinline preload="metadata"></video>` : `<img src="${esc(mediaUrl(m.path))}" alt="" loading="lazy">`);
  return `<div class="gv-est-head"><button class="ghost" data-gvback>${ICON.left} Biblioteca</button><div class="gv-est-title"><b>${pf.fav ? '★ ' : ''}${esc(s.nombre)}</b><span class="muted">Estilo · ${esc(p.id)} · ${esc(p.titulo || '')}</span></div><button class="icon" data-gvestx aria-label="Cerrar">✕</button></div>
    <div class="gv-est-frames">${frames.join('') || gvPosterHtml(s, p.titulo_pantalla || p.titulo || '')}</div>
    <p class="gv-est-src">${v ? `${v.exacto ? '' : `Todavía no hay un video terminado en este estilo: estos cuadros son del más parecido${v.de ? `, ${esc(gvQ(v.de))}` : ''}. `}Cuadros de ${esc(gvQ(v.titulo))} · <button class="link" data-gvvideo="${esc(v.path)}" data-titulo="${esc(v.titulo)}">ver el video completo</button>${vids.length > 1 ? ` · otros videos: ${vids.map((x, i) => i === k ? '' : `<button class="link" data-gvvsel="${i}">${esc(gvQ(x.titulo))}</button>`).filter(Boolean).join(', ')}` : ''}`
      : (s.videos || []).some(x => !x.cuadros) ? 'Sacando cuadros del video terminado…' : (s.muestras || []).some(m => /\/ref-/.test(m.path)) ? 'Todavía no hicimos un video en este estilo: es la referencia de tus guardados que lo inspira.' : (s.muestras || []).length ? 'Muestra del estilo.' : 'Todavía no hay un video en este estilo.'}</p>
    <dl class="gv-est-dl">${s.titulo ? `<dt>Título</dt><dd>${esc(s.titulo)}</dd>` : ''}${s.ritmo ? `<dt>Ritmo</dt><dd>${esc(s.ritmo)}</dd>` : ''}<dt>Paleta</dt><dd class="gv-est-hex">${(s.paleta || []).map(c => `<span><i style="background:${esc(c)}"></i>${esc(c)}</span>`).join('')}</dd></dl>
    <div class="gv-est-det-acts">${act ? '<span class="tag ok">Es el estilo actual</span>' : `<button class="primary" data-gvpick="${esc(s.id)}">Usar en ${esc(p.id)}</button>`}
      <button class="secondary gv-est-fav${pf.fav ? ' on' : ''}" data-gvpref="${esc(s.id)}" data-v="${pf.fav ? 'quitar_favorito' : 'favorito'}">${GV_STAR} ${pf.fav ? 'Favorito' : 'Marcar favorito'}</button>
      <button class="secondary gv-est-no${pf.desc ? ' on' : ''}" data-gvpref="${esc(s.id)}" data-v="${pf.desc ? 'recuperar' : 'descartar'}">${pf.desc ? ICON.restore + ' Recuperar' : GV_NO + ' Descartar'}</button></div>`;
}

function gvEstilosClick(e) {
  const box = e.currentTarget, p = gvPiece(gv.est?.id), t = e.target;
  if (t === box || t.closest('[data-gvestx]')) { box.close(); return; }
  if (t.closest('[data-gvback]')) { gv.est.ver = null; gvRenderEstilos(gv.est.y); return; }
  const tb = t.closest('[data-gvtab]'); if (tb) { gv.est.tab = tb.dataset.gvtab; gv.est.ver = null; gvRenderEstilos(0); return; }
  const lk = t.closest('[data-gvlook]'); if (lk && p) { gvSetProd(p, 'look', lk.dataset.gvlook || null); return; }
  const ti = t.closest('[data-gvtit]'); if (ti && p) { gvSetProd(p, 'titulo', ti.dataset.gvtit || null); return; }
  const ver = t.closest('[data-gvver]'); if (ver) { gv.est.y = box.querySelector('.gv-est-in')?.scrollTop || 0; gv.est.ver = ver.dataset.gvver; gv.est.vid = 0; gvRenderEstilos(0); return; }
  const vs = t.closest('[data-gvvsel]'); if (vs) { gv.est.vid = Number(vs.dataset.gvvsel) || 0; gvRenderEstilos(); return; }
  const vd = t.closest('[data-gvvideo]'); if (vd) { gvOpenSlides({ id: 'Video terminado', titulo: vd.dataset.titulo || '', laminas: [{ n: 1, mp4: vd.dataset.gvvideo }] }, 0); return; }
  const pf = t.closest('[data-gvpref]'); if (pf) { gvEstPreferencia(pf.dataset.gvpref, pf.dataset.v); return; }
  const po = t.closest('[data-gvportada]'); if (po) { gvEstPortada(po.dataset.gvportada, po.dataset.f); return; }
  // El editor queda abierto después de elegir, para seguir con el look o el título.
  const pk = t.closest('[data-gvpick]'); if (pk && p) { gv.est.ver = null; gvSetEstilo(p, pk.dataset.gvpick); }
}

async function gvEstPreferencia(id, accion) {
  try { gv.est.prefs = (await api('guiones/estilos/preferencia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estilo: id, accion }) })).preferencias; }
  catch (e) { toast(e.message); return; }
  gvRenderEstilos();
  toast({ favorito: 'Marcado como favorito.', quitar_favorito: 'Salió de favoritos.', descartar: 'Descartado: queda abajo, en «Descartados».', recuperar: 'Recuperado.' }[accion], accion === 'descartar' ? () => gvEstPreferencia(id, 'recuperar') : null);
  // Las tarjetas marcan si su estilo quedó descartado.
  if (accion === 'descartar' || accion === 'recuperar') loadGuiones();
}

async function gvEstPortada(id, cuadro) {
  try { gv.est.prefs = (await api('guiones/estilos/portada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estilo: id, cuadro }) })).preferencias; }
  catch (e) { toast(e.message); return; }
  gvRenderEstilos(); toast(cuadro ? 'Ese cuadro representa al estilo en la biblioteca.' : 'Volvió al cuadro automático.');
}

async function gvSetEstilo(p, id, undo) {
  const antes = p.estilo?.id;
  let r;
  try { r = await api('guiones/estilo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: p.planPath, run: p.run, estilo: id, deshacer: !!undo }) }); }
  catch (e) { toast(e.message); return; }
  const nombre = r.estilo?.nombre || id;
  toast(undo ? `Volvió a «${nombre}».` : `Estilo: «${nombre}».${r.nota ? ' Quedó una nota para rehacerlo.' : ''}`, !undo && antes && antes !== id ? () => gvSetEstilo(p, antes, true) : null);
  await loadGuiones();
  if (document.getElementById('gvEstilos')?.open && gv.est?.id === p.key) gvRenderEstilos();
}
document.addEventListener('keydown', e => {
  const box = document.getElementById('gvPlayer'); if (!box || box.hidden) return;
  if (e.key === 'Escape') { e.stopPropagation(); gvClosePlayer(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); box.querySelector(`[data-gvsl]:${e.key === 'ArrowLeft' ? 'first-of-type' : 'last-of-type'}`)?.click(); }
}, true);

// Si el planner se reinició con código nuevo, una pestaña abierta de antes seguiría mostrando la versión vieja (así no
// se veían los cortes). Al volver a la pestaña se compara el arranque del servidor: en Guiones sin nada a medio
// escribir se recarga sola; si no, avisa.
let gvStarted = null;
async function gvCheckVersion() {
  try {
    const h = await (await fetch('/api/health', { cache: 'no-store' })).json();
    if (gvStarted && h.startedAt !== gvStarted) {
      const dirty = gv.rec || Object.values(gv.text).some(Boolean);
      if (view === 'guiones' && !dirty) { location.reload(); return; }
      toast('Hay una versión nueva del planner.', () => location.reload(), 'Recargar');
    }
    gvStarted = h.startedAt;
  } catch {}
}
gvCheckVersion();
function gvRerender() { const y = scrollY; renderGuiones(true); scrollTo({ top: y }); }

function gvDescartada(p, media) {
  const marca = p.descartado || p.pausado, o = gv.open[p.key] || '', d = marca.at ? new Date(marca.at).toLocaleString('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '') : '';
  return `<article class="gv-card is-descartada${p.pausado ? ' is-pausada' : ''}${p.video || p.laminas?.length ? ' has-video' : ''}" data-gvid="${esc(p.key)}">
    ${media}
    <div class="gv-body">
      <div class="gv-top">${gvEstadoTag(p, d)}</div>
      <h3 class="gv-title">${esc(p.titulo || '')}</h3>
      <p class="gv-hook">${esc(p.hook || '')}</p>
      <div class="gv-acts">
        <button class="secondary" data-gvdesc="${esc(p.key)}" data-v="${p.pausado ? 'reanudar' : 'recuperar'}">${ICON.restore} ${p.pausado ? 'Reanudar' : 'Recuperar'}</button>
        <button class="ghost ${o === 'guion' ? 'on' : ''}" data-gvopen="guion" data-id="${esc(p.key)}">${p.tipo === 'carrusel' ? 'Texto' : 'Guion'}</button>
        <button class="ghost ${o === 'why' ? 'on' : ''}" data-gvopen="why" data-id="${esc(p.key)}">Por qué</button>
      </div>
      ${o === 'guion' ? gvGuion(p) : o === 'why' ? gvWhy(p) : ''}
    </div>
  </article>`;
}

async function gvDescartar(p, accion) {
  try { await api('guiones/descartar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: p.run, accion }) }); }
  catch (e) { toast(e.message); return; }
  toast({ descartar: 'Pieza descartada: quedó al final, en gris.', recuperar: 'Pieza recuperada.', pausar: 'Pieza pausada: quedó al final, en gris.', reanudar: 'Pieza reanudada.' }[accion],
    { descartar: () => gvDescartar(p, 'recuperar'), pausar: () => gvDescartar(p, 'reanudar') }[accion] || null);
  await loadGuiones();
}

async function gvSetEstado(p, estado) {
  try { await api('guiones/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: p.run, estado }) }); }
  catch (e) { toast(e.message); return; }
  const ok = p.video?.final ? 'Final aprobado.' : p.video ? 'Corte aprobado.' : p.laminas?.length ? 'Borrador aprobado.' : 'Audio aprobado.';
  toast(estado === 'aprobado' ? ok : 'Volvió a Por escuchar.', estado === 'aprobado' ? () => gvSetEstado(p, 'por_escuchar') : null);
  await loadGuiones();
}

async function gvSave(p, text, clip) {
  gv.saving[p.key] = true; gvRerender();
  const body = { run: p.run, pieza: p.id, text: text || '' };
  try {
    if (clip) { body.audio = await blobB64(clip.blob); body.mime = clip.mime; body.audio_seconds = clip.seconds; }
    const r = await api('guiones/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    p.feedback = r.entries; gv.text[p.key] = ''; if (p.estado === 'aprobado') p.estado = 'cambios';
    toast(clip ? 'Audio guardado.' : 'Nota guardada.');
  } catch (e) { toast((clip ? 'No se guardó el audio: ' : 'No se guardó la nota: ') + e.message); if (clip) gv.lost = clip; }
  finally { delete gv.saving[p.key]; }
  await loadGuiones();
}

async function gvRecord(p) {
  if (gv.rec) { if (gv.rec.id === p.key) gv.rec.mr.stop(); else toast('Ya hay una grabación en curso.'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar audio.');
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('No hay permiso para usar el micrófono.'); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(gv.rec?.timer);
    const seconds = (performance.now() - gv.rec.start) / 1000, type = mr.mimeType || mime || 'audio/webm';
    gv.rec = null;
    // Se guarda aunque se haya cerrado el panel: el audio no se pierde.
    gvSave(p, gv.text[p.key] || '', { blob: new Blob(chunks, { type }), mime: type.split(';')[0], seconds });
  };
  gv.rec = { id: p.key, mr, start: performance.now(), timer: setInterval(() => { const c = document.querySelector('[data-gvclock]'); if (c) c.textContent = clock((performance.now() - gv.rec.start) / 1000); }, 500) };
  mr.start(); gvRerender();
}

$('guionesView').addEventListener('click', async e => {
  const t = e.target;
  const fd = t.closest('[data-gvfinder]'); if (fd) { revealInFinder(fd.dataset.gvfinder); return; }
  const wk = t.closest('[data-gvweek]'); if (wk) { week = monday(wk.dataset.gvweek); gvSetRango('semana'); return; }
  const rg = t.closest('[data-gvrango]'); if (rg) { gvSetRango(rg.dataset.gvrango); return; }
  const et = t.closest('[data-gvetapas]'); if (et) { gvSetEtapas(et.dataset.gvetapas ? et.dataset.gvetapas.split(',') : []); return; }
  const sm = t.closest('[data-gvst]'); if (sm) { const p = gvPiece(sm.dataset.gvst); if (p) gvMenuEstado(sm, p); return; }
  const pv = t.closest('[data-gvportview]'); if (pv) { const p = gvPiece(pv.dataset.gvportview); if (p?.portadas?.length) gvOpenSlides({ ...p, titulo: (p.titulo || '') + ' · portadas', laminas: p.portadas.map((x, k) => ({ n: k + 1, png: x.path, modified: x.modified })) }, Number(pv.dataset.i) || 0); return; }
  const pc = t.closest('[data-gvport]'); if (pc) { const p = gvPiece(pc.dataset.gvport); if (p) gvElegirPortada(p, pc.dataset.v); return; }
  const sl = t.closest('[data-gvslides]'); if (sl) { const p = gvPiece(sl.dataset.gvslides); if (p?.laminas?.length) gvOpenSlides(p, Number(sl.dataset.i) || 0); return; }
  const ok = t.closest('[data-gvok]'); if (ok) { const p = gvPiece(ok.dataset.gvok); if (p) gvSetEstado(p, ok.dataset.v); return; }
  const dsc = t.closest('[data-gvdesc]'); if (dsc) { const p = gvPiece(dsc.dataset.gvdesc); if (p) gvDescartar(p, dsc.dataset.v); return; }
  const es = t.closest('[data-gvestilo]'); if (es) { const p = gvPiece(es.dataset.gvestilo); if (p) gvOpenEstilos(p); return; }
  const pr = t.closest('[data-gvprod]'); if (pr) { const p = gvPiece(pr.dataset.id); if (p) gvOpenEstilos(p, pr.dataset.gvprod); return; }
  const op = t.closest('[data-gvopen]'); if (op) { const id = op.dataset.id; gv.open[id] = gv.open[id] === op.dataset.gvopen ? '' : op.dataset.gvopen; gvRerender(); return; }
  const rc = t.closest('[data-gvrec]'); if (rc) { const p = gvPiece(rc.dataset.gvrec); if (p) gvRecord(p); return; }
  const cs = t.closest('[data-gvcopysave]'); if (cs) { const p = gvPiece(cs.dataset.gvcopysave); if (p) gvSaveCopy(p); return; }
  const cu = t.closest('[data-gvcopyundo]'); if (cu) { delete gv.copy[cu.dataset.gvcopyundo]; gvRerender(); return; }
  const cp = t.closest('[data-gvcopy]'); if (cp) { const p = gvPiece(cp.dataset.gvcopy); if (p?.guion) copyText(p.guion.texto, 'Guion copiado.'); return; }
  const del = t.closest('[data-gvdel]'); if (del) {
    const p = gvPiece(del.dataset.id); if (!p || !confirm('¿Borrar esta nota?')) return;
    try { const r = await api('guiones/feedback/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: p.run, file: del.dataset.gvdel }) }); p.feedback = r.entries; gvRerender(); } catch (err) { toast(err.message); }
    return;
  }
});
// Un video a la vez: al darle play a uno se pausan los demás.
$('guionesView').addEventListener('play', e => { if (e.target.matches?.('video[data-gvvid]')) $('gvGrid').querySelectorAll('video[data-gvvid]').forEach(v => v !== e.target && v.pause()); }, true);
// El archivo de notas aplicadas queda abierto o cerrado aunque la tarjeta se vuelva a pintar.
$('guionesView').addEventListener('toggle', e => { if (e.target.matches?.('[data-gvarch]')) gv.arch[e.target.dataset.gvarch] = e.target.open; }, true);
$('guionesView').addEventListener('input', e => {
  const t = e.target.closest('[data-gvtext]'); if (t) gv.text[t.dataset.gvtext] = t.value;
  const c = e.target.closest('[data-gvcopytext]'); if (c) { const p = gvPiece(c.dataset.gvcopytext); (gv.copy ||= {})[c.dataset.gvcopytext] = c.value; const a = c.closest('.gv-copy')?.querySelector('.gv-copy-acts'); if (a && p) a.hidden = !gvCopyDirty(p); }
});
$('guionesView').addEventListener('keydown', e => {
  const t = e.target.closest('[data-gvtext]'); if (!t) return;
  e.stopPropagation();
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const p = gvPiece(t.dataset.gvtext); if (p && t.value.trim()) gvSave(p, t.value.trim(), null); }
});
$('gvPrev').onclick = () => { week = dateAdd(week, -7); gvSetRango('semana'); };
$('gvNext').onclick = () => { week = dateAdd(week, 7); gvSetRango('semana'); };
$('gvToday').onclick = () => { week = monday(todayStr()); gvSetRango('semana'); };
$('gvWeekTitle').onclick = () => gvMenuSemanas($('gvWeekTitle'));
$('gvEstado').onclick = () => gvMenuEtapas($('gvEstado'));
$('gvCopy').onclick = async () => {
  // Un pedido por plan con notas; si hay más de uno, se copian juntos.
  const planes = (gv.data?.planes || []).filter(x => x.piezas.some(p => gvFb(p).length && gvFormatoOk(p) && gvEtapaOk(p)));
  try {
    const rs = await Promise.all(planes.map(x => api('guiones/copiar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil: x.perfil, week: x.week, path: x.path }) })));
    await copyText(rs.map(r => r.prompt).filter(Boolean).join('\n\n---\n\n'), 'Copiado: pegalo en Claude Code.');
  }
  catch (e) { toast(e.message); }
  loadGuiones();
};
// Al volver a la pestaña, el audio pudo haber cambiado (otra sesión aplicó el feedback).
document.addEventListener('visibilitychange', () => { if (document.hidden) return; gvCheckVersion(); if (view === 'guiones' && !gv.rec) loadGuiones(); });
if (view === 'guiones') renderGuiones();
