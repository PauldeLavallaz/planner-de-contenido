// Sección Twitter: Semana (horarios y lo aprobado por agendar), Borradores (lista y, al lado, el tweet como sale en X con su
// origen), Bookmarks y Búsquedas (tweets ajenos para reaccionar, uno por línea) y Cuentas (tabla con ficha). Usa las
// utilidades de planner.js y el menú de guiones.js (gvMenu). La API está en src/x.ts y los scripts en engine/x/.
const X_PAGINA = 60;
const xs = { data: null, loading: false, error: null, tab: store.get('xTab', 'borradores'), filtro: store.get('xFiltro', 'borrador'),
  origen: store.get('xOrigen', 'todos'), sel: null, bkFiltro: store.get('xBkFiltro', 'nuevos'), tier: store.get('xTier', 'todas'),
  cuentaSel: null, bkTemas: store.get('xBkTemas', []), bkVer: X_PAGINA, busq: null, orden: store.get('xOrden', 'bookmarks'), semana: null, timers: {}, rec: null, fbGuardando: {}, fbBorrador: {}, bkRecien: new Set(), bkAbiertos: new Set() };
const X_TABS = [['semana', 'Semana'], ['borradores', 'Borradores'], ['bookmarks', 'Bookmarks'], ['busquedas', 'Búsquedas'], ['cuentas', 'Cuentas']];
const X_ESTADOS = [['borrador', 'Por revisar'], ['aprobado', 'Aprobados'], ['agendado', 'Agendados'], ['publicado', 'Publicados'], ['descartado', 'Descartados']];
const X_ORIGEN = [['todos', 'Todos'], ['propios', 'Desde cero'], ['sobre', 'Sobre un post']];
const X_BK = [['nuevos', 'Por revisar'], ['interesa', 'Me interesan'], ['usados', 'En borrador'], ['descartados', 'No me interesan'], ['todos', 'Todos']];
const X_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const X_LIMITE = 280;
const X_IC = {
  check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12', plus: 'M12 5v14M5 12h14',
  abrir: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  propio: 'M12 20h9M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.8.8-2.9a2 2 0 0 1 .5-.9z',
  sobre: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 12a2 2 0 0 0 2-2V8H8M14 12a2 2 0 0 0 2-2V8h-2',
  hilo: 'M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2zM18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  copiar: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  repartir: 'M3 6h18M3 12h12M3 18h6', volver: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1',
  resp: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z', repost: 'm2 9 3-3 3 3M13 18H7a2 2 0 0 1-2-2V6M22 15l-3 3-3-3M11 6h6a2 2 0 0 1 2 2v10',
  like: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z',
  vistas: 'M18 20V10M12 20V4M6 20v-6', chev: 'm6 9 6 6 6-6',
};
const xIc = (k, cls = '') => `<svg class="xi ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${X_IC[k]}"/></svg>`;
const xVerif = () => '<svg class="xv-verif" viewBox="0 0 24 24" role="img" aria-label="Cuenta verificada"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path class="tic" d="m9 12 2 2 4-4"/></svg>';

// Largo como lo cuenta X: casi todo el alfabeto latino vale 1 y lo demás (emojis, CJK) vale 2; un link vale 23.
const xLargo = t => { let n = 0; const s = String(t || '').replace(/https?:\/\/\S+/g, () => { n += 23; return ''; });
  for (const ch of s) { const c = ch.codePointAt(0); n += (c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247)) ? 1 : 2; }
  return n; };
const xHace = iso => { if (!iso) return ''; const d = new Date(iso), h = (Date.now() - d) / 36e5;
  if (h < 1) return 'recién'; if (h < 24) return `hace ${Math.round(h)} h`; if (h < 24 * 7) return `hace ${Math.round(h / 24)} d`;
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };
const xNum = v => v == null ? '' : v >= 1e6 ? (Math.round(v / 1e5) / 10).toLocaleString(LOCALE) + ' M' : v >= 1e4 ? Math.round(v / 1e3).toLocaleString(LOCALE) + ' mil' : Number(v).toLocaleString(LOCALE);
const xUrl = b => b.url || `https://x.com/${b.autor?.handle || 'i'}/status/${b.id}`;
const xTxt = t => esc(t).replace(/\n/g, '<br>');
const xMedia = p => `/api/planner/media?path=${encodeURIComponent(p)}`;
const xIniciales = s => esc(String(s || '?').replace(/^@/, '').slice(0, 1).toUpperCase());
const xAvatar = (src, nombre, cls = '') => src
  ? `<img class="xav ${cls}" src="${esc(/^https?:/.test(src) ? src : xMedia(src))}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : `<span class="xav ph ${cls}" aria-hidden="true">${xIniciales(nombre)}</span>`;
// La fecha propuesta (`YYYY-MM-DDTHH:MM`, en la zona de la config) en texto corto: «mar 3 · 14:00».
const xCuando = f => { if (!f) return ''; const [d, h] = f.split('T'), dt = new Date(d + 'T12:00:00');
  return `${dt.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')} · ${h}`; };
// Un horario ya pasó si es anterior a la hora actual en la zona de la config (nowLocal, de planner.js).
const xVencido = f => f <= nowLocal();
// Una opción de los menús de filtro.
const xOpt = (v, t, on, n, sub) => `<button class="gv-pop-opt xv-opt${on ? ' on' : ''}" data-v="${esc(v)}" role="menuitemradio" aria-checked="${on}">${on ? ICON.check : '<i></i>'}<span class="t">${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${n != null ? `<span class="n">${n}</span>` : ''}</button>`;

async function xCargar() {
  if (xs.loading) return; xs.loading = true;
  try { xs.data = await api('x'); xs.error = null; } catch (e) { xs.error = e.message; }
  xs.loading = false; renderX();
}

const xEst = b => b.estado || 'borrador';
const xUsados = d => new Set(d.borradores.flatMap(b => (b.fuentes || []).map(f => String(f.id))));
const xFuente = b => (b.fuentes || [])[0] || null;
const xVacio = d => !d.borradores.length && !d.bookmarks.length && !(d.busquedas || []).length && !d.cuentas.length;

function renderX() {
  if (!xs.data && !xs.error) { $('xBody').innerHTML = skeleton('split'); xCargar(); return; }
  const d = xs.data || { bookmarks: [], borradores: [], cuentas: [], busquedas: [], estado: {}, cuenta: {}, slots: [], tipos: [], temas: [] };
  const usados = xUsados(d);
  const n = { semana: d.borradores.filter(b => xEst(b) === 'aprobado' && !b.fecha).length, borradores: d.borradores.filter(b => xEst(b) === 'borrador').length,
    bookmarks: d.bookmarks.filter(b => !d.estado[b.id] && !usados.has(b.id)).length, cuentas: d.cuentas.length,
    busquedas: xSinRepetir((d.busquedas || []).flatMap(x => x.items)).filter(b => !d.estado[b.id] && !usados.has(b.id)).length };
  $('xTabs').innerHTML = X_TABS.map(([k, l]) => `<button role="tab" aria-selected="${xs.tab === k}" class="${xs.tab === k ? 'on' : ''}" data-xtab="${k}">${l}${n[k] ? ` <span class="n">${n[k]}</span>` : ''}</button>`).join('');
  const c = d.cuenta || {};
  $('xCuenta').innerHTML = c.handle ? `${xAvatar(c.avatar, c.nombre, 'sm')}<span class="xv-yo-t"><b>${esc(c.nombre || c.handle)}</b>${c.verificado ? xVerif() : ''}<span>@${esc(c.handle)}</span></span>` : '';
  if (xs.error) { $('xBody').innerHTML = `<p class="xv-vacio">No se pudo cargar Twitter: ${esc(xs.error)}</p>`; return; }
  if (xVacio(d)) { $('xBody').innerHTML = xEmpezarHtml(d); return; }
  $('xBody').innerHTML = xs.tab === 'semana' ? xSemanaHtml(d) : xs.tab === 'bookmarks' ? xBookmarksHtml(d, usados) : xs.tab === 'busquedas' ? xBusquedasHtml(d, usados) : xs.tab === 'cuentas' ? xCuentasHtml(d) : xBorradoresHtml(d);
  // El alto de cada texto se mide cuando el panel ya tiene su ancho (recién dibujado puede estar angosto).
  requestAnimationFrame(() => document.querySelectorAll('#xBody textarea.xt-txt').forEach(xAjustar));
  // «Mostrar más» sólo en lo que de verdad no entra.
  document.querySelectorAll('#xBody p.xtw-t:not(.abierto)').forEach(p => { if (p.scrollHeight > p.clientHeight + 1) p.nextElementSibling.hidden = false; });
}

// Sin nada todavía: qué hace la sección y qué pedirle a Claude Code para arrancar.
function xEmpezarHtml(d) {
  const paso = (t, s) => `<li><b>${t}</b><span>${s}</span></li>`;
  return `<div class="xv-empezar">
    <h2>Twitter, desde tus bookmarks</h2>
    <p>Guardás en X lo que te interesa; Claude Code lo convierte en borradores con tu voz, los revisás y los editás acá, y los agendás en la semana.</p>
    <ol>
      ${paso('Conectá tu cuenta', `Pedile a Claude Code «configurá Twitter en el planner». Te guía para crear tu app de X (sólo lectura) y autorizar tus bookmarks una vez${d.postiz ? '' : ', y para conectar X en Postiz si querés agendar desde acá'}.`)}
      ${paso('Traé lo que guardaste', 'Pedile «bajá mis bookmarks de X»: aparecen en Bookmarks, para marcar lo que te interesa.')}
      ${paso('Escribí', 'Pedile «armá borradores de Twitter». Los revisás en Borradores: los editás, los aprobás y les dejás notas escritas o en audio.')}
      ${paso('Agendá', 'Lo aprobado va a Semana: arrastralo a un horario y copiá el pedido para Claude Code. Pegarlo es tu OK.')}
    </ol>
    <p class="xv-nota">También podés pedirle «buscá en X sobre…»: lo que traiga aparece en Búsquedas, con el mismo formato.</p>
  </div>`;
}

// ---------- borradores: lista a la izquierda, el tweet como sale en X a la derecha ----------
function xFiltrados(d) {
  return d.borradores.filter(b => xEst(b) === xs.filtro && (xs.origen === 'todos' || (xs.origen === 'sobre') === (b.tipo === 'sobre')));
}

function xTipoTxt(b, largo = false) {
  const f = xFuente(b), quien = f?.autor?.handle ? '@' + f.autor.handle : 'otro';
  if (b.tipo === 'sobre') return { ic: 'sobre', t: largo ? `Comentario sobre un post de ${quien}` : `Sobre ${quien}`, cls: 'sobre' };
  if (b.tipo === 'hilo') return { ic: 'hilo', t: largo ? `Hilo propio · ${b.partes.length} partes` : `Hilo · ${b.partes.length}`, cls: 'hilo' };
  return { ic: 'propio', t: largo ? 'Post propio' : 'Post', cls: 'propio' };
}

function xBorradoresHtml(d) {
  const lista = xFiltrados(d);
  if (!lista.some(b => b.id === xs.sel)) xs.sel = lista[0]?.id || null;
  const cuenta = k => d.borradores.filter(b => xEst(b) === k).length;
  const barra = `<div class="rf-bar xv-bar">
    <div class="xv-chips" role="group" aria-label="Estado">${X_ESTADOS.map(([k, l]) => `<button class="xv-chip${xs.filtro === k ? ' on' : ''}" data-xfiltro="${k}" aria-pressed="${xs.filtro === k}">${l}<span class="n">${cuenta(k) || ''}</span></button>`).join('')}</div>
    <span class="rf-bar-sep" aria-hidden="true"></span>
    <div class="segmented xv-origen" role="group" aria-label="Origen">${X_ORIGEN.map(([k, l]) => `<button class="${xs.origen === k ? 'on' : ''}" data-xorigen="${k}" aria-pressed="${xs.origen === k}">${k === 'propios' ? xIc('propio') : k === 'sobre' ? xIc('sobre') : ''}${l}</button>`).join('')}</div>
    <span class="rf-bar-fin"><button class="${xPorMandar(d) ? 'primary' : 'secondary'} xv-mandar" data-xmandar ${xPorMandar(d) ? '' : 'disabled'} title="Copia tus notas y tus ediciones para pegarlas en Claude Code: corrige los tweets y aprende tu manera de escribir">${xIc('copiar')}Mandar feedback a Claude Code${xPorMandar(d) ? ` <span class="count">${xPorMandar(d)}</span>` : ''}</button></span>
  </div>`;
  if (!lista.length) return barra + `<div class="xv-empty">${xs.filtro === 'borrador'
    ? '<b>No hay borradores por revisar.</b><span>Pedile a Claude Code «armá borradores de Twitter»: los escribe desde tus bookmarks y lo que marcaste «Me interesa».</span>'
    : `<b>Nada en ${esc(Object.fromEntries(X_ESTADOS)[xs.filtro].toLowerCase())}.</b>`}</div>`;
  const filas = lista.map(b => {
    const t = xTipoTxt(b), f = xFuente(b), primera = String(b.partes[0]?.texto || '').split('\n').find(Boolean) || '(vacío)';
    const av = b.tipo === 'sobre' ? xAvatar(f?.autor?.avatar, f?.autor?.handle) : xAvatar(d.cuenta.avatar, d.cuenta.nombre);
    return `<div class="xr${b.id === xs.sel ? ' on' : ''}" data-xsel="${esc(b.id)}" role="option" aria-selected="${b.id === xs.sel}" tabindex="-1">
      <span class="xr-av">${av}${b.tipo === 'sobre' ? `<i class="xr-badge">${xIc('sobre')}</i>` : ''}</span>
      <span class="xr-txt"><span class="xr-tipo ${t.cls}">${xIc(t.ic)}${esc(t.t)}</span><b>${esc(primera)}</b>
        <small>${xNotasAbiertas(b).length ? `<span class="tag accent">${xNotasAbiertas(b).length === 1 ? '1 nota' : xNotasAbiertas(b).length + ' notas'}</span>` : ''}${b.fecha ? `${xIc('cal')}${esc(xCuando(b.fecha))}` : esc(xHace(b.creado))}${b.tema ? ` · ${esc(b.tema)}` : ''}</small></span>
    </div>`;
  }).join('');
  const sel = lista.find(b => b.id === xs.sel);
  return barra + `<div class="xd2">
    <div class="rfb-list xd2-list" role="listbox" aria-label="Borradores"><div class="rfb-head">${lista.length} ${lista.length === 1 ? 'borrador' : 'borradores'}<span class="rfb-head-fin"><kbd>↑</kbd><kbd>↓</kbd></span></div><div class="rfb-rows">${filas}</div></div>
    <section class="rf-panel xe" aria-label="Borrador">${sel ? xEditorHtml(sel, d) : ''}</section>
  </div>`;
}

// El detalle de un borrador, en una sola columna centrada: el tema, el tweet como sale en X, las dos decisiones, el feedback
// en una línea y, al pie y chico, por qué se escribió con el link al post original.
function xEditorHtml(b, d) {
  const estado = xEst(b), editable = estado === 'borrador' || estado === 'aprobado', f = xFuente(b), c = d.cuenta || {};
  const partes = b.partes || [];
  const tweets = partes.map((p, i) => {
    const largo = xLargo(p.texto), ultimo = i === partes.length - 1;
    const media = (p.media || []).map(m => typeof m === 'string' ? m : m.path).filter(Boolean);
    const adjunto = media.map(m => /\.(mp4|mov|webm)$/i.test(m) ? `<video src="${xMedia(m)}" controls preload="metadata"></video>` : `<img src="${xMedia(m)}" alt="Imagen del tweet" loading="lazy">`).join('');
    // El post comentado se ve adentro del tweet, como la cita de X.
    const cita = i === 0 && b.tipo === 'sobre' && f ? `<div class="xt-cita">${xFuenteHtml(f, 'cita')}</div>` : '';
    return `<div class="xt${ultimo ? ' ultimo' : ''}">
      <div class="xt-col">${xAvatar(c.avatar, c.nombre)}</div>
      <div class="xt-cuerpo">
        <div class="xt-h"><b>${esc(c.nombre || c.handle || 'Tu cuenta')}</b>${c.verificado ? xVerif() : ''}${c.handle ? `<span>@${esc(c.handle)}</span>` : ''}${partes.length > 1 ? `<span class="xt-n">${i + 1}/${partes.length}</span>` : ''}</div>
        <textarea class="xt-txt" data-xid="${esc(b.id)}" data-parte="${i}" rows="2" ${editable ? '' : 'readonly'} placeholder="Escribí esta parte del hilo" aria-label="Texto ${partes.length > 1 ? 'de la parte ' + (i + 1) : 'del post'}">${esc(p.texto)}</textarea>
        ${adjunto ? `<div class="xt-media${media.length > 1 ? ' doble' : ''}">${adjunto}</div>` : ''}${cita}
        <div class="xt-pie">${editable && partes.length > 1 ? `<button class="ghost danger xt-quitar" data-xquitar="${esc(b.id)}" data-parte="${i}">Quitar esta parte</button>` : ''}
          <span class="xt-cnt${largo > X_LIMITE ? ' pasado' : ''}" data-cnt="${esc(b.id)}-${i}" title="Así lo cuenta X. Sin X Premium no se puede pasar de ${X_LIMITE}; con Premium sale entero, pero se corta con «Mostrar más»">${largo}/${X_LIMITE}</span></div>
      </div></div>`;
  }).join('');
  const sumar = editable && b.tipo !== 'sobre' ? `<button class="ghost xt-sumar" data-xparte="${esc(b.id)}">${xIc('plus')}${partes.length > 1 ? 'Agregar otra parte' : 'Convertir en hilo'}</button>` : '';
  const decide = estado === 'borrador'
    ? `<div class="xe-decide"><button class="xe-si" data-xestado="aprobado" data-xid="${esc(b.id)}" title="Pasa a la semana para elegirle horario">${xIc('check')}Aprobar<kbd>A</kbd></button>
       <button class="xe-no" data-xestado="descartado" data-xid="${esc(b.id)}">${xIc('x')}Descartar<kbd>X</kbd></button></div>`
    : estado === 'aprobado' ? `<div class="xe-estado ok">${xIc('check')}<span><b>Aprobado</b>${b.fecha ? ` · ${esc(xCuando(b.fecha))}` : ' · sin horario'}</span>
       <button class="ghost" data-xir="semana">${xIc('cal')}Ver en la semana</button><button class="ghost" data-xestado="borrador" data-xid="${esc(b.id)}">${xIc('volver')}Volver a revisar</button></div>`
    : estado === 'descartado' ? `<div class="xe-estado"><span><b>Descartado</b>${b.motivo ? ` · ${esc(b.motivo)}` : ''}</span><button class="ghost" data-xestado="borrador" data-xid="${esc(b.id)}">${xIc('volver')}Recuperar</button></div>`
    : `<div class="xe-estado postiz">${xIc('cal')}<span><b>${estado === 'publicado' ? 'Publicado' : b.typefully ? 'En Typefully' : 'En Postiz'}</b>${b.fecha ? ` · ${esc(xCuando(b.fecha))}` : ''}</span></div>`;
  const m = f?.metricas || {};
  const pie = b.por_que || f ? `<p class="xe-porque"><span>${esc(b.por_que || '')}</span>
      ${f ? `<a class="xe-orig" href="${esc(xUrl(f))}" target="_blank" rel="noopener">${xAvatar(f.autor?.avatar, f.autor?.handle, 'xs')}Ver el post de @${esc(f.autor?.handle || '')}${m.likes != null ? ` · ${xNum(m.likes)} me gusta` : ''}${xIc('abrir')}</a>` : ''}</p>` : '';
  return `<div class="xe-col">
    <div class="xe-top"><h2 class="xe-tema">${esc(b.tema || '')}</h2><span class="xe-save" data-save="${esc(b.id)}" aria-live="polite"></span></div>
    <div class="xe-tweet">${tweets}${sumar}</div>
    ${decide}
    ${xFeedbackHtml(b)}
    ${pie}
  </div>`;
}

// Un post ajeno con su autor a la vista: foto, nombre, usuario y fecha; métricas y link al original. Modos: «completo»
// (texto entero e imagen), «resumen» (cuatro líneas, sin imagen) y «cita» (sólo autor y texto corto, dentro del tweet).
function xFuenteHtml(f, modo = 'completo') {
  if (!f) return '';
  const corto = modo !== 'completo', pie = modo !== 'cita';
  const a = f.autor || {}, m = f.metricas || {}, prev = (f.media || []).find(x => x.preview)?.preview;
  return `<div class="xf-h">${xAvatar(a.avatar, a.handle, 'sm')}<span><b>${esc(a.nombre || a.handle || '')}</b>${a.verificado ? xVerif() : ''} <span>@${esc(a.handle || '')} · ${esc(xHace(f.fecha))}</span></span></div>
    <p class="xf-t${corto ? ' corto' : ''}">${xTxt(f.articulo?.titulo || f.texto || '')}</p>
    ${prev && !corto ? `<img class="xf-img" src="${esc(prev)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    ${!pie ? '' : `<div class="xf-pie"><span>${m.likes != null ? `<b>${xNum(m.likes)}</b> me gusta` : ''}${m.reposts ? ` · <b>${xNum(m.reposts)}</b> reposts` : ''}${m.vistas ? ` · <b>${xNum(m.vistas)}</b> vistas` : ''}</span>
      <a class="ghost" href="${esc(xUrl(f))}" target="_blank" rel="noopener">${xIc('abrir')}Abrir en X</a></div>`}`;
}

function xAjustar(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
addEventListener('resize', () => { if (typeof view !== 'undefined' && view === 'x') document.querySelectorAll('#xBody textarea.xt-txt').forEach(xAjustar); });
const xBorrador = id => xs.data?.borradores.find(b => b.id === id);
const xPartesDe = id => [...document.querySelectorAll(`#xBody textarea[data-xid="${CSS.escape(id)}"]`)].map(t => ({ texto: t.value }));

function xGuardar(id) {
  clearTimeout(xs.timers[id]);
  xs.timers[id] = setTimeout(async () => {
    const b = xBorrador(id); if (!b) return;
    const el = document.querySelector(`[data-save="${CSS.escape(id)}"]`); if (el) el.textContent = 'Guardando…';
    try { const r = await api('x/borrador', post({ id, partes: xPartesDe(id), editado: b.editado || null })); Object.assign(b, r.borrador); if (el) el.textContent = 'Guardado · lo sumo a tu voz'; }
    catch (e) { if (el) el.textContent = e.message; if (e.status === 409) { xs.data = null; xCargar(); } }
  }, 900);
}

async function xEstado(id, estado) {
  clearTimeout(xs.timers[id]);
  try {
    const b = xBorrador(id);
    if (['borrador', 'aprobado'].includes(xEst(b)) && document.querySelector(`#xBody textarea[data-xid="${CSS.escape(id)}"]`)) {
      const r0 = await api('x/borrador', post({ id, partes: xPartesDe(id), editado: b.editado || null })); Object.assign(b, r0.borrador);
    }
    const r = await api('x/borrador/estado', post({ id, estado })); Object.assign(b, r.borrador);
    if (xs.tab === 'borradores') { const lista = xFiltrados(xs.data), i = lista.findIndex(x => x.id === id); xs.sel = (lista[i + 1] || lista[i - 1])?.id || null; }
    renderX();
  } catch (e) { toast(e.message); }
}

async function xCambiarPartes(id, fn) {
  const b = xBorrador(id); if (!b) return;
  try { const r = await api('x/borrador', post({ id, partes: fn(xPartesDe(id)), editado: b.editado || null })); Object.assign(b, r.borrador); renderX();
    const ts = document.querySelectorAll(`#xBody textarea[data-xid="${CSS.escape(id)}"]`); ts[ts.length - 1]?.focus(); }
  catch (e) { toast(e.message); }
}

// ---------- feedback por tweet: escrito o grabado, como en Guiones ----------
// Las notas y las ediciones a mano viajan con «Mandar feedback a Claude Code»; al aplicarlas, Claude Code pasa lo que
// enseñan a tu guía de voz.
const xNotasAbiertas = b => (b.feedback || []).filter(n => n.estado !== 'aplicado');
const xEditadoSinAprender = b => b.editado_por === 'usuario' && b.texto_original && (!b.aprendido_en || b.aprendido_en < b.editado);
const xPorMandar = d => d.borradores.reduce((n, b) => n + xNotasAbiertas(b).filter(x => x.estado === 'pendiente').length + (xEditadoSinAprender(b) ? 1 : 0), 0);
const X_NOTA = { pendiente: ['Pendiente', 'accent'], enviado: ['Enviado a Claude Code', 'warn'], aplicado: ['Aplicado', 'ok'] };

function xFeedbackHtml(b, ayuda = 'Feedback para Claude Code: escribí y apretá Enter, o grabá un audio') {
  const notas = b.feedback || [], rec = xs.rec?.id === b.id ? xs.rec : null, guardando = xs.fbGuardando[b.id];
  const nota = n => { const [t, c] = X_NOTA[n.estado] || X_NOTA.pendiente;
    return `<div class="fb-entry${n.estado === 'aplicado' ? ' done' : ''}"><div class="fb-head"><span>${esc(new Date(n.created_at).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''))}</span><span class="tag ${c}">${t}</span>
      ${n.estado !== 'aplicado' ? `<button class="icon fb-del" data-xfbdel="${esc(n.file)}" data-xid="${esc(b.id)}" title="Borrar la nota" aria-label="Borrar la nota">${ICON.trash}</button>` : ''}</div>
      ${n.text ? `<p class="fb-text">${esc(n.text)}</p>` : ''}${n.audio ? `<audio controls preload="none" src="${xMedia(n.audio)}"></audio>` : ''}
      ${n.transcript && !n.text ? `<p class="fb-text xe-transc">«${esc(n.transcript)}»</p>` : ''}${n.cambio ? `<p class="xe-cambio">${xIc('check')}${esc(n.cambio)}</p>` : ''}</div>`; };
  return `<div class="xe-fb">
    ${notas.length ? `<div class="fb-list">${notas.map(nota).join('')}</div>` : ''}
    <div class="gv-fb-in"><input type="text" data-xfbtext="${esc(b.id)}" value="${esc(xs.fbBorrador[b.id] || '')}" placeholder="${guardando ? 'Guardando…' : esc(ayuda)}" ${guardando ? 'disabled' : ''} aria-label="${esc(ayuda)}">
      ${rec ? `<button class="secondary rec on" data-xrec="${esc(b.id)}" title="Detener y guardar">${ICON.stop}<span data-xclock>${clock((performance.now() - rec.start) / 1000)}</span></button>`
        : `<button class="secondary rec" data-xrec="${esc(b.id)}" title="Grabar un audio" aria-label="Grabar un audio" ${guardando ? 'disabled' : ''}>${ICON.mic}</button>`}</div></div>`;
}

// Las notas de un borrador viven en el borrador; las de un tweet marcado, en `bookmark_notas` por id del tweet.
function xNotasGuardar(id, notas) { const b = xBorrador(id); if (b) b.feedback = notas; else xs.data.bookmark_notas[id] = notas; }

async function xFeedbackGuardar(id, text, clip) {
  xs.fbGuardando[id] = true; renderX();
  const body = { id, text: text || '' };
  try {
    if (clip) { body.audio = await blobB64(clip.blob); body.mime = clip.mime; body.audio_seconds = clip.seconds; }
    const r = await api('x/feedback', post(body)); xNotasGuardar(id, r.feedback); delete xs.fbBorrador[id];
    toast(clip ? 'Audio guardado.' : 'Nota guardada.');
  } catch (e) { toast((clip ? 'No se guardó el audio: ' : 'No se guardó la nota: ') + e.message); }
  finally { delete xs.fbGuardando[id]; renderX(); }
}

async function xGrabar(id) {
  if (xs.rec) { if (xs.rec.id === id) xs.rec.mr.stop(); else toast('Ya hay una grabación en curso.'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar audio.');
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('No hay permiso para usar el micrófono.'); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(xs.rec?.timer);
    const seconds = (performance.now() - xs.rec.start) / 1000, type = mr.mimeType || mime || 'audio/webm';
    const txt = document.querySelector(`[data-xfbtext="${CSS.escape(id)}"]`)?.value || '';
    xs.rec = null;
    // Se guarda aunque se haya cambiado de tweet: el audio no se pierde.
    xFeedbackGuardar(id, txt, { blob: new Blob(chunks, { type }), mime: type.split(';')[0], seconds });
  };
  xs.rec = { id, mr, start: performance.now(), timer: setInterval(() => { const c = document.querySelector('[data-xclock]'); if (c && xs.rec) c.textContent = clock((performance.now() - xs.rec.start) / 1000); }, 500) };
  mr.start(); renderX();
}

async function xFeedbackBorrar(id, file) {
  try { const r = await api('x/feedback/remove', post({ id, file })); xNotasGuardar(id, r.feedback); renderX(); }
  catch (e) { toast(e.message); }
}

async function xCopiar(msg, ok) {
  try { await navigator.clipboard.writeText(msg); xAviso(ok); } catch { prompt('Copiá el pedido:', msg); }
}

async function xMandarFeedback() {
  try {
    const r = await api('x/feedback/copiar', post({}));
    await xCopiar(r.prompt, 'Copiado. Pegalo en Claude Code: aplica tus notas y aprende de tus cambios.');
    xs.data = null; xCargar();
  } catch (e) { toast(e.message); }
}

// ---------- semana: lo aprobado por agendar y los horarios de cada día ----------
function xSemanaHtml(d) {
  // Arranca en la semana del próximo horario libre: un domingo a la noche ya muestra la que viene.
  if (!xs.semana) { let dia = todayStr();
    for (let i = 0; i < 8 && !d.slots.some(h => !xVencido(`${dia}T${h}`)); i++) dia = dateAdd(dia, 1);
    xs.semana = monday(dia); }
  const dias = Array.from({ length: 7 }, (_, i) => dateAdd(xs.semana, i));
  const fin = dias[6], hoy = todayStr();
  const conFecha = d.borradores.filter(b => b.fecha && ['aprobado', 'agendado', 'publicado'].includes(xEst(b)));
  const porAgendar = d.borradores.filter(b => xEst(b) === 'aprobado' && !b.fecha);
  const sinMandar = d.borradores.filter(b => xEst(b) === 'aprobado' && b.fecha);
  const fmt = s => new Date(s + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }).replace('.', '');
  const titulo = xs.semana.slice(0, 7) === fin.slice(0, 7) ? `${Number(xs.semana.slice(8))} – ${fmt(fin)}` : `${fmt(xs.semana)} – ${fmt(fin)}`;
  const tarjeta = b => { const fija = xEst(b) !== 'aprobado', txt = String(b.partes[0]?.texto || '').split('\n').find(Boolean) || '';
    return `<div class="xs-card${fija ? ' postiz' : ''}" ${fija ? '' : 'draggable="true"'} data-xdrag="${esc(b.id)}" data-xabrir="${esc(b.id)}" title="${fija ? 'Ya está agendado' : 'Arrastralo a otro horario o a «Para agendar»'}">
      <span class="xs-card-t">${esc(txt)}</span>
      ${b.tipo === 'hilo' || b.tipo === 'sobre' || fija ? `<span class="xs-meta">${b.tipo === 'hilo' ? `Hilo · ${b.partes.length}` : b.tipo === 'sobre' ? 'Cita' : ''}${fija ? '<span class="tag ok">Agendado</span>' : ''}</span>` : ''}</div>`; };
  const columnas = dias.map((dia, i) => {
    const pasado = dia < hoy, deHoy = conFecha.filter(b => b.fecha.slice(0, 10) === dia);
    const horas = [...new Set([...d.slots, ...deHoy.map(b => b.fecha.slice(11, 16))])].sort();
    const huecos = horas.map(h => {
      const ocup = deHoy.filter(b => b.fecha.slice(11, 16) === h), f = `${dia}T${h}`, vencido = xVencido(f);
      return `<div class="xs-slot${ocup.length ? ' lleno' : ''}${vencido ? ' vencido' : ''}" ${vencido ? '' : `data-xslot="${f}"`}>
        <span class="xs-hora">${h}</span>${ocup.map(tarjeta).join('') || (vencido ? '' : '<span class="xs-libre">Libre</span>')}</div>`;
    }).join('');
    return `<div class="xs-dia${dia === hoy ? ' hoy' : ''}${pasado ? ' pasado' : ''}"><div class="day-head"><span class="day-name">${X_DIAS[i]}</span><span class="day-num">${Number(dia.slice(8))}</span></div>${huecos}</div>`;
  }).join('');
  return `<div class="xs-head">
      <div class="rf-week"><span class="week-title">${esc(titulo)}</span>
        <div class="week-nav"><button class="icon" data-xsem="-7" aria-label="Semana anterior"><svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg></button>
        <button class="ghost" data-xsem="0">Hoy</button>
        <button class="icon" data-xsem="7" aria-label="Semana siguiente"><svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5"/></svg></button></div></div>
      <div class="xs-acc">
        ${sinMandar.length ? `<span class="xs-falta"><b>${sinMandar.length}</b> con horario sin agendar</span>` : ''}
        <button class="primary" data-xpedido ${sinMandar.length ? '' : 'disabled'} title="Copia el pedido; pegarlo en Claude Code es tu OK para agendarlos">${xIc('copiar')}Copiar pedido para Claude Code</button>
      </div>
    </div>
    <div class="xs-body">
      <aside class="xs-tray" data-xslot="" aria-label="Para agendar">
        <div class="xs-tray-h"><b>Para agendar</b><span class="n">${porAgendar.length || ''}</span>
          <button class="ghost" data-xrepartir ${porAgendar.length ? '' : 'disabled'} title="Los pone en los próximos horarios libres">${xIc('repartir')}Distribuir</button></div>
        ${porAgendar.map(tarjeta).join('') || '<p class="xs-tray-vacio">Lo que apruebes en Borradores aparece acá. Arrastralo a un horario o tocá Distribuir.</p>'}
      </aside>
      <div class="xs-grid">${columnas}</div>
    </div>
    <p class="xv-nota xs-nota">Horarios: ${d.slots.map(esc).join(', ')} (${esc(d.zona || TZ)}; se cambian con <code>x.horarios</code> en la config). Los tweets con horario quedan propuestos; «Copiar pedido para Claude Code» arma el mensaje y pegarlo es tu OK para agendarlos.${d.postiz ? '' : ' Para agendar desde acá, conectá tu cuenta de X en Postiz.'}</p>`;
}

async function xFecha(id, fecha) {
  try { const r = await api('x/borrador/fecha', post({ id, fecha: fecha || null })); Object.assign(xBorrador(id), r.borrador); }
  catch (e) { toast(e.message); }
}

async function xMover(id, fecha) {
  const d = xs.data, otro = fecha && d.borradores.find(b => b.id !== id && b.fecha === fecha && xEst(b) === 'aprobado');
  if (fecha && d.borradores.some(b => b.id !== id && b.fecha === fecha && xEst(b) !== 'aprobado')) { toast('Ese horario ya tiene un tweet agendado.'); return; }
  const antes = xBorrador(id)?.fecha || null;
  await xFecha(id, fecha);
  if (otro) await xFecha(otro.id, antes); // el que estaba ahí pasa al lugar del que llegó (o vuelve a «Para agendar»)
  renderX();
}

// Distribuir: lo aprobado sin horario va a los próximos horarios libres, desde ahora y en orden de aprobación.
async function xRepartir() {
  const d = xs.data, ocupadas = new Set(d.borradores.filter(b => b.fecha).map(b => b.fecha));
  const pend = d.borradores.filter(b => xEst(b) === 'aprobado' && !b.fecha).sort((a, b) => String(a.aprobado || '').localeCompare(String(b.aprobado || '')));
  const libres = [];
  for (let i = 0; i < 21 && libres.length < pend.length; i++) {
    const dia = dateAdd(todayStr(), i);
    for (const h of d.slots) { const f = `${dia}T${h}`; if (!ocupadas.has(f) && !xVencido(f)) libres.push(f); }
  }
  for (const [i, b] of pend.entries()) if (libres[i]) await xFecha(b.id, libres[i]);
  if (libres[0]) xs.semana = monday(libres[0].slice(0, 10));
  renderX();
}

async function xPedido() {
  try { const r = await api('x/pedido', post({})); await xCopiar(r.prompt, 'Copiado. Pegalo en Claude Code: es tu OK para agendarlos.'); }
  catch (e) { toast(e.message); }
}

function xAviso(t) {
  let el = document.querySelector('.xv-aviso'); if (!el) { el = document.createElement('div'); el.className = 'xv-aviso'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 3200);
}

// ---------- bookmarks y búsquedas: tweets ajenos para reaccionar ----------
// Un tweet por línea, en el orden en que los guardaste. Marcás «Me interesa» o «No me interesa» y, si querés, dejás qué
// querés decir; «Copiar pedido» se lo pasa a Claude Code, que redacta y deja los tweets en Borradores. Bookmarks y
// Búsquedas comparten fila, marcas, notas y pedido.
const xBkTipo = (b, d, usados) => d.estado[b.id]?.estado === 'descartado' ? 'descartados' : usados.has(b.id) ? 'usados' : d.estado[b.id]?.estado === 'interesa' ? 'interesa' : 'nuevos';
function xSinRepetir(lista) { const vistos = new Set(); return lista.filter(b => !vistos.has(b.id) && vistos.add(b.id)); }
// Lo recién marcado se queda en su lugar hasta cambiar de filtro: la lista no salta y ahí se le deja la nota.
const xPorEstado = (lista, d, usados) => lista.filter(b => xs.bkFiltro === 'todos' || xBkTipo(b, d, usados) === xs.bkFiltro || (xs.bkFiltro === 'nuevos' && xs.bkRecien.has(b.id)));
const xMarcados = (d, usados) => xSinRepetir([...d.bookmarks, ...(d.busquedas || []).flatMap(x => x.items)]).filter(b => xBkTipo(b, d, usados) === 'interesa');
const xTemaDe = b => b.tema || 'sin';
const xTemaNombre = d => { const n = Object.fromEntries((d.temas || []).map(t => [t.id, t.nombre])); return t => n[t] || (t === 'sin' ? 'Sin tema' : t); };
// El color de cada tema sale de su lugar en tu lista (los temas son tuyos).
const xTemaColor = (d, t) => { const i = (d.temas || []).findIndex(x => x.id === t); return i < 0 ? 'sin' : String(i % 10); };

function xChipsHtml(lista, d, usados) {
  const cuenta = { nuevos: 0, interesa: 0, usados: 0, descartados: 0, todos: lista.length };
  lista.forEach(b => { cuenta[xBkTipo(b, d, usados)]++; });
  return `<div class="xv-chips" role="group" aria-label="Qué tweets">${X_BK.map(([k, l]) => `<button class="xv-chip${xs.bkFiltro === k ? ' on' : ''}" data-xbk="${k}" aria-pressed="${xs.bkFiltro === k}">${l}<span class="n">${cuenta[k] || ''}</span></button>`).join('')}</div>`;
}
function xPedidoBtn(d, usados) {
  const n = xMarcados(d, usados).length;
  return `<button class="${n ? 'primary' : 'secondary'} xv-mandar" data-xpedidobk ${n ? '' : 'disabled'} title="Copia el pedido; al pegarlo en Claude Code redacta un tweet por cada uno y los deja en Borradores">${xIc('copiar')}Copiar pedido para Claude Code${n ? ` <span class="count">${n}</span>` : ''}</button>`;
}
function xFilasHtml(lista, d, usados) {
  const ver = lista.slice(0, xs.bkVer), resto = lista.length - ver.length;
  return `<div class="xtw-grid">${ver.map(b => xTweetHtml(b, { estado: xBkTipo(b, d, usados), notas: d.bookmark_notas?.[b.id] || [] })).join('')}
    ${resto ? `<button class="secondary xtw-mas" data-xver>Ver ${Math.min(X_PAGINA, resto)} más · quedan ${resto}</button>` : ''}</div>`;
}

function xBookmarksHtml(d, usados) {
  const sel = xs.bkTemas, nombre = xTemaNombre(d), base = xPorEstado(d.bookmarks, d, usados);
  const lista = sel.length ? base.filter(b => sel.includes(xTemaDe(b))) : base;
  const txt = !sel.length ? 'Todos' : sel.length === 1 ? nombre(sel[0]) : String(sel.length);
  const temas = (d.temas || []).length ? `<span class="rf-bar-sep" aria-hidden="true"></span>
    <button class="rf-dd rf-ddm${sel.length ? ' on' : ''}" data-xdd="temas" aria-haspopup="menu" title="${esc(sel.length ? `Temas: ${sel.map(nombre).join(', ')}` : 'Filtrar por temas')}"><span class="k">Temas</span><b>${esc(txt)}</b>${xIc('chev', 'chev')}</button>` : '';
  const barra = `<div class="rf-bar xv-bar">${xChipsHtml(d.bookmarks, d, usados)}${temas}
    <span class="rf-bar-fin">${d.actualizado ? `<span class="xv-nota-in">Bajados ${esc(xHace(d.actualizado))} · los últimos ${d.bookmarks.length} que guardaste, de ${(d.total_bookmarks || d.bookmarks.length).toLocaleString(LOCALE)}</span>` : ''}
      ${xPedidoBtn(d, usados)}</span></div>`;
  if (!d.bookmarks.length) return barra + '<div class="xv-empty"><b>Todavía no bajaste tus bookmarks.</b><span>Pedile a Claude Code «bajá mis bookmarks de X». La primera vez te guía para autorizar la lectura (sólo lectura: no puede publicar nada).</span></div>';
  if (!lista.length) return barra + '<div class="xv-empty"><b>Nada por acá.</b></div>';
  return barra + xFilasHtml(lista, d, usados);
}

// Varios temas a la vez: tildar no cierra el menú.
function xMenuTemas(btn) {
  const d = xs.data, usados = xUsados(d), nombre = xTemaNombre(d);
  const html = () => { const base = xPorEstado(d.bookmarks, d, usados), n = t => base.filter(b => xTemaDe(b) === t).length;
    const ids = [...(d.temas || []).map(t => t.id), ...(base.some(b => !b.tema) ? ['sin'] : [])].sort((a, b) => (a === 'sin') - (b === 'sin') || n(b) - n(a));
    return `<div class="rf-pop xv-pop" role="menu"><div class="rf-pop-h"><b>Temas</b>${xs.bkTemas.length ? '<button class="link" data-v="">Ver todos</button>' : ''}</div>
      ${ids.map(t => { const on = xs.bkTemas.includes(t), c = n(t);
        return `<button class="gv-pop-opt xv-opt rf-multi${on ? ' on' : ''}${c ? '' : ' cero'}" data-v="${esc(t)}" role="menuitemcheckbox" aria-checked="${on}"><span class="rf-caja">${on ? ICON.check : ''}</span><i class="xv-dot tm-${xTemaColor(d, t)}" aria-hidden="true"></i><span class="t">${esc(nombre(t))}</span><span class="n">${c}</span></button>`; }).join('')}</div>`; };
  gvMenu(btn, html(), e => {
    const b = e.target.closest('[data-v]'); if (!b) return; const v = b.dataset.v;
    xs.bkTemas = v === '' ? [] : xs.bkTemas.includes(v) ? xs.bkTemas.filter(x => x !== v) : [...xs.bkTemas, v];
    store.set('xBkTemas', xs.bkTemas); xs.bkVer = X_PAGINA; renderX();
    // El botón se redibujó: el menú sigue anclado al nuevo.
    gv.menuAnchor = document.querySelector('#xBody [data-xdd="temas"]') || gv.menuAnchor;
    const p = document.getElementById('gvPop'); if (p && !p.hidden) p.innerHTML = html();
  });
}

// Búsquedas: lo que Claude Code trae con engine/x/buscar.py, de la más nueva a la más vieja; arranca en la última.
const xBusqActual = d => xs.busq === 'todas' ? null : (d.busquedas || []).find(x => x.id === xs.busq) || d.busquedas?.[0] || null;
function xBusquedasHtml(d, usados) {
  const todas = d.busquedas || [];
  if (!todas.length) return '<div class="xv-empty"><b>Todavía no hay búsquedas.</b><span>Pedile a Claude Code «buscá en X sobre…» y lo que traiga aparece acá, para marcar lo que te interesa y dejarle tu idea.</span></div>';
  const sel = xBusqActual(d), items = sel ? sel.items : xSinRepetir(todas.flatMap(x => x.items)), lista = xPorEstado(items, d, usados);
  const barra = `<div class="rf-bar xv-bar">${xChipsHtml(items, d, usados)}<span class="rf-bar-sep" aria-hidden="true"></span>
    <button class="rf-dd rf-ddm on" data-xdd="busqueda" aria-haspopup="menu" title="${esc(sel ? sel.query || sel.consulta : 'Todas las búsquedas')}"><span class="k">Búsqueda</span><b>${esc(sel ? sel.consulta : 'Todas')}</b>${xIc('chev', 'chev')}</button>
    <span class="rf-bar-fin">${sel ? `<span class="xv-nota-in">Buscada ${esc(xHace(sel.creado))} · ${sel.items.length} tweets</span>` : ''}
      ${xPedidoBtn(d, usados)}</span></div>`;
  if (!lista.length) return barra + '<div class="xv-empty"><b>Nada por acá.</b></div>';
  return barra + xFilasHtml(lista, d, usados);
}
function xMenuBusqueda(btn) {
  const d = xs.data, sel = xBusqActual(d);
  const html = `<div class="rf-pop xv-pop" role="menu">${xOpt('todas', 'Todas', !sel, xSinRepetir(d.busquedas.flatMap(x => x.items)).length)}
    ${d.busquedas.map(x => xOpt(x.id, x.consulta, sel?.id === x.id, x.items.length, xHace(x.creado))).join('')}</div>`;
  gvMenu(btn, html, e => { const b = e.target.closest('[data-v]'); if (!b) return; xs.busq = b.dataset.v; xs.bkVer = X_PAGINA; gvMenuClose(); renderX(); scrollTo(0, 0); });
}

// Un post ajeno como se ve en X: foto y nombre, el texto, la media adentro (fotos en grilla, video con ▶ y duración), el
// post citado en su recuadro y las métricas con los íconos de X.
const xLimpio = t => String(t || '').replace(/(\s*https:\/\/t\.co\/\S+)+\s*$/g, '').replace(/https:\/\/t\.co\/\S+/g, '🔗');
const xDur = ms => { const s = Math.round((ms || 0) / 1000); return ms ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''; };
function xMediaTw(media, chico = false) {
  const ms = (media || []).filter(m => m.preview || m.url);
  if (!ms.length) return '';
  const una = m => { const video = /video|gif/.test(m.tipo || '');
    return `<span class="xtw-m${video ? ' video' : ''}"><img src="${esc(m.preview || m.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      ${video ? `<span class="xtw-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span><span class="xtw-dur">${m.tipo === 'animated_gif' ? 'GIF' : esc(xDur(m.duracion_ms) || 'Video')}</span>` : ''}</span>`; };
  const m0 = ms[0], prop = ms.length === 1 && m0.ancho && m0.alto ? Math.min(Math.max(m0.alto / m0.ancho, 0.5), 1) : null;
  return `<div class="xtw-media n${Math.min(ms.length, 4)}${chico ? ' chico' : ''}"${prop && !chico ? ` style="aspect-ratio: ${1 / prop}"` : ''}>${ms.slice(0, 4).map(una).join('')}</div>`;
}
// Un artículo de X o la tarjeta de un sitio: su texto es sólo un link, así que se muestra como en X, con portada, título y
// resumen. Sin `url` no es un link, porque va adentro del recuadro de una cita, que ya lo es.
function xArticuloHtml(art, url) {
  const adentro = `${art.portada ? `<img src="${esc(art.portada)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    <span class="xtw-art-t"><small>${esc(art.sitio || 'Artículo')}</small><b>${esc(art.titulo || '')}</b>${art.resumen ? `<span>${esc(art.resumen)}</span>` : ''}</span>`;
  return url ? `<a class="xtw-art" href="${esc(url)}" target="_blank" rel="noopener">${adentro}</a>` : `<span class="xtw-art">${adentro}</span>`;
}
function xTweetHtml(b, { estado = null, notas = [] } = {}) {
  const a = b.autor || {}, m = b.metricas || {}, q = b.cita;
  const n = (ic, v, t) => v ? `<span class="xtw-n" title="${t}">${xIc(ic)}${xNum(v)}</span>` : '';
  // Las dos decisiones, siempre en el mismo lugar a la derecha del tweet para poder ir bajando y marcando.
  const decide = estado === 'nuevos' ? `<div class="xtw-dec"><button class="xtw-si" data-xbkestado="interesa" data-xbid="${esc(b.id)}" title="Claude Code redacta un tweet sobre este post cuando le pegues el pedido">${xIc('check')}Me interesa</button>
      <button class="xtw-no" data-xbkestado="descartado" data-xbid="${esc(b.id)}" title="No quiero hablar de esto">${xIc('x')}No me interesa</button></div>`
    : estado === 'interesa' ? `<div class="xtw-dec"><span class="tag ok">Te interesa</span><button class="ghost" data-xbkestado="" data-xbid="${esc(b.id)}">${xIc('volver')}Deshacer</button></div>`
    : estado === 'descartados' ? `<div class="xtw-dec"><button class="ghost" data-xbkestado="" data-xbid="${esc(b.id)}">${xIc('volver')}Recuperar</button></div>`
    : estado === 'usados' ? '<div class="xtw-dec"><span class="tag accent">En borrador</span></div>' : '';
  return `<article class="xtw${estado === 'descartados' ? ' apagado' : ''}">
    ${xAvatar(a.avatar, a.handle)}
    <div class="xtw-main">
      <div class="xtw-h"><b>${esc(a.nombre || a.handle || '')}</b>${a.verificado ? xVerif() : ''}<span>@${esc(a.handle || '?')} · ${esc(xHace(b.fecha))}</span>${b.tema && xs.data ? `<i class="xv-dot tm-${xTemaColor(xs.data, b.tema)}" title="${esc(xTemaNombre(xs.data)(b.tema))}"></i>` : ''}</div>
      ${xLimpio(b.texto) ? `<p class="xtw-t${xs.bkAbiertos.has(b.id) ? ' abierto' : ''}">${xTxt(xLimpio(b.texto))}</p><button class="xtw-vermas" data-xvermas="${esc(b.id)}" ${xs.bkAbiertos.has(b.id) ? '' : 'hidden'}>${xs.bkAbiertos.has(b.id) ? 'Mostrar menos' : 'Mostrar más'}</button>` : ''}
      ${b.articulo ? xArticuloHtml(b.articulo, b.articulo.url || xUrl(b)) : ''}
      ${xMediaTw(b.media)}
      ${q ? `<a class="xtw-cita" href="${esc(xUrl(q))}" target="_blank" rel="noopener"><span class="xtw-h">${xAvatar(q.autor?.avatar, q.autor?.handle, 'xs')}<b>${esc(q.autor?.nombre || '')}</b>${q.autor?.verificado ? xVerif() : ''}<span>@${esc(q.autor?.handle || '')}</span></span>
        ${xLimpio(q.texto) ? `<span class="xtw-t corto">${xTxt(xLimpio(q.texto))}</span>` : ''}${q.articulo ? xArticuloHtml(q.articulo) : ''}${xMediaTw(q.media, true)}</a>` : ''}
      <div class="xtw-pie">${n('resp', m.respuestas, 'Respuestas')}${n('repost', m.reposts, 'Reposts')}${n('like', m.likes, 'Me gusta')}${n('vistas', m.vistas, 'Vistas')}
        <span class="xtw-acc"><a class="ghost" href="${esc(xUrl(b))}" target="_blank" rel="noopener" title="Abrir en X">${xIc('abrir')}Abrir</a></span></div>
      ${estado === 'interesa' ? `<div class="xtw-nota">${xFeedbackHtml({ id: b.id, feedback: notas }, 'Qué querés decir de esto (opcional): escribí o grabá un audio')}</div>` : ''}
    </div>
    ${decide}
  </article>`;
}

async function xBookmarkEstado(id, estado) {
  try {
    const r = await api('x/bookmark', post({ id, estado: estado || null })); xs.data.estado = r.estado;
    if (estado === 'interesa') xs.bkRecien.add(id); else xs.bkRecien.delete(id);
    renderX();
    if (estado === 'interesa') document.querySelector(`#xBody input[data-xfbtext="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  } catch (e) { toast(e.message); }
}

// El pedido de lo marcado «Me interesa» que todavía no tiene borrador, venga de Bookmarks o de Búsquedas, con lo que
// querés decir de cada uno. Lo escrito sin Enter se guarda antes de copiar. Pegarlo dispara la redacción; no agenda nada.
async function xPedidoBookmarks() {
  const d = xs.data, usados = xUsados(d), lista = xMarcados(d, usados);
  if (!lista.length) return;
  for (const b of lista) { const t = String(xs.fbBorrador[b.id] || '').trim(); if (t) await xFeedbackGuardar(b.id, t, null); }
  const nota = n => [n.text && `  · Lo que quiero decir: «${n.text}»`, n.audio && `  · Lo que quiero decir, en audio: ${n.audio}${n.audio_seconds ? ` (${Math.round(n.audio_seconds)} s)` : ''}`].filter(Boolean).join('\n');
  const lineas = lista.map(b => [`- ${b.id} · @${b.autor?.handle || '?'} · «${(b.articulo?.titulo || xLimpio(b.texto)).split('\n')[0].slice(0, 80)}» · ${xUrl(b)}`,
    ...(xs.data.bookmark_notas?.[b.id] || []).filter(n => n.estado !== 'aplicado').map(nota)].join('\n'));
  const msg = `${tituloMensaje('Planificación', lista.length === 1 ? 'Redactar un tweet sobre un post que marqué' : `Redactar ${lista.length} tweets sobre posts que marqué`)}\n\nCon la skill x-borradores (sección «Reaccionar a lo marcado»), redactá un tweet sobre cada uno de estos ${lista.length} posts que marqué «Me interesa». Si dejé una nota, partí de lo que quiero decir; \`python3 engine/x/aprender.py marcados\` los junta y transcribe los audios. Revisá tono y posicionamiento y dejalos en Borradores, sin agendar:\n${lineas.join('\n')}`;
  await xCopiar(msg, 'Copiado. Pegalo en Claude Code: redacta los tweets y los deja en Borradores.');
}

// ---------- cuentas: la base de cuentas que seguís, con ficha ----------
const X_COLS = [['cuenta', 'Cuenta'], ['tier', 'Tipo'], ['bookmarks', 'Bookmarks', 'n'], ['likes', 'Me gusta típicos', 'n'], ['ultimo', 'Último bookmark'], ['why', 'Por qué está']];
const xTipos = d => [['todas', 'Todas'], ...(d.tipos || []).map(t => [t.id, t.nombre]), ['sin', 'Sin tipo']];
const xTipoNombre = (d, k) => (d.tipos || []).find(t => t.id === k)?.nombre || (k ? k : 'Sin tipo');
const xTipoColor = (d, k) => { const i = (d.tipos || []).findIndex(t => t.id === k); return i < 0 ? 'sin' : String(i % 10); };
function xCuentasHtml(d) {
  // «Tono» suma las que confirmaste como tu tono aunque sean de otro tipo.
  const deTier = (c, k) => k === 'todas' || (k === 'sin' ? !c.tipo : c.tipo === k || (k === 'voz' && c.voz === true));
  const cuenta = Object.fromEntries(xTipos(d).map(([k]) => [k, d.cuentas.filter(c => deTier(c, k)).length]));
  const ord = { cuenta: (a, b) => a.handle.localeCompare(b.handle), tier: (a, b) => String(a.tipo || '~').localeCompare(String(b.tipo || '~')) || (b.bookmarks - a.bookmarks),
    bookmarks: (a, b) => b.bookmarks - a.bookmarks || a.handle.localeCompare(b.handle), likes: (a, b) => (b.likes_mediana ?? -1) - (a.likes_mediana ?? -1),
    ultimo: (a, b) => String(b.ultimo_bookmark || '').localeCompare(String(a.ultimo_bookmark || '')), why: (a, b) => a.why.localeCompare(b.why) }[xs.orden] || (() => 0);
  const lista = d.cuentas.filter(c => deTier(c, xs.tier)).sort(ord);
  const sel = d.cuentas.find(c => c.handle === xs.cuentaSel);
  const barra = `<div class="rf-bar xv-bar"><div class="xv-chips" role="group" aria-label="Tipo de cuenta">${xTipos(d).filter(([k]) => k === 'todas' || cuenta[k]).map(([k, l]) => `<button class="xv-chip${xs.tier === k ? ' on' : ''}" data-xtier="${esc(k)}" aria-pressed="${xs.tier === k}">${k !== 'todas' ? `<i class="xv-dot t-${xTipoColor(d, k === 'sin' ? null : k)}" aria-hidden="true"></i>` : ''}${esc(l)}<span class="n">${cuenta[k] || ''}</span></button>`).join('')}</div>
    <span class="rf-bar-fin xv-nota-in">${lista.length} cuentas · tu base y las que más guardás</span></div>`;
  if (!d.cuentas.length) return barra + '<div class="xv-empty"><b>Todavía no hay cuentas.</b><span>Aparecen solas las que más guardás en tus bookmarks. Para armar tu base con su tipo y por qué la seguís, pedile a Claude Code «armá mi base de cuentas de X».</span></div>';
  const th = ([k, l, n]) => `<th class="${n || ''}" aria-sort="${xs.orden === k ? 'descending' : 'none'}"><button data-xorden="${k}">${l}</button></th>`;
  const filas = lista.map(c => `<tr class="${c.handle === xs.cuentaSel ? 'on' : ''}" data-xcuenta="${esc(c.handle)}">
      <td><span class="rf-quien">${xAvatar(c.avatar, c.handle, 'xs')}<b>@${esc(c.handle)}</b>${c.verificado ? xVerif() : ''}<span>${esc(c.nombre || '')}</span></span></td>
      <td><span class="xv-tier"><i class="xv-dot t-${xTipoColor(d, c.tipo)}" aria-hidden="true"></i>${esc(xTipoNombre(d, c.tipo))}${c.voz === true ? ' <span class="tag ok">Tu tono</span>' : ''}</span></td>
      <td class="n">${c.bookmarks || '<span class="xv-sd">0</span>'}</td><td class="n">${c.likes_mediana != null ? xNum(c.likes_mediana) : '<span class="xv-sd">—</span>'}</td>
      <td>${esc(xHace(c.ultimo_bookmark)) || '<span class="xv-sd">—</span>'}</td><td class="xc-why">${esc(c.why)}</td></tr>`).join('');
  return barra + `<div class="rfc${sel ? '' : ' solo'} xc">
    <div class="rfc-wrap"><table class="rfc-table"><thead><tr>${X_COLS.map(th).join('')}</tr></thead><tbody>${filas || '<tr><td class="rfc-vacia" colspan="6">No hay cuentas de este tipo.</td></tr>'}</tbody></table></div>
    ${sel ? xFichaHtml(sel, d) : ''}</div>`;
}

function xFichaHtml(c, d) {
  const suyos = d.bookmarks.filter(b => String(b.autor?.handle || '').toLowerCase() === c.handle.toLowerCase());
  return `<aside class="rf-panel xc-ficha" aria-label="Ficha de @${esc(c.handle)}">
    <div class="xc-ficha-h">${xAvatar(c.avatar, c.handle, 'lg')}<div><b>${esc(c.nombre || '@' + c.handle)}${c.verificado ? xVerif() : ''}</b><span>@${esc(c.handle)}</span></div>
      <button class="icon xc-cerrar" data-xcuenta="" aria-label="Cerrar la ficha">${xIc('x')}</button></div>
    <p class="xv-tier"><i class="xv-dot t-${xTipoColor(d, c.tipo)}" aria-hidden="true"></i>${esc(xTipoNombre(d, c.tipo))} · ${c.bookmarks} ${c.bookmarks === 1 ? 'bookmark' : 'bookmarks'}${c.likes_mediana != null ? ` · ${xNum(c.likes_mediana)} me gusta típicos` : ''}</p>
    ${c.why ? `<p class="xc-why-l">${esc(c.why)}</p>` : ''}
    <div class="xc-voz"><b>¿Querés tomar el tono de esta cuenta?</b><div class="xc-voz-bts">
      <button class="${c.voz === true ? 'on si' : ''}" data-xvoz="true" data-xh="${esc(c.handle)}">${xIc('check')}Sí, es mi tono</button>
      <button class="${c.voz === false ? 'on no' : ''}" data-xvoz="false" data-xh="${esc(c.handle)}">${xIc('x')}No</button></div></div>
    <a class="ghost xc-abrir" href="https://x.com/${esc(c.handle)}" target="_blank" rel="noopener">${xIc('abrir')}Ver perfil en X</a>
    <h3>Lo que le guardaste</h3>
    ${suyos.length ? suyos.slice(0, 12).map(b => `<div class="xe-fuente">${xFuenteHtml(b, 'resumen')}</div>`).join('') : '<p class="xv-nota">Nada en tus últimos bookmarks.</p>'}
  </aside>`;
}

async function xVoz(handle, voz) {
  const c = xs.data.cuentas.find(x => x.handle === handle); const nuevo = c.voz === voz ? null : voz;
  try { await api('x/cuenta', post({ handle, voz: nuevo })); c.voz = nuevo; renderX(); } catch (e) { toast(e.message); }
}

// ---------- eventos ----------
document.addEventListener('click', e => {
  const t = e.target.closest('#xView [data-xtab], #xView [data-xfiltro], #xView [data-xorigen], #xView [data-xsel], #xView [data-xbk], #xView [data-xtier], #xView [data-xestado], #xView [data-xparte], #xView [data-xquitar], #xView [data-xbkestado], #xView [data-xorden], #xView [data-xcuenta], #xView [data-xvoz], #xView [data-xsem], #xView [data-xrepartir], #xView [data-xpedido], #xView [data-xir], #xView [data-xabrir], #xView [data-xrec], #xView [data-xfbdel], #xView [data-xmandar], #xView [data-xdd], #xView [data-xver], #xView [data-xvermas], #xView [data-xpedidobk]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.xtab) { xs.tab = ds.xtab; store.set('xTab', xs.tab); xs.bkRecien.clear(); xs.bkVer = X_PAGINA; renderX(); }
  else if (ds.xfiltro) { xs.filtro = ds.xfiltro; store.set('xFiltro', xs.filtro); xs.sel = null; renderX(); }
  else if (ds.xorigen) { xs.origen = ds.xorigen; store.set('xOrigen', xs.origen); xs.sel = null; renderX(); }
  else if (ds.xsel) { xs.sel = ds.xsel; renderX(); }
  else if (ds.xbk) { xs.bkFiltro = ds.xbk; store.set('xBkFiltro', xs.bkFiltro); xs.bkRecien.clear(); xs.bkVer = X_PAGINA; renderX(); }
  else if (ds.xtier) { xs.tier = ds.xtier; store.set('xTier', xs.tier); renderX(); }
  else if (ds.xestado) xEstado(ds.xid, ds.xestado);
  else if (ds.xparte) xCambiarPartes(ds.xparte, ps => [...ps, { texto: '' }]);
  else if (ds.xquitar) xCambiarPartes(ds.xquitar, ps => ps.filter((_, i) => i !== Number(ds.parte)));
  else if ('xbkestado' in ds) xBookmarkEstado(ds.xbid, ds.xbkestado);
  else if (ds.xorden) { xs.orden = ds.xorden; store.set('xOrden', xs.orden); renderX(); }
  else if ('xcuenta' in ds) { xs.cuentaSel = ds.xcuenta && ds.xcuenta !== xs.cuentaSel ? ds.xcuenta : null; renderX(); }
  else if (ds.xvoz) xVoz(ds.xh, ds.xvoz === 'true');
  else if ('xsem' in ds) { xs.semana = ds.xsem === '0' ? monday(todayStr()) : dateAdd(xs.semana || monday(todayStr()), Number(ds.xsem)); renderX(); }
  else if ('xrepartir' in ds) xRepartir();
  else if ('xpedido' in ds) xPedido();
  else if ('xpedidobk' in ds) xPedidoBookmarks();
  else if (ds.xir) { xs.tab = ds.xir; store.set('xTab', xs.tab); renderX(); }
  else if (ds.xdd) (ds.xdd === 'temas' ? xMenuTemas : xMenuBusqueda)(t);
  else if ('xver' in ds) { xs.bkVer += X_PAGINA; renderX(); }
  else if (ds.xvermas) { if (!xs.bkAbiertos.delete(ds.xvermas)) xs.bkAbiertos.add(ds.xvermas); renderX(); }
  else if (ds.xrec) xGrabar(ds.xrec);
  else if (ds.xfbdel) xFeedbackBorrar(ds.xid, ds.xfbdel);
  else if ('xmandar' in ds) xMandarFeedback();
  else if (ds.xabrir) { const b = xBorrador(ds.xabrir); if (b) { xs.tab = 'borradores'; xs.filtro = xEst(b); xs.origen = 'todos'; xs.sel = b.id; renderX(); } }
});
document.addEventListener('input', e => {
  const nota = e.target.closest('#xView input[data-xfbtext]'); if (nota) { xs.fbBorrador[nota.dataset.xfbtext] = nota.value; return; }
  const t = e.target.closest('#xView textarea.xt-txt'); if (!t || t.readOnly) return;
  xAjustar(t);
  const cnt = document.querySelector(`[data-cnt="${CSS.escape(t.dataset.xid + '-' + t.dataset.parte)}"]`);
  if (cnt) { const n = xLargo(t.value); cnt.textContent = `${n}/${X_LIMITE}`; cnt.classList.toggle('pasado', n > X_LIMITE); }
  const el = document.querySelector(`[data-save="${CSS.escape(t.dataset.xid)}"]`); if (el) el.textContent = 'Sin guardar';
  xGuardar(t.dataset.xid);
});
// Arrastrar en la semana: de «Para agendar» a un horario, entre horarios o de vuelta a la bandeja.
document.addEventListener('dragstart', e => { const c = e.target.closest?.('#xView [data-xdrag][draggable="true"]'); if (!c) return; e.dataTransfer.setData('text/x-borrador', c.dataset.xdrag); e.dataTransfer.effectAllowed = 'move'; document.body.classList.add('x-arrastrando'); });
document.addEventListener('dragend', () => { document.body.classList.remove('x-arrastrando'); document.querySelectorAll('#xView .x-sobre').forEach(n => n.classList.remove('x-sobre')); });
document.addEventListener('dragover', e => { const s = e.target.closest?.('#xView [data-xslot]'); if (!s || !e.dataTransfer.types.includes('text/x-borrador')) return; e.preventDefault(); document.querySelectorAll('#xView .x-sobre').forEach(n => n !== s && n.classList.remove('x-sobre')); s.classList.add('x-sobre'); });
document.addEventListener('drop', e => { const s = e.target.closest?.('#xView [data-xslot]'); const id = e.dataTransfer.getData('text/x-borrador'); if (!s || !id) return; e.preventDefault(); xMover(id, s.dataset.xslot || null); });
// Teclado en Borradores: ↑↓ para moverse, A aprueba y X descarta (fuera de los textos).
document.addEventListener('keydown', e => {
  if (typeof view === 'undefined' || view !== 'x' || xs.tab !== 'borradores' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('textarea, input, select') || document.querySelector('dialog[open]')) return;
  const lista = xs.data ? xFiltrados(xs.data) : [], i = lista.findIndex(b => b.id === xs.sel);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const n = lista[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { e.preventDefault(); xs.sel = n.id; renderX(); document.querySelector('#xView .xr.on')?.scrollIntoView({ block: 'nearest' }); } }
  else if ((e.key === 'a' || e.key === 'A') && lista[i] && xEst(lista[i]) === 'borrador') xEstado(lista[i].id, 'aprobado');
  else if ((e.key === 'x' || e.key === 'X') && lista[i] && xEst(lista[i]) === 'borrador') xEstado(lista[i].id, 'descartado');
});

// Enter en la nota escrita la guarda.
document.addEventListener('keydown', e => {
  const t = e.target.closest?.('#xView input[data-xfbtext]'); if (!t || e.key !== 'Enter' || !t.value.trim()) return;
  e.preventDefault(); const v = t.value; t.value = ''; xFeedbackGuardar(t.dataset.xfbtext, v, null);
});
