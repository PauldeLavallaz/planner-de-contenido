// Patrones de interfaz: esqueletos de carga, paleta ⌘K y etiquetas de la barra plegada, con los tokens del planner.
// Se carga antes que planner.js; lo de planner.js se lee al usarlo.

// ---------- esqueletos ----------
// Mientras algo carga se ve la forma de lo que viene, no un «Cargando…» suelto. `posters`: grilla de portadas; `list`: filas; `split`: lista + detalle; `cards`: tarjetas grandes.
function skeleton(kind = 'list', n) {
  const row = () => '<div class="skel-row"><span class="skel sq"></span><span class="skel-lines"><span class="skel l1"></span><span class="skel l2"></span></span></div>';
  const rows = k => Array.from({ length: k }, row).join('');
  const body = {
    posters: () => Array.from({ length: n || 12 }, () => '<span class="skel poster"></span>').join(''),
    list: () => rows(n || 8),
    split: () => `<div class="skel-col">${rows(n || 7)}</div><span class="skel panel"></span>`,
    cards: () => Array.from({ length: n || 2 }, () => '<span class="skel card"></span>').join(''),
  }[kind] || (() => rows(n || 8));
  return `<div class="skel-wrap skel-${kind}" role="status" aria-label="Cargando">${body()}</div>`;
}

// Al abrir el planner, hasta que llegan las piezas, las secciones están vacías: se ve la forma de la que se abre.
// planner.js llama a arranqueListo() después del primer render (o si falla la carga).
{
  const v = (() => { try { return JSON.parse(localStorage.getItem('planner.view')); } catch { return null; } })() || 'week';
  const forma = v === 'pieces' || v === 'history' ? 'list' : 'posters';
  document.body.classList.add('arrancando');
  document.querySelector('.topbar')?.insertAdjacentHTML('afterend', `<div id="arranque" class="arranque">${skeleton(forma)}</div>`);
}
function arranqueListo() { document.getElementById('arranque')?.remove(); document.body.classList.remove('arrancando'); }

// ---------- título de la conversación ----------
// La primera línea de cada mensaje para Claude Code es «[Etiqueta] qué se está haciendo», y .claude/hooks/titulo_desde_planner.py
// la vuelve el título de la conversación. Misma versión que src/titulo-mensaje.ts, que tiene el porqué.
const msgCortar = (t, max) => { const c = [...t]; if (c.length <= max) return t; const s = c.slice(0, max - 1).join(''), e = s.lastIndexOf(' '); return (e > max * 0.6 ? s.slice(0, e) : s).trimEnd() + '…'; };
const msgLimpio = t => String(t ?? '').split('\n')[0].replace(/@/g, '').replace(/\s+/g, ' ').trim();
const tituloMensaje = (etiqueta, descripcion) => `[${etiqueta}] ${msgCortar(msgLimpio(descripcion), 90)}`;
const sinTituloMensaje = mensaje => String(mensaje).replace(/^\[[^\]\n]+\] [^\n]*\n\n/, '');
const nombreMensaje = (t, max = 48) => { const x = msgLimpio(t); return x ? `«${msgCortar(x, max)}»` : ''; };
const msgDia = fecha => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(String(fecha).slice(0, 10) + 'T12:00:00Z')).replace(/[.,]/g, '').replace(/\s+de\s+/, ' ');
function diasMensaje(fechas) {
  const dias = [...new Set(fechas.map(f => String(f).slice(0, 10)))].sort();
  if (!dias.length) return '';
  const a = msgDia(dias[0]), b = msgDia(dias[dias.length - 1]);
  if (a === b) return `del ${a}`;
  return a.split(' ')[1] === b.split(' ')[1] ? `del ${a.split(' ')[0]} al ${b}` : `del ${a} al ${b}`;
}

// ---------- paleta ⌘K ----------
// Ir a una sección, cambiar de marca o abrir una pieza por su título desde cualquier lado, sin pasar por la barra.
const CMDK_NORM = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cmdk = { list: [], at: 0 };

function cmdkItems(q) {
  const words = CMDK_NORM(q).split(/\s+/).filter(Boolean), hit = s => words.every(w => CMDK_NORM(s).includes(w));
  const secciones = [...document.querySelectorAll('#navMenu [data-view]')].map(b => ({
    grupo: 'Secciones', label: b.querySelector('span')?.textContent || '', sub: b.title, icon: b.querySelector('svg')?.outerHTML || '',
    actual: b.dataset.view === view, run: () => b.click(),
  }));
  // Las marcas, si hay más de una.
  const ms = marcas(), perfiles = ms.length < 2 ? [] : [...ms.map(m => ({ id: m, label: BRAND_LABEL[m] || m })), { id: 'all', label: 'Todas las marcas' }].map(v => ({
    grupo: 'Marcas', label: v.label, sub: v.id === 'all' ? 'Todas las cuentas' : 'Cambiar de marca', icon: `<i class="cmdk-ini">${esc(v.id === 'all' ? '∗' : (v.label || '?')[0])}</i>`,
    actual: v.id === perfilActual, run: () => setPerfil(v.id),
  }));
  const oscuro = document.documentElement.dataset.theme === 'dark', plegada = document.body.classList.contains('side-plegada');
  const acciones = [
    { label: oscuro ? 'Tema claro' : 'Tema oscuro', run: () => $('themeToggle').click() },
    { label: plegada ? 'Desplegar la barra' : 'Plegar la barra', run: () => $('sideToggle').click() },
    { label: 'Consultar Postiz', sub: 'Trae lo agendado y lo publicado', run: () => $('sync').click() },
  ].map(a => ({ grupo: 'Acciones', icon: ICON_CMDK.accion, ...a }));
  const fijos = [...secciones, ...perfiles, ...acciones].filter(x => hit(x.label + ' ' + (x.sub || '')));
  if (!words.length) return fijos;
  // Las piezas sólo aparecen al escribir: son cientos y sin búsqueda no dicen nada.
  const piezas = (data?.items || [])
    .filter(i => !['discarded', 'component', 'archived'].includes(i.status) && hit([i.title, i.slug, i.brand].join(' ')))
    .sort((a, b) => (when(b) || b.created || '').localeCompare(when(a) || a.created || ''))
    .slice(0, 12)
    .map(i => {
      const w = when(i), u = thumbUrl(i);
      return {
        grupo: 'Piezas', label: i.title, sub: [statusOf(i)[1], w ? fmt(w.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + w.slice(11, 16) : ''].filter(Boolean).join(' · '),
        icon: u ? `<img class="cmdk-thumb" src="${esc(u)}" alt="" loading="lazy">` : '<i class="cmdk-thumb"></i>', run: () => openItem(i.id),
      };
    });
  return [...fijos, ...piezas];
}

const ICON_CMDK = {
  buscar: '<svg class="ti" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  accion: '<svg class="ti" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
};

function cmdkRender() {
  const box = $('cmdkList'), list = cmdk.list = cmdkItems($('cmdkInput').value);
  cmdk.at = Math.min(cmdk.at, Math.max(0, list.length - 1));
  let grupo = '';
  box.innerHTML = list.length ? list.map((x, k) => {
    const h = x.grupo !== grupo ? `<li class="cmdk-g" role="presentation">${esc(grupo = x.grupo)}</li>` : '';
    return `${h}<li id="cmdk-${k}" role="option" class="cmdk-it" data-k="${k}" aria-selected="${k === cmdk.at}">${x.icon}<span class="cmdk-t"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${x.actual ? '<span class="cmdk-now">Actual</span>' : ''}</li>`;
  }).join('') : '<li class="cmdk-vacio">No hay secciones, marcas ni piezas con ese nombre.</li>';
  $('cmdkInput').setAttribute('aria-activedescendant', list.length ? 'cmdk-' + cmdk.at : '');
}

function cmdkMove(d) {
  if (!cmdk.list.length) return;
  cmdk.at = (cmdk.at + d + cmdk.list.length) % cmdk.list.length;
  $('cmdkList').querySelectorAll('[aria-selected]').forEach(li => li.setAttribute('aria-selected', String(Number(li.dataset.k) === cmdk.at)));
  $('cmdkInput').setAttribute('aria-activedescendant', 'cmdk-' + cmdk.at);
  $('cmdk-' + cmdk.at)?.scrollIntoView({ block: 'nearest' });
}

function cmdkRun(k) { const x = cmdk.list[k]; if (!x) return; $('cmdk').close(); x.run(); }

function cmdkOpen() {
  if (!$('cmdk')) {
    const d = document.createElement('dialog');
    d.id = 'cmdk'; d.className = 'cmdk'; d.setAttribute('aria-label', 'Buscar o ir a');
    d.innerHTML = `<div class="cmdk-in">${ICON_CMDK.buscar}<input id="cmdkInput" type="text" placeholder="Buscá una sección, una marca o una pieza por su título" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmdkList"><kbd>esc</kbd></div>
      <ul id="cmdkList" class="cmdk-list" role="listbox"></ul>
      <div class="cmdk-pie"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>↵</kbd> abrir</span><span><kbd>⌘</kbd><kbd>K</kbd> abrir y cerrar</span></div>`;
    document.body.appendChild(d);
    $('cmdkInput').oninput = () => { cmdk.at = 0; cmdkRender(); };
    $('cmdkInput').onkeydown = e => {
      if (e.isComposing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cmdkMove(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') { e.preventDefault(); cmdkRun(cmdk.at); }
    };
    $('cmdkList').onclick = e => { const li = e.target.closest('[data-k]'); if (li) cmdkRun(Number(li.dataset.k)); };
    $('cmdkList').onpointermove = e => { const li = e.target.closest('[data-k]'); if (li && Number(li.dataset.k) !== cmdk.at) cmdkMove(Number(li.dataset.k) - cmdk.at); };
    d.onclick = e => { if (e.target === d) d.close(); };
  }
  $('cmdkInput').value = ''; cmdk.at = 0; cmdkRender();
  $('cmdk').showModal(); $('cmdkInput').focus();
}

document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'k') return;
  const abierto = document.querySelector('dialog[open]');
  if (abierto && abierto.id !== 'cmdk') return; // el editor de historias y los detalles tienen sus propios atajos
  e.preventDefault();
  if (abierto) abierto.close(); else cmdkOpen();
});
document.getElementById('cmdkBtn')?.addEventListener('click', () => cmdkOpen());

// ---------- etiquetas de la barra plegada ----------
// Plegada, la barra es sólo íconos y el `title` del navegador tarda y dice la descripción larga. Al pasar el mouse
// aparece el nombre al costado, al instante.
{
  const SEL = '.appside-nav [data-view], #perfilBtn, #cmdkBtn, #themeToggle, #sideToggle';
  let tip, de;
  const label = b => b.id === 'perfilBtn' ? 'Marca: ' + (b.querySelector('.perfil-t b')?.textContent || '') : b.querySelector(':scope > span')?.textContent?.trim() || b.getAttribute('aria-label') || b.dataset.tipTitle || '';
  const ocultar = () => { if (!de) return; if (de.dataset.tipTitle) { de.title = de.dataset.tipTitle; delete de.dataset.tipTitle; } de = null; tip?.classList.remove('on'); };
  document.addEventListener('pointerover', e => {
    const b = e.target.closest?.(SEL);
    if (b === de) return;
    ocultar();
    if (!b || !document.body.classList.contains('side-plegada')) return;
    const text = label(b); if (!text) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'side-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    if (b.title) { b.dataset.tipTitle = b.title; b.removeAttribute('title'); }
    de = b; tip.textContent = text;
    const r = b.getBoundingClientRect();
    tip.style.left = r.right + 10 + 'px'; tip.style.top = r.top + r.height / 2 + 'px';
    tip.classList.remove('on'); void tip.offsetWidth; tip.classList.add('on');
  });
  document.addEventListener('pointerdown', ocultar, true);
  new MutationObserver(() => { if (!document.body.classList.contains('side-plegada')) ocultar(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('scroll', ocultar, { passive: true, capture: true });
}
