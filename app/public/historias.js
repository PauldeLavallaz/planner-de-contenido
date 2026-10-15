// Historias del planner. Se carga después de planner.js y usa sus utilidades (api, post, toast, fechas, íconos).
// La semana en horizontal: un día por fila, la secuencia una al lado de la otra y el recurso fijo a la derecha. Cada
// semana es una carpeta de historias/ con su semana.json (ver docs/historias.md), que acá sólo se lee. El orden, el día,
// si se publica y a qué hora van en un borrador propio (historias-draft.json); Postiz sólo cambia cuando confirmás la
// propuesta en el chat. La métrica principal son las respuestas de cada día.
const TIPO_NAME = { venta: 'Venta', recurso: 'Recurso', conciencia: 'Conciencia', libre: 'Libre' };
const CIERRE_NAME = { encuesta: 'Sin pedido · encuesta', slider: 'Sin pedido · slider', caja: 'Caja de preguntas', ninguno: 'Sin pedido' };
const STORY_METRIC_KEYS = ['respuestas', 'vistas_primera', 'vistas_ultima'];
const MODE_NAME = { postiz: 'Postiz', mano: 'A mano', no: 'No se publica' };
const STORY_DEFAULT_HOUR = '10:00';
const STORY_GAP_MIN = 2; // minutos entre historias para que salgan en orden (igual que engine/historias.py)
const storyTime = (hora, i) => fromMin(toMin(hora || STORY_DEFAULT_HOUR) + i * STORY_GAP_MIN);
let stories = { week: null, cuenta: '', data: null, error: null };
// La pestaña muestra las semanas de una cuenta de Instagram; cada día puede salir desde otra cuenta conectada.
let sCuenta = store.get('sCuenta', '');
let storyLoad = null, sbState = null, sDrag = null, sSaving = Promise.resolve();
async function loadStories() {
  const w = week, c = sCuenta || '', key = w + '|' + c; if (storyLoad?.key === key) return storyLoad.p;
  const p = api('stories?week=' + w + (c ? '&cuenta=' + encodeURIComponent(c) : '')).then(r => { stories = { week: w, cuenta: c, data: r, error: null }; },
    e => { if (e.status === 400 && c && /cuenta/i.test(e.message)) { sCuenta = ''; store.set('sCuenta', ''); } stories = { week: w, cuenta: c, data: null, error: e.message }; })
    .finally(() => { if (storyLoad?.key === key) storyLoad = null; if (view === 'stories' && week === w && (sCuenta || '') === c) renderStories(); });
  storyLoad = { key, p }; return p;
}
const metricsOf = d => stories.data?.metricas?.[d] || {};
const metricsFor = (cuenta, d) => stories.data?.metricas_cuentas?.[cuenta]?.[d] || {};
const seqAccount = s => s.cuenta || stories.data?.cuenta;
const acctName = p => { const a = (stories.data?.cuentas || []).find(x => x.profile === p); return a ? String(a.label || '').replace(/^Instagram\s+/i, '') || '@' + p : '@' + p; };
const sumRespuestas = (from, to) => Object.entries(stories.data?.metricas || {}).filter(([d]) => d >= from && d <= to).reduce((s, [, m]) => s + (m.respuestas || 0), 0);
const hasRespuestas = (from, to) => Object.entries(stories.data?.metricas || {}).some(([d, m]) => d >= from && d <= to && Number.isInteger(m.respuestas));
const pct = (a, b) => Number.isInteger(a) && Number.isInteger(b) && b > 0 ? Math.round(a / b * 1000) / 10 : null;
// Un sticker interactivo (encuesta, link, mención, caja) no sale por la API de Instagram: esa historia va a mano.
const needsHand = h => typeof h?.sticker === 'string' && h.sticker.trim() && !/opcional/i.test(h.sticker) && !/^(zona segura\s*(\+\s*)?)+$/i.test(h.sticker.trim());
const storyByImg = () => Object.fromEntries([...(stories.data?.semana?.dias || []), ...(stories.data?.entrantes || []).map(e => e.dia)].flatMap(d => d.historias.map(h => [h.imagen, h])));
const defaultSeq = dia => ({ fecha: dia.fecha, historias: dia.historias.map(h => h.imagen), publicar: 'no', hora: null });
// Las secuencias tal como quedan con el borrador: cada una conserva su día original (tipo, fórmula, recurso).
function storySeqs() {
  const sem = stories.data?.semana; if (!sem) return [];
  const d = stories.data.draft?.secuencias || {};
  return sem.dias.map(dia => ({ orig: dia.fecha, dia, ...defaultSeq(dia), ...(d[dia.fecha] || {}) }));
}
// Una secuencia se puede correr a otra semana (por ejemplo, del jueves al lunes siguiente). Queda guardada en el
// borrador de su semana de origen y se ve, se edita y se programa en la semana a la que fue: acá llegan como `entrantes`.
const entrantes = () => (stories.data?.entrantes || []).map(e => ({ orig: e.orig, dia: e.dia, src: e.semana, recurso: e.recurso, entrante: true, ...e.secuencia }));
const allSeqs = () => [...storySeqs(), ...entrantes()];
const weekSeqs = () => allSeqs().filter(s => monday(s.fecha) === week);
// Notas sin corregir de una secuencia (pendientes o copiadas que nadie tomó), por el run al que pertenece.
const runOfSeq = s => s.entrante ? (stories.data?.entrantes || []).find(e => e.orig === s.orig && e.semana === s.src)?.run : stories.data?.semana?.run;
const fbSinAplicar = s => stories.data?.feedback_sin_aplicar?.[runOfSeq(s) + '|' + s.orig] || [];
const seqOn = d => { const l = weekSeqs().filter(s => s.fecha === d); return l.find(s => s.historias.length) || l[0]; };
const ownAccount = s => s.cuenta && s.cuenta !== stories.data?.cuenta ? s.cuenta : null;
const seqChanged = s => JSON.stringify([s.fecha, s.historias, s.publicar, s.hora || null, ownAccount(s)]) !== JSON.stringify((({ fecha, historias, publicar, hora }) => [fecha, historias, publicar, hora, null])(defaultSeq(s.dia)));
async function saveSeqs(list, message) {
  const prev = structuredClone(stories.data.draft);
  const secuencias = list.some(seqChanged) ? Object.fromEntries(list.map(s => [s.orig, { fecha: s.fecha, historias: s.historias, publicar: s.publicar, hora: s.publicar === 'postiz' ? (s.hora || STORY_DEFAULT_HOUR) : (s.hora || null), ...(ownAccount(s) ? { cuenta: s.cuenta } : {}) }])) : {};
  stories.data.draft = { ...stories.data.draft, secuencias }; renderStories();
  sSaving = sSaving.then(async () => {
    try { setSave('Guardando…'); const r = await api('stories/draft', post({ week: stories.week, cuenta: stories.data.cuenta, revision: prev.revision, secuencias })); stories.data.draft = r; setSave('Guardado'); if (message) toast(message, () => saveSeqs(seqsFrom(prev))); }
    catch (e) { stories.data.draft = prev; setSave(''); toast(e.message); if (e.status === 409) { stories.week = null; } }
    renderStories();
  });
  return sSaving;
}
// Guarda una sola secuencia en su semana de origen: correrla a otra semana o editar una que llegó de otra.
function saveSeqOne(s, patch, message, goto) {
  const next = { fecha: s.fecha, historias: s.historias, publicar: s.publicar, hora: s.hora || null, cuenta: s.cuenta || null, ...patch };
  if (next.publicar === 'postiz' && !next.hora) next.hora = STORY_DEFAULT_HOUR;
  if (!next.cuenta || next.cuenta === stories.data.cuenta) delete next.cuenta;
  sSaving = sSaving.then(async () => {
    try { setSave('Guardando…'); await api('stories/seq', post({ cuenta: stories.data.cuenta, semana: s.src || stories.week, orig: s.orig, revision: stories.data.draft.revision, secuencia: next })); setSave('Guardado'); if (message) toast(message, goto ? () => { week = monday(goto); render(); } : null, 'Ir a esa semana'); }
    catch (e) { setSave(''); toast(e.message); }
    stories.week = null; await loadStories();
  });
  return sSaving;
}
// Cambiar una secuencia de día. En la misma semana intercambia con la del día elegido; a otra semana se corre, y el día
// tiene que estar libre. Una que llegó de otra semana no intercambia: el día tiene que estar libre.
function moveSeq(orig, date) {
  const s = allSeqs().find(x => x.orig === orig); if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date === s.fecha) { renderStories(); return; }
  const here = monday(date) === week, there = here ? weekSeqs().find(x => x.orig !== orig && x.fecha === date && x.historias.length) : null;
  if (there && (there.entrante || s.entrante)) { toast(`El ${dayLong(date)} ya tiene otra secuencia. Mové primero esa.`); renderStories(); return; }
  if (!s.entrante && here) {
    const list = storySeqs(), src = list.find(x => x.orig === orig), other = list.find(x => x.orig !== orig && x.fecha === date), from = src.fecha;
    src.fecha = date; if (other) other.fecha = from;
    return saveSeqs(list, `Secuencia movida al ${dayLong(date)}.`);
  }
  return saveSeqOne(s, { fecha: date }, `Secuencia movida al ${dayLong(date)}.`, here ? null : date);
}
const seqsFrom = draft => { const d = draft?.secuencias || {}; return stories.data.semana.dias.map(dia => ({ orig: dia.fecha, dia, ...defaultSeq(dia), ...(d[dia.fecha] || {}) })); };
function renderStories() {
  const end = dateAdd(week, 6);
  $('sWeekTitle').textContent = week.slice(5, 7) === end.slice(5, 7) ? `${Number(week.slice(8))} – ${Number(end.slice(8))} ${fmt(end, { month: 'long' })}` : `${Number(week.slice(8))} ${fmt(week, { month: 'short' })} – ${Number(end.slice(8))} ${fmt(end, { month: 'short' })}`;
  $('sJumpDate').value = week;
  if (stories.week !== week || stories.cuenta !== (sCuenta || '')) { $('sGrid').innerHTML = '<div class="s-empty">Cargando…</div>'; $('sSummary').innerHTML = ''; $('sActions').hidden = true; loadStories(); return; }
  const cuentas = stories.data?.cuentas || [];
  $('sCuenta').hidden = cuentas.length < 2;
  $('sCuenta').innerHTML = cuentas.map(a => `<option value="${esc(a.profile)}" ${a.profile === stories.data.cuenta ? 'selected' : ''}>${esc(acctName(a.profile))} · @${esc(a.profile)}${a.semanas.length ? '' : ' (sin historias)'}</option>`).join('');
  if (stories.error) { $('sGrid').innerHTML = `<div class="s-empty">${esc(stories.error)}</div>`; $('sActions').hidden = true; return; }
  const sem = stories.data.semana, today = todayStr();
  const total = sumRespuestas(week, end), prevTotal = sumRespuestas(dateAdd(week, -7), dateAdd(week, -1));
  const best = Array.from({ length: 7 }, (_, n) => dateAdd(week, n)).filter(d => Number.isInteger(metricsOf(d).respuestas)).sort((a, b) => metricsOf(b).respuestas - metricsOf(a).respuestas)[0];
  const diff = total - prevTotal;
  $('sSummary').innerHTML = hasRespuestas(week, end)
    ? `<span><b>${total}</b>respuestas</span>${hasRespuestas(dateAdd(week, -7), dateAdd(week, -1)) ? `<span class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${diff} contra la semana anterior (${prevTotal})</span>` : ''}${best ? `<span>Mejor día: ${esc(dayLong(best))} · ${metricsOf(best).respuestas}</span>` : ''}`
    : sem ? '<span>Sin respuestas cargadas</span>' : '';
  if (!sem && !entrantes().length) {
    $('sActions').hidden = true;
    const weeks = stories.data.weeks || [], nextW = weeks.find(w => w > week) || weeks[weeks.length - 1];
    const ac = stories.data.cuenta, principal = ac === cuentas[0]?.profile;
    $('sGrid').innerHTML = `<div class="s-empty">No hay historias planificadas para ${principal ? 'esta semana' : `@${esc(ac)} esta semana`}.${nextW ? ` <button class="link" data-sweek="${esc(nextW)}">Ir a la semana del ${esc(dayLong(nextW))}</button>` : ''}${weeks.length ? '' : `<br><span class="muted">Para armarlas, pedíselas a Claude Code: «armá la semana de historias${cuentas.length > 1 ? ` de @${esc(ac)}` : ''}». Cada semana es una carpeta en <code>${esc(stories.data.carpeta || 'historias')}/</code> con su semana.json (ver docs/historias.md).</span>`}</div>`;
    return;
  }
  const seqs = storySeqs(), byImg = storyByImg(), cola = stories.data.cola || {};
  const recursos = Object.fromEntries((sem?.recursos || []).map(r => [r.id, r]));
  const changed = seqs.some(seqChanged), toPostiz = weekSeqs().filter(s => s.publicar === 'postiz' && s.historias.length).length;
  const queued = Object.values(cola).some(q => q && q.estado !== 'publicada');
  $('sActions').hidden = false;
  $('sReset').hidden = !changed;
  // Programar también cuenta el feedback sin corregir de la semana: viaja en la propuesta.
  const fbN = weekSeqs().reduce((k, s) => k + fbSinAplicar(s).length, 0);
  $('sPropose').disabled = !(toPostiz || queued || fbN);
  $('sProposeCount').textContent = toPostiz + fbN;
  $('sPropose').title = [toPostiz ? `${toPostiz} día${toPostiz === 1 ? '' : 's'} a Postiz` : '', fbN ? `${fbN} nota${fbN === 1 ? '' : 's'} de feedback sin corregir` : ''].filter(Boolean).join(' · ');
  $('sGrid').innerHTML = Array.from({ length: 7 }, (_, n) => {
    const d = dateAdd(week, n), s = seqOn(d);
    // Un día de esta semana sin secuencia: la semana de historias no lo cubre, o su secuencia se corrió a otra semana.
    if (!s) { const out = seqs.find(x => x.orig === d && monday(x.fecha) !== week && x.historias.length);
      return `<section class="s-row vacia ${d === today ? 'today' : ''}" data-srow="${d}" aria-label="${esc(dayLong(d))}"><div class="s-day"><div class="s-dayname"><span class="day-name">${esc(dayShort(d))}</span><span class="day-num">${Number(d.slice(8))}</span></div></div><div class="s-seq"><span class="s-free">${out ? `Su secuencia pasó al ${esc(dayLong(out.fecha))}. <button class="link" data-sweek="${esc(out.fecha)}">Ir a esa semana</button>` : 'Sin historias planificadas'}</span></div><aside class="s-res none"></aside></section>`; }
    const dia = s.dia, tipo = dia.tipo || 'libre', mc = seqAccount(s), m = metricsFor(mc, d), moved = s.orig !== d;
    const seqHtml = s.historias.length
      ? s.historias.map((img, i) => {
          const h = byImg[img] || {}, q = cola[img], hand = needsHand(h), from = img.includes(`/${s.orig}_`) ? '' : ' moved', fbn = stories.data.feedback?.[s.orig]?.historias?.[img] || 0;
          const st = q ? (q.estado === 'publicada' ? '<span class="q ok">Publicada</span>' : q.cuenta && q.cuenta !== mc && s.publicar === 'postiz' ? `<span class="q warn" title="Está agendada en @${esc(q.cuenta)}: al confirmar la propuesta pasa a @${esc(mc)}">Pasa a @${esc(mc)}</span>` : q.cambio ? '<span class="q warn" title="Cambiaste la foto: se reemplaza en Postiz al confirmar la propuesta">Imagen nueva</span>' : `<span class="q">En Postiz${q.cuando ? ' · ' + esc(new Date(q.cuando).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })) : ''}</span>`) : '';
          return `<button class="s-story${from}${s.publicar === 'postiz' && hand ? ' hand' : ''}" draggable="true" data-story="${esc(s.orig)}|${i}" data-img="${esc(img)}" title="${esc((h.texto || '') + (h.sticker ? ' · Sticker: ' + h.sticker : ''))}"><img src="/api/planner/poster?path=${esc(encodeURIComponent(img))}&v=${h.mtime || 0}" alt="" loading="lazy" draggable="false"><span class="n">${i + 1}</span>${h.video ? '<span class="s-vid" title="Video con voz en off">▶ video</span>' : ''}${h.editable ? '<span class="s-edit" data-edit-story title="Abrir el editor">✏️ Editar</span>' : ''}${fbn ? `<span class="s-fbn" title="${fbn} nota${fbn === 1 ? '' : 's'} de feedback pendiente${fbn === 1 ? '' : 's'}">💬 ${fbn}</span>` : ''}${st}${h.sticker && !/^zona segura/i.test(h.sticker) ? `<span class="stk">${hand ? '✋ ' : ''}${esc(h.sticker.split(':')[0])}</span>` : ''}</button>`;
        }).join('')
      : `<span class="s-free">${esc(dia.tema || 'Sin historias')}</span>`;
    const num = (k, ph, label) => `<input inputmode="numeric" pattern="[0-9]*" data-smetric="${k}" data-date="${d}" data-cuenta="${esc(mc)}" value="${Number.isInteger(m[k]) ? m[k] : ''}" placeholder="${ph}" title="${label}" aria-label="${label} del ${esc(dayLong(d))}">`;
    const tasa = pct(m.respuestas, m.vistas_primera), llega = pct(m.vistas_ultima, m.vistas_primera);
    const pc = v => v.toLocaleString('es-AR') + ' %';
    const ratio = [tasa !== null ? `${pc(tasa)} respondió` : '', llega !== null ? `${pc(llega)} llegó a la última` : ''].filter(Boolean).join(' · ');
    const auto = m.fuente === 'instagram' ? `<span class="s-auto" title="Medido de Instagram ${m.medido_at ? 'el ' + esc(new Date(m.medido_at).toLocaleString('es-AR', { timeZone: TZ, hourCycle: 'h23' })) : ''}">Instagram</span>` : '';
    const metrics = tipo === 'libre' && !s.historias.length ? '' : `<div class="s-metrics"><label class="main"><span>Respuestas</span>${num('respuestas', '—', 'Respuestas')}</label><div class="s-vistas"><span>Vistas</span>${num('vistas_primera', '1.ª', 'Vistas de la primera historia')}${num('vistas_ultima', 'última', 'Vistas de la última historia')}</div>${auto || ratio ? `<p class="s-ratio">${auto}${esc(ratio)}</p>` : ''}</div>`;
    const handAt = s.historias.map((img, i) => needsHand(byImg[img]) ? `${i + 1} a las ${storyTime(s.hora, i)}` : null).filter(Boolean);
    const hands = handAt.length;
    const pub = s.historias.length ? `<div class="s-pub" data-seq="${esc(s.orig)}">
        <div class="seg">${['postiz', 'mano', 'no'].map(k => `<button class="${s.publicar === k ? 'on' : ''}" data-pub="${k}" title="${k === 'postiz' ? 'Se agenda en Postiz cuando confirmes en el chat' : k === 'mano' ? 'La subís vos desde Instagram' : 'No sale'}">${MODE_NAME[k]}</button>`).join('')}</div>
        ${s.publicar !== 'no' ? '<div class="s-publine">' : ''}${s.publicar !== 'no' && cuentas.length > 1 ? `<label class="s-cuenta" title="Desde qué Instagram sale esta secuencia"><select data-scuenta="${esc(s.orig)}" aria-label="Cuenta de Instagram">${cuentas.map(a => `<option value="${esc(a.profile)}" ${a.profile === mc ? 'selected' : ''}>@${esc(a.profile)}</option>`).join('')}</select></label>` : ''}
        ${s.publicar === 'postiz' ? `<label class="s-hora">a las <input data-hora="${esc(s.orig)}" value="${esc(s.hora || STORY_DEFAULT_HOUR)}" inputmode="numeric" aria-label="Hora de la primera historia"></label>` : ''}${s.publicar !== 'no' ? '</div>' : ''}
        ${s.publicar === 'postiz' ? `${hands ? `<span class="s-hand" title="Instagram no deja publicar ese sticker por la API: la subís vos a esa hora, en su lugar de la secuencia">✋ A mano: ${esc(handAt.join(' · '))}</span>` : ''}` : ''}
      </div>` : '';
    return `<section class="s-row tipo-${tipo} ${s.historias.length ? 'con-historias' : ''} ${tipo === 'libre' && !s.historias.length ? 'libre' : ''} ${d === today ? 'today' : ''} ${moved ? 'moved' : ''}" data-srow="${d}" data-seq="${esc(s.orig)}" aria-label="${esc(dayLong(d))}">
      <div class="s-day"><div class="s-dayname"><span class="s-handle" draggable="true" data-seqdrag="${esc(s.orig)}" title="Arrastrá para cambiar de día" aria-label="Mover la secuencia a otro día">⋮⋮</span>${s.historias.length ? `<button class="s-move" data-smove="${esc(s.orig)}" title="Cambiar de día, también a otra semana"><span class="day-name">${esc(dayShort(d))}</span><span class="day-num">${Number(d.slice(8))}</span></button><input type="date" class="s-movedate" data-smovedate="${esc(s.orig)}" value="${esc(s.fecha)}" min="${dateAdd(s.orig, -28)}" max="${dateAdd(s.orig, 84)}" tabindex="-1" aria-hidden="true">` : `<span class="day-name">${esc(dayShort(d))}</span><span class="day-num">${Number(d.slice(8))}</span>`}${moved ? `<span class="s-was">era ${esc(monday(s.orig) === week ? `${dayShort(s.orig)} ${Number(s.orig.slice(8))}` : dayLong(s.orig))}</span>` : ''}</div>
        <span class="s-tipo">${TIPO_NAME[tipo] || esc(tipo)}${dia.formula && dia.formula !== 'Libre' ? `<span>${esc(dia.formula)}</span>` : ''}</span>
        ${s.historias.length ? `<p class="s-tema" title="${esc((dia.tema || '') + (dia.relacionada ? ' · ' + dia.relacionada : ''))}">${esc(dia.tema || '')}</p>` : ''}${pub}${metrics}</div>
      <div class="s-seq" data-seqdrop="${esc(s.orig)}">${seqHtml}</div>
      ${storyResource(dia, s.entrante ? s.recurso : dia.recurso ? recursos[dia.recurso] : null, s.orig)}</section>`;
  }).join('');
}
function storyResource(dia, r, orig) {
  if (!dia || (dia.tipo === 'libre' && !dia.historias?.length)) return '<aside class="s-res none">Libre</aside>';
  // Feedback general de la secuencia, al final de la fila: el del día, no el de una historia.
  const n = stories.data.feedback?.[orig]?.pendientes || 0;
  const fbb = dia.historias?.length ? `<button class="s-fbbtn ${n ? 'on' : ''}" data-sqfb="${esc(orig)}" title="Feedback general de la secuencia: el tema, el enfoque o rehacer varias historias">💬 Feedback${n ? ` · ${n}` : ''}</button>` : '';
  if (!r) return `<aside class="s-res none"><span>${esc(CIERRE_NAME[dia.cierre] || 'Sin pedido')}</span>${fbb}</aside>`;
  // Sólo el título y el llamado a la acción; la vista previa y el archivo se abren con sus botones.
  const ready = r.estado === 'listo';
  const ver = r.archivo || r.preview;
  const acts = [r.dm ? `<button class="ghost" data-sdm="${esc(r.id)}">${ICON.copy} Copiar DM</button>` : '', r.url ? `<button class="ghost" data-scopy="${esc(r.url)}">${ICON.copy} Copiar link</button>` : '', r.url ? `<a class="ghost" href="${esc(r.url)}" target="_blank" rel="noopener">Abrir</a>` : '', ver ? `<a class="ghost" href="${esc(mediaUrl(ver))}" target="_blank" rel="noopener">Ver</a>` : ''].join('');
  const cta = r.palabra ? `<span class="s-word">${esc(r.palabra)}</span>` : r.entrega ? `<span class="s-cta">${esc(r.entrega)}</span>` : '';
  return `<aside class="s-res" title="${esc(r.que_trae || '')}"><div class="s-res-head"><span class="lbl">${r.tipo === 'oferta' ? 'Oferta' : 'Recurso'}</span>${fbb}</div><h4>${esc(r.nombre)}</h4>${cta}${ready ? '' : '<span class="state warn">Por preparar</span>'}${acts ? `<div class="s-acts">${acts}</div>` : ''}</aside>`;
}
async function saveStoryMetric(input) {
  const d = input.dataset.date, cuenta = input.dataset.cuenta || stories.data.cuenta, row = input.closest('.s-metrics'), body = { date: d, cuenta };
  for (const k of STORY_METRIC_KEYS) {
    const raw = row.querySelector(`[data-smetric="${k}"]`).value.trim().replace(/[.\s]/g, '');
    if (raw === '') body[k] = null; else if (/^\d+$/.test(raw)) body[k] = Number(raw); else { toast('Cargá un número entero, o dejalo vacío.'); input.focus(); return; }
  }
  const before = metricsFor(cuenta, d);
  if (STORY_METRIC_KEYS.every(k => (Number.isInteger(before[k]) ? before[k] : null) === body[k])) return;
  try { setSave('Guardando…'); const r = await api('stories/metrics', post(body)); stories.data.metricas_cuentas = { ...(stories.data.metricas_cuentas || {}), [r.cuenta]: r.metricas }; if (r.cuenta === stories.data.cuenta) stories.data.metricas = r.metricas; setSave('Guardado'); if (!document.activeElement?.matches('[data-smetric]')) renderStories(); else { const keep = document.activeElement.dataset; renderStories(); document.querySelector(`[data-smetric="${keep.smetric}"][data-date="${keep.date}"]`)?.focus(); } }
  catch (e) { setSave(''); toast(e.message); }
}
// Controles: publicar (Postiz, a mano o no) y la hora de la primera historia; las siguientes salen de a un minuto.
function setStoryPub(orig, patch) {
  const e = entrantes().find(x => x.orig === orig); if (e) return saveSeqOne(e, patch);
  const list = storySeqs(), s = list.find(x => x.orig === orig); if (!s) return;
  Object.assign(s, patch); if (s.publicar === 'postiz' && !s.hora) s.hora = STORY_DEFAULT_HOUR;
  saveSeqs(list);
}
// Arrastrar una historia: reordena en su día o la pasa a otro día. Arrastrar ⋮⋮: cambia la secuencia de día (intercambia).
function storyDropIndex(row, x) { const tiles = [...row.querySelectorAll('.s-story:not(.dragging)')]; const i = tiles.findIndex(t => { const r = t.getBoundingClientRect(); return x < r.left + r.width / 2; }); return i < 0 ? tiles.length : i; }
$('sGrid').addEventListener('dragstart', e => {
  const st = e.target.closest?.('.s-story[draggable]'), hd = e.target.closest?.('[data-seqdrag]');
  if (hd) { sDrag = { kind: 'seq', orig: hd.dataset.seqdrag }; e.dataTransfer.setData('text/plain', hd.dataset.seqdrag); e.dataTransfer.effectAllowed = 'move'; hd.closest('.s-row').classList.add('dragging'); return; }
  if (st) { const [orig, i] = st.dataset.story.split('|'); sDrag = { kind: 'story', orig, img: st.dataset.img, i: Number(i) }; e.dataTransfer.setData('text/plain', st.dataset.img); e.dataTransfer.effectAllowed = 'move'; st.classList.add('dragging'); }
});
$('sGrid').addEventListener('dragover', e => {
  if (!sDrag) return; const row = e.target.closest('.s-row'); if (!row) return;
  e.preventDefault(); document.querySelectorAll('.s-row.drag-over').forEach(r => r !== row && r.classList.remove('drag-over')); row.classList.add('drag-over');
});
$('sGrid').addEventListener('dragleave', e => { const row = e.target.closest('.s-row'); if (row && !row.contains(e.relatedTarget)) row.classList.remove('drag-over'); });
$('sGrid').addEventListener('dragend', () => { sDrag = null; document.querySelectorAll('.s-grid .dragging, .s-row.drag-over').forEach(x => x.classList.remove('dragging', 'drag-over')); });
$('sGrid').addEventListener('drop', e => {
  if (!sDrag) return; const row = e.target.closest('.s-row'); if (!row) return; e.preventDefault();
  const list = storySeqs(), target = list.find(x => x.orig === row.dataset.seq), date = row.dataset.srow, drag = sDrag; sDrag = null;
  if (drag.kind === 'seq') return moveSeq(drag.orig, date);
  // Las historias de una secuencia que llegó de otra semana sólo se reordenan entre ellas.
  const ent = entrantes(), eSrc = ent.find(x => x.orig === drag.orig), eTgt = ent.find(x => x.orig === row.dataset.seq);
  if (eSrc || eTgt) {
    if (eSrc !== eTgt) { toast('Esa secuencia viene de otra semana: sus historias no se mezclan con las de esta.'); return renderStories(); }
    let at = storyDropIndex(row.querySelector('.s-seq'), e.clientX); const h = eSrc.historias.filter(x => x !== drag.img);
    if (at > drag.i) at = Math.min(at, h.length); h.splice(Math.min(at, h.length), 0, drag.img);
    return saveSeqOne(eSrc, { historias: h }, 'Orden cambiado.');
  }
  const src = list.find(x => x.orig === drag.orig); if (!src || !target) return renderStories();
  const seqEl = row.querySelector('.s-seq'); let at = storyDropIndex(seqEl, e.clientX);
  src.historias = src.historias.filter(h => h !== drag.img);
  if (src === target && at > drag.i) at = Math.min(at, src.historias.length);
  target.historias.splice(Math.min(at, target.historias.length), 0, drag.img);
  saveSeqs(list, src === target ? 'Orden cambiado.' : `Historia pasada al ${dayLong(target.fecha)}.`);
});
// Editor de historias, del estilo de Canva. Abre el HTML fuente de la historia sin sus scripts (el árbol que se ve es
// el del archivo), congelado en el cuadro de la imagen fija. Las manijas son de Moveable (MIT): mover, ancho, tamaño y
// rotación, con imán al eje central, a las zonas seguras y a los otros elementos. Al guardar, el HTML vuelve a la
// carpeta de la semana y se renderiza con el motor (motor-historias/render.py).
let se = null;
const SE_CSS = `
  .historia { cursor: default; user-select: none; -webkit-user-select: none; }
  .sticker { pointer-events: auto !important; }
  .se-hover { outline: 3px dashed rgba(56, 151, 240, .95) !important; outline-offset: 6px; cursor: move; }
  [contenteditable="true"] { outline: 5px solid #fdcb58 !important; outline-offset: 6px; cursor: text !important; user-select: text; -webkit-user-select: text; caret-color: #3897f0; }
  .fondo, .atenuado { cursor: grab; }
  .moveable-control-box { z-index: 2000 !important; }
  .se-multi { outline: 3px solid rgba(56, 151, 240, .95) !important; outline-offset: 6px; }
  .se-crop { outline: 4px dashed #fdcb58 !important; outline-offset: 0; cursor: grab !important; }
  /* Zonas seguras sin tapar la historia: lo que tapa Instagram en gris translúcido con su borde punteado, y el eje
     del centro, porque todo va centrado (el chequeo del motor lo mide). */
  .guias .historia::after { background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, .8) 0 16px, transparent 16px 30px) 0 248px / 100% 3px no-repeat,
    repeating-linear-gradient(90deg, rgba(255, 255, 255, .8) 0 16px, transparent 16px 30px) 0 1649px / 100% 3px no-repeat,
    repeating-linear-gradient(180deg, rgba(56, 151, 240, .55) 0 14px, transparent 14px 28px) 539px 0 / 2px 100% no-repeat,
    linear-gradient(rgba(18, 17, 14, .34), rgba(18, 17, 14, .34)) 0 0 / 100% 250px no-repeat,
    linear-gradient(rgba(18, 17, 14, .34), rgba(18, 17, 14, .34)) 0 1650px / 100% 270px no-repeat !important; }
  .guias .sticker { outline: 3px dashed rgba(255, 255, 255, .85) !important; background: rgba(18, 17, 14, .22) !important; }
  .guias .sticker::before { color: #fff !important; text-shadow: 0 1px 4px rgba(0, 0, 0, .5); }`;
const SE_MEDIA = '.captura, .recorte, .sticker, svg, img';
const seIsMedia = el => el.matches(SE_MEDIA) || !!el.closest('svg');
const seTop = el => { let e = el; while (e && e.parentElement && e.parentElement !== se.root) e = e.parentElement; return e && e.parentElement === se.root ? e : null; };
const seLayer = el => el.matches('.fondo, .atenuado, .capa');
const SE_FONTS = [['serif', 'Serif'], ['clasica', 'Clásica'], ['maquina', 'Máquina']];
const SE_BOX = [['ninguno', 'Sin fondo'], ['caja', 'Caja negra'], ['caja blanca', 'Caja blanca'], ['caja color', 'Caja del color'], ['caja translucida', 'Caja translúcida'], ['resalte', 'Resaltado blanco'], ['resalte negro', 'Resaltado negro'], ['resalte color', 'Resaltado del color']];
const SE_BOX_CLASSES = ['caja', 'blanca', 'color', 'translucida', 'resalte', 'negro'];
const SE_EMOJIS = '👇 👆 👉 👈 ✨ 🔥 💡 ✅ ❌ ⚠️ 🤯 😮 😅 🙌 👏 💪 🫵 👋 🤖 🎬 📲 🎙️ 🧑‍💻 ⚙️ 📈 💰 🗓️ ⏰ 🚀 🎯 📌 💬 ❤️ ⭐ 🔁 ➡️ 👀 🙏'.split(' ');
// Lo que se agarra al tocar: un emoji, una imagen, flecha o zona de sticker entera, o el bloque de texto que contiene lo tocado.
function seUnit(t) {
  if (!t || t.nodeType !== 1) t = t?.parentElement;
  if (!t || t === se.root || !se.root.contains(t)) return null;
  const top = seTop(t); if (!top || seLayer(top)) return null;
  if (top.matches('.grupo, [data-grupo]')) return top;  // un grupo se elige y se mueve entero
  const emo = t.closest('.emoji'); if (emo && se.root.contains(emo)) return emo;
  if (seIsMedia(t) || seIsMedia(top)) return top;
  let e = t; while (e !== top && ['inline', 'inline-block', 'contents'].includes(se.w.getComputedStyle(e).display)) e = e.parentElement;
  return e;
}
function seKind(el) {
  if (!el) return null;
  if (el.matches('.sticker')) return 'sticker';
  if (el.matches('svg') || el.closest('svg')) return 'dibujo';
  if (el.matches('.captura, .recorte, img')) return 'imagen';
  const t = el.textContent.trim();
  if (el.matches('.emoji') || (t && /\p{Extended_Pictographic}/u.test(t) && !/[\p{L}\p{N}]/u.test(t) && [...t].length <= 4)) return 'emoji';
  return t ? 'texto' : 'bloque';
}
const seLabel = el => {
  if (!el) return '';
  if (el.matches('.fondo')) return el.querySelector('img[data-secuencia]') ? '🎬 Video de fondo' : '🖼️ Foto de fondo';
  if (el.matches('.atenuado')) return 'Oscurecer la foto';
  if (el.parentElement === se.root && seIsGroup(el)) { const t = (el.innerText || el.textContent).replace(/\s+/g, ' ').trim(); return `▣ Grupo de ${seGroupItems(el).length}${t ? ` · «${t.length > 36 ? t.slice(0, 36) + '…' : t}»` : ''}`; }
  const k = seKind(el);
  // El lugar que se le deja a un sticker de Instagram (en el HTML, data-sticker="zona segura" o el sticker que va).
  if (k === 'sticker') return /^zona segura/i.test(el.dataset.sticker || '') || !el.dataset.sticker ? 'Lugar para un sticker' : `Lugar del sticker: ${el.dataset.sticker}`;
  if (k === 'dibujo') return 'Flecha o dibujo';
  if (k === 'imagen') return el.dataset.caja ? `Imagen: ${el.dataset.caja}` : 'Imagen';
  if (k === 'emoji') return `Emoji ${el.textContent.trim()}`;
  const t = (el.innerText || el.textContent).replace(/\s+/g, ' ').trim(); return t ? `«${t.length > 46 ? t.slice(0, 46) + '…' : t}»` : 'Bloque';
};
async function openEditor() {
  const { s, i, byImg } = sbState, img = s.historias[i];
  let src; try { src = await api('stories/source?imagen=' + encodeURIComponent(img)); } catch (e) { toast(e.message); return; }
  const doc = new DOMParser().parseFromString(src.html, 'text/html'), root = doc.querySelector('.historia');
  if (!root) { toast('Esta historia no tiene el formato del motor de historias.'); return; }
  let n = 0; root.setAttribute('data-se', '0'); root.querySelectorAll('*').forEach(el => el.setAttribute('data-se', String(++n)));
  const view = doc.cloneNode(true);
  view.querySelectorAll('script').forEach(x => x.remove());
  view.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); }));
  const base = view.createElement('base'); base.href = src.base; view.head.prepend(base);
  const st = view.createElement('style'); st.textContent = SE_CSS; view.head.append(st);
  const mv = view.createElement('script'); mv.src = '/vendor/moveable.min.js'; view.head.append(mv);
  if ($('seGuides').checked) view.documentElement.classList.add('guias');
  se = { img, seq: s, i, src, doc, h: byImg[img] || {}, dur: parseFloat(root.dataset.duracion) || 7, sel: null, hover: null, editing: null, edited: new Set(), undo: [], redo: [], dirty: false, busy: false, nid: 0, stash: null };
  $('seTitle').textContent = `Editar · ${dayLong(s.fecha)} · ${i + 1} de ${s.historias.length}`;
  seTab = null; $('sePop').hidden = true; seBar(); seDrawer();
  $('seFrame').onload = seSetup;
  $('seFrame').srcdoc = '<!doctype html>\n' + view.documentElement.outerHTML;
  $('storyEditor').showModal(); seFit();
}
function seSetup() {
  const w = $('seFrame').contentWindow, d = w?.document;
  if (!se || !d || se.d === d || !d.querySelector('.historia')) return;  // la carga vacía al cerrar, o una segunda llamada
  if (!w.Moveable) { $('seBar').innerHTML = '<span class="bad">No cargó el editor de manijas (Moveable). Reiniciá el planner.</span>'; return; }
  Object.assign(se, { w, d, root: d.querySelector('.historia') });
  se.orig = new Map([...se.root.querySelectorAll('[data-se]')].map(el => [el.dataset.se, el.getAttribute('style')]));
  const mv = new w.Moveable(d.body, {
    target: null, draggable: true, resizable: true, rotatable: true, snappable: true, origin: false, keepRatio: false,
    throttleResize: 1, throttleRotate: 1, snapThreshold: 12, snapRotationDegrees: [0, 90, 180, 270], snapRotationThreshold: 4,
    verticalGuidelines: [540], horizontalGuidelines: [250, 960, 1650], isDisplaySnapDigit: false,
    snapDirections: { left: true, top: true, right: true, bottom: true, center: true, middle: true },
    elementSnapDirections: { left: true, top: true, right: true, bottom: true, center: true, middle: true },
    rotationPosition: 'top', checkInput: true, zoom: 1 / (se.k || .35),
  });
  se.mv = mv;
  // Mover: se corren top/left (o el desplazamiento relativo) desde el estilo de partida; la distancia ya trae el imán.
  mv.on('dragStart', e => { if (se.editing || se.busy || !se.down) { e.stop(); return; } se.g = { el: e.target, style0: e.target.getAttribute('style'), before: seSnap() }; })
    .on('drag', e => { const g = se.g; if (!g) return; seRestore(g.el, g.style0); seMoveBy(g.el, Math.round(e.beforeDist[0]), Math.round(e.beforeDist[1])); })
    .on('dragEnd', e => { const g = se.g; se.g = null; if (!g) return; const [dx, dy] = e.lastEvent?.beforeDist || [0, 0]; if (Math.hypot(dx, dy) < 3) seRestore(g.el, g.style0); else sePush(g.before); mv.updateRect(); seSide(); });
  // Tamaño: en un texto, los lados cambian el ancho (cuántas palabras entran por renglón) y las esquinas, la letra;
  // en un emoji, la letra; en una imagen, flecha o sticker, el ancho y el alto. Siempre desde el centro.
  mv.on('resizeStart', e => {
    if (se.editing || se.busy) { e.stop(); return; }
    // Recortar, como en Canva: el lado que se
    // arrastra corta el marco y la imagen queda quieta en su lugar.
    if (se.crop?.el === e.target) { const el = e.target, img = seFreezeImg(el); if (!img) { e.stop(); return; } const cs = se.w.getComputedStyle(el);
      se.g = { el, crop: true, img, before: seSnap(), L: parseFloat(cs.left) || 0, T: parseFloat(cs.top) || 0, W: el.offsetWidth, H: el.offsetHeight,
        il: parseFloat(img.style.left) || 0, it: parseFloat(img.style.top) || 0, iw: parseFloat(img.style.width) || el.offsetWidth, ih: parseFloat(img.style.height) || el.offsetHeight, styles: seStylesOf(el) }; return; }
    e.setFixedDirection([0, 0]); const el = e.target, k = seKind(el), r0 = el.getBoundingClientRect(), ie = e.inputEvent;
    // La letra se escala por la distancia del puntero al centro (como pellizcar en Instagram), no por el ancho que
    // calcula Moveable: al cambiar la letra, el alto cambia y ese ancho deja de servir.
    const c = [r0.left + r0.width / 2, r0.top + r0.height / 2], p0 = ie ? [ie.clientX, ie.clientY] : [r0.right, r0.bottom];
    const ci = k === 'imagen' ? seCropImg(el) : null, img0 = ci && /px$/.test(ci.style.width || '') ? ['left', 'top', 'width', 'height'].map(p => parseFloat(ci.style[p]) || 0) : null;
    se.g = { el, k, before: seSnap(), r0, c, d0: Math.max(8, Math.hypot(p0[0] - c[0], p0[1] - c[1])), fonts: ['texto', 'emoji', 'bloque'].includes(k) ? seFontTargets(el) : null, style0: el.getAttribute('style'), styles: seStylesOf(el), ci, img0 };
  }).on('resize', e => {
    const g = se.g; if (!g) return; seRestoreAll(g.styles);
    if (g.crop) { seCropTo(g, e); return; }
    const ie = e.inputEvent, f = ie ? Math.max(.15, Math.hypot(ie.clientX - g.c[0], ie.clientY - g.c[1]) / g.d0) : e.width / g.r0.width;
    if (g.k === 'texto' || g.k === 'bloque') { if (e.direction[1] === 0) seSetWidth(g.el, Math.round(e.width)); else seScaleFont(g.fonts, f); }
    else if (g.k === 'emoji') seScaleFont(g.fonts, f);
    else { seSetSize(g.el, Math.round(e.width), Math.round(e.height), g.r0);
      // Una imagen ya recortada escala con su marco: la imagen de adentro crece igual.
      if (g.img0) { const f = Math.round(e.width) / g.r0.width; ['left', 'top', 'width', 'height'].forEach((p, i) => { g.ci.style[p] = Math.round(g.img0[i] * f) + 'px'; }); } }
  }).on('resizeEnd', e => { const g = se.g; se.g = null; if (g && e.isDrag) sePush(g.before); mv.updateRect(); seSide(); });
  mv.on('rotateStart', e => { if (se.editing || se.busy) { e.stop(); return; } se.g = { el: e.target, rot0: seRotation(e.target), before: seSnap() }; })
    .on('rotate', e => { const g = se.g; if (!g) return; seSetRotation(g.el, g.rot0 + e.dist); })
    .on('rotateEnd', e => { const g = se.g; se.g = null; if (g && e.isDrag) sePush(g.before); mv.updateRect(); seSide(); });
  seFreeze(); (d.fonts ? d.fonts.ready : Promise.resolve()).then(() => { seFreeze(); mv.updateRect(); seIssueBadge(); if (seTab === 'chequeo') seDrawer(); });
  d.addEventListener('pointerdown', e => { se.down = e.button === 0; }, true); d.addEventListener('pointerup', () => { se.down = false; }, true); d.addEventListener('pointercancel', () => { se.down = false; }, true);
  d.addEventListener('pointerdown', seDown, true); d.addEventListener('pointermove', seMove); d.addEventListener('pointerup', seUp); d.addEventListener('pointercancel', seUp);
  d.addEventListener('dblclick', seDbl); d.addEventListener('keydown', seKey); d.addEventListener('paste', sePaste);
  d.addEventListener('input', () => { if (se.editing) { se.edited.add(se.editing.dataset.se); se.dirty = true; seSaveButton(); } });
  d.addEventListener('load', e => { if (e.target.tagName === 'IMG' && !se.play) { seSide(); se.mv?.updateRect(); } }, true);
  // Al marcar palabras mientras se corrige, la barra muestra el color y el resaltado de lo marcado.
  let selT = 0; d.addEventListener('selectionchange', () => { if (!se?.editing) return; clearTimeout(selT); selT = setTimeout(() => se?.editing && seBar(), 80); });
  d.addEventListener('pointerdown', () => $('sePop') && ($('sePop').hidden = true), true);
  d.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  d.addEventListener('drop', e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); seUploadFiles(e.dataTransfer.files, [e.clientX, e.clientY]); });
  seFit(); seSide();
}
// El cuadro que queda en la imagen fija: render.py la saca en el último cuadro (duración − 1/30 s).
function seFreeze() { if (!se?.d) return; const t = Math.max(0, se.dur - 1 / 30) * 1000; for (const a of se.d.getAnimations()) { a.pause(); a.currentTime = t; } }
function seFit() {
  const st = $('seStage'), k = Math.min(st.clientHeight / 1920, st.clientWidth / 1080) || .3;
  $('seScale').style.width = 1080 * k + 'px'; $('seScale').style.height = 1920 * k + 'px'; $('seFrame').style.transform = `scale(${k})`;
  if (se) { se.k = k; if (se.mv) { se.mv.zoom = 1 / k; se.mv.updateRect(); } }
}
addEventListener('resize', () => { if ($('storyEditor').open) seFit(); });

// ── Historial ──
const seSnap = () => ({ html: se.root.innerHTML, cls: se.root.getAttribute('class'), style: se.root.getAttribute('style') });
function seApplySnap(s) {
  se.mv.target = null; se.sel = se.hover = null;
  se.root.innerHTML = s.html; se.root.setAttribute('class', s.cls || ''); if (s.style === null) se.root.removeAttribute('style'); else se.root.setAttribute('style', s.style);
  se.root.querySelectorAll('.se-hover, .se-multi, .se-crop').forEach(x => x.classList.remove('se-hover', 'se-multi', 'se-crop'));
  se.multi = new Set(); se.crop = null; if (se.mv) se.mv.draggable = true;
  se.root.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
  seFreeze();
}
function sePush(before) { se.undo.push(before); if (se.undo.length > 80) se.undo.shift(); se.redo = []; se.dirty = true; seFreeze(); seSide(); }
function seUndo() { if (!se?.root || !se.undo.length || se.busy) return; seEndEdit(false); se.redo.push(seSnap()); seApplySnap(se.undo.pop()); se.dirty = true; seSide(); }
function seRedo() { if (!se?.root || !se.redo.length || se.busy) return; seEndEdit(false); se.undo.push(seSnap()); seApplySnap(se.redo.pop()); se.dirty = true; seSide(); }
// Cambio puntual desde el panel: guarda el estado anterior y aplica.
function seChange(fn) { if (!se?.root || se.busy) return; const before = seSnap(); fn(); if (before.html !== se.root.innerHTML || before.cls !== se.root.getAttribute('class') || before.style !== se.root.getAttribute('style')) sePush(before); else seSide(); se.mv?.updateRect(); }

// ── Geometría ──
function seRestore(el, style) { if (style === null || style === undefined) el.removeAttribute('style'); else el.setAttribute('style', style); }
const seStylesOf = el => [el, ...el.querySelectorAll('*')].map(x => [x, x.getAttribute('style')]);
function seRestoreAll(list) { for (const [x, s] of list) seRestore(x, s); }
// Mueve sin tocar el ancho: en cada eje corre los lados fijados (top/bottom, left/right) o el desplazamiento relativo.
function seMoveBy(el, dx, dy) {
  const cs = se.w.getComputedStyle(el), spec = side => { try { return el.computedStyleMap().get(side).toString(); } catch { return cs[side]; } };
  if (cs.position === 'absolute' || cs.position === 'fixed') {
    for (const [a, b, d] of [['top', 'bottom', dy], ['left', 'right', dx]]) {
      if (!d) continue;
      const aAuto = spec(a) === 'auto', bAuto = spec(b) === 'auto';
      if (!aAuto || bAuto) el.style[a] = Math.round(parseFloat(cs[a]) + d) + 'px';
      if (!bAuto) el.style[b] = Math.round(parseFloat(cs[b]) - d) + 'px';
    }
  } else {
    if (cs.position === 'static') el.style.position = 'relative';
    if (cs.display === 'inline') el.style.display = 'inline-block';
    if (dx) el.style.left = Math.round((parseFloat(cs.left) || 0) + dx) + 'px';
    if (dy) el.style.top = Math.round((parseFloat(cs.top) || 0) + dy) + 'px';
  }
}
const seBlock = el => { let e = el; while (e && e !== se.root && se.w.getComputedStyle(e).display === 'inline') e = e.parentElement; return e; };
// Ancho de un texto (cuántas palabras entran por renglón), centrado sobre su eje.
function seSetWidth(el, W) {
  el = seBlock(el); W = Math.max(60, Math.min(1080, W));
  const cs = se.w.getComputedStyle(el), r = el.getBoundingClientRect(), cx = r.left + r.width / 2;
  if (cs.position === 'absolute') { el.style.width = W + 'px'; el.style.left = Math.round(cx - W / 2) + 'px'; el.style.right = 'auto'; el.style.maxWidth = 'none'; }
  else if (cs.display.startsWith('inline')) { el.style.maxWidth = W + 'px'; el.style.width = 'auto'; }
  else { el.style.width = W + 'px'; el.style.maxWidth = 'none'; el.style.marginLeft = `calc((100% - ${W}px) / 2)`; el.style.marginRight = '0'; }
  // Las cajas de adentro pueden crecer hasta el ancho nuevo.
  for (const x of el.querySelectorAll('.caja, .resalte, p')) if (se.w.getComputedStyle(x).maxWidth !== 'none') x.style.maxWidth = W + 'px';
  // Si al crecer se sale de la historia (un texto en la columna de un costado), se corre hacia adentro.
  const r2 = el.getBoundingClientRect(), over = r2.right > 1060 ? 1060 - r2.right : r2.left < 20 ? 20 - r2.left : 0;
  if (over) { if (cs.position === 'absolute') el.style.left = Math.round(parseFloat(el.style.left) + over) + 'px'; else if (!cs.display.startsWith('inline')) el.style.marginLeft = `calc((100% - ${W}px) / 2 + ${Math.round(over)}px)`; }
}
// Tamaño de la letra: el elemento y cada descendiente con un tamaño propio, todos por el mismo factor.
function seFontTargets(el) {
  const w = se.w, list = [el];
  for (const x of el.querySelectorAll('*')) { if (x.matches('br')) continue; if (Math.abs(parseFloat(w.getComputedStyle(x).fontSize) - parseFloat(w.getComputedStyle(x.parentElement).fontSize)) > .5) list.push(x); }
  return list.map(x => ({ x, fs: parseFloat(w.getComputedStyle(x).fontSize) }));
}
function seScaleFont(targets, f) { for (const t of targets) t.x.style.fontSize = Math.max(8, Math.round(t.fs * f)) + 'px'; }
function seSetSize(el, W, H, r0) {
  const cs = se.w.getComputedStyle(el), r = r0 || el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  el.style.width = Math.max(20, W) + 'px'; el.style.height = Math.max(20, H) + 'px';
  if (cs.position === 'absolute') { el.style.left = Math.round(cx - W / 2) + 'px'; el.style.right = 'auto'; el.style.top = Math.round(cy - H / 2) + 'px'; el.style.bottom = 'auto'; }
}
const seRotation = el => { const m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || ''); return m ? parseFloat(m[1]) : 0; };
function seSetRotation(el, deg) { deg = Math.round(((deg + 540) % 360) - 180); el.style.transform = (el.style.transform || '').replace(/\s*rotate\([^)]*\)/, '').trim() + (deg ? ` rotate(${deg}deg)` : ''); if (!el.style.transform.trim()) el.style.removeProperty('transform'); }
function seCenter(el) { const r = seInk(el) || el.getBoundingClientRect(), dx = Math.round(540 - (r.left + r.width / 2)); if (dx) seMoveBy(el, dx, 0); }
// Lo que se ve de un elemento: las cajas, imágenes y renglones de adentro, no el contenedor (un .bloque ocupa todo el
// ancho aunque su texto esté corrido). Es lo que mide el chequeo del render.
function seInk(x) {
  const rs = [], d = se.d;
  const walk = e => {
    if (e.matches('script, style, audio, br')) return;
    const cs = se.w.getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (e.matches('.caja, .resalte, img, svg, video, .captura, .recorte, .sticker, [data-recurso]')) { rs.push(e.getBoundingClientRect()); return; }
    if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) { const g = d.createRange(); g.selectNodeContents(e); rs.push(...g.getClientRects()); return; }
    [...e.children].forEach(walk);
  };
  walk(x);
  const ok = rs.filter(r => r.width > 1 && r.height > 1); if (!ok.length) return null;
  const l = Math.min(...ok.map(r => r.left)), t = Math.min(...ok.map(r => r.top)), rr = Math.max(...ok.map(r => r.right)), b = Math.max(...ok.map(r => r.bottom));
  return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t };
}
const seBoxEl = el => el.matches('.caja, .resalte') ? el : el.querySelector('.caja, .resalte') || el;
function seBoxValue(el) { const b = seBoxEl(el), c = b.classList; if (c.contains('caja')) return c.contains('blanca') ? 'caja blanca' : c.contains('color') ? 'caja color' : c.contains('translucida') ? 'caja translucida' : 'caja'; if (c.contains('resalte')) return c.contains('negro') ? 'resalte negro' : c.contains('color') ? 'resalte color' : 'resalte'; return 'ninguno'; }
function seSetBox(el, v) { const boxes = el.matches('.caja, .resalte') ? [el] : [...el.querySelectorAll('.caja, .resalte')]; for (const b of boxes.length ? boxes : [el]) { b.classList.remove(...SE_BOX_CLASSES); if (v !== 'ninguno') b.classList.add(...v.split(' ')); } }
function seFontValue(el) { for (const [k] of SE_FONTS) if (el.classList.contains(k)) return k; const b = seBoxEl(el); for (const [k] of SE_FONTS) if (b.classList.contains(k) || b.querySelector('.' + k)) return k; const f = se.w.getComputedStyle(b).fontFamily; return /Clasica/i.test(f) ? 'clasica' : /Maquina/i.test(f) ? 'maquina' : 'serif'; }
function seSetFont(el, f) { for (const x of [el, ...el.querySelectorAll('*')]) { if (x.closest('.emoji')) continue; x.classList.remove('serif', 'clasica', 'maquina'); } el.classList.add(f); }
// Los elementos nuevos o duplicados llevan su propia marca para seguirlos (no existen en el archivo original).
function seMark(el) { for (const x of [el, ...el.querySelectorAll('*')]) x.setAttribute('data-se', 'n' + (++se.nid)); return el; }

// ── Elegir, mover a mano, encuadrar la foto ──
function seSelect(el) {
  if (se.hover) { se.hover.classList.remove('se-hover'); se.hover = null; }
  if (se.multi?.size) { se.root.querySelectorAll('.se-multi').forEach(x => x.classList.remove('se-multi')); se.multi = new Set(); }
  if (se.crop && se.crop.el !== el) seEndCrop(false);
  se.sel = el || null;
  const mv = se.mv;
  if (mv) {
    const k = seKind(el);
    mv.target = el && !se.editing ? el : null;
    if (el) {
      const crop = se.crop?.el === el;
      mv.keepRatio = !crop && ['imagen', 'dibujo', 'emoji'].includes(k);
      mv.renderDirections = crop || k === 'sticker' ? ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'] : k === 'texto' || k === 'bloque' ? ['w', 'e', 'nw', 'ne', 'sw', 'se'] : ['nw', 'ne', 'sw', 'se'];
      mv.rotatable = !crop && k !== 'sticker'; mv.draggable = !crop;
      mv.elementGuidelines = [...se.root.children].filter(x => x !== el && !x.contains(el) && !seLayer(x) && !x.matches('.sticker'));
    }
  }
  seSide();
}
function seDown(e) {
  if (e.button !== 0 || se.busy) return;
  if (se.mv?.isMoveableElement?.(e.target) || e.target.closest?.('.moveable-control-box')) return;
  if (se.editing) { if (se.editing.contains(e.target)) return; seEndEdit(); }
  // Recortando: arrastrar adentro del marco corre la imagen, que siempre lo cubre.
  if (se.crop && se.crop.el.contains(e.target)) { e.preventDefault(); e.stopPropagation(); seCropPanBegin(e); return; }
  const u = seUnit(e.target);
  if (u) {
    const t = seTop(u) || u;
    if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); seToggleMulti(u); return; }
    if (se.multi?.size >= 2 && se.multi.has(t)) { e.preventDefault(); e.stopPropagation(); seDragBegin(e, [...se.multi]); return; }
    if (u === se.sel) return;  // Moveable ya lo arrastra
    e.preventDefault(); e.stopPropagation();
    seSelect(u);
    // Clic y arrastrar mueve; al soltar, se suelta. El
    // arrastre del primer clic lo lleva el editor (no Moveable): sólo mueve mientras el botón sigue apretado.
    seDragBegin(e, [u]);
    return;
  }
  if (se.multi?.size) seSelectMany([]);
  seSelect(null);
  const img = se.root.querySelector('.fondo > img');
  if (img && (e.target === se.root || e.target.closest('.fondo, .atenuado'))) {
    e.preventDefault();
    const [px, py] = se.w.getComputedStyle(img).objectPosition.split(' ').map(v => parseFloat(v));
    const W = img.clientWidth, H = img.clientHeight, k = Math.max(W / img.naturalWidth, H / img.naturalHeight), z = seZoom();
    se.pan = { img, x0: e.clientX, y0: e.clientY, px: Number.isFinite(px) ? px : 50, py: Number.isFinite(py) ? py : 50, ox: img.naturalWidth * k * z - W, oy: img.naturalHeight * k * z - H, moved: false, before: seSnap() };
    try { e.target.setPointerCapture(e.pointerId); } catch {}
  }
}
function seMove(e) {
  if (se.drag) { seDragMove(e); return; }
  if (se.cpan) { seCropPanMove(e); return; }
  if (se.pan) {
    const p = se.pan, dx = e.clientX - p.x0, dy = e.clientY - p.y0; if (!p.moved && Math.hypot(dx, dy) < 4) return; p.moved = true;
    const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
    const x = p.ox > 1 ? clamp(p.px - dx / p.ox * 100) : p.px, y = p.oy > 1 ? clamp(p.py - dy / p.oy * 100) : p.py;
    p.img.style.objectPosition = `${x}% ${y}%`; se.fondoPos = true;
  } else if (!se.editing && !se.g) {
    const u = seUnit(e.target);
    if (u !== se.hover) { se.hover?.classList.remove('se-hover'); se.hover = u && u !== se.sel ? u : null; se.hover?.classList.add('se-hover'); }
  }
}
function seUp() { if (se.drag) { seDragEnd(); return; } if (se.cpan) { seCropPanEnd(); return; } if (se.pan) { const p = se.pan; se.pan = null; if (p.moved && p.before.html !== se.root.innerHTML) sePush(p.before); else seSide(); } }
// Doble clic: corregir el texto ahí mismo, con la palabra marcada.
function seDbl(e) {
  const u = seUnit(e.target);
  if (u && seCropImg(u)) { seStartCrop(u); return; }
  if (!u || seIsMedia(u) || u.querySelector('script')) return;
  seStartEdit(u, e.clientX, e.clientY);
}
function seStartEdit(u, x, y) {
  se.editBefore = seSnap(); se.sel = u; se.editing = u; se.mv.target = null;
  u.setAttribute('contenteditable', 'true'); u.spellcheck = false; u.focus();
  const d = se.d, sel = d.getSelection();
  let r = x != null ? (d.caretRangeFromPoint?.(x, y) || null) : null;
  if (!r && x != null) { const pos = d.caretPositionFromPoint?.(x, y); if (pos) { r = d.createRange(); r.setStart(pos.offsetNode, pos.offset); } }
  if (r && u.contains(r.startContainer)) { sel.removeAllRanges(); sel.addRange(r); try { sel.modify('move', 'backward', 'word'); sel.modify('extend', 'forward', 'word'); } catch {} }
  else { const all = d.createRange(); all.selectNodeContents(u); all.collapse(false); sel.removeAllRanges(); sel.addRange(all); }
  seSide();
}
function seEndEdit(push = true) {
  const el = se?.editing; if (!el) return;
  el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); se.editing = null;
  // Sin espacios duros (el navegador los mete al corregir) ni nodos vacíos.
  const tw = se.d.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n; (n = tw.nextNode());) if (n.data.includes(' ')) n.data = n.data.replace(/ /g, ' ');
  el.querySelectorAll('span:empty').forEach(x => x.remove());
  if (push && se.editBefore && se.editBefore.html !== se.root.innerHTML) sePush(se.editBefore);
  se.editBefore = null; seSelect(el);
}
function sePaste(e) { if (!se.editing) { sePasteImage(e); return; } e.preventDefault(); se.d.execCommand('insertText', false, (e.clipboardData?.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ')); }
function seKey(e) {
  if (se.editing) {
    if (e.key === 'Enter') { e.preventDefault(); se.d.execCommand('insertLineBreak'); }
    else if (e.key === 'Escape') { e.preventDefault(); seEndEdit(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { /* deshacer del navegador mientras se escribe */ }
    return;
  }
  seKeys(e);
}
function seKeys(e) {
  if (!se?.root) return false;
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? seRedo() : seUndo(); return true; }
  if (mod && k === 'y') { e.preventDefault(); seRedo(); return true; }
  if (e.key === 'Escape') { if (se.crop) { e.preventDefault(); seEndCrop(); return true; } if (se.multi?.size) { e.preventDefault(); seSelectMany([]); return true; } if (se.sel) { e.preventDefault(); seSelect(null); return true; } return false; }
  if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) seUngroup(se.sel ? seTop(se.sel) || se.sel : null); else seGroup(); return true; }
  if (se.multi?.size >= 2) {
    const st = e.shiftKey ? 10 : 1, ar = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
    if (ar[e.key]) { e.preventDefault(); seChange(() => se.multi.forEach(x => seMoveBy(x, ...ar[e.key]))); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); const l = [...se.multi]; seSelectMany([]); seChange(() => l.forEach(x => x.remove())); return true; }
    return false;
  }
  if (!se.sel) return false;
  if (mod && k === 'd') { e.preventDefault(); seDuplicate(); return true; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); seDelete(); return true; }
  if (e.key === 'Enter' && seKind(se.sel) === 'texto') { e.preventDefault(); seStartEdit(se.sel); return true; }
  const step = e.shiftKey ? 10 : 1, arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (arrows[e.key]) { e.preventDefault(); seChange(() => seMoveBy(se.sel, ...arrows[e.key])); return true; }
  return false;
}

// ── Arrastrar, varios a la vez, agrupar y desagrupar ──
// Un grupo es un elemento de la historia con dos o más piezas adentro (un bloque con varias cajas, o uno
// armado acá con data-grupo). Desagrupar deja cada pieza suelta en su lugar exacto; Shift+clic elige varias, que se
// arrastran juntas, y Agrupar las une en un grupo que se mueve como una.
const seUnion = els => { const rs = els.map(x => x.getBoundingClientRect()); const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom)); return { left: l, top: t, width: r - l, height: b - t, right: r, bottom: b }; };
function seDragBegin(e, els) {
  se.drag = { els, x0: e.clientX, y0: e.clientY, styles: els.flatMap(x => [[x, x.getAttribute('style')]]), before: seSnap(), moved: false };
  try { e.target.setPointerCapture(e.pointerId); } catch {}
}
function seDragMove(e) {
  const g = se.drag; if (!(e.buttons & 1)) { seDragEnd(); return; }
  let dx = e.clientX - g.x0, dy = e.clientY - g.y0; if (!g.moved && Math.hypot(dx, dy) < 4) return; g.moved = true;
  for (const [x, st] of g.styles) seRestore(x, st);
  // Imán al eje central: todo va centrado.
  const r = seUnion(g.els), cx = r.left + r.width / 2 + dx; if (Math.abs(cx - 540) < 12) dx += 540 - cx;
  g.els.forEach(x => seMoveBy(x, Math.round(dx), Math.round(dy))); se.mv?.updateRect();
}
function seDragEnd() {
  const g = se.drag; se.drag = null; if (!g) return;
  if (g.moved) sePush(g.before);
  se.mv?.updateRect(); seSide();
}
function seSelectMany(list) {
  se.root.querySelectorAll('.se-multi').forEach(x => x.classList.remove('se-multi'));
  list = [...new Set(list)].filter(x => x && x.parentElement === se.root && !seLayer(x));
  if (list.length < 2) { se.multi = new Set(); seSelect(list[0] || null); return; }
  if (se.crop) seEndCrop(false);
  se.multi = new Set(list); se.sel = null; if (se.mv) se.mv.target = null;
  list.forEach(x => x.classList.add('se-multi'));
  seSide();
}
function seToggleMulti(u) {
  const t = seTop(u) || u; if (!t || seLayer(t)) return;
  const set = new Set(se.multi?.size ? se.multi : se.sel ? [seTop(se.sel) || se.sel] : []);
  if (set.has(t)) set.delete(t); else set.add(t);
  seSelectMany([...set]);
}
const seGroupItems = el => el && el.parentElement === se.root && !seLayer(el) && !el.matches('.captura, .recorte, .sticker, svg, img, audio, [data-recurso]') ? [...el.children].filter(x => !x.matches('script, style, br, audio') && x.getBoundingClientRect().height > 0) : [];
const seIsGroup = el => seGroupItems(el).length >= 2;
function seUngroup(el) {
  if (!el || !seIsGroup(el)) { toast('Elegí un bloque con varias piezas para desagruparlo.'); return; }
  const piezas = [];
  seChange(() => {
    // Todas las posiciones se miden antes de sacar la primera: al sacar una, las de abajo suben dentro del bloque.
    const items = seGroupItems(el), rs = items.map(c => c.getBoundingClientRect()), mts = items.map(c => parseFloat(se.w.getComputedStyle(c).marginTop) || 0);
    items.forEach((c, i) => {
      const r0 = rs[i], abs = ['absolute', 'fixed'].includes(se.w.getComputedStyle(c).position);
      let pieza = c;
      if (abs) el.before(c);
      else {
        // Cada pieza sale en un bloque igual al original (las mismas clases, así conserva su letra y su tamaño) en su lugar.
        pieza = el.cloneNode(false); pieza.removeAttribute('data-grupo'); pieza.removeAttribute('data-se'); pieza.classList.remove('grupo'); seMark(pieza);
        pieza.style.top = Math.round(r0.top - mts[i]) + 'px'; pieza.style.bottom = 'auto'; pieza.style.removeProperty('height');
        el.before(pieza); pieza.appendChild(c);
      }
      const r1 = c.getBoundingClientRect(), dx = Math.round(r0.left - r1.left), dy = Math.round(r0.top - r1.top);
      if (dx || dy) seMoveBy(pieza, dx, dy);
      piezas.push(pieza);
    });
    el.remove();
  });
  seSelectMany(piezas);
  toast(`Separado en ${piezas.length} piezas: tocá cada una para moverla.`);
}
function seGroup(list = [...(se.multi || [])]) {
  list = list.filter(x => x.parentElement === se.root && !seLayer(x));
  if (list.length < 2) { toast('Elegí dos o más elementos con Shift+clic para agruparlos.'); return; }
  list.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  let g;
  seChange(() => {
    const u = seUnion(list), rs = list.map(x => x.getBoundingClientRect());
    // El grupo ocupa todo el ancho: adentro, cada pieza conserva su lugar y su centrado.
    // Sin data-grupo: así el chequeo del render sigue midiendo el centrado de cada pieza de adentro.
    g = se.d.createElement('div'); g.className = 'bloque grupo';
    g.style.cssText = `left: 0px; right: 0px; top: ${Math.round(u.top)}px; height: ${Math.round(u.height)}px;`;
    seMark(g); list[0].before(g);
    list.forEach((x, i) => { g.appendChild(x); const r1 = x.getBoundingClientRect(), dx = Math.round(rs[i].left - r1.left), dy = Math.round(rs[i].top - r1.top); if (dx || dy) seMoveBy(x, dx, dy); });
  });
  se.root.querySelectorAll('.se-multi').forEach(x => x.classList.remove('se-multi')); se.multi = new Set();
  if (g) seSelect(g);
}
// ── Recursos y tapar una captura ──
// motor-historias/recursos.html: bloques con el estilo adentro (chat de WhatsApp, archivo del
// recurso). Entran centrados, a la altura de la mitad de la historia, y se eligen enteros (data-grupo).
function seAddRecurso(id) {
  const src = se.recursosDoc?.querySelector(`.historia > [data-recurso="${CSS.escape(id)}"]`); if (!src) return;
  let el;
  seChange(() => { el = se.d.importNode(src, true); se.root.appendChild(seMark(el)); el.style.top = Math.round(960 - el.getBoundingClientRect().height / 2) + 'px'; seCenter(el); });
  if (el) seSelect(el);
}
// Tapar: la captura se borronea y lleva un candado encima; el recurso se ve pero no se lee (recurso hypeado, R4).
function seTapar(el) {
  const img = seCropImg(el); if (!img) return;
  seChange(() => {
    const t = el.querySelector(':scope > [data-tapa]');
    if (t) { t.remove(); img.style.removeProperty('filter'); return; }
    img.style.filter = 'blur(14px)';
    const s = se.d.createElement('span'); s.setAttribute('data-tapa', ''); s.textContent = '🔒';
    s.style.cssText = 'position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 150px; font-family: var(--emoji);';
    el.appendChild(seMark(s));
  });
}
// ── Recortar una imagen ──
// La imagen queda con su tamaño y su lugar en px dentro del marco; recortar mueve los bordes del marco sin escalarla.
const seCropImg = el => el?.matches?.('.captura') ? el.querySelector(':scope > img') : null;
function seFreezeImg(el) {
  const img = seCropImg(el); if (!img) return null;
  if (/px$/.test(img.style.width || '')) return img;
  const W = el.clientWidth, H = el.clientHeight, nw = img.naturalWidth || W, nh = img.naturalHeight || H, k = Math.max(W / nw, H / nh), fw = nw * k, fh = nh * k;
  const [px, py] = (se.w.getComputedStyle(img).objectPosition || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
  Object.assign(img.style, { position: 'absolute', maxWidth: 'none', objectFit: 'fill', width: Math.round(fw) + 'px', height: Math.round(fh) + 'px', left: Math.round((W - fw) * (Number.isFinite(px) ? px : .5)) + 'px', top: Math.round((H - fh) * (Number.isFinite(py) ? py : .5)) + 'px' });
  img.style.removeProperty('object-position');
  return img;
}
function seStartCrop(el) {
  if (!seCropImg(el)) return;
  if (se.multi?.size) seSelectMany([]);
  se.crop = { el }; el.classList.add('se-crop');
  seSelect(el); toast('Arrastrá los bordes para recortar. Listo o Esc para terminar.');
}
function seEndCrop(reselect = true) {
  const c = se.crop; if (!c) return; se.crop = null; c.el.classList.remove('se-crop');
  if (se.mv) se.mv.draggable = true;
  if (reselect) seSelect(c.el);
}
function seCropTo(g, e) {
  const dir = e.direction, min = 40;
  // Bordes de la imagen en coordenadas de la historia: el marco no puede salirse de ellos.
  const iL = g.L + g.il, iT = g.T + g.it, iR = iL + g.iw, iB = iT + g.ih;
  let L = g.L, T = g.T, W = g.W, H = g.H;
  if (dir[0] === -1) { L = Math.max(iL, Math.min(g.L + g.W - min, g.L + g.W - e.width)); W = g.L + g.W - L; }
  else if (dir[0] === 1) W = Math.max(min, Math.min(iR - g.L, e.width));
  if (dir[1] === -1) { T = Math.max(iT, Math.min(g.T + g.H - min, g.T + g.H - e.height)); H = g.T + g.H - T; }
  else if (dir[1] === 1) H = Math.max(min, Math.min(iB - g.T, e.height));
  Object.assign(g.el.style, { left: Math.round(L) + 'px', top: Math.round(T) + 'px', width: Math.round(W) + 'px', height: Math.round(H) + 'px', right: 'auto', bottom: 'auto' });
  g.img.style.left = Math.round(g.il - (L - g.L)) + 'px'; g.img.style.top = Math.round(g.it - (T - g.T)) + 'px';
}
function seCropPanBegin(e) {
  const img = seFreezeImg(se.crop.el); if (!img) return;
  se.cpan = { img, el: se.crop.el, x0: e.clientX, y0: e.clientY, l0: parseFloat(img.style.left) || 0, t0: parseFloat(img.style.top) || 0, before: seSnap(), moved: false };
  try { e.target.setPointerCapture(e.pointerId); } catch {}
}
function seCropPanMove(e) {
  const p = se.cpan; if (!(e.buttons & 1)) { seCropPanEnd(); return; }
  const dx = e.clientX - p.x0, dy = e.clientY - p.y0; if (!p.moved && Math.hypot(dx, dy) < 3) return; p.moved = true;
  const W = p.el.clientWidth, H = p.el.clientHeight, iw = parseFloat(p.img.style.width), ih = parseFloat(p.img.style.height);
  p.img.style.left = Math.round(Math.min(0, Math.max(W - iw, p.l0 + dx))) + 'px'; p.img.style.top = Math.round(Math.min(0, Math.max(H - ih, p.t0 + dy))) + 'px';
}
function seCropPanEnd() { const p = se.cpan; se.cpan = null; if (p?.moved) sePush(p.before); seSide(); }

// ── Agregar, duplicar, borrar, ordenar ──
function seAdd(kind, value) {
  seChange(() => {
    const d = se.d; let el;
    if (kind === 'texto') { el = d.createElement('div'); el.className = 'bloque'; el.style.top = '860px'; el.innerHTML = value === 'resalte' ? '<p class="parejo"><span class="resalte clasica" style="font-size: 56px;">Texto nuevo</span></p>' : value === 'suelto' ? '<p class="serif suelto parejo" style="font-size: 60px;">Texto nuevo</p>' : '<p class="caja serif parejo" style="font-size: 56px;">Texto nuevo</p>'; }
    else if (kind === 'emoji') { el = d.createElement('div'); el.className = 'abs emoji'; el.style.cssText = 'top: 880px; font-size: 140px; line-height: 1;'; el.textContent = value || '👇'; }
    else if (kind === 'flecha') { const curva = value === 'curva'; el = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('class', 'lapiz'); el.setAttribute('viewBox', curva ? '0 0 110 60' : '0 0 100 150'); el.setAttribute('style', curva ? 'top: 900px; width: 180px; height: 98px;' : 'top: 880px; width: 110px; height: 165px;'); el.innerHTML = curva ? '<path d="M6 34 C 34 12, 70 12, 98 30"/><path d="M78 12 L100 31 L76 48"/>' : '<path d="M50 8 C 62 46, 38 88, 50 136"/><path d="M28 110 L50 140 L72 110"/>'; }
    else if (kind === 'sticker') { el = d.createElement('div'); el.className = 'sticker'; el.dataset.sticker = value || 'zona segura'; el.style.cssText = 'left: 240px; top: 1300px; width: 600px; height: 200px;'; }
    if (!el) return;
    se.root.appendChild(seMark(el)); seCenter(el); seFreeze();
    se.pendingSelect = el; if (kind === 'texto') se.pendingEdit = el;
  });
  const el = se.pendingSelect, ed = se.pendingEdit; se.pendingSelect = se.pendingEdit = null;
  if (el) { seSelect(el); if (ed) seStartEdit(ed.querySelector('p') || ed); }
}
// Imágenes como sticker (fotos o capturas): entran con bordes redondeados y sombra, con la proporción de la imagen,
// centradas o donde se soltaron.
function seAddImage(src, at) {
  let el;
  seChange(() => {
    el = se.d.createElement('div'); el.className = 'captura';
    el.style.cssText = 'left: 260px; top: 680px; width: 560px; height: 560px;';
    const img = se.d.createElement('img'); img.setAttribute('src', src); img.setAttribute('alt', ''); el.appendChild(img);
    se.root.appendChild(seMark(el));
  });
  if (!el) return;
  const img = el.querySelector('img'), fit = () => {
    if (!el.isConnected || !img.naturalWidth) return;
    let W = 560, H = Math.round(W * img.naturalHeight / img.naturalWidth); if (H > 1000) { H = 1000; W = Math.round(H * img.naturalWidth / img.naturalHeight); }
    const cx = at ? at[0] : 540, cy = at ? at[1] : 960;
    Object.assign(el.style, { width: W + 'px', height: H + 'px', left: Math.round(cx - W / 2) + 'px', top: Math.round(Math.max(260, Math.min(1650 - H, cy - H / 2))) + 'px' });
    se.mv?.updateRect(); seSide();
  };
  if (img.complete && img.naturalWidth) fit(); else img.addEventListener('load', fit, { once: true });
  seSelect(el);
}
async function seUploadFiles(files, at) {
  const all = [...(files || [])], vid = all.find(seEsVideo), aud = all.find(seEsAudio);
  if (vid) seUploadVideo(vid); if (aud) seUploadAudio(aud);
  const list = all.filter(f => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name || ''));
  if (!list.length) { if (!vid && !aud) toast('Eso no es una imagen.'); return; }
  for (const f of list) {
    if (f.size > 20e6) { toast(`${f.name || 'La imagen'} pesa más de 20 MB.`); continue; }
    toast('Subiendo ' + (f.name || 'la imagen') + '…');
    try {
      const r = await api('stories/upload', post({ imagen: se.img, name: f.name || 'captura', mime: f.type || 'image/heic', data: await blobB64(f) }));
      if (!se?.root) return;
      seAddImage(r.src, at); se.assets = null; if (seTab === 'imagenes') seDrawer();
    } catch (e) { toast(e.message); }
  }
}
// Una captura en el portapapeles se pega con Cmd+V (en el editor, salvo que se esté escribiendo).
function sePasteImage(e) {
  const files = [...(e.clipboardData?.items || [])].filter(x => x.kind === 'file' && x.type.startsWith('image/')).map(x => x.getAsFile()).filter(Boolean);
  if (!files.length) return false;
  e.preventDefault(); seUploadFiles(files); return true;
}
function seDuplicate() {
  const el = se.sel; if (!el || seLayer(el)) return; let copy;
  seChange(() => { copy = seMark(el.cloneNode(true)); copy.classList.remove('se-hover'); el.after(copy); seMoveBy(copy, 0, 60); seFreeze(); });
  if (copy) seSelect(copy);
}
function seDelete() { const el = se.sel; if (!el || seLayer(el)) return; seSelect(null); seChange(() => el.remove()); }
function seOrder(el, dir) { seChange(() => { if (dir > 0 && el.nextElementSibling) el.nextElementSibling.after(el); else if (dir < 0 && el.previousElementSibling && !seLayer(el.previousElementSibling)) el.previousElementSibling.before(el); }); }

// ── Fondo de la historia ──
const seFondo = () => se.root.querySelector(':scope > .fondo');
const seAten = () => se.root.querySelector(':scope > .atenuado');
const seZoom = () => { const m = /scale\(([\d.]+)\)/.exec(seFondo()?.style.transform || ''); return m ? parseFloat(m[1]) : 1; };
function seBgMode() { const c = se.root.classList; return c.contains('lisa') ? (c.contains('negra') ? 'negro' : 'blanco') : seFondo() ? 'foto' : 'blanco'; }
function seSetBg(mode) {
  if (mode === 'foto') {
    if (seFondo()) return;
    if (se.stash) { seChange(() => { se.root.classList.remove('lisa', 'negra'); se.root.prepend(...se.stash); }); se.stash = null; }
    else openPicker();
    return;
  }
  seChange(() => {
    const f = seFondo(), a = seAten();
    if (f) { se.stash = [f, a].filter(Boolean); se.stash.forEach(x => x.remove()); }
    se.root.classList.add('lisa'); se.root.classList.toggle('negra', mode === 'negro');
  });
}
function seSetAten(on, v) {
  const a = seAten();
  if (!on) { a?.remove(); return; }
  const el = a || seMark(Object.assign(se.d.createElement('div'), { className: 'atenuado' }));
  if (!a) seFondo() ? seFondo().after(el) : se.root.prepend(el);
  if (v != null) el.style.setProperty('--atenuar', String(v));
}

// ── Video de fondo y voz en off ──
// Historias con video de fondo y voz en off, con el texto encima. El video
// se sube crudo (un MOV del iPhone pesa cientos de MB) y el servidor lo prepara con motor-historias/fondo_video.py: color
// normal (si vino en HDR, la conversión de Apple con las luces altas suavizadas), 1080 × 1920 y sus cuadros. La voz es
// un <audio class="voz"> de la historia, con su segundo de inicio; render.py la mezcla en el MP4.
const seVideo = () => seFondo()?.querySelector('img[data-secuencia]') || null;
const seVoz = () => se.root.querySelector(':scope > audio.voz');
const seEsVideo = f => /^video\//.test(f.type) || /\.(mov|mp4|m4v|webm)$/i.test(f.name || '');
const seEsAudio = f => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name || '');
const seFmtS = s => String(Math.round((s || 0) * 10) / 10).replace('.', ',');
const seVideoDur = () => { const v = seVideo(); return v ? (parseInt(v.dataset.cuadros, 10) || 0) / (parseFloat(v.dataset.fps) || 30) : 0; };
const seVozFin = () => { const a = seVoz(); return a && parseFloat(a.dataset.duracion) ? (parseFloat(a.dataset.inicio) || 0) + parseFloat(a.dataset.duracion) : 0; };
// Con voz en off, la historia termina con la voz (más un respiro), para que no quede un tramo mudo al final; si la voz
// dura más que el video, el último cuadro queda quieto hasta que termina. Sin voz, dura lo que el video.
function seAjustarDuracion() {
  const d = seVozFin() ? seVozFin() + 0.4 : seVideoDur();
  if (d > 0) { const v = String(Math.round(d * 10) / 10); se.root.dataset.duracion = v; se.dur = parseFloat(v); }
}
async function seSubirMedia(file, tipo) {
  if (file.size > (tipo === 'video' ? 800e6 : 200e6)) throw new Error(tipo === 'video' ? 'El video pesa más de 800 MB: recortalo antes de subirlo.' : 'El audio pesa más de 200 MB.');
  const q = new URLSearchParams({ imagen: se.img, tipo, name: file.name || tipo });
  const r = await fetch('/api/planner/stories/media?' + q, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'No se pudo subir.'); return j;
}
function sePonerVideo(r) {
  seChange(() => {
    let f = seFondo();
    if (!f) { f = se.d.createElement('div'); f.className = 'fondo'; f.innerHTML = '<img alt="">'; seMark(f); se.root.prepend(f); se.root.classList.remove('lisa', 'negra'); se.root.style.removeProperty('background-color'); se.stash = null; }
    const img = f.querySelector('img') || f.appendChild(seMark(se.d.createElement('img')));
    Object.entries({ 'data-secuencia': r.secuencia, 'data-cuadros': String(r.cuadros), 'data-fps': String(r.fps || 30), 'data-inicio': '0', src: r.poster }).forEach(([k, v]) => img.setAttribute(k, v));
    img.style.removeProperty('object-position'); f.style.removeProperty('transform');
    seAjustarDuracion();
  });
  se.videoMeta = r;
}
async function seUploadVideo(file) {
  if (!file || !se?.root) return;
  if (!seEsVideo(file)) { toast('Eso no es un video.'); return; }
  se.mediaBusy = 'Subiendo y preparando el video… Si vino del iPhone en HDR, lo paso a color normal. Puede tardar un minuto.'; if (seTab !== 'fondo') seTab = 'fondo'; seDrawer();
  try { const r = await seSubirMedia(file, 'video'); if (se?.root) { sePonerVideo(r); toast(`Video listo: ${seFmtS(r.duracion)} s.`); } }
  catch (e) { toast(e.message); } finally { if (se) { se.mediaBusy = null; seDrawer(); } }
}
function seLoadVideoMeta(v) {
  const m = /^assets\/videos\/([a-z0-9-]+)\//.exec(v.dataset.secuencia || ''); if (!m) return;
  se.videoMetaLoading = true;
  fetch(se.src.base + 'assets/videos/' + m[1] + '/video.json').then(r => r.ok ? r.json() : null).then(j => { if (se && j) se.videoMeta = j; })
    .catch(() => {}).finally(() => { if (se) { se.videoMetaLoading = false; if (seTab === 'fondo') seDrawer(); } });
}
function seVideoBox(vid) {
  if (/video/i.test(se.mediaBusy || '')) return `<p class="hint busy">${esc(se.mediaBusy)}</p>`;
  const up = `<label class="se-upload"><input type="file" accept="video/*,.mov,.mp4,.m4v,.webm" data-upload-video hidden>⬆︎ ${vid ? 'Cambiar el video' : 'Subir un video'}</label>`;
  if (!vid) return up + '<p class="hint">Del celular, una grabación de pantalla o un clip de YouTube. Si vino del iPhone en HDR, lo paso a color normal. Hasta 60 s por historia.</p>';
  const m = se.videoMeta;
  return `<div class="se-fondo-foto"><img src="${esc(se.src.base + vid.getAttribute('src'))}" alt=""><span class="muted">${seFmtS(seVideoDur())} s de video${m?.conversion && /HDR/.test(m.conversion) ? ' · pasado de HDR a color normal' : ''}</span></div>
    <div class="se-tramo"><label>Desde <input type="number" min="0" step="0.1" data-video="desde" value="${esc(String(m?.desde ?? 0))}"> s</label><label>Hasta <input type="number" min="0" step="0.1" data-video="hasta" value="${esc(String(m?.hasta ?? ''))}" placeholder="fin"> s</label>${seB('video-tramo', 'Recortar', { title: 'Vuelve a tomar ese tramo del video original' })}</div>
    <div class="se-adds row">${up}${seB('video-sacar', 'Sacar el video')}</div>`;
}
async function seTrimVideo() {
  const v = seVideo(); if (!v) return;
  const desde = document.querySelector('#seDrawer [data-video="desde"]')?.value, hasta = document.querySelector('#seDrawer [data-video="hasta"]')?.value;
  se.mediaBusy = 'Recortando el video…'; seDrawer();
  try { const r = await api('stories/video-trim', post({ imagen: se.img, secuencia: v.dataset.secuencia, desde, hasta })); if (se?.root) sePonerVideo(r); }
  catch (e) { toast(e.message); } finally { if (se) { se.mediaBusy = null; seDrawer(); } }
}
function sePonerVoz(r) {
  seChange(() => {
    let a = seVoz();
    if (!a) { a = seMark(se.d.createElement('audio')); a.className = 'voz'; a.dataset.inicio = '0.25'; se.root.prepend(a); }
    a.setAttribute('src', r.src); a.dataset.duracion = String(r.duracion || 0);
    seAjustarDuracion();
  });
}
async function seUploadAudio(file) {
  if (!file || !se?.root) return;
  if (!seEsAudio(file)) { toast('Eso no es un audio.'); return; }
  se.mediaBusy = 'Subiendo el audio…'; if (seTab !== 'audio') seTab = 'audio'; seDrawer();
  try { const r = await seSubirMedia(file, 'audio'); if (se?.root) { sePonerVoz(r); se.voces = null; } }
  catch (e) { toast(e.message); } finally { if (se) { se.mediaBusy = null; seDrawer(); } }
}
async function seElegirVoz(v) {
  try { const r = v.en_fuente ? { src: v.src, duracion: v.duracion } : await api('stories/voice-import', post({ imagen: se.img, path: v.path })); if (se?.root) { sePonerVoz(r); se.voces = null; seDrawer(); } }
  catch (e) { toast(e.message); }
}
// Probar: la voz suena desde su segundo y el video corre en el editor cuadro a cuadro, como en el render.
function seProbar() {
  if (se.play) { seParar(); return; }
  const v = seVideo(), a = seVoz(), fps = parseFloat(v?.dataset.fps) || 30, n = parseInt(v?.dataset.cuadros, 10) || 0, pat = v?.dataset.secuencia;
  const audio = a ? new Audio(se.src.base + a.getAttribute('src')) : null, ini = parseFloat(a?.dataset.inicio) || 0, t0 = performance.now(), dur = se.dur;
  se.play = { audio, raf: 0, v, poster: v?.getAttribute('src'), timer: audio ? setTimeout(() => audio.play().catch(() => {}), ini * 1000) : null };
  const tick = () => {
    if (!se?.play) return; const t = (performance.now() - t0) / 1000; if (t >= dur) { seParar(); return; }
    if (v && n) v.setAttribute('src', pat.replace('%03d', String(Math.min(n, Math.floor(t * fps) + 1)).padStart(3, '0')));
    se.play.raf = requestAnimationFrame(tick);
  };
  tick(); seDrawer();
}
function seParar() {
  const p = se?.play; if (!p) return; se.play = null;
  cancelAnimationFrame(p.raf); clearTimeout(p.timer); p.audio?.pause(); if (p.v && p.poster) p.v.setAttribute('src', p.poster);
  if (seTab === 'audio') seDrawer();
}

// ── Colores ──
// Toda la paleta para todo: La fila del editor de texto de Instagram, grises y cualquier otro color.
const SE_PALETTE = [['#ffffff', 'Blanco'], ['#000000', 'Negro'], ['#fdcb58', 'Amarillo'], ['#fd8d32', 'Naranja'], ['#ed4956', 'Rojo'], ['#d10869', 'Magenta'], ['#a307ba', 'Violeta'], ['#3897f0', 'Azul'], ['#70c050', 'Verde'], ['#262626', 'Gris oscuro'], ['#737373', 'Gris'], ['#dbdbdb', 'Gris claro'], ['#efefef', 'Papel']];
const SE_ESTILOS = { 'estilo-amarillo': '#fdcb58', 'estilo-naranja': '#fd8d32', 'estilo-rojo': '#ed4956', 'estilo-verde': '#70c050' };
const seHex = c => { if (!c) return ''; c = String(c).trim(); if (c.startsWith('#')) return (c.length === 4 ? '#' + [...c.slice(1)].map(x => x + x).join('') : c.slice(0, 7)).toLowerCase(); const m = c.match(/\d+(\.\d+)?/g); return m && m.length >= 3 ? '#' + m.slice(0, 3).map(v => Math.round(+v).toString(16).padStart(2, '0')).join('') : ''; };
const seLum = hex => { const h = seHex(hex); if (!h) return 1; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); };
// La letra que mejor se lee sobre un color (negra o blanca), por contraste.
const seOn = hex => { const L = seLum(hex); return (L + .05) / .05 >= 1.05 / (L + .05) ? '#000000' : '#ffffff'; };
const seAcentoHex = () => seHex(se.root.style.getPropertyValue('--acento')) || Object.entries(SE_ESTILOS).find(([k]) => se.root.classList.contains(k))?.[1] || seHex(se.w.getComputedStyle(se.root).getPropertyValue('--acento')) || '#fdcb58';
const seBoxes = el => el.matches('.caja, .resalte') ? [el] : [...el.querySelectorAll('.caja, .resalte')];
function seBoxColor(el) { const b = seBoxes(el)[0]; if (!b) return ''; if (b.style.getPropertyValue('--caja')) return seHex(b.style.getPropertyValue('--caja')); if (b.classList.contains('color')) return 'acento'; return seHex(se.w.getComputedStyle(b).backgroundColor); }
function seTextColor(el) { const t = seBoxEl(el); if (/acento/.test(t.style.color)) return 'acento'; return t.style.color ? seHex(t.style.color) : ''; }
function seBgValue() { const c = se.root.classList; if (!c.contains('lisa') && seFondo()) return 'foto'; if (se.root.style.backgroundColor) return seHex(se.root.style.backgroundColor); return c.contains('negra') ? '#000000' : '#ffffff'; }
// Aplica un color: acento de la historia, fondo liso, letra, caja o resaltado, flecha.
function seColorAct(act, val) {
  const el = se.sel, root = se.root;
  if (act === 'acento') {
    root.classList.remove(...Object.keys(SE_ESTILOS)); root.style.removeProperty('--acento'); root.style.removeProperty('--sobre-acento');
    const cls = Object.entries(SE_ESTILOS).find(([, h]) => h === val)?.[0];
    if (cls) root.classList.add(cls); else { root.style.setProperty('--acento', val); root.style.setProperty('--sobre-acento', seOn(val)); }
  } else if (act === 'bgcolor') {
    const f = seFondo(), a = seAten(); if (f) { se.stash = [f, a].filter(Boolean); se.stash.forEach(x => x.remove()); }
    root.classList.add('lisa'); root.classList.remove('negra'); root.style.removeProperty('background-color'); root.style.removeProperty('color');
    if (val === '#000000') root.classList.add('negra'); else if (val !== '#ffffff') { root.style.backgroundColor = val; root.style.color = seOn(val); }
  } else if (act === 'color' && el) {
    const t = seBoxEl(el); if (val === 'acento') t.style.color = 'var(--acento)'; else if (val) t.style.color = val; else t.style.removeProperty('color'); if (t !== el) el.style.removeProperty('color');
  } else if (act === 'cajacolor' && el) {
    for (const b of seBoxes(el)) {
      b.style.removeProperty('--caja'); b.style.removeProperty('--letra');
      if (val === 'acento') { b.classList.remove('blanca', 'negro', 'translucida'); b.classList.add('color'); }
      else if (val) { b.style.setProperty('--caja', val); b.style.setProperty('--letra', seOn(val)); }
    }
  } else if (act === 'trazo' && el) {
    if (val === 'acento') el.style.setProperty('--trazo', 'var(--acento)'); else if (val) el.style.setProperty('--trazo', val); else el.style.removeProperty('--trazo');
  }
  if (!root.getAttribute('style')) root.removeAttribute('style');
}

// ── Estilo de lo marcado: resaltar o pintar las palabras que se marcan al corregir el texto ──
const SE_HL = 'span.resalte, span.caja, .completar', SE_COL = '.c, span[style*="color"]:not(.resalte):not(.caja)';
const seMarkUp = (node, el, sel) => { if (node?.nodeType === 1 && node !== el && node.matches(sel)) return node; for (let e = node?.parentElement; e && e !== el && el.contains(e); e = e.parentElement) if (e.matches(sel)) return e; return null; };
function seHlKey(M) { if (!M || M.matches('.completar')) return null; if (M.style.getPropertyValue('--caja')) return seHex(M.style.getPropertyValue('--caja')); if (M.classList.contains('color')) return 'acento'; if (M.classList.contains('negro') || (M.matches('.caja') && !M.classList.contains('blanca'))) return '#000000'; return '#ffffff'; }
const seColKey = M => !M ? null : M.classList.contains('c') ? 'acento' : seHex(M.style.color);
function seHlSpan(color) { const s = se.d.createElement('span'); s.className = 'resalte'; if (color === 'acento') s.classList.add('color'); else if (color === '#000000') s.classList.add('negro'); else if (color !== '#ffffff') { s.style.setProperty('--caja', color); s.style.setProperty('--letra', seOn(color)); } return s; }
function seColSpan(color) { const s = se.d.createElement('span'); if (color === 'acento') s.className = 'c'; else s.style.color = color; return s; }
// Saca lo marcado (un rango) de su marca: lo de antes y lo de después siguen marcados. Devuelve los nodos sacados.
function seLiftRange(M, r) {
  const d = se.d, ra = d.createRange(); ra.setStart(r.endContainer, r.endOffset); ra.setEnd(M, M.childNodes.length); const after = ra.extractContents();
  const rw = d.createRange(); rw.setStart(r.startContainer, r.startOffset); rw.setEnd(M, M.childNodes.length); const mid = rw.extractContents();
  const tail = M.cloneNode(false); tail.appendChild(after); const nodes = [...mid.childNodes]; M.after(...nodes, tail);
  for (const x of [M, tail]) if (!x.textContent.trim() && !x.querySelector('br, .emoji')) x.replaceWith(...x.childNodes);
  return nodes;
}
// Junta marcas iguales que quedaron pegadas, saca las vacías y deja los espacios de las puntas afuera.
function seMergeSpans(el) {
  el.querySelectorAll('span:not(.emoji)').forEach(x => { if (!x.textContent.trim() && !x.querySelector('br, .emoji, svg, img')) x.replaceWith(...x.childNodes); });
  let again = true;
  while (again) {
    again = false;
    for (const sp of el.querySelectorAll('span:not(.emoji)')) {
      let n = sp.nextSibling, ws = null;
      if (n?.nodeType === 3 && /^\s+$/.test(n.data)) { ws = n; n = n.nextSibling; }
      if (n?.nodeType === 1 && n.tagName === 'SPAN' && !n.matches('.emoji') && n.className === sp.className && (n.getAttribute('style') || '') === (sp.getAttribute('style') || '')) {
        if (ws) sp.appendChild(ws); while (n.firstChild) sp.appendChild(n.firstChild); n.remove(); again = true; break;
      }
    }
  }
  for (const sp of el.querySelectorAll('span:not(.emoji)')) {
    const last = sp.lastChild, first = sp.firstChild;
    if (last?.nodeType === 3 && /\s$/.test(last.data) && last.data.trim()) { const m = last.data.match(/\s+$/)[0]; last.data = last.data.slice(0, -m.length); sp.after(se.d.createTextNode(m)); }
    if (first?.nodeType === 3 && /^\s/.test(first.data) && first.data.trim()) { const m = first.data.match(/^\s+/)[0]; first.data = first.data.slice(m.length); sp.before(se.d.createTextNode(m)); }
  }
  el.normalize();
}
// El nodo en cada punta de lo marcado (si la punta cae entre elementos, el elemento de ese lado).
const seAt = (c, o, end) => c.nodeType === 3 ? c : (end ? c.childNodes[o - 1] : c.childNodes[o]) || c;
const seMarked = () => { const sel = se?.d?.getSelection(); if (!se?.editing || !sel?.rangeCount || sel.isCollapsed) return null; const r = sel.getRangeAt(0); return se.editing.contains(r.commonAncestorContainer) ? r : null; };
// Lo marcado como posiciones en el texto (el texto no cambia al resaltar), para volver a marcarlo después.
const seOff = (el, node, off) => { const r = se.d.createRange(); r.selectNodeContents(el); r.setEnd(node, off); return r.toString().length; };
function seSelectOffsets(el, a, b) {
  // El comienzo va al principio del nodo siguiente (adentro de la marca), no al final del anterior.
  const tw = se.d.createTreeWalker(el, NodeFilter.SHOW_TEXT), r = se.d.createRange(); let pos = 0, start = null, last = null;
  for (let n; (n = tw.nextNode());) { last = n; const end = pos + n.data.length; if (start === null && a < end) { r.setStart(n, a - pos); start = n; } if (start && b <= end) { r.setEnd(n, b - pos); break; } pos = end; }
  if (!start && last) { r.setStart(last, last.data.length); r.setEnd(last, last.data.length); start = last; }
  if (start) { const sel = se.d.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
}
// kind «hl» (resaltado) o «col» (letra); color null saca ese estilo. Lo marcado con el mismo color se desmarca.
function seMarkSelection(kind, color) {
  const r = seMarked(); if (!r) { toast('Marcá una o más palabras: arrastrá sobre el texto o hacé doble clic en una.'); return; }
  const el = se.editing, selector = kind === 'hl' ? SE_HL : SE_COL, before = se.editBefore ? null : seSnap(), oa = seOff(el, r.startContainer, r.startOffset), ob = seOff(el, r.endContainer, r.endOffset);
  const M = seMarkUp(seAt(r.startContainer, r.startOffset), el, selector), M2 = seMarkUp(seAt(r.endContainer, r.endOffset, true), el, selector), key = M ? (kind === 'hl' ? seHlKey(M) : seColKey(M)) : undefined;
  const whole = M && (() => { const mr = se.d.createRange(); mr.selectNodeContents(M); return r.compareBoundaryPoints(Range.START_TO_START, mr) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, mr) >= 0; })();
  let nodes;
  if (M && M === M2 && whole) {
    // Lo marcado es toda la marca: se le cambia el color o se la saca entera.
    const kids = [...M.childNodes];
    if (color && key !== color) { const sp = kind === 'hl' ? seHlSpan(color) : seColSpan(color); M.replaceWith(sp); sp.append(...kids); nodes = [sp]; }
    else { M.replaceWith(...kids); nodes = kids; }
  } else if (M && M === M2) {
    nodes = seLiftRange(M, r);
    if (color && key !== color) { const sp = kind === 'hl' ? seHlSpan(color) : seColSpan(color); nodes[0].before(sp); sp.append(...nodes); nodes = [sp]; }
  } else if (color) {
    const sp = kind === 'hl' ? seHlSpan(color) : seColSpan(color); sp.appendChild(r.extractContents()); r.insertNode(sp);
    sp.querySelectorAll(selector).forEach(x => x.replaceWith(...x.childNodes)); nodes = [sp];
  } else {
    [...el.querySelectorAll(selector)].filter(x => r.intersectsNode(x)).forEach(x => x.replaceWith(...x.childNodes)); nodes = [];
  }
  seMergeSpans(el);
  seSelectOffsets(el, oa, ob);
  se.edited.add(el.dataset.se); se.dirty = true; if (before) sePush(before); seSide();
}

// ── Barra, selector de color y panel de la izquierda ──
// Como en Canva: una sola barra arriba que cambia con lo elegido, un solo
// selector de color para todo (texto, palabras marcadas, caja, fondo, acento), el texto se corrige sobre la historia y
// lo que se marca toma el estilo desde la misma barra. A la izquierda, agregar, fondo, capas y chequeo.
let seTab = null;
const SE_FONT_NAME = Object.fromEntries(SE_FONTS);
const SE_BOX_STYLES = [['ninguno', 'Sin fondo'], ['caja', 'Caja'], ['translucida', 'Caja translúcida'], ['resalte', 'Resaltado']];
const seBoxStyle = el => { const v = seBoxValue(el); return v === 'ninguno' ? 'ninguno' : v.includes('translucida') ? 'translucida' : v.startsWith('caja') ? 'caja' : 'resalte'; };
function seSetBoxStyle(el, style) {
  const color = seBoxColor(el) || (style === 'resalte' ? '#ffffff' : '#000000');
  if (style === 'ninguno') { seSetBox(el, 'ninguno'); for (const b of seBoxes(el)) { b.style.removeProperty('--caja'); b.style.removeProperty('--letra'); } return; }
  seSetBox(el, style === 'translucida' ? 'caja translucida' : style);
  if (style !== 'translucida') seColorAct('cajacolor', color === 'acento' ? 'acento' : color);
}
function seSaveButton() { $('seSave').disabled = !se?.dirty || se.busy; $('seSave').textContent = se?.busy ? (se.root && (seVideo() || seVoz()) ? 'Renderizando el video…' : 'Renderizando…') : 'Guardar y renderizar'; $('seUndo').disabled = !se?.undo.length || se?.busy; $('seRedo').disabled = !se?.redo.length || se?.busy; }
// Los mismos números que el chequeo de render.py: el centro a 14 px del eje y el texto entre 240 y 1660 px.
const SE_TOL_CENTRO = 14, SE_ARRIBA = 240, SE_ABAJO = 1660, SE_GANCHO_MAX = 20, SE_HISTORIA_MAX = 47;
const seWarnTarget = el => el.closest('[data-grupo]') || seTop(el) || el;
const seHasText = x => !x.matches('.sticker') && !x.closest('[data-sin-chequeo]') && !x.matches('[data-sin-chequeo]') && /[\p{L}\p{N}]/u.test(x.textContent);
function seWarn(el) {
  if (!el || seKind(el) === 'sticker') return [];
  const r = seInk(el) || el.getBoundingClientRect(), out = [];
  if (seHasText(el) && (r.top < SE_ARRIBA || r.bottom > SE_ABAJO)) out.push('Fuera de la zona segura: Instagram tapa los 250 px de arriba y los 270 de abajo.');
  const g = seWarnTarget(el), rg = seInk(g) || g.getBoundingClientRect();
  if (Math.abs(rg.left + rg.width / 2 - 540) > SE_TOL_CENTRO) out.push('No está centrado sobre el eje vertical.');
  return out;
}
// Chequeo en vivo: lo que el render frena al guardar se ve mientras se edita, cada aviso con su arreglo.
function seWords() {
  let n = 0; const w = se.d.createTreeWalker(se.root, 4);
  while (w.nextNode()) { const p = w.currentNode.parentElement;
    if (!p || p.closest('[data-sin-chequeo], .sticker, .emoji, style, script')) continue;
    const cs = se.w.getComputedStyle(p); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    n += (w.currentNode.textContent.match(/[\p{L}\p{N}]+/gu) || []).length; }
  return n;
}
function seIssues() {
  if (!se?.root || !se.d) return [];
  const out = [];
  for (const x of se.root.children) {
    if (seLayer(x) || x.matches('script, style, audio')) continue;
    const r = seInk(x); if (!r) continue;
    const name = seLabel(x), dx = Math.round(r.left + r.width / 2 - 540);
    if (Math.abs(dx) > SE_TOL_CENTRO) out.push({ el: x, fix: 'centrar', txt: `${name} está corrido ${Math.abs(dx)} px a la ${dx > 0 ? 'derecha' : 'izquierda'}: todo va centrado.` });
    if (seHasText(x) && r.top < SE_ARRIBA) out.push({ el: x, fix: 'bajar', dy: SE_ARRIBA + 20 - r.top, txt: `${name} queda arriba, donde Instagram pone su barra.` });
    else if (seHasText(x) && r.bottom > SE_ABAJO) out.push({ el: x, fix: 'subir', dy: SE_ABAJO - 20 - r.bottom, txt: `${name} queda abajo, donde va la barra de respuesta.` });
  }
  const n = seWords();
  if (se.i === 0 && n > SE_GANCHO_MAX) out.push({ txt: `El gancho tiene ${n} palabras: un gancho que funciona tiene ${SE_GANCHO_MAX} o menos. Dejá un titular corto y pasá el dato a la historia siguiente.` });
  else if (n > SE_HISTORIA_MAX) out.push({ txt: `Tiene ${n} palabras: una historia se lee bien con ${SE_HISTORIA_MAX} o menos. Recortá o partila en dos.` });
  return out;
}
function seFixIssue(x) { if (!x?.el) return; if (x.fix === 'centrar') seCenter(x.el); else if (x.dy) seMoveBy(x.el, 0, Math.round(x.dy)); }
function seIssueBadge() { const n = se?.root ? seIssues().length : 0, b = $('seIssueN'); if (!b) return; b.hidden = !n; b.textContent = n; }
function seSide() { if (!se) return; seSaveButton(); seBar(); seDrawer(); seIssueBadge(); }
const seB = (act, label, o = {}) => `<button class="se-b ${o.on ? 'on' : ''} ${o.cls || ''}" data-act="${act}"${o.val != null ? ` data-val="${esc(o.val)}"` : ''}${o.pop ? ` data-pop="${o.pop}"` : ''} title="${esc(o.title || '')}" ${o.disabled ? 'disabled' : ''}>${label}</button>`;
const seSwatch = c => c === 'acento' ? seAcentoHex() : c || 'transparent';
const seColorBtn = (act, cur, title, kind = 'fill', extra = {}) => `<button class="se-b se-cb ${kind}" data-pop="color" data-act="${act}" data-cur="${esc(cur || '')}" data-auto="${esc(extra.auto || '')}" title="${esc(title)}" ${extra.disabled ? 'disabled' : ''}>${kind === 'text' ? `<span class="se-a">A</span><i style="background:${seSwatch(cur) === 'transparent' ? '#000' : seSwatch(cur)}"></i>` : kind === 'hl' ? `<span class="se-hl" style="background:${seSwatch(cur)};color:${cur ? seOn(seSwatch(cur)) : 'inherit'}">ab</span>` : `<i class="sq" style="background:${seSwatch(cur)}"></i>`}${extra.label ? `<span>${extra.label}</span>` : ''}</button>`;
const seStep = (key, val, title, unit = '') => `<span class="se-step" title="${esc(title)}"><button data-step="${key}" data-d="-1" aria-label="Menos">−</button><input data-stepin="${key}" value="${val}" aria-label="${esc(title)}"><button data-step="${key}" data-d="1" aria-label="Más">+</button>${unit ? `<small>${unit}</small>` : ''}</span>`;
const seSep = '<span class="se-sep"></span>';
// El aviso de lo elegido: si está corrido, el botón lo centra; si está fuera de la zona, lo dice.
function seWarnChip(el) {
  const w = seWarn(el); if (!w.length) return '';
  const centro = w.find(x => x.startsWith('No está centrado'));
  return centro ? seB('centrar-aviso', '⚠ Centrar', { cls: 'warn', title: w.join(' ') + ' Tocá para centrarlo.' }) : `<span class="se-warn" title="${esc(w.join(' '))}">⚠ ${esc(w[0].split(':')[0])}</span>`;
}
function seBar() {
  const bar = $('seBar'); if (!se?.root) { bar.innerHTML = '<span class="muted">Cargando la historia…</span>'; return; }
  const el = se.sel, k = seKind(el);
  const grupo = el && seIsGroup(seTop(el) || el) ? seB('desagrupar', '⧈ Desagrupar', { title: 'Separar las piezas para moverlas sueltas (Cmd+Shift+G)' }) : '';
  const right = el ? `<span class="se-grow"></span>${grupo}${seWarnChip(el)}${seB('pos', 'Posición ▾', { pop: 'pos', title: 'Centrar, traer adelante, enviar atrás' })}${seB('duplicar', '⧉', { title: 'Duplicar (Cmd+D)' })}${seB('borrar', '🗑', { title: 'Borrar (Supr)', cls: 'danger' })}` : '';
  let html = '';
  if (se.editing) {
    const r = seMarked(), at = r && seAt(r.startContainer, r.startOffset), M = r && seMarkUp(at, se.editing, SE_HL), C = r && seMarkUp(at, se.editing, SE_COL);
    html = `<span class="se-label">Corrigiendo el texto</span>${seSep}
      ${seColorBtn('sel-col', C ? seColKey(C) : '', 'Color de la letra de lo marcado', 'text', { disabled: !r, auto: 'Sacarle el color' })}
      ${seColorBtn('sel-hl', M ? seHlKey(M) || '' : '', 'Resaltar lo marcado', 'hl', { disabled: !r, label: 'Resaltar', auto: 'Sacar el resaltado' })}
      <span class="se-hint">${r ? 'Elegí un color para lo marcado. El mismo color otra vez lo saca.' : 'Marcá palabras arrastrando o con doble clic. Enter corta el renglón.'}</span>
      <span class="se-grow"></span>${seB('fin-edit', 'Listo', { cls: 'primary' })}`;
  } else if (se.multi?.size >= 2) {
    html = `<span class="se-label">${se.multi.size} elementos elegidos</span>${seSep}${seB('agrupar', '▣ Agrupar', { title: 'Unirlos en un grupo que se mueve como uno (Cmd+G)' })}${seB('multi-centrar', 'Centrar', { title: 'Centrar el conjunto' })}
      <span class="se-grow"></span><span class="se-hint">Arrastralos para moverlos juntos. Shift+clic suma o saca uno.</span>${seB('multi-borrar', '🗑', { title: 'Borrar los elegidos', cls: 'danger' })}`;
  } else if (!el) {
    const bg = seBgValue(), img = seFondo()?.querySelector('img'), a = seAten();
    html = `${seColorBtn('bgcolor', bg === 'foto' ? '' : bg, 'Color de fondo', 'fill', { label: 'Fondo' })}
      ${seB('bg-foto', bg === 'foto' ? '🖼️ Cambiar foto' : '🖼️ Poner foto', { title: 'Elegir una foto de tu carpeta de fotos' })}
      ${bg === 'foto' && img ? `${seSep}<span class="se-lab">Zoom</span>${seStep('zoom', seZoom().toFixed(1), 'Zoom de la foto', '×')}<span class="se-lab">Oscurecer</span>${seStep('aten', a ? Math.round((parseFloat(a.style.getPropertyValue('--atenuar') || se.w.getComputedStyle(a).getPropertyValue('--atenuar')) || .4) * 100) : 0, 'Oscurecer la foto', '%')}` : ''}
      ${seSep}${seColorBtn('acento', seAcentoHex(), 'Color de acento: el de las cajas y resaltados «del color» y las palabras pintadas con A', 'fill', { label: 'Acento' })}
      <span class="se-grow"></span><span class="se-hint">Tocá un texto, emoji o imagen para editarlo.${bg === 'foto' ? ' Arrastrá la foto para encuadrarla.' : ''}</span>`;
  } else if (k === 'texto' || k === 'bloque') {
    const fs = Math.round(parseFloat(se.w.getComputedStyle(seBoxEl(el)).fontSize)), bs = seBoxStyle(el);
    html = `${seB('font', (SE_FONT_NAME[seFontValue(el)] || 'Letra') + ' ▾', { pop: 'font', title: 'Letra' })}
      ${seStep('fs', fs, 'Tamaño de la letra')}
      ${seColorBtn('color', seTextColor(el), 'Color de la letra', 'text', { auto: 'El que trae el estilo' })}${seSep}
      ${seB('boxstyle', (SE_BOX_STYLES.find(([v]) => v === bs)?.[1] || 'Fondo') + ' ▾', { pop: 'box', title: 'Fondo del texto, como el botón «A» de Instagram' })}
      ${bs !== 'ninguno' && bs !== 'translucida' ? seColorBtn('cajacolor', seBoxColor(el), 'Color del fondo del texto', 'fill') : ''}${seSep}
      ${seB('more-text', 'Espaciado ▾', { pop: 'texto', title: 'Interlineado y sombra' })}
      ${seB('editar', '✏️ Editar texto', { title: 'Corregir el texto y marcar palabras para resaltarlas (o doble clic)' })}${right}`;
  } else if (k === 'emoji') {
    html = `${seStep('fs', Math.round(parseFloat(se.w.getComputedStyle(el).fontSize)), 'Tamaño')}${seB('emoji', el.textContent.trim() + ' Cambiar ▾', { pop: 'emoji', title: 'Cambiar el emoji' })}${right}`;
  } else if (k === 'imagen') {
    const cs = se.w.getComputedStyle(el);
    if (se.crop?.el === el) { bar.innerHTML = `<span class="se-label">✂️ Recortando</span><span class="se-hint">Arrastrá los bordes para cortar la imagen y adentro para correrla.</span><span class="se-grow"></span>${seB('recortar-fin', 'Listo', { cls: 'primary' })}`; return; }
    html = `${seCropImg(el) ? seB('recortar', '✂️ Recortar', { title: 'Cortar los bordes de la imagen (o doble clic)' }) + seB('tapar', el.querySelector(':scope > [data-tapa]') ? '🔓 Destapar' : '🔒 Tapar', { title: 'Borronear la captura y ponerle un candado: el recurso se ve pero no se lee' }) + seSep : ''}<span class="se-lab">Ancho</span>${seStep('w', Math.round(el.getBoundingClientRect().width), 'Ancho de la imagen', 'px')}${seB('forma', 'Forma ▾', { pop: 'forma', title: 'Rectángulo, redondeada o círculo' })}<span class="se-lab">Bordes</span>${seStep('radio', Math.round(parseFloat(cs.borderRadius) || 0), 'Bordes redondeados', 'px')}${seB('sombra', 'Sombra', { on: cs.boxShadow !== 'none', title: 'Sombra de la imagen' })}${right}`;
  } else if (k === 'dibujo') {
    html = `${seColorBtn('trazo', /acento/.test(el.style.getPropertyValue('--trazo')) ? 'acento' : seHex(el.style.getPropertyValue('--trazo')) || '#ffffff', 'Color de la flecha', 'fill', { auto: 'Blanco, el del lápiz' })}<span class="se-lab">Grosor</span>${seStep('trazo', Math.round(parseFloat(se.w.getComputedStyle(el).strokeWidth) || 11), 'Grosor del trazo')}${right}`;
  } else if (k === 'sticker') {
    html = `<span class="se-label">${esc(seLabel(el))}</span>${right}`;
  }
  bar.innerHTML = html;
}
// El panel de la izquierda (se abre con los botones del costado).
function seDrawer() {
  const box = $('seDrawer'); document.querySelectorAll('#storyEditor [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === seTab));
  box.hidden = !seTab; if (!seTab || !se?.root) return;
  if (seTab === 'agregar') {
    box.innerHTML = `<h4>Texto</h4><div class="se-adds">
        <button data-act="add" data-val="texto:caja" class="se-add"><span class="pv caja">Texto en caja</span></button>
        <button data-act="add" data-val="texto:resalte" class="se-add"><span class="pv resalte">Texto resaltado</span></button>
        <button data-act="add" data-val="texto:suelto" class="se-add"><span class="pv suelto">Texto suelto</span></button></div>
      <h4>Emojis</h4><div class="se-emojis">${SE_EMOJIS.map(x => `<button data-act="add" data-val="emoji:${x}">${x}</button>`).join('')}</div>
      <h4>Flechas</h4><div class="se-adds row"><button data-act="add" data-val="flecha:abajo" class="se-add">⤵︎ Hacia abajo</button><button data-act="add" data-val="flecha:curva" class="se-add">↷ Curva</button></div>
      <h4>Sticker</h4><div class="se-adds row"><button data-act="add" data-val="sticker:zona segura" class="se-add" title="Deja libre el lugar de un sticker de Instagram (encuesta, link, mención): el diseño no lo tapa">▭ Lugar para un sticker</button></div>
      <h4>Recursos</h4><div class="se-adds">${se.recursos ? (se.recursos.map(r => `<button data-act="add-recurso" data-val="${esc(r.id)}" class="se-add">${r.id === 'chat' ? '💬' : r.id === 'archivo' ? '📄' : '✨'} ${esc(r.nombre)}</button>`).join('') || '<p class="hint">No encontré motor-historias/recursos.html.</p>') : '<p class="hint">Cargando…</p>'}</div>
      <p class="hint">Para tapar una captura del recurso, elegila y tocá «Tapar». El chat de WhatsApp recrea un chat real o una broma que se nota: nunca una reacción inventada.</p>`;
    if (!se.recursos && !se.recursosLoading) { se.recursosLoading = true; api('stories/recursos').then(r => { const doc = new DOMParser().parseFromString(r.html || '', 'text/html'); se.recursosDoc = doc; se.recursos = [...doc.querySelectorAll('.historia > [data-recurso]')].filter(x => x.dataset.recurso !== 'tapado').map(x => ({ id: x.dataset.recurso, nombre: x.dataset.nombre || x.dataset.recurso })); }, () => { se.recursos = []; }).finally(() => { if (se) { se.recursosLoading = false; if (seTab === 'agregar') seDrawer(); } }); }
  } else if (seTab === 'imagenes') {
    box.innerHTML = `<h4>Subir</h4><label class="se-upload"><input type="file" accept="image/*,.heic,.heif" multiple data-upload hidden>⬆︎ Subir fotos o capturas</label>
      <p class="hint">También podés arrastrarlas sobre la historia o pegar una captura con Cmd+V.</p>
      <h4>Tus fotos</h4><button class="se-add" data-act="img-catalogo">Elegir de tu carpeta de fotos</button>
      <h4>De esta semana</h4><div class="se-imgs">${se.assets ? (se.assets.map(a => `<button class="se-img" data-act="add-img" data-val="${esc(a.src)}" title="${esc(a.src.split('/').pop())}"><img src="${esc(se.src.base + a.src)}" loading="lazy" alt=""></button>`).join('') || '<p class="hint">Todavía no hay imágenes.</p>') : '<p class="hint">Cargando…</p>'}</div>`;
    if (!se.assets && !se.assetsLoading) { se.assetsLoading = true; api('stories/assets?imagen=' + encodeURIComponent(se.img)).then(r => { se.assets = r.imagenes; }, () => { se.assets = []; }).finally(() => { if (se) { se.assetsLoading = false; if (seTab === 'imagenes') seDrawer(); } }); }
  } else if (seTab === 'fondo') {
    const bg = seBgValue(), vid = seVideo(), img = vid ? null : seFondo()?.querySelector('img');
    if (vid && !se.videoMeta && !se.videoMetaLoading) seLoadVideoMeta(vid);
    box.innerHTML = `<h4>Foto</h4>${img ? `<div class="se-fondo-foto"><img src="${esc(se.src.base + img.getAttribute('src'))}" alt=""><span class="muted">${esc((img.getAttribute('src') || '').split('/').pop())}</span></div>` : ''}
      <div class="se-adds row">${seB('bg-foto', img ? 'Cambiar foto' : 'Poner una foto')}${img ? seB('bg-sinfoto', 'Sacar la foto') : ''}</div>
      <h4>Video</h4>${seVideoBox(vid)}
      <h4>Color liso</h4><div class="se-colors big">${SE_PALETTE.map(([h, n]) => `<button class="se-color ${bg === h ? 'on' : ''}" data-act="bgcolor" data-val="${h}" title="${n}" style="background:${h}"></button>`).join('')}<label class="se-color custom" title="Otro color"><input type="color" data-act="bgcolor" value="${bg.startsWith('#') ? bg : '#ff3366'}"></label></div>`;
  } else if (seTab === 'audio') {
    const a = seVoz(), busy = /audio/i.test(se.mediaBusy || '');
    box.innerHTML = `<h4>Voz en off</h4>${a ? `<audio controls preload="metadata" src="${esc(se.src.base + a.getAttribute('src'))}"></audio>
        <div class="se-tramo"><label>Empieza en <input type="number" min="0" step="0.05" data-voz="inicio" value="${esc(a.dataset.inicio || '0')}"> s</label></div>
        <div class="se-adds row">${seB('voz-probar', se.play ? '■ Parar' : (seVideo() ? '▶ Probar con el video' : '▶ Probar'))}${seB('voz-sacar', 'Sacar la voz')}</div>` : '<p class="hint">Sin voz en off. Subí un audio o elegí una voz de la carpeta voces/ de la semana.</p>'}
      <p class="hint">La historia dura ${seFmtS(se.dur)} s${seVideo() ? ` · el video, ${seFmtS(seVideoDur())} s` : ''}${a && seVozFin() ? ` · la voz termina en ${seFmtS(seVozFin())} s` : ''}.${a && seVideo() && seVozFin() > seVideoDur() ? ' El video termina antes que la voz: el último cuadro queda quieto.' : ''}</p>
      <h4>Subir</h4>${busy ? `<p class="hint busy">${esc(se.mediaBusy)}</p>` : '<label class="se-upload"><input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" data-upload-audio hidden>⬆︎ Subir un audio</label>'}
      <h4>Voces de la semana</h4><div class="se-voces">${se.voces ? (se.voces.map((v, k) => `<button class="se-add" data-act="voz-elegir" data-val="${k}" title="${esc(v.path)}">🎙 ${esc(v.nombre)}${v.duracion ? ` · ${seFmtS(v.duracion)} s` : ''}${a && v.src && v.src === a.getAttribute('src') ? ' · en uso' : ''}</button>`).join('') || '<p class="hint">No hay voces en la carpeta voces/ de la semana.</p>') : '<p class="hint">Cargando…</p>'}</div>`;
    if (!se.voces && !se.vocesLoading) { se.vocesLoading = true; api('stories/voices?imagen=' + encodeURIComponent(se.img)).then(r => { se.voces = r.voces; }, () => { se.voces = []; }).finally(() => { if (se) { se.vocesLoading = false; if (seTab === 'audio') seDrawer(); } }); }
  } else if (seTab === 'capas') {
    const items = [...se.root.children].filter(x => !x.matches('script, audio')).reverse();
    box.innerHTML = `<h4>Capas</h4><p class="hint">De adelante hacia atrás. Tocá una para elegirla.</p>${items.map(x => `<div class="se-layer ${x === se.sel || x.contains(se.sel) ? 'on' : ''} ${seLayer(x) ? 'fija' : ''}"><button class="se-layer-name" data-act="layer" data-val="${esc(x.dataset.se || '')}">${esc(seLabel(x))}</button>${seLayer(x) ? '' : `<button class="icon" data-act="layer-up" data-val="${esc(x.dataset.se || '')}" title="Adelante">↑</button><button class="icon" data-act="layer-down" data-val="${esc(x.dataset.se || '')}" title="Atrás">↓</button>`}</div>`).join('')}`;
  } else if (seTab === 'chequeo') {
    const is = seIssues(), arreglables = is.filter(x => x.el && x.fix).length;
    box.innerHTML = `<h4>Ahora</h4>${is.length ? `${arreglables > 1 ? `<div class="se-adds row">${seB('issue-all', `Arreglar los ${arreglables}`, { cls: 'primary' })}</div>` : ''}<ul class="se-issues">${is.map((x, k) => `<li><span>${esc(x.txt)}</span>${x.el ? `<span class="se-issue-acts">${seB('issue-pick', 'Elegir', { val: k })}${x.fix ? seB('issue-fix', x.fix === 'centrar' ? 'Centrar' : x.fix === 'bajar' ? 'Bajar' : 'Subir', { val: k, cls: 'primary' }) : ''}</span>` : ''}</li>`).join('')}</ul>` : '<p class="hint ok">Todo centrado, adentro de la zona segura y con un largo que se lee de un vistazo.</p>'}
      <h4>Al guardar</h4>${se.check?.html || '<p class="hint">El render mide además el contraste, los renglones disparejos y las caras tapadas.</p>'}${se.check?.img ? `<img class="se-result-img" src="${esc(se.check.img)}" alt="Historia renderizada">` : ''}`;
  }
}
// Un solo popover para todo: colores, letra, fondo del texto, emoji, posición, interlineado, sticker.
function seUsedColors() {
  const set = new Set();
  for (const x of se.root.querySelectorAll('*')) { const cs = se.w.getComputedStyle(x); for (const v of [x.style.color, x.style.getPropertyValue('--caja'), x.matches('.caja, .resalte') ? cs.backgroundColor : '']) { const h = seHex(v); if (h && h !== '#000000' && h !== '#ffffff') set.add(h); } }
  if (se.root.style.backgroundColor) set.add(seHex(se.root.style.backgroundColor));
  const ac = seAcentoHex(); return [...set].filter(h => h && h !== ac).slice(0, 10);
}
function seOpenPop(btn) {
  const kind = btn.dataset.pop, act = btn.dataset.act, el = se.sel, pop = $('sePop');
  let html = '';
  if (kind === 'color') {
    const cur = btn.dataset.cur, auto = btn.dataset.auto, sw = (h, n, extra = '') => `<button class="se-color ${cur === h || seHex(cur) === h ? 'on' : ''}" data-pick="${h}" title="${esc(n)}" style="background:${h === 'acento' ? seAcentoHex() : h}"${extra}></button>`;
    html = `<h5>De esta historia</h5><div class="se-colors">${act === 'acento' ? sw(seAcentoHex(), 'El acento actual') : `<button class="se-color acento ${cur === 'acento' ? 'on' : ''}" data-pick="acento" title="El acento de la historia" style="background:${seAcentoHex()};color:${seOn(seAcentoHex())}">A</button>`}${seUsedColors().map(h => sw(h, h)).join('')}</div>
      <h5>Colores de Instagram</h5><div class="se-colors">${SE_PALETTE.map(([h, n]) => sw(h, n)).join('')}</div>
      <div class="se-pop-row"><label class="se-color custom" title="Elegir cualquier color"><input type="color" data-pick-input value="${seHex(cur) || '#ff3366'}"></label><span>Otro color</span>${auto ? `<button class="se-b" data-pick="">${esc(auto)}</button>` : ''}</div>`;
  } else if (kind === 'font') html = SE_FONTS.map(([v, n]) => `<button class="se-pop-item ${seFontValue(el) === v ? 'on' : ''}" data-pick="${v}" style="font-family:${v === 'serif' ? 'Georgia, serif' : v === 'maquina' ? '\'Courier New\', monospace' : 'var(--sans)'}">${n}</button>`).join('');
  else if (kind === 'box') html = SE_BOX_STYLES.map(([v, n]) => `<button class="se-pop-item ${seBoxStyle(el) === v ? 'on' : ''}" data-pick="${v}"><span class="pv ${v}">Aa</span>${n}</button>`).join('');
  else if (kind === 'emoji') html = `<div class="se-emojis">${SE_EMOJIS.map(x => `<button data-pick="${x}">${x}</button>`).join('')}</div><input class="se-input" data-pick-text placeholder="O escribí otro y Enter" maxlength="8">`;
  else if (kind === 'pos') html = `${seTop(el) && seTop(el) !== el ? '<button class="se-pop-item" data-pick="padre">Elegir el bloque entero</button>' : ''}<button class="se-pop-item" data-pick="centrar">Centrar</button><button class="se-pop-item" data-pick="adelante">Traer adelante</button><button class="se-pop-item" data-pick="atras">Enviar atrás</button>${se.orig.has(el.dataset.se) ? '<button class="se-pop-item" data-pick="reset">Volver a su lugar</button>' : ''}`;
  else if (kind === 'texto') { const b = seBoxEl(el), bcs = se.w.getComputedStyle(b), lh = ((parseFloat(bcs.lineHeight) / parseFloat(bcs.fontSize)) || 1.2).toFixed(2), sombra = el.classList.contains('suelto') || !!el.querySelector('.suelto');
    html = `<div class="se-pop-row"><span>Interlineado</span>${seStep('lh', lh, 'Interlineado')}</div><button class="se-pop-item ${sombra ? 'on' : ''}" data-pick="sombra">${sombra ? '☑' : '☐'} Sombra suave (texto blanco sobre foto)</button>`; }
  else if (kind === 'forma') html = [['rect', 'Rectángulo'], ['redondeada', 'Bordes redondeados'], ['circulo', 'Círculo']].map(([v, n]) => `<button class="se-pop-item" data-pick="${v}"><span class="pv-forma ${v}"></span>${n}</button>`).join('');
  pop.innerHTML = html; pop.dataset.kind = kind; pop.dataset.act = act; pop.hidden = false;
  const r = btn.getBoundingClientRect(), d = $('storyEditor').getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left - d.left, d.width - pop.offsetWidth - 8)) + 'px'; pop.style.top = (r.bottom - d.top + 6) + 'px';
}
const seClosePop = () => { $('sePop').hidden = true; };
function sePick(kind, act, val) {
  const el = se.sel;
  if (kind === 'color') {
    if (act === 'sel-hl') return seMarkSelection('hl', val || null);
    if (act === 'sel-col') return seMarkSelection('col', val || null);
    return seChange(() => seColorAct(act, val));
  }
  if (!el) return;
  if (kind === 'font') return seChange(() => seSetFont(el, val));
  if (kind === 'box') return seChange(() => seSetBoxStyle(el, val));
  if (kind === 'emoji') return seChange(() => { el.textContent = val; });
  if (kind === 'forma') return seChange(() => {
    if (val === 'circulo') { const r0 = el.getBoundingClientRect(), side = Math.round(Math.min(r0.width, r0.height)); seSetSize(el, side, side, r0); el.style.borderRadius = '50%'; }
    else el.style.borderRadius = val === 'rect' ? '0px' : '18px';
  });
  if (kind === 'texto' && val === 'sombra') return seChange(() => { const t = el.querySelector('.suelto') || el; t.classList.toggle('suelto'); });
  if (kind === 'pos') {
    if (val === 'padre') return seSelect(seTop(el));
    if (val === 'centrar') return seChange(() => seCenter(el));
    if (val === 'adelante') return seOrder(seTop(el) || el, 1);
    if (val === 'atras') return seOrder(seTop(el) || el, -1);
    if (val === 'reset') return seChange(() => seRestore(el, se.orig.get(el.dataset.se)));
  }
}
// Pasos (− +) de tamaño, ancho, bordes, grosor, zoom, oscurecer e interlineado.
const SE_STEP = { fs: 2, w: 20, radio: 4, trazo: 1, zoom: .1, aten: 5, lh: .05 };
function seStepTo(key, v) {
  const el = se.sel;
  seChange(() => {
    if (key === 'fs' && el) { const base = parseFloat(se.w.getComputedStyle(seKind(el) === 'emoji' ? el : seBoxEl(el)).fontSize); seScaleFont(seFontTargets(el), Math.max(8, v) / base); }
    else if (key === 'w' && el) { const r0 = el.getBoundingClientRect(); seSetSize(el, Math.max(40, v), Math.round(Math.max(40, v) * r0.height / r0.width), r0); }
    else if (key === 'radio' && el) el.style.borderRadius = Math.max(0, v) + 'px';
    else if (key === 'trazo' && el) el.style.strokeWidth = String(Math.max(1, v));
    else if (key === 'lh' && el) seBoxEl(el).style.lineHeight = String(Math.max(.7, Math.round(v * 100) / 100));
    else if (key === 'zoom') { const f = seFondo(), z = Math.max(1, Math.min(3, Math.round(v * 10) / 10)); if (f) { if (z === 1) f.style.removeProperty('transform'); else f.style.transform = `scale(${z})`; } }
    else if (key === 'aten') { const p = Math.max(0, Math.min(80, v)); seSetAten(p > 0, p / 100); }
  });
}
function seStepClick(key, dir) {
  const inp = document.querySelector(`#storyEditor [data-stepin="${key}"]`), v = parseFloat(inp?.value) || 0;
  seStepTo(key, Math.round((v + dir * SE_STEP[key]) * 100) / 100);
}
document.querySelector('#storyEditor').addEventListener('click', e => {
  if (!se?.root) return;
  const pick = e.target.closest('#sePop [data-pick]');
  if (pick) { const p = $('sePop'); seClosePop(); sePick(p.dataset.kind, p.dataset.act, pick.dataset.pick); return; }
  if (e.target.closest('#sePop')) return;
  const st = e.target.closest('[data-step]'); if (st) { seStepClick(st.dataset.step, Number(st.dataset.d)); return; }
  const tab = e.target.closest('[data-tab]'); if (tab) { seTab = seTab === tab.dataset.tab ? null : tab.dataset.tab; seClosePop(); seDrawer(); return; }
  const b = e.target.closest('[data-act]'); seClosePop();
  if (!b || b.matches('input')) return;
  if (b.dataset.pop) { seOpenPop(b); return; }
  const act = b.dataset.act, val = b.dataset.val ?? '', el = se.sel;
  switch (act) {
    case 'bgcolor': return seChange(() => seColorAct('bgcolor', val));
    case 'bg-foto': return openPicker();
    case 'img-catalogo': return openPicker('sticker');
    case 'add-img': return seAddImage(val);
    case 'bg-sinfoto': return seChange(() => seColorAct('bgcolor', '#ffffff'));
    case 'video-tramo': return seTrimVideo();
    case 'video-sacar': seParar(); se.videoMeta = null; return seChange(() => { seFondo()?.remove(); seAten()?.remove(); se.root.classList.add('lisa', 'negra'); seAjustarDuracion(); });
    case 'voz-probar': return seProbar();
    case 'voz-sacar': seParar(); return seChange(() => { seVoz()?.remove(); seAjustarDuracion(); });
    case 'voz-elegir': return se.voces?.[+val] && seElegirVoz(se.voces[+val]);
    case 'add': { const [kind, v] = val.split(/:(.*)/s); return seAdd(kind, v); }
    case 'layer': { const x = seById(val); return seSelect(x && !seLayer(x) ? x : null); }
    case 'layer-up': return seOrder(seById(val), 1);
    case 'layer-down': return seOrder(seById(val), -1);
    case 'editar': return el && seStartEdit(el);
    case 'agrupar': return seGroup();
    case 'desagrupar': return seUngroup(el ? seTop(el) || el : null);
    case 'centrar-aviso': return el && seChange(() => seCenter(seWarnTarget(el)));
    case 'issue-fix': { const x = seIssues()[+val]; return x && seChange(() => seFixIssue(x)); }
    case 'issue-pick': { const x = seIssues()[+val]; return x?.el && seSelect(x.el); }
    case 'issue-all': return seChange(() => { for (let k = 0; k < 20; k++) { const x = seIssues().find(y => y.el && y.fix); if (!x) break; seFixIssue(x); } });
    case 'multi-centrar': return seChange(() => { const r = seUnion([...se.multi]), dx = Math.round(540 - (r.left + r.width / 2)); if (dx) se.multi.forEach(x => seMoveBy(x, dx, 0)); });
    case 'multi-borrar': { const l = [...se.multi]; seSelectMany([]); return seChange(() => l.forEach(x => x.remove())); }
    case 'recortar': return el && seStartCrop(el);
    case 'add-recurso': return seAddRecurso(val);
    case 'tapar': return el && seTapar(el);
    case 'recortar-fin': return seEndCrop();
    case 'fin-edit': return seEndEdit();
    case 'duplicar': return seDuplicate();
    case 'borrar': return seDelete();
    case 'sombra': return el && seChange(() => { el.style.boxShadow = se.w.getComputedStyle(el).boxShadow !== 'none' ? 'none' : '0 18px 40px rgba(0, 0, 0, .35)'; });
  }
});
document.querySelector('#storyEditor').addEventListener('change', e => {
  const t = e.target; if (!se?.root) return;
  if (t.matches('[data-stepin]')) { const v = parseFloat(String(t.value).replace(',', '.')); if (Number.isFinite(v)) seStepTo(t.dataset.stepin, v); else seSide(); }
  else if (t.matches('[data-upload]')) { seUploadFiles(t.files); t.value = ''; }
  else if (t.matches('[data-upload-video]')) { seUploadVideo(t.files[0]); t.value = ''; }
  else if (t.matches('[data-upload-audio]')) { seUploadAudio(t.files[0]); t.value = ''; }
  else if (t.matches('[data-voz="inicio"]')) { const v = Math.max(0, parseFloat(String(t.value).replace(',', '.')) || 0); seChange(() => { const a = seVoz(); if (a) { a.dataset.inicio = String(Math.round(v * 100) / 100); seAjustarDuracion(); } }); seDrawer(); }
  else if (t.matches('[data-pick-input]')) { const p = $('sePop'); sePick('color', p.dataset.act, seHex(t.value)); seClosePop(); }
  else if (t.matches('input[type=color][data-act="bgcolor"]')) seChange(() => seColorAct('bgcolor', seHex(t.value)));
});
document.querySelector('#storyEditor').addEventListener('keydown', e => {
  const t = e.target;
  if (t.matches('[data-stepin]') && e.key === 'Enter') { e.preventDefault(); t.blur(); }
  if (t.matches('[data-pick-text]') && e.key === 'Enter' && t.value.trim()) { e.preventDefault(); sePick('emoji', '', t.value.trim()); seClosePop(); }
  if (e.key === 'Escape' && !$('sePop').hidden) { e.preventDefault(); e.stopPropagation(); seClosePop(); }
}, true);
const seById = id => id ? se.root.querySelector(`[data-se="${CSS.escape(id)}"]`) : null;
$('seUndo').onclick = seUndo; $('seRedo').onclick = seRedo;
$('seGuides').onchange = () => se?.d?.documentElement.classList.toggle('guias', $('seGuides').checked);

// ── Guardar ──
// El HTML original con la historia editada: se reemplaza el contenido de .historia (y sus clases), y los scripts que
// el archivo tenía adentro vuelven a su lugar. El texto de semana.json se corrige igual.
function seBuild() {
  const out = se.doc.cloneNode(true), oroot = out.querySelector('.historia');
  const plano = el => { const c = el.cloneNode(true); c.querySelectorAll('.sticker, script, style, svg, .emoji, [data-caja]').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
  const clone = se.root.cloneNode(true);
  for (const x of [clone, ...clone.querySelectorAll('*')]) { x.removeAttribute('contenteditable'); x.removeAttribute('spellcheck'); x.classList?.remove('se-hover', 'se-multi', 'se-crop'); if (x.getAttribute('class') === '') x.removeAttribute('class'); }
  // Scripts de adentro de la historia: después del elemento que los precedía (o al final de su contenedor).
  for (const sc of [...oroot.querySelectorAll('script')]) {
    const parentId = sc.parentElement.dataset.se, prev = sc.previousElementSibling?.dataset.se;
    const parent = parentId === '0' ? clone : clone.querySelector(`[data-se="${parentId}"]`) || clone, after = prev ? parent.querySelector(`:scope > [data-se="${prev}"]`) : null;
    // También el espacio que lo precedía: el script vuelve justo después de ese espacio, no pegado al elemento.
    const copy = sc.cloneNode(true), ws = sc.previousSibling?.nodeType === 3 ? sc.previousSibling.data : '', nx = after?.nextSibling;
    if (after && ws && nx?.nodeType === 3 && nx.data.startsWith(ws)) nx.splitText(ws.length).before(copy);
    else if (after) after.after(copy); else parent.appendChild(copy);
  }
  // Pares de texto corregido (antes y después), para corregir el texto de la historia en semana.json.
  const pares = [];
  for (const id of se.edited) { const o = oroot.querySelector(`[data-se="${id}"]`), v = clone.querySelector(`[data-se="${id}"]`); const a = o ? plano(o) : '', b = v ? plano(v) : ''; if (a !== b) pares.push([a, b]); }
  const antes = plano(oroot), despues = plano(clone);
  for (const x of [clone, ...clone.querySelectorAll('[data-se]')]) x.removeAttribute('data-se');
  for (const a of [...oroot.attributes]) oroot.removeAttribute(a.name);
  for (const a of [...clone.attributes]) oroot.setAttribute(a.name, a.value);
  oroot.innerHTML = clone.innerHTML;
  out.querySelectorAll('[data-se]').forEach(x => x.removeAttribute('data-se'));
  let texto;
  if (antes !== despues) {
    const t0 = se.h.texto || storyByImg()[se.img]?.texto || '';
    texto = pares.length && pares.every(([a]) => a && t0.includes(a)) ? pares.reduce((t, [a, b]) => t.replace(a, b), t0) : despues;
  }
  // El salto de línea final del archivo el parser lo mete en <body>: se saca para no sumar uno en cada guardado.
  const last = out.body?.lastChild; if (last?.nodeType === 3 && /^\s*$/.test(last.data) && se.src.html.endsWith('\n')) last.data = last.data.replace(/\n$/, '');
  // Los trazos SVG vuelven a escribirse cerrados en sí mismos, como en el archivo (<path …/>).
  const html = ('<!doctype html>\n' + out.documentElement.outerHTML + '\n').replace(/<(path|circle|line|rect|polyline|polygon|ellipse)\b([^>]*)><\/\1>/g, '<$1$2/>').replace(/(\sdata-[\w-]+)=""/g, '$1');
  return { html, texto };
}
$('seSave').onclick = async () => {
  if (!se || se.busy || !se.dirty) return; seEndEdit(); seSelect(null);
  se.busy = true; se.check = { html: '<p class="hint">Renderizando la historia con el chequeo…</p>' }; seTab = 'chequeo'; seSide();
  try {
    const { html, texto } = seBuild();
    const r = await api('stories/edit', post({ imagen: se.img, html, mtime: se.src.mtime, ...(texto !== undefined ? { texto } : {}) }));
    if (r.html_mtime) se.src.mtime = r.html_mtime;
    se.dirty = false;
    se.check = { html: r.sin_cambios ? '<p class="hint">No había cambios para guardar.</p>' : r.avisos?.length ? `<p class="hint warn"><b>El chequeo avisa:</b></p><ul class="se-avisos">${r.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p class="hint ok">Guardada. El chequeo no encontró problemas.</p>', img: r.sin_cambios ? null : '/api/planner/poster?path=' + encodeURIComponent(se.img) + '&v=' + r.mtime };
    const queued = stories.data?.cola?.[se.img];
    if (!r.sin_cambios) toast(queued && queued.estado !== 'publicada' ? 'Historia guardada. Ya estaba en Postiz: tocá Programar para reemplazarla.' : 'Historia guardada.');
    stories.week = null; await loadStories();
    const s = allSeqs().find(x => x.orig === sbState?.s.orig); if (s) { sbState = { ...sbState, s, byImg: storyByImg() }; if ($('storyBox').open) showStory(); }
  } catch (e) { se.check = { html: `<p class="hint bad">${esc(e.message)}</p>` }; }
  finally { if (se) { se.busy = false; seSide(); } }
};
function seClose() {
  if (!se) { $('storyEditor').close(); return; }
  if (se.busy) return;
  if (se.dirty && !confirm('Tenés cambios sin guardar en esta historia. ¿Cerrar igual?')) return;
  $('storyEditor').close();
}
$('seClose').onclick = seClose;
$('storyEditor').addEventListener('cancel', e => { e.preventDefault(); if (!$('sePop').hidden) seClosePop(); else if (se?.editing) seEndEdit(); else if (se?.sel) seSelect(null); else seClose(); });
document.addEventListener('paste', e => { if (!$('storyEditor').open || !se?.root || se.editing || e.target.closest?.('input, textarea, [contenteditable]')) return; sePasteImage(e); });
// El aviso de cierre llega después: si para entonces se abrió otra historia, no se toca.
$('storyEditor').addEventListener('close', () => { if ($('storyEditor').open) return; seParar(); try { se?.mv?.destroy(); } catch {} $('seFrame').srcdoc = ''; se = null; });

// Elegir una foto de tu carpeta (planner.config.json → historias.fotos) para el fondo o como sticker. La foto se
// copia a la carpeta de la semana y entra al editor centrada; el encuadre se ajusta arrastrándola.
let catalogo = null, catalogoDir = null, pp = null;
// La copia en la semana lleva el nombre del original, sin acentos ni espacios.
const fotoSlug = a => String(a || '').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60);
const catOf = foto => { const k = fotoSlug(foto); return k ? catalogo.find(f => fotoSlug(f.archivo) === k) : null; };
async function openPicker(mode = 'fondo') {
  if (!se?.root) return; const img = se.root.querySelector('.fondo > img');
  try { if (!catalogo) { const r = await api('catalog'); catalogo = r.fotos; catalogoDir = r.carpeta; } } catch (e) { toast(e.message); return; }
  if (!catalogoDir) { toast('Para elegir fotos, poné tu carpeta de fotos en planner.config.json → historias.fotos. Mientras tanto, subilas desde Imágenes.'); return; }
  if (!catalogo.length) { toast('No encuentro fotos en ' + catalogoDir + '.'); return; }
  const enUso = new Set((stories.data?.semana?.dias || []).flatMap(d => d.historias.map(k => k.fondo && catOf(k.fondo.foto)?.id).filter(Boolean)));
  const actual = img ? catOf((img.getAttribute('src') || '').split('/').pop())?.id || null : null;
  pp = { sel: mode === 'sticker' ? null : actual, actual: mode === 'sticker' ? null : actual, enUso, busy: false, mode };
  $('ppTitle').textContent = mode === 'sticker' ? 'Agregar una foto a la historia' : 'Cambiar foto de fondo';
  const dirs = [...new Set(catalogo.map(f => f.carpeta))].filter(Boolean).sort();
  $('ppCarpeta').innerHTML = '<option value="">Todas las carpetas</option>' + dirs.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  $('ppCarpeta').hidden = !dirs.length; $('ppCarpeta').value = ''; $('ppQ').value = '';
  $('ppAvisos').innerHTML = '';
  renderPickerGrid(); renderPickerSide(); $('photoPicker').showModal();
  $('ppGrid').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
function renderPickerGrid() {
  if (!pp) return;
  const q = $('ppQ').value.toLowerCase().trim(), dir = $('ppCarpeta').value, cur = catalogo.find(f => f.id === pp.actual);
  const list = catalogo.filter(f => f.id === pp.actual || ((!dir || f.carpeta === dir) && (!q || (f.carpeta + '/' + f.archivo).toLowerCase().includes(q))))
    .sort((a, b) => (b.id === pp.actual) - (a.id === pp.actual) || (b.carpeta === cur?.carpeta) - (a.carpeta === cur?.carpeta) || b.mtime - a.mtime);
  $('ppGrid').innerHTML = list.slice(0, 400).map(f => `<button class="pp-foto ${f.id === pp.sel ? 'on' : ''}" data-ppfoto="${esc(f.id)}" title="${esc(f.descripcion || f.archivo)}"><img src="/api/planner/catalog/thumb?id=${esc(encodeURIComponent(f.id))}" alt="" loading="lazy">${f.id === pp.actual ? '<span class="pp-tag">actual</span>' : pp.enUso.has(f.id) ? '<span class="pp-tag usada">en la semana</span>' : ''}</button>`).join('') || '<p class="muted">Ninguna foto con estos filtros.</p>';
}
function renderPickerSide() {
  if (!pp) return;
  const sel = catalogo.find(f => f.id === pp.sel), src = sel ? '/api/planner/catalog/photo?id=' + encodeURIComponent(sel.id) : '';
  if ($('ppCrop').getAttribute('src') !== src) { if (src) $('ppCrop').src = src; else $('ppCrop').removeAttribute('src'); }
  $('ppNow').innerHTML = sel ? `<b>${esc(sel.archivo)}</b>${sel.carpeta ? `<br><span class="muted">${esc(sel.carpeta)}</span>` : ''}` : pp.actual === null && pp.mode !== 'sticker' && se?.root.querySelector('.fondo > img') ? '<span class="muted">La foto actual no está en tu carpeta de fotos.</span>' : '<span class="muted">Elegí una foto.</span>';
  $('ppApply').disabled = pp.busy || !pp.sel || pp.sel === pp.actual;
  $('ppApply').textContent = pp.busy ? 'Preparando la foto…' : pp.mode === 'sticker' ? 'Agregar a la historia' : 'Usar esta foto';
}
$('ppGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-ppfoto]'); if (!b || !pp || pp.busy) return;
  pp.sel = b.dataset.ppfoto; document.querySelectorAll('#ppGrid .pp-foto').forEach(x => x.classList.toggle('on', x === b)); renderPickerSide();
});
$('ppCarpeta').addEventListener('change', renderPickerGrid); $('ppQ').addEventListener('input', renderPickerGrid);
$('photoPicker').addEventListener('click', e => { if (e.target === $('photoPicker') && !pp?.busy) $('photoPicker').close(); });
$('photoPicker').addEventListener('cancel', e => { if (pp?.busy) e.preventDefault(); });
$('ppApply').onclick = async () => {
  if (!pp || pp.busy || !se?.root) return; pp.busy = true; renderPickerSide();
  try {
    const r = await api('stories/photo-asset', post({ imagen: se.img, foto: pp.sel }));
    if (pp.mode === 'sticker') { $('photoPicker').close(); seAddImage(r.src); se.assets = null; return; }
    // Una historia de fondo liso pasa a tener foto: se crea la capa .fondo debajo de todo.
    seChange(() => {
      let f = seFondo();
      if (!f) { f = se.d.createElement('div'); f.className = 'fondo'; f.innerHTML = '<img alt="">'; seMark(f); se.root.prepend(f); se.root.classList.remove('lisa', 'negra'); se.stash = null; }
      const img = f.querySelector('img'); img.setAttribute('src', r.src); img.style.objectPosition = '50% 50%'; f.style.removeProperty('transform');
      ['data-secuencia', 'data-cuadros', 'data-fps', 'data-inicio', 'data-loop'].forEach(k => img.removeAttribute(k)); se.videoMeta = null;
    });
    $('photoPicker').close();
  } catch (e) { $('ppAvisos').innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  finally { if (pp) { pp.busy = false; renderPickerSide(); } }
};

// Propuesta: lo que va a Postiz se congela y se confirma en el chat, como en reels y carruseles.
function renderStoryProposal() {
  const seqs = weekSeqs(), byImg = storyByImg(), cola = stories.data.cola || {};
  const rows = seqs.filter(s => s.historias.length).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(s => {
    const hands = s.historias.map((img, i) => [img, i]).filter(([img]) => needsHand(byImg[img]));
    const queued = s.historias.filter(img => cola[img] && cola[img].estado !== 'publicada').length;
    const nuevas = s.historias.filter(img => cola[img]?.cambio && cola[img].estado !== 'publicada').length;
    const en = (stories.data.cuentas || []).length > 1 ? ` en @${esc(seqAccount(s))}` : '';
    const what = s.publicar === 'postiz' ? `Postiz${en} desde las ${esc(s.hora || STORY_DEFAULT_HOUR)}, cada ${STORY_GAP_MIN} min · ${s.historias.length - hands.length} historia${s.historias.length - hands.length === 1 ? '' : 's'}${nuevas ? ` · se reemplaza${nuevas === 1 ? '' : 'n'} ${nuevas} con la foto nueva` : ''}${hands.length ? ` · a mano: ${hands.map(([, i]) => `${i + 1} a las ${storyTime(s.hora, i)}`).join(', ')}` : ''}` : s.publicar === 'mano' ? 'A mano' + en + (queued ? ' · se quita de Postiz' : '') : 'No se publica' + (queued ? ' · se quita de Postiz' : '');
    return `<div class="sp-row ${s.publicar}"><b>${esc(dayLong(s.fecha))}</b><span>${TIPO_NAME[s.dia.tipo] || ''} ${esc(s.dia.formula || '')}</span><span class="what">${what}</span></div>`;
  }).join('');
  const fb = seqs.filter(s => fbSinAplicar(s).length).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(s => {
    const l = fbSinAplicar(s), txt = l.map(e => `${e.alcance === 'secuencia' ? 'Secuencia' : `Historia ${e.n || '?'}`}: ${e.text || (e.audio ? 'audio' : '')}`).join(' · ');
    return `<div class="sp-row fb"><b>${esc(dayLong(s.fecha))}</b><span>${l.length} nota${l.length === 1 ? '' : 's'}</span><span class="what">${esc(txt.length > 240 ? txt.slice(0, 240) + '…' : txt)}${s.publicar === 'postiz' ? ' · su agenda espera la corrección' : ''}</span></div>`;
  }).join('');
  $('spList').innerHTML = rows + (fb ? `<h4 class="sp-sec">Contenido · feedback sin corregir</h4>${fb}` : ''); $('spResult').hidden = true; $('spPrepare').disabled = false;
}
$('sPropose').onclick = async () => { await sSaving; renderStoryProposal(); $('storyProposal').showModal(); };
$('sReset').onclick = () => { if (!confirm('¿Volver al plan original de la semana? Lo que ya está en Postiz no cambia.')) return; saveSeqs(storySeqs().map(s => ({ ...s, ...defaultSeq(s.dia) })), 'Volviste al plan original.'); };
$('spPrepare').onclick = async () => {
  try {
    $('spPrepare').disabled = true; await sSaving;
    const r = await api('stories/proposal', post({ week: stories.week, cuenta: stories.data.cuenta, revision: stories.data.draft.revision }));
    $('spResult').hidden = false;
    $('spResult').innerHTML = `<p class="hint">Pegá este mensaje en Claude Code: ${r.feedback ? 'corrige el feedback' + (r.prompt.includes('historias.py aplicar') ? ', agenda lo que va a Postiz y te avisa lo que va a mano.' : '.') : 'agenda las historias en Postiz y te avisa las que van a mano.'}</p><textarea readonly aria-label="Mensaje de confirmación">${esc(r.prompt)}</textarea><button class="primary" id="spCopy">${ICON.copy} Copiar mensaje</button>`;
    $('spCopy').onclick = () => copyText(r.prompt, 'Copiado. Pegalo en el chat.');
  } catch (e) { toast(e.message); $('spPrepare').disabled = false; }
};
$('storyProposal').addEventListener('click', e => { if (e.target === $('storyProposal')) $('storyProposal').close(); });
function openStory(key) {
  const [orig, i] = key.split('|'); const s = allSeqs().find(x => x.orig === orig); if (!s) return;
  sbState = { s, i: Number(i) || 0, byImg: storyByImg() };
  showStory(); if (!$('storyBox').open) $('storyBox').showModal();
}
function showStory() {
  const { s, i, byImg } = sbState, img = s.historias[i], h = byImg[img] || {};
  $('sbTitle').textContent = `${dayLong(s.fecha)} · ${TIPO_NAME[s.dia.tipo] || s.dia.tipo} ${s.dia.formula || ''} · ${i + 1} de ${s.historias.length}`;
  $('sbImg').src = mediaUrl(img) + '&v=' + (h.mtime || 0); $('sbImg').alt = h.texto || '';
  // Historia con video y voz en off: se ve y se escucha el MP4 que se publica.
  const vid = h.video ? mediaUrl(h.video) + '&v=' + (h.video_mtime || 0) : null, sv = $('sbVid');
  $('sbImg').hidden = !!vid; sv.hidden = !vid;
  if (vid) { if (sv.dataset.src !== vid) { sv.dataset.src = vid; sv.src = vid; } sv.play().catch(() => {}); }
  else if (sv.dataset.src) { sv.pause(); sv.removeAttribute('src'); delete sv.dataset.src; sv.load(); }
  // Dos botones, editar y feedback; el feedback se abre al costado. Arriba, si hace falta, el aviso de que va a mano.
  $('sbChip').hidden = !needsHand(h); $('sbChip').textContent = needsHand(h) ? '✋ Va a mano: ' + h.sticker.split(/[(:]/)[0].trim() : ''; $('sbChip').title = h.sticker || '';
  $('sbEdit').hidden = !h.editable;
  $('sbPrev').disabled = i === 0; $('sbNext').disabled = i === s.historias.length - 1;
  sbFbCount(stories.data?.feedback?.[s.orig]?.historias?.[img] || 0);
  if (!$('sbFeedback').hidden) loadStoryFeedback('sb', img);
}
const sbFbCount = n => { $('sbFbN').hidden = !n; $('sbFbN').textContent = n || ''; };
$('sbEdit').onclick = () => { $('sbVid').pause(); openEditor(); };
$('sbFbBtn').onclick = () => {
  const open = $('sbFeedback').hidden; $('sbFeedback').hidden = !open; $('sbFbBtn').classList.toggle('on', open);
  if (open && sbState) { loadStoryFeedback('sb', sbState.s.historias[sbState.i]); setTimeout(() => $('sbFeedback').querySelector('[data-sfb="text"]')?.focus(), 60); }
};
// ---------- feedback de historias ----------
// Notas escritas o grabadas que persisten en la carpeta de la semana (feedback/) y se copian para Claude Code. Las de
// una historia son detalles (textos, colores, tamaños) que Claude corrige directo; las de la secuencia son generales
// (cambiar el tema, rehacer varias historias) y Claude propone antes de rehacer.
// Dos lugares con el mismo componente: «sb», la historia grande (notas de esa historia) y «dia», el feedback de la
// secuencia que se abre desde la fila del día (notas generales, y ahí se ven también las de cada historia).
const sfbx = {};
const SFB = {
  sb: { box: 'sbFeedback', scope: 'historia', title: 'Feedback', ph: '¿Qué cambio en esta historia?', close: true },
  dia: { box: 'sqFeedback', scope: 'secuencia', title: '', ph: '¿Qué cambio en la secuencia?' },
};
async function loadStoryFeedback(key, img) {
  const prev = sfbx[key], keep = prev?.img === img ? prev : null;
  const st = sfbx[key] = { key, img, entries: keep?.entries || [], prompt: keep?.prompt || null, text: keep?.text || '', rec: keep?.rec || null, loading: !keep, saving: false, error: null, clip: keep?.clip || null };
  renderStoryFeedback(key);
  try { const r = await api('stories/feedback?imagen=' + encodeURIComponent(img)); if (sfbx[key] === st) Object.assign(st, { entries: r.entries, prompt: r.prompt, dia: r.dia, loading: false }); }
  catch (e) { if (sfbx[key] === st) Object.assign(st, { error: e.message, loading: false }); }
  if (sfbx[key] === st) renderStoryFeedback(key);
}
const sfbMine = (st, e) => e.alcance !== 'secuencia' && e.imagen?.split('/').pop() === st.img.split('/').pop();
function renderStoryFeedback(key) {
  const st = sfbx[key], cfg = SFB[key], box = $(cfg.box); if (!st || !box) return;
  const list = key === 'sb' ? st.entries.filter(e => sfbMine(st, e)) : [...st.entries].sort((a, b) => (a.alcance === 'secuencia' ? 0 : 1) - (b.alcance === 'secuencia' ? 0 : 1) || (a.n || 0) - (b.n || 0));
  const pend = st.entries.filter(fbOpen), mineN = list.filter(fbOpen).length, others = pend.length - mineN;
  const entry = e => `<div class="fb-entry ${e.estado === 'aplicado' ? 'done' : ''}"><div class="fb-head">${key === 'dia' ? `<span class="tag ${e.alcance === 'secuencia' ? 'accent' : ''}">${e.alcance === 'secuencia' ? 'General' : 'Historia ' + (e.n || '?')}</span>` : ''}<span>${esc(new Date(e.created_at).toLocaleString('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''))}</span><span class="tag ${FB_STATE[e.estado]?.[1] ?? 'accent'}">${FB_STATE[e.estado]?.[0] ?? 'Pendiente'}</span><button class="icon fb-del" data-sfbdel="${esc(e.file)}" aria-label="Borrar nota">${ICON.trash}</button></div>${e.text ? `<p class="fb-text">${esc(e.text)}</p>` : ''}${e.audio ? `<audio src="${esc(mediaUrl(e.audio))}" controls preload="metadata"></audio>` : ''}${e.transcript ? `<p class="hint">«${esc(e.transcript)}»</p>` : ''}${e.cambio ? `<p class="hint">${esc(e.cambio)}</p>` : ''}</div>`;
  const rec = st.rec, clip = st.clip;
  const dayPend = pend.length;
  if (key === 'sb') sbFbCount(mineN);
  box.innerHTML = `${cfg.title ? `<div class="fb-top"><b>${cfg.title}</b>${cfg.close ? '<button class="icon" data-sfb="close" aria-label="Cerrar"><svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>' : ''}</div>` : ''}
    ${st.error ? `<p class="hint warn">${esc(st.error)}</p>` : ''}
    <div class="fb-list">${list.map(entry).join('') || (st.loading ? '' : '<p class="fb-empty">Sin notas todavía.</p>')}</div>
    ${clip ? `<div class="fb-retry"><audio src="${esc(clip.url)}" controls></audio><button class="secondary" data-sfb="retry">Reintentar</button><button class="ghost" data-sfb="drop">Descartar</button></div>` : ''}
    <div class="fb-compose">
      <input data-sfb="text" class="fb-input" value="${esc(st.text)}" placeholder="${rec ? 'Grabando…' : cfg.ph}" ${st.saving || rec ? 'disabled' : ''} aria-label="${cfg.ph}">
      ${rec ? `<button class="secondary rec on" data-sfb="rec" title="Detener y guardar">${ICON.stop}<span data-sfb="time">${clock((performance.now() - rec.start) / 1000)}</span></button>` : `<button class="secondary rec" data-sfb="rec" title="Grabar audio" aria-label="Grabar audio" ${st.saving ? 'disabled' : ''}>${ICON.mic}</button>`}
    </div>
    <button class="primary fb-copy" data-sfb="copy" ${st.prompt ? '' : 'disabled'} title="Copia todas las notas pendientes del día (${others ? 'incluye ' + others + ' de otras historias o de la secuencia' : 'las de esta historia'})">${ICON.copy} Copiar para Claude Code${dayPend ? ` · ${dayPend}` : ''}</button>`;
  const q = n => box.querySelector(`[data-sfb="${n}"]`);
  q('text').oninput = e => { st.text = e.target.value; };
  q('text').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (st.text.trim()) saveStoryFeedback(key, null); } };
  q('rec').onclick = () => st.rec ? st.rec.rec.stop() : startStoryRec(key);
  if (q('close')) q('close').onclick = () => { $('sbFeedback').hidden = true; $('sbFbBtn').classList.remove('on'); };
  q('copy').onclick = async () => {
    if (!st.prompt) return; const img = st.img;
    if (!await copyText(st.prompt, 'Copiado: pegalo en Claude Code.')) return;
    try { const r = await api('stories/feedback/sent', post({ imagen: img })); sfbRefresh(img, r); } catch {}
  };
  if (q('retry')) q('retry').onclick = () => { const c = st.clip; st.clip = null; saveStoryFeedback(key, c); };
  if (q('drop')) q('drop').onclick = () => { if (confirm('¿Descartar este audio sin guardarlo?')) { URL.revokeObjectURL(st.clip.url); st.clip = null; renderStoryFeedback(key); } };
  box.querySelectorAll('[data-sfbdel]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Borrar esta nota? Queda guardada aparte en feedback/.borradas.')) return;
    try { const r = await api('stories/feedback/remove', post({ imagen: st.img, file: b.dataset.sfbdel })); sfbRefresh(st.img, r); toast('Nota borrada.'); } catch (e) { toast(e.message); }
  });
}
// Las notas son del día: si los dos lugares muestran el mismo día, se actualizan juntos, y la semana cuenta de nuevo.
function sfbRefresh(img, r) {
  const run = img.split('/historias/')[0];
  for (const k of Object.keys(sfbx)) { const st = sfbx[k]; if (st && st.img.split('/historias/')[0] === run && (st.dia === r.dia || st.img === img)) { Object.assign(st, { entries: r.entries, prompt: r.prompt, dia: r.dia }); renderStoryFeedback(k); } }
  stories.week = null; loadStories();
}
async function startStoryRec(key) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar audio.');
  const st = sfbx[key], img = st.img; let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('No hay permiso para usar el micrófono.'); }
  if (sfbx[key]?.img !== img) { stream.getTracks().forEach(t => t.stop()); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [], start = performance.now();
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const cur = sfbx[key]; if (cur?.rec?.rec === rec) { clearInterval(cur.rec.timer); cur.rec = null; }
    const type = rec.mimeType || mime || 'audio/webm';
    // Se guarda aunque se haya pasado a otra historia o cerrado la vista: el audio no se pierde.
    saveStoryFeedback(key, { blob: new Blob(chunks, { type }), mime: type, seconds: (performance.now() - start) / 1000 }, img);
  };
  rec.start(1000);
  st.rec = { rec, start, timer: setInterval(() => { const el = $(SFB[key].box)?.querySelector('[data-sfb="time"]'); if (el) el.textContent = clock((performance.now() - start) / 1000); }, 250) };
  renderStoryFeedback(key);
}
async function saveStoryFeedback(key, clip, img = sfbx[key]?.img) {
  const st = sfbx[key], mine = () => sfbx[key]?.img === img;
  const text = mine() && !clip ? (st.text || '').trim() : '';
  if (!text && !clip) return toast('Escribí algo o grabá un audio.');
  const body = { imagen: img, alcance: SFB[key].scope, text };
  if (clip) { body.audio = await blobB64(clip.blob); body.mime = clip.mime; body.audio_seconds = clip.seconds; }
  if (mine()) { st.saving = true; renderStoryFeedback(key); }
  try {
    const r = await api('stories/feedback', post(body));
    if (mine()) { st.saving = false; st.error = null; if (text) st.text = ''; }
    sfbRefresh(img, r);
    if (mine() && text) $(SFB[key].box)?.querySelector('[data-sfb="text"]')?.focus();
    toast(clip ? 'Audio guardado.' : 'Nota guardada.');
  } catch (e) {
    if (mine()) { st.saving = false; if (clip) st.clip = { ...clip, url: URL.createObjectURL(clip.blob) }; renderStoryFeedback(key); }
    toast((clip ? 'No se guardó el audio: ' : 'No se guardó la nota: ') + e.message);
  }
}
// Feedback de la secuencia: desde la fila del día, con la secuencia a la vista.
function openSeqFeedback(orig) {
  const sq = allSeqs().find(x => x.orig === orig); const img = sq?.dia.historias[0]?.imagen; if (!img) return;
  $('sqTitle').textContent = `Feedback de la secuencia · ${dayLong(sq.fecha)} · ${TIPO_NAME[sq.dia.tipo] || sq.dia.tipo || ''} ${sq.dia.formula || ''}`;
  const counts = stories.data.feedback?.[orig]?.historias || {};
  $('sqStrip').innerHTML = `${sq.dia.tema ? `<p class="sq-tema">${esc(sq.dia.tema)}</p>` : ''}<div class="sq-thumbs">${sq.historias.map((im, i) => `<button class="sq-thumb" data-story="${esc(sq.orig)}|${i}" title="Abrir la historia ${i + 1}"><img src="/api/planner/poster?path=${esc(encodeURIComponent(im))}&v=${storyByImg()[im]?.mtime || 0}" alt=""><span class="n">${i + 1}</span>${counts[im] ? `<span class="s-fbn">💬 ${counts[im]}</span>` : ''}</button>`).join('')}</div>`;
  loadStoryFeedback('dia', img);
  if (!$('seqFb').open) $('seqFb').showModal();
}
const stepStory = n => { if (!sbState) return; const k = sbState.i + n; if (k < 0 || k >= sbState.s.historias.length) return; sbState.i = k; showStory(); };
$('sbPrev').onclick = () => stepStory(-1); $('sbNext').onclick = () => stepStory(1);
$('storyBox').addEventListener('click', e => { if (e.target === $('storyBox')) $('storyBox').close(); });
$('storyBox').addEventListener('close', () => { if (sfbx.sb?.rec) sfbx.sb.rec.rec.stop(); $('sbVid').pause(); });
$('seqFb').addEventListener('close', () => { if (sfbx.dia?.rec) sfbx.dia.rec.rec.stop(); });
$('seqFb').addEventListener('click', e => { if (e.target === $('seqFb')) $('seqFb').close(); });
$('sGrid').addEventListener('change', e => {
  if (e.target.matches('[data-smetric]')) saveStoryMetric(e.target);
  else if (e.target.matches('[data-smovedate]')) moveSeq(e.target.dataset.smovedate, e.target.value);
  else if (e.target.matches('[data-scuenta]')) setStoryPub(e.target.dataset.scuenta, { cuenta: e.target.value === stories.data.cuenta ? undefined : e.target.value });
  else if (e.target.matches('[data-hora]')) { const t = parseTime(e.target.value); if (!t) { toast('Hora inválida: usá 10:00.'); e.target.value = ''; return; } setStoryPub(e.target.dataset.hora, { hora: t }); }
});
$('sGrid').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-smetric], [data-hora]')) { e.preventDefault(); e.target.blur(); } });
$('sGrid').addEventListener('click', e => { const mv = e.target.closest('[data-smove]'); if (mv) { const inp = mv.parentElement.querySelector('[data-smovedate]'); try { inp.showPicker(); } catch { inp.focus(); } return; } const b = e.target.closest('[data-pub]'); if (b) { setStoryPub(b.closest('[data-seq]').dataset.seq, { publicar: b.dataset.pub }); } });
$('sCuenta').onchange = () => { sCuenta = $('sCuenta').value; store.set('sCuenta', sCuenta); render(); };
$('sPrev').onclick = () => { week = dateAdd(week, -7); render(); };
$('sNext').onclick = () => { week = dateAdd(week, 7); render(); };
$('sToday').onclick = () => { week = monday(todayStr()); render(); };
$('sWeekTitle').onclick = () => { try { $('sJumpDate').showPicker(); } catch { $('sJumpDate').focus(); } };
$('sJumpDate').onchange = () => { if ($('sJumpDate').value) { week = monday($('sJumpDate').value); render(); } };

// Clics de la pestaña: semana sugerida, feedback de la secuencia, abrir una historia, copiar el DM o el link del recurso.
document.addEventListener('click', e => {
  const t = e.target;
  const swk = t.closest('[data-sweek]'); if (swk) { week = monday(swk.dataset.sweek); render(); scrollTo({ top: 0 }); return; }
  const sqb = t.closest('[data-sqfb]'); if (sqb) { openSeqFeedback(sqb.dataset.sqfb); return; }
  // ✏️ Editar sobre la miniatura: entra directo al editor, sin pasar por la vista de la historia.
  const ed = t.closest('[data-edit-story]'), st = t.closest('[data-story]');
  if (ed && st) { const [orig, i] = st.dataset.story.split('|'), s = allSeqs().find(x => x.orig === orig); if (s) { sbState = { s, i: Number(i) || 0, byImg: storyByImg() }; openEditor(); } return; }
  if (st) { openStory(st.dataset.story); return; }
  const sdm = t.closest('[data-sdm]'); if (sdm) { const r = [...(stories.data?.semana?.recursos || []), ...(stories.data?.entrantes || []).map(x => x.recurso).filter(Boolean)].find(x => x.id === sdm.dataset.sdm); if (r?.dm) copyText(r.dm, 'DM copiado.'); return; }
  const sc = t.closest('[data-scopy]'); if (sc) { copyText(sc.dataset.scopy, 'Link copiado.'); }
});
// Teclado: el editor (deshacer, mover con flechas, borrar) y las flechas en la historia grande.
document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, select');
  if ($('storyEditor').open) { if (!$('photoPicker').open && !typing && se?.root) seKeys(e); return; }
  if ($('storyBox').open && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); stepStory(e.key === 'ArrowRight' ? 1 : -1); }
});
