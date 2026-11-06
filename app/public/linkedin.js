// Sección LinkedIn: lo que se publica en tu perfil y la búsqueda activa de quien necesita lo que vendés. Cinco pestañas con el
// lenguaje de Referencias y Twitter: Prospectos (lista y ficha de cada uno, con por qué califica, lo que busca y su Instagram),
// Videos (el video a medida de cada contacto, de elegir a enviar), Posts (el mini artículo como se ve en LinkedIn, con el corte
// del «ver más»), Métricas (semana por semana) y Referencias (el research de lo viral). Usa las utilidades de planner.js y el
// menú de guiones.js. Nada se envía desde acá: los textos se copian y los mandás vos.
const lis = { data: null, loading: false, error: null, tab: store.get('liTabV', 'prospectos'), filtro: store.get('liFiltro', 'nuevo'),
  nivel: store.get('liNivel', 'todos'), pais: store.get('liPais', 'todos'), senal: store.get('liSenalV2', 'pide_ia'), sel: null, postFiltro: store.get('liPostFiltro', 'borrador'),
  postSel: null, entero: false, idioma: store.get('liIdioma', 'todos'), timers: {}, vPaso: null, vSel: null, vElegidos: new Set(), vRubro: 'todos', vNivel: 'todos', vNotas: {}, vDescartados: false, vTimer: null, rec: null, fbBorrador: {}, fbGuardando: {} };
const LI_TABS = [['prospectos', 'Prospectos'], ['videos', 'Videos'], ['posts', 'Posts'], ['numeros', 'Métricas'], ['referencias', 'Referencias']];
const LI_ESTADOS = [['nuevo', 'Nuevos'], ['para_contactar', 'Para contactar'], ['contactado', 'Contactados'], ['respondio', 'Respondieron'], ['agendo', 'Agendaron'], ['descartado', 'Descartados']];
const LI_ESTADO_TXT = { nuevo: 'Nuevo', para_contactar: 'Para contactar', contactado: 'Contactado', respondio: 'Respondió', agendo: 'Agendó', descartado: 'Descartado' };
// El paso siguiente de cada estado, en el orden del embudo.
const LI_SIGUE = { nuevo: ['para_contactar', 'Para contactar'], para_contactar: ['contactado', 'Ya lo contactamos'], contactado: ['respondio', 'Respondió'], respondio: ['agendo', 'Agendó una llamada'] };
const LI_POSTS = [['borrador', 'Por revisar'], ['aprobado', 'Para programar'], ['agendado', 'Programados'], ['publicado', 'Publicados'], ['descartado', 'Descartados']];
const LI_PAIS = { ar: 'Argentina', cl: 'Chile', uy: 'Uruguay', py: 'Paraguay', bo: 'Bolivia', pe: 'Perú', ec: 'Ecuador', co: 'Colombia', ve: 'Venezuela',
  mx: 'México', gt: 'Guatemala', sv: 'El Salvador', hn: 'Honduras', ni: 'Nicaragua', cr: 'Costa Rica', pa: 'Panamá', do: 'Rep. Dominicana', cu: 'Cuba', pr: 'Puerto Rico', br: 'Brasil' };
// Las señales, de la más fuerte a la más débil: un posteo donde alguien pide ayuda vale más que un aviso laboral.
const LI_SENAL = [['pide_ia', 'Piden IA'], ['pide_servicio', 'Piden agencia'], ['contrata', 'Contratan'], ['busqueda_laboral', 'Avisos laborales'], ['todas', 'Todos']];
const LI_SENAL_NOTA = { pide_ia: 'Posteos de gente que le pide a alguien ayuda con contenido, marketing o automatización con IA.', pide_servicio: 'Posteos de gente que busca una agencia o pide que le recomienden una.', contrata: 'Empresas que publicaron en su feed que buscan a alguien para sus redes.', busqueda_laboral: 'Avisos laborales de los países de tu búsqueda. No son posteos.', todas: 'Todas las señales juntas, de la más fuerte a la más débil.' };
const LI_SENAL_TXT = { pide_ia: 'Pide IA', pide_servicio: 'Pide agencia', contrata: 'Contrata', busqueda_laboral: 'Aviso laboral' };
const liSenal = p => p.senal || 'busqueda_laboral';
const LI_FUENTE = { google: 'Google Jobs', linkedin: 'LinkedIn Empleos', computrabajo: 'Computrabajo', getonbrd: 'GetOnBoard' };
const LI_GANCHO = { bitacora: 'Bitácora', novedad_probada: 'Novedad probada', recurso: 'Recurso', historia: 'Historia', sentencia_con_caso: 'Contra lo obvio, con caso', caso_con_numero: 'Caso con número', sentencia_contraria: 'Contra lo obvio', escena_del_dueno: 'Escena del dueño', novedad_con_postura: 'Novedad con postura', metodo_en_pasos: 'Método en pasos' };
const LI_CORTE = 210; // lo que se lee en el teléfono antes del «…ver más»
const LI_LIMITE = 3000;
const LI_IC = {
  check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12', volver: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1',
  abrir: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h11',
  web: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', ig: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4zM17.5 6.5h.01',
  in: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  flecha: 'M5 12h14M13 6l6 6-6 6', copiar: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1', mundo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18',
};
const liIc = (k, cls = '') => `<svg class="lii ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${LI_IC[k]}"/></svg>`;
const liHace = iso => { if (!iso) return '';
  if (iso.length === 10) { const n = Math.round((new Date(todayStr() + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 864e5); if (n <= 0) return 'hoy'; if (n === 1) return 'ayer'; if (n < 14) return `hace ${n} días`; }
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso), h = (Date.now() - d) / 36e5;
  if (h < 1) return 'recién'; if (h < 24) return `hace ${Math.round(h)} h`; if (h < 48) return 'ayer'; if (h < 24 * 14) return `hace ${Math.round(h / 24)} días`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', ''); };
const liNum = v => v == null ? '—' : Number(v).toLocaleString('es-AR');
const liMedia = p => /^https?:/.test(p) ? p : `/api/planner/media?path=${encodeURIComponent(p)}`;
const liLogo = (p, cls = '') => p.logo
  ? `<img class="lilogo ${cls}" src="${esc(p.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : `<span class="lilogo ph ${cls}" aria-hidden="true">${esc(String(p.empresa || '?').slice(0, 1).toUpperCase())}</span>`;
const liTam = t => t ? String(t).replace(/\s*(employees?|empleados?)/, '').replace(/^De (\S+) a (\S+)$/, '$1-$2') + ' empleados' : '';
const liDia = f => f ? new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '') : 'Sin día';

async function liCargar() {
  if (lis.loading) return; lis.loading = true;
  try { lis.data = liPartir(await api('linkedin')); lis.error = null; } catch (e) { lis.error = e.message; }
  lis.loading = false; renderLinkedin();
}

// Los contactos con video tienen su propia pestaña: Prospectos sigue siendo lo que trae la búsqueda.
// Un prospecto entra a Videos al pasar a «Para contactar» y se queda ahí si ya tiene video.
const liEnVideos = p => p.senal === 'contacto' || p.estado === 'para_contactar' || !!p.video?.archivo || LV_EN_CURSO.includes(p.video?.estado);
function liPartir(d) {
  const todos = d.todos || d.prospectos || [];
  return { ...d, todos, contactos: todos.filter(liEnVideos), prospectos: todos.filter(p => p.senal !== 'contacto') };
}

// Filtro: un botón que muestra lo elegido y abre el menú de la casa (el de Guiones), en vez de un select nativo.
const LI_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const liDd = (clave, k, valor, activo) => `<button class="rf-dd li-dd${activo ? ' on' : ''}" data-lidd="${clave}" aria-haspopup="menu"><span class="k">${k}</span><b>${esc(valor)}</b>${LI_CHEV}</button>`;
function liDdAbrir(btn, opciones, actual, elegir) {
  gvMenu(btn, `<div class="gv-pop-list li-pop" role="menu">${opciones.map(([v, l, n]) => `<button class="gv-pop-opt${v === actual ? ' on' : ''}" role="menuitemradio" aria-checked="${v === actual}" data-v="${esc(v)}">${liIc('check', v === actual ? '' : 'li-oculto')}<span>${esc(l)}</span>${n != null ? `<small>${n}</small>` : ''}</button>`).join('')}</div>`, e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    elegir(b.dataset.v); gvMenuClose(); renderLinkedin();
  });
}

function renderLinkedin() {
  liContador();
  if (!lis.data && !lis.error) { $('liBody').innerHTML = skeleton('split'); liCargar(); return; }
  const d = lis.data || { prospectos: [], contactos: [], borradores: [], referencias: { posts: [] }, radar: {}, cuenta: {} };
  const n = { videos: d.contactos.filter(p => lvPaso(p) === 'revisar').length, prospectos: d.prospectos.filter(p => p.estado === 'nuevo').length, posts: d.borradores.filter(b => (b.estado || 'borrador') === 'borrador').length };
  $('liTabs').innerHTML = LI_TABS.map(([k, l]) => `<button role="tab" aria-selected="${lis.tab === k}" class="${lis.tab === k ? 'on' : ''}" data-litab="${k}">${l}${n[k] ? ` <span class="n">${n[k]}</span>` : ''}</button>`).join('');
  const r = lis.tab === 'videos' ? {} : d.radar || {};
  $('liEstado').innerHTML = r.actualizado ? `${liIc('busca')}<span>Búsqueda ${esc(liHace(r.actualizado))} · ${liNum(r.posteos_leidos)} ${r.posteos_leidos === 1 ? 'posteo' : 'posteos'} y ${liNum(r.avisos_leidos)} ${r.avisos_leidos === 1 ? 'aviso leído' : 'avisos leídos'}</span>` : '';
  if (lis.error) { $('liBody').innerHTML = `<p class="liv-vacio">No se pudo cargar LinkedIn: ${esc(lis.error)}</p>`; return; }
  $('liBody').innerHTML = lis.tab === 'videos' ? lvHtml(d) : lis.tab === 'posts' ? liPostsHtml(d) : lis.tab === 'numeros' ? liNumerosHtml({ ...d, prospectos: d.todos || [] }) : lis.tab === 'referencias' ? liReferenciasHtml(d) : liProspectosHtml(d);
  document.querySelectorAll('#liBody .lip-fb .fb-list').forEach(l => { l.scrollTop = l.scrollHeight; });
  lvVigilar(d);
}

// ---------- prospectos: lista a la izquierda, ficha a la derecha ----------
// Un prospecto es un posteo de LinkedIn (alguien pide agencia o una empresa contrata) o una empresa con avisos laborales.
const liPasa = (p, sinEstado) => (sinEstado || p.estado === lis.filtro) && (lis.nivel === 'todos' || p.nivel === lis.nivel)
  && (lis.pais === 'todos' || (p.pais || '') === (lis.pais === 'sin' ? '' : lis.pais)) && (lis.senal === 'todas' || liSenal(p) === lis.senal);
const liFiltrados = d => d.prospectos.filter(p => liPasa(p));
const liAvatar = (p, cls = '') => liSenal(p) === 'busqueda_laboral' ? liLogo(p, cls)
  : p.autor?.foto ? `<img class="lilogo redondo ${cls}" src="${esc(p.autor.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'lilogo ph redondo ${cls}', textContent: ${esc(JSON.stringify(String(p.autor?.nombre || p.empresa || '?').slice(0, 1).toUpperCase()))} }))">`
  : `<span class="lilogo ph redondo ${cls}" aria-hidden="true">${esc(String(p.autor?.nombre || p.empresa || '?').slice(0, 1).toUpperCase())}</span>`;

function liProspectosHtml(d) {
  const r = d.radar || {}, lista = liFiltrados(d);
  if (!lista.some(p => p.id === lis.sel)) lis.sel = lista[0]?.id || null;
  const cuenta = k => d.prospectos.filter(p => p.estado === k && liPasa(p, true)).length;
  const conSenal = k => d.prospectos.filter(p => p.estado !== 'descartado' && (k === 'todas' || liSenal(p) === k)).length;
  const senales = `<div class="li-senales" role="tablist" aria-label="Qué señal mirar">${LI_SENAL.map(([k, l]) => `<button class="li-senal${k === 'pide_ia' ? ' ia' : ''}${lis.senal === k ? ' on' : ''}" role="tab" aria-selected="${lis.senal === k}" data-lisenal="${k}">${l}<span class="n">${conSenal(k)}</span></button>`).join('')}</div>
    <p class="li-senal-nota">${esc(LI_SENAL_NOTA[lis.senal] || '')}</p>`;
  const barra = `${senales}<div class="rf-bar liv-bar">
    <div class="liv-chips" role="group" aria-label="Estado">${LI_ESTADOS.map(([k, l]) => `<button class="liv-chip${lis.filtro === k ? ' on' : ''}" data-lifiltro="${k}" aria-pressed="${lis.filtro === k}">${l}<span class="n">${cuenta(k) || ''}</span></button>`).join('')}</div>
    <div class="liv-filtros">
      ${liDd('nivel', 'Categoría', lis.nivel === 'todos' ? 'Todas' : lis.nivel, lis.nivel !== 'todos')}
      ${liDd('pais', 'País', lis.pais === 'todos' ? 'Todos' : lis.pais === 'sin' ? 'Sin país' : LI_PAIS[lis.pais] || lis.pais.toUpperCase(), lis.pais !== 'todos')}
    </div>
  </div>`;
  const pie = r.descartes?.length && (lis.senal === 'busqueda_laboral' || lis.senal === 'todas') ? `<details class="liv-descartes"><summary>${r.descartes.length} empresas con avisos que el filtro dejó afuera</summary>
    <ul>${r.descartes.map(x => `<li><b>${esc(x.empresa || 'Sin nombre')}</b> · ${esc(x.motivo)}<span> · ${esc((x.puestos || []).slice(0, 2).join(', '))}</span></li>`).join('')}</ul></details>` : '';
  if (!d.prospectos.length) return barra + `<div class="liv-empty"><b>Todavía no corrió la búsqueda.</b><span>Pedile a Claude Code «buscá prospectos en LinkedIn» (skill linkedin-prospectos) o corré <code>python3 engine/linkedin/prospectos.py</code>. Lee fuentes públicas, nunca tu cuenta.</span></div>`;
  if (!lista.length) return barra + `<div class="liv-empty"><b>Nada en ${esc(LI_ESTADO_TXT[lis.filtro].toLowerCase())} con estos filtros.</b></div>` + pie;
  const filas = lista.map(p => {
    const s = liSenal(p), a = (p.avisos || [])[0] || {};
    const linea = s === 'busqueda_laboral' ? `${esc(a.puesto || '')}${p.avisos?.length > 1 ? ` <i>+${p.avisos.length - 1}</i>` : ''}` : esc(p.que_pide || '');
    const pie2 = s === 'busqueda_laboral' ? [p.rubro, liTam(p.tamano), LI_PAIS[p.pais]] : [LI_PAIS[p.pais], liHace(p.post?.fecha), p.autor?.nombre !== p.empresa ? p.autor?.nombre : ''];
    return `<div class="lir${p.id === lis.sel ? ' on' : ''}" data-lisel="${esc(p.id)}" role="option" aria-selected="${p.id === lis.sel}" tabindex="-1">
      ${liAvatar(p)}
      <span class="lir-txt"><span class="lir-senal s-${s}">${esc(LI_SENAL_TXT[s])}</span><b>${esc(p.empresa)}</b><span>${linea}</span>
        <small>${esc(pie2.filter(Boolean).join(' · '))}</small></span>
      <span class="lir-fin"><span class="linivel n-${esc(p.nivel)}" title="Puntaje ${p.puntaje}">${esc(p.nivel)}</span>${p.nuevo && p.estado === 'nuevo' ? '<i class="lir-nuevo" title="Apareció en la última búsqueda"></i>' : ''}</span>
    </div>`;
  }).join('');
  const sel = lista.find(p => p.id === lis.sel);
  return barra + `<div class="lid2">
    <div class="rfb-list lid2-list" role="listbox" aria-label="Prospectos"><div class="rfb-head"><b>${lista.length}</b> ${lista.length === 1 ? 'prospecto' : 'prospectos'}<span class="rfb-head-fin"><kbd>↑</kbd><kbd>↓</kbd></span></div><div class="rfb-rows">${filas}</div></div>
    <section class="rf-panel lif" aria-label="Ficha del prospecto">${sel ? liFichaHtml(sel) : ''}</section>
  </div>` + pie;
}

function liDecideHtml(p) {
  const est = p.estado, sigue = LI_SIGUE[est];
  return est === 'descartado'
    ? `<div class="lif-estado"><span><b>Descartado</b>${p.decision?.nota ? ` · ${esc(p.decision.nota)}` : ''}</span><button class="ghost" data-liestado="nuevo" data-liid="${esc(p.id)}">${liIc('volver')}Recuperar</button></div>`
    : `<div class="lif-decide">${sigue ? `<button class="lif-si" data-liestado="${sigue[0]}" data-liid="${esc(p.id)}">${liIc(est === 'nuevo' ? 'check' : 'flecha')}${sigue[1]}${est === 'nuevo' ? '<kbd>A</kbd>' : ''}</button>` : `<span class="lif-fin">${liIc('cal')}Agendó una llamada</span>`}
        ${est !== 'nuevo' ? `<button class="ghost" data-liestado="${est === 'para_contactar' ? 'nuevo' : est === 'contactado' ? 'para_contactar' : est === 'respondio' ? 'contactado' : 'respondio'}" data-liid="${esc(p.id)}">${liIc('volver')}Un paso atrás</button>` : ''}
        <button class="lif-no" data-liestado="descartado" data-liid="${esc(p.id)}">${liIc('x')}Descartar${est === 'nuevo' ? '<kbd>X</kbd>' : ''}</button></div>`;
}

const liPasoHtml = p => `<div class="lif-paso"><span class="tag ${p.estado === 'agendo' ? 'ok' : p.estado === 'nuevo' ? 'accent' : ''}">${esc(LI_ESTADO_TXT[p.estado])}</span>${p.decision?.at ? `<small>${esc(liHace(p.decision.at))}</small>` : `<small>detectado ${esc(liHace(p.detectado))}</small>`}</div>`;
const LI_CANAL = '<p class="liv-nota lif-canal">Nada sale solo: los textos se copian desde acá. Escribir vos desde tu cuenta no la arriesga; lo que LinkedIn castiga es que lo haga un programa.</p>';
// Los textos del primer contacto que escribe buscar.py: comentario público (sólo si pidió agencia), nota de invitación,
// mensaje privado y mail. Cada uno con su botón de copiar.
const LI_TEXTOS = [['comentario', 'Comentario en el posteo', 450], ['nota', 'Nota de la invitación', 200], ['mensaje', 'Mensaje privado', 600], ['email', 'Mail', 900]];
function liTextosHtml(p) {
  const t = p.textos;
  if (!t) return '<h3>Para contactar</h3><p class="liv-nota">Los textos se escriben en la próxima búsqueda.</p>';
  const bloques = LI_TEXTOS.filter(([k]) => t[k]).map(([k, l, max]) => `<div class="lit">
      <div class="lit-h"><b>${l}</b><small class="${t[k].length > max ? 'pasado' : ''}">${t[k].length} caracteres</small>
        <button class="ghost" data-licopiar="${esc(p.id)}" data-campo="${k}">${liIc('copiar')}Copiar</button></div>
      ${k === 'email' && t.email_asunto ? `<p class="lit-asunto">Asunto: ${esc(t.email_asunto)}</p>` : ''}
      <p class="lit-t">${esc(t[k]).replace(/\n/g, '<br>')}</p></div>`).join('');
  return `<h3>Para contactar</h3><div class="lits">${bloques}</div>`;
}

function liFichaHtml(p) {
  if (liSenal(p) !== 'busqueda_laboral') return liFichaPosteoHtml(p);
  const c = p.conteo || {};
  const links = [p.web && `<a class="ghost" href="${esc(/^https?:/.test(p.web) ? p.web : 'https://' + p.web)}" target="_blank" rel="noopener">${liIc('web')}Web</a>`,
    p.linkedin && `<a class="ghost" href="${esc(p.linkedin)}" target="_blank" rel="noopener">${liIc('in')}LinkedIn</a>`,
    c.instagram && `<a class="ghost" href="https://www.instagram.com/${esc(c.instagram)}/" target="_blank" rel="noopener">${liIc('ig')}Instagram</a>`].filter(Boolean).join('');
  const avisos = (p.avisos || []).map(a => `<li><span class="lif-av-t"><b>${esc(a.puesto)}</b><small>${esc([a.lugar, liHace(a.fecha), a.via ? 'vía ' + a.via : LI_FUENTE[a.fuente] || a.fuente].filter(Boolean).join(' · '))}</small>${a.descripcion ? `<span class="lif-av-d">${esc(a.descripcion)}</span>` : ''}</span>
    ${a.link ? `<a class="ghost" href="${esc(a.link)}" target="_blank" rel="noopener">${liIc('abrir')}Ver aviso</a>` : ''}</li>`).join('');
  return `<header class="lif-head">${liLogo(p, 'lg')}<div><h2>${esc(p.empresa)}</h2>
      <p>${esc([p.rubro, liTam(p.tamano), LI_PAIS[p.pais]].filter(Boolean).join(' · '))}</p></div>
      <span class="linivel n-${esc(p.nivel)} lg" title="Puntaje ${p.puntaje}">${esc(p.nivel)}</span></header>
    ${links ? `<div class="lif-links">${links}</div>` : ''}
    ${liPasoHtml(p)}
    ${liDecideHtml(p)}
    <h3>Por qué califica</h3>
    <ul class="lif-porque">${(p.por_que || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Lo que está buscando</h3>
    <ul class="lif-avisos">${avisos}</ul>
    <h3>Su Instagram</h3>
    ${liInstagramHtml(c)}
    ${liTextosHtml(p)}
    ${LI_CANAL}`;
}

function liInstagramHtml(c) {
  return c.instagram ? (c.privada ? `<p class="liv-nota">@${esc(c.instagram)} es privada.</p>` : c.ultimo_post ? `<div class="lif-ig">
      <div><b>${c.dias_sin_publicar}</b><span>días desde el último posteo</span></div>
      <div><b>${c.posts_90}${c.posts_90_es_minimo ? '+' : ''}</b><span>posteos en 90 días</span></div>
      <div><b>${c.hueco_mas_largo}</b><span>días de hueco más largo${c.hueco_desde ? `, desde el ${esc(new Date(c.hueco_desde + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', ''))}` : ''}</span></div>
    </div><p class="liv-nota">@${esc(c.instagram)} · ${liNum(c.seguidores_instagram)} seguidores · contado sobre los últimos 12 posteos que se ven.</p>` : `<p class="liv-nota">@${esc(c.instagram)} no tiene posteos.</p>`)
    : '<p class="liv-nota">No encontré su Instagram en la web.</p>';
}

// Un posteo: quién lo escribió, qué pide y el texto entero, con el link para leerlo en LinkedIn.
function liFichaPosteoHtml(p) {
  const a = p.autor || {}, po = p.post || {}, s = liSenal(p);
  return `<header class="lif-head">${liAvatar(p, 'lg')}<div><h2>${esc(p.empresa)}</h2>
      <p>${esc([p.rubro, LI_PAIS[p.pais] || 'País sin confirmar'].filter(Boolean).join(' · '))}</p></div>
      <span class="linivel n-${esc(p.nivel)} lg" title="Puntaje ${p.puntaje}">${esc(p.nivel)}</span></header>
    <div class="lif-links">${po.url ? `<a class="ghost" href="${esc(po.url)}" target="_blank" rel="noopener">${liIc('abrir')}Ver el posteo</a>` : ''}${a.url ? `<a class="ghost" href="${esc(a.url)}" target="_blank" rel="noopener">${liIc('in')}Perfil de ${esc(String(a.nombre || '').split(' ')[0])}</a>` : ''}</div>
    ${liPasoHtml(p)}
    ${liDecideHtml(p)}
    <h3>${s === 'pide_servicio' || s === 'pide_ia' ? 'Lo que pide' : 'A quién busca'}</h3>
    <p class="lif-pide"><span class="lir-senal s-${s}">${esc(LI_SENAL_TXT[s])}</span>${esc(p.que_pide || '')}</p>
    <h3>El posteo</h3>
    <div class="lif-post">
      <div class="lif-post-h">${liAvatar(p)}<div><b>${esc(a.nombre || '')}</b><small>${esc(a.titular || '')}</small><small>${esc(liHace(po.fecha))}</small></div></div>
      <p>${esc(po.texto || '').replace(/\n/g, '<br>')}</p>
      <small class="lif-post-pie">${liNum(po.reacciones)} reacciones · ${liNum(po.comentarios)} comentarios</small>
    </div>
    <h3>Por qué califica</h3>
    <ul class="lif-porque">${(p.por_que || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${liTextosHtml(p)}
    ${LI_CANAL}`;
}

async function liProspecto(id, estado) {
  try {
    const r = await api('linkedin/prospecto', post({ id, estado }));
    const p = lis.data.prospectos.find(x => x.id === id);
    const lista = liFiltrados(lis.data), i = lista.findIndex(x => x.id === id);
    p.estado = estado; p.decision = r.decision;
    lis.data = liPartir(lis.data);
    lis.sel = (lista[i + 1] || lista[i - 1])?.id || null;
    renderLinkedin();
  } catch (e) { alert(e.message); }
}

// ---------- videos a medida: un recorrido, una acción principal por paso ----------
// Desde el panel se piden los videos de los contactos elegidos, se ven, se corrigen y, aprobados, se marcan como enviados.
// Cada contacto está en un solo paso, que se deduce de su estado: la pantalla muestra sólo lo que hace falta en ese paso.
const LV_PASOS = [['elegir', 'Elegir'], ['generando', 'Generando'], ['revisar', 'Revisar'], ['enviar', 'Enviar'], ['enviados', 'Enviados']];
const LV_ETAPAS = [['guion', 'Guion'], ['voz', 'Voz'], ['avatar', 'Avatar'], ['video', 'Armado del video']];
// Cuánto sale cada video con tus proveedores (`linkedin.video.costo_usd` en la config); sin ese dato no se muestra un monto.
const lvCosto = n => { const c = lis.data?.video?.costo_usd; return c ? ` · unos US$${Math.round(n * c * 100) / 100}` : ''; };
const LV_EN_CURSO = ['pedido', 'produciendo', 'corrigiendo', 'error'];
const LV_ENVIADOS = ['contactado', 'respondio', 'agendo'];
const LV_ORDEN = 'Usá la skill video-a-medida y producí los videos que están en la cola del planner (LinkedIn → Videos).';
const lvPaso = p => {
  const v = p.video || {};
  if (p.estado === 'descartado') return 'descartado';
  if (LV_ENVIADOS.includes(p.estado)) return 'enviados';
  if (LV_EN_CURSO.includes(v.estado)) return 'generando';
  if (v.estado === 'aprobado') return 'enviar';
  return v.archivo ? 'revisar' : 'elegir';
};
const lvEsperando = v => v.estado === 'pedido' || (v.estado === 'corrigiendo' && !v.paso);
const lvMedia = v => `${liMedia(v.archivo)}${v.version ? `&v=${v.version}` : ''}`;
const lvNombre = p => String(p.autor?.nombre || p.empresa || '');
const lvCuenta = (d, k) => d.contactos.filter(p => lvPaso(p) === k).length;
const lvMensaje = p => p.video?.mensaje || p.textos?.mensaje || '';
const lvArchivo = p => `video-${String(p.empresa || p.id).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.mp4`;
const lvPoster = v => `/api/planner/poster?path=${encodeURIComponent(v.archivo)}`;

function lvLista(d) {
  if (lis.vPaso === 'elegir' && lis.vDescartados) return d.contactos.filter(p => lvPaso(p) === 'descartado');
  const lista = d.contactos.filter(p => lvPaso(p) === lis.vPaso);
  return lis.vPaso === 'elegir' ? lista.filter(p => (lis.vRubro === 'todos' || p.rubro === lis.vRubro) && (lis.vNivel === 'todos' || p.nivel === lis.vNivel)) : lista;
}

function lvPasosHtml(d) {
  const ch = '<svg class="lv-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  return `<nav class="lv-pasos" aria-label="Recorrido del video">${LV_PASOS.map(([k, l], i) => {
    const n = lvCuenta(d, k), urgente = n && (k === 'revisar' || k === 'enviar');
    return `${i ? ch : ''}<button class="lv-paso${lis.vPaso === k ? ' on' : ''}${urgente ? ' urge' : ''}" data-lv="paso" data-paso="${k}" aria-current="${lis.vPaso === k ? 'step' : 'false'}">${l}<span class="n">${n || ''}</span></button>`;
  }).join('')}</nav>`;
}

function lvFila(p) {
  const paso = lvPaso(p), v = p.video || {}, on = p.id === lis.vSel, marcado = lis.vElegidos.has(p.id);
  const ojo = paso === 'elegir' ? `<button class="lvr-check${marcado ? ' on' : ''}" role="checkbox" aria-checked="${marcado}" aria-label="Elegir a ${esc(lvNombre(p))}" data-lv="marcar" data-id="${esc(p.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button>` : '';
  const cara = v.archivo && paso !== 'generando' ? `<img class="lvr-poster" src="${lvPoster(v)}" alt="" loading="lazy">` : liAvatar(p);
  const pie = paso === 'generando'
    ? (v.estado === 'error' ? '<small class="mal">Se frenó</small>' : lvEsperando(v) ? `<small>En la cola${v.estado === 'corrigiendo' ? ', con tus cambios' : ''}</small>` : `<small class="vivo"><i></i>${esc((LV_ETAPAS.find(([k]) => k === v.paso) || [, 'Arrancando'])[1])}</small>`)
    : paso === 'enviados' ? `<small>${esc(LI_ESTADO_TXT[p.estado])} ${esc(liHace(p.decision?.at))}</small>`
    : (v.version > 1 && paso === 'revisar' ? `<small>Versión ${v.version}, con tus cambios</small>` : `<small>${esc([p.rubro, LI_PAIS[p.pais]].filter(Boolean).join(' · '))}</small>`);
  return `<div class="lvr${on ? ' on' : ''}" data-lv="ver" data-id="${esc(p.id)}" role="option" aria-selected="${on}" tabindex="-1">${ojo}${cara}
    <span class="lir-txt"><b>${esc(lvNombre(p))}</b><span>${esc(p.empresa)}</span>${pie}</span>
    ${paso === 'elegir' ? `<span class="linivel n-${esc(p.nivel)}">${esc(p.nivel)}</span>` : ''}</div>`;
}

function lvListaHtml(d) {
  const lista = lvLista(d);
  const head = lis.vPaso === 'elegir' && !lis.vDescartados
    ? `<div class="rfb-head lv-head"><div class="lv-dds">${liDd('vnivel', 'Categoría', lis.vNivel === 'todos' ? 'Todas' : lis.vNivel, lis.vNivel !== 'todos')}${liDd('rubro', 'Rubro', lis.vRubro === 'todos' ? 'Todos' : lis.vRubro, lis.vRubro !== 'todos')}</div><b>${lista.length}</b></div>`
    : lis.vDescartados ? `<div class="rfb-head lv-head"><button class="ghost" data-lv="descartados">${liIc('volver')}Volver a Elegir</button><b>${lista.length}</b></div>` : '';
  const vacio = { elegir: 'No queda nadie por elegir.', generando: 'No se está generando nada.', revisar: 'No hay videos por revisar.', enviar: 'No hay videos aprobados.', enviados: 'Todavía no marcaste ningún envío.' }[lis.vPaso];
  const n = lis.vElegidos.size, descartados = lvCuenta(d, 'descartado');
  const pie = lis.vPaso !== 'elegir' || lis.vDescartados ? '' : n
    ? `<div class="lv-acc"><span><b>${n}</b> ${n === 1 ? 'elegido' : 'elegidos'}${lvCosto(n)}</span><button class="lif-si" data-lv="generar">Generar ${n === 1 ? 'video' : `${n} videos`}</button></div>`
    : `<div class="lv-acc vacio"><span>Marcá a quién le hacemos un video</span>${descartados ? `<button class="ghost" data-lv="descartados">${descartados} ${descartados === 1 ? 'descartado' : 'descartados'}</button>` : ''}</div>`;
  return `${head}<div class="rfb-rows" role="listbox" aria-label="Contactos">${lista.map(lvFila).join('') || `<p class="lv-vacio">${vacio}</p>`}</div>${pie}`;
}

function lvCabeza(p) {
  return `<header class="lv-cab">${liAvatar(p)}<div><h2>${esc(lvNombre(p))}</h2><p>${esc([p.empresa, p.rubro, LI_PAIS[p.pais]].filter(Boolean).join(' · '))}</p></div>
    ${p.autor?.url ? `<a class="ghost lv-in" href="${esc(p.autor.url)}" target="_blank" rel="noopener" aria-label="Abrir su perfil de LinkedIn">${liIc('in')}</a>` : ''}</header>`;
}
const lvVideo = v => `<div class="lv-vid"><video src="${esc(lvMedia(v))}" poster="${lvPoster(v)}" controls playsinline preload="metadata"></video></div>`;

function lvDetalleElegir(p) {
  const marcado = lis.vElegidos.has(p.id), descartado = lvPaso(p) === 'descartado';
  const posteos = (p.posteos || (p.post ? [p.post] : [])).map(po => `<div class="lif-post"><p>${esc(po.texto || '').replace(/\n/g, '<br>')}</p><small class="lif-post-pie">${esc(liHace(po.fecha))} · ${liNum(po.reacciones)} reacciones${po.url ? ` · <a href="${esc(po.url)}" target="_blank" rel="noopener">Ver en LinkedIn</a>` : ''}</small></div>`).join('');
  return `<div class="lv-lee">${lvCabeza(p)}
    <div class="lv-botones">${descartado
      ? `<button class="lif-si" data-lv="estado" data-id="${esc(p.id)}" data-estado="nuevo">${liIc('volver')}Recuperar</button>`
      : `<button class="${marcado ? 'lif-no' : 'lif-si'}" data-lv="marcar" data-id="${esc(p.id)}">${liIc('check')}${marcado ? 'Elegido' : 'Elegir'}<kbd>E</kbd></button><button class="lif-no" data-lv="estado" data-id="${esc(p.id)}" data-estado="descartado">${liIc('x')}Descartar<kbd>X</kbd></button>`}</div>
    <h3>Por qué</h3><ul class="lif-porque">${(p.por_que || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${p.ideas?.length ? `<h3>Qué le mostraríamos</h3><ul class="lif-porque">${p.ideas.map(i => `<li>${esc(i.titulo)}</li>`).join('')}</ul>` : ''}
    ${posteos ? `<details class="lv-mas"><summary>${p.post ? 'El posteo' : 'Sus posteos'}</summary><div class="lif-posteos">${posteos}</div></details>` : ''}</div>`;
}

function lvDetalleGenerando(p) {
  const v = p.video || {}, nota = (v.notas || []).filter(n => !n.aplicada).pop();
  const i = LV_ETAPAS.findIndex(([k]) => k === v.paso);
  const cuerpo = v.estado === 'error'
    ? `<div class="lv-mal"><b>Se frenó.</b> ${esc(v.error || 'No terminó de producirse.')}<button class="lif-si" data-lv="reintentar" data-id="${esc(p.id)}">Reintentar</button></div>`
    : lvEsperando(v)
      ? `<div class="lv-espera"><b>En la cola</b><p>Para que arranque, pegale este pedido a Claude. Toma todo lo que esté en la cola.</p><button class="lif-si" data-lv="orden">${liIc('copiar')}<span>Copiar el pedido</span></button></div>`
      : `<ol class="lv-etapas">${LV_ETAPAS.map(([k, l], j) => `<li class="${j < i ? 'ya' : j === i ? 'ahora' : ''}"><i>${j < i ? liIc('check') : ''}</i>${esc(l)}</li>`).join('')}</ol><p class="liv-nota">Se actualiza solo. Cuando termine, pasa a Revisar.</p>`;
  return `<div class="lv-lee">${lvCabeza(p)}${nota ? `<p class="lv-nota">Tu pedido: «${esc(nota.texto)}»</p>` : ''}${cuerpo}</div>`;
}

// Revisar: el video a la izquierda y, a su lado, aprobar, pedir cambios y el guion a la vista.
function lvDetalleRevisar(p) {
  const v = p.video, nota = lis.vNotas[p.id] || '', viejas = (v.notas || []).slice().reverse();
  const palabras = v.guion ? v.guion.trim().split(/\s+/).length : 0;
  return `<div class="lv-dos">${lvVideo(v)}<div class="lv-lado">${lvCabeza(p)}
    <button class="lif-si lv-grande" data-lv="aprobar" data-id="${esc(p.id)}">${liIc('check')}Aprobar<kbd>A</kbd></button>
    <div class="lv-pide"><textarea id="lv-nota" aria-label="Qué cambiarías" data-lvnota="${esc(p.id)}" rows="2" placeholder="¿Qué cambiarías?">${esc(nota)}</textarea>
      <button class="lif-no" data-lv="cambios" data-id="${esc(p.id)}"${nota.trim() ? '' : ' disabled'}>Pedir cambios</button></div>
    ${viejas.length ? `<div class="lv-notas">${viejas.map(n => `<p>«${esc(n.texto)}»<small>${esc(liHace(n.at))}</small></p>`).join('')}</div>` : ''}
    ${v.guion ? `<section class="lv-guion"><h3>Guion<small>${palabras} palabras${v.duracion_s ? ` · ${v.duracion_s} s` : ''}</small></h3>${v.guion.split('\n').map(l => `<p>${esc(l)}</p>`).join('')}</section>` : ''}</div></div>`;
}

function lvDetalleEnviar(p) {
  const v = p.video, nombre = lvNombre(p).split(' ')[0], archivo = lvArchivo(p);
  return `<div class="lv-dos">${lvVideo(v)}<div class="lv-lado">${lvCabeza(p)}
    <ol class="lv-envio">
      <li><b>Invitá a ${esc(nombre)}, sin nota</b>${p.autor?.url ? `<a class="lif-no" href="${esc(p.autor.url)}" target="_blank" rel="noopener">${liIc('in')}Abrir su perfil</a>` : ''}</li>
      <li><b>Cuando acepte, mandale esto</b><p class="lv-msj">${esc(lvMensaje(p))}</p><button class="lif-no" data-lv="copiar" data-id="${esc(p.id)}">${liIc('copiar')}<span>Copiar</span></button></li>
      <li><b>Y adjuntale el video</b><a class="lif-no" href="${esc(lvMedia(v))}" download="${esc(archivo)}"><svg class="lii" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 11l5 5 5-5M4 21h16"/></svg>Descargar el video</a></li>
    </ol>
    <button class="lif-si lv-grande" data-lv="estado" data-id="${esc(p.id)}" data-estado="contactado">${liIc('check')}Marcar como enviado</button>
    <button class="ghost lv-atras" data-lv="desaprobar" data-id="${esc(p.id)}">${liIc('volver')}Volver a Revisar</button></div></div>`;
}

function lvDetalleEnviados(p) {
  const v = p.video || {}, sigue = p.estado === 'contactado' ? ['respondio', 'Respondió'] : p.estado === 'respondio' ? ['agendo', 'Agendó una llamada'] : null;
  return `<div class="lv-dos">${v.archivo ? lvVideo(v) : ''}<div class="lv-lado">${lvCabeza(p)}
    <p class="lv-hecho">${liIc(p.estado === 'agendo' ? 'cal' : 'check')}${esc(LI_ESTADO_TXT[p.estado])} ${esc(liHace(p.decision?.at))}</p>
    ${sigue ? `<button class="lif-si lv-grande" data-lv="estado" data-id="${esc(p.id)}" data-estado="${sigue[0]}">${sigue[1]}</button>` : ''}
    <section class="lv-guion"><h3>El mensaje</h3><p>${esc(lvMensaje(p))}</p></section>
    <button class="ghost lv-atras" data-lv="estado" data-id="${esc(p.id)}" data-estado="${{ contactado: 'para_contactar', respondio: 'contactado', agendo: 'respondio' }[p.estado]}">${liIc('volver')}Deshacer</button></div></div>`;
}

function lvDetalleHtml(p) {
  if (!p) return `<div class="lv-nada">${{ revisar: 'Cuando termine un video, lo ves acá para aprobarlo o pedir cambios.', enviar: 'Lo que apruebes en Revisar aparece acá, listo para mandar.', generando: 'Marcá contactos en Elegir para generar sus videos.', enviados: 'Lo que marques como enviado queda acá, con su seguimiento.', elegir: 'Pedile a Claude Code más contactos y aparecen acá.' }[lis.vPaso]}</div>`;
  const paso = lvPaso(p);
  return paso === 'generando' ? lvDetalleGenerando(p) : paso === 'revisar' ? lvDetalleRevisar(p) : paso === 'enviar' ? lvDetalleEnviar(p) : paso === 'enviados' ? lvDetalleEnviados(p) : lvDetalleElegir(p);
}

function lvHtml(d) {
  if (!d.contactos.length) return '<div class="liv-empty"><b>Todavía no hay contactos.</b><span>Un prospecto que pasás a «Para contactar» aparece acá. También podés pedirle a Claude Code «sumá contactos para video a medida» (skill video-a-medida).</span></div>';
  // arranca donde hay algo esperándote
  if (!lis.vPaso) lis.vPaso = lvCuenta(d, 'revisar') ? 'revisar' : lvCuenta(d, 'enviar') ? 'enviar' : lvCuenta(d, 'generando') ? 'generando' : 'elegir';
  const lista = lvLista(d);
  if (!lista.some(p => p.id === lis.vSel)) lis.vSel = lista[0]?.id || null;
  return `${lvPasosHtml(d)}<div class="lid2 lv-grid"><div class="rfb-list lid2-list lv-list" id="lvLista">${lvListaHtml(d)}</div>
    <section class="rf-panel lv-det" id="lvDetalle" aria-label="Detalle del contacto">${lvDetalleHtml(lista.find(p => p.id === lis.vSel))}</section></div>`;
}

// Mientras se genera algo, se actualiza sola. Si estás mirando un video o escribiendo, no se toca lo que tenés abierto.
function lvVigilar(d) {
  clearTimeout(lis.vTimer);
  if (lis.tab !== 'videos' || !d.contactos?.some(p => ['pedido', 'produciendo', 'corrigiendo'].includes(p.video?.estado))) return;
  lis.vTimer = setTimeout(async () => {
    if (typeof view !== 'undefined' && view !== 'linkedin') return;
    try { lis.data = liPartir(await api('linkedin')); } catch { return lvVigilar(lis.data); }
    if (lis.vPaso === 'generando') renderLinkedin();
    else { liContador(); const nav = document.querySelector('#liBody .lv-pasos'); if (nav) nav.outerHTML = lvPasosHtml(lis.data); const li = $('lvLista'); if (li) li.innerHTML = lvListaHtml(lis.data); lvVigilar(lis.data); }
  }, 12000);
}

async function lvRefrescar(fn) {
  try { await fn(); lis.data = liPartir(await api('linkedin')); renderLinkedin(); } catch (e) { alert(e.message); }
}
function lvMarcar(id) { if (lis.vElegidos.has(id)) lis.vElegidos.delete(id); else lis.vElegidos.add(id); renderLinkedin(); }
function lvCopiar(t, texto) {
  const et = t.querySelector('span'), antes = et.textContent;
  navigator.clipboard.writeText(texto).then(() => { et.textContent = 'Copiado'; setTimeout(() => { et.textContent = antes; }, 1600); }, () => prompt('Copiá el texto:', texto));
}

document.addEventListener('click', e => {
  const dd = e.target.closest('#liView [data-lidd]');
  if (dd) {
    const d = lis.data, k = dd.dataset.lidd;
    const conteo = f => d.prospectos.filter(p => p.estado === lis.filtro && f(p)).length;
    if (k === 'senal') liDdAbrir(dd, LI_SENAL.map(([v, l]) => [v, l, conteo(p => v === 'todas' || liSenal(p) === v)]), lis.senal, v => { lis.senal = v; store.set('liSenal', v); lis.sel = null; });
    else if (k === 'nivel') liDdAbrir(dd, [['todos', 'Todas'], ['A', 'A'], ['B', 'B'], ['C', 'C']].map(([v, l]) => [v, l, conteo(p => v === 'todos' || p.nivel === v)]), lis.nivel, v => { lis.nivel = v; store.set('liNivel', v); lis.sel = null; });
    else if (k === 'pais') {
      const paises = [...new Set(d.prospectos.map(p => p.pais || ''))].sort((x, y) => (LI_PAIS[x] || 'zz').localeCompare(LI_PAIS[y] || 'zz'));
      liDdAbrir(dd, [['todos', 'Todos', conteo(() => true)], ...paises.map(x => [x || 'sin', x ? LI_PAIS[x] || x.toUpperCase() : 'Sin país', conteo(p => (p.pais || '') === x)])], lis.pais, v => { lis.pais = v; store.set('liPais', v); lis.sel = null; });
    } else if (k === 'rubro') {
      const para = d.contactos.filter(p => lvPaso(p) === 'elegir' && (lis.vNivel === 'todos' || p.nivel === lis.vNivel)), rubros = [...new Set(para.map(p => p.rubro).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es'));
      liDdAbrir(dd, [['todos', 'Todos', para.length], ...rubros.map(r => [r, r, para.filter(p => p.rubro === r).length])], lis.vRubro, v => { lis.vRubro = v; lis.vSel = null; });
    } else if (k === 'vnivel') {
      const para = d.contactos.filter(p => lvPaso(p) === 'elegir' && (lis.vRubro === 'todos' || p.rubro === lis.vRubro));
      liDdAbrir(dd, [['todos', 'Todas', para.length], ...['A', 'B', 'C'].map(n => [n, n, para.filter(p => p.nivel === n).length])], lis.vNivel, v => { lis.vNivel = v; lis.vSel = null; });
    }
    return;
  }
  const t = e.target.closest('#liView [data-lv]'); if (!t) return;
  const { lv, id } = t.dataset;
  if (lv === 'paso') { lis.vPaso = t.dataset.paso; lis.vSel = null; lis.vDescartados = false; renderLinkedin(); }
  else if (lv === 'ver') { lis.vSel = id; renderLinkedin(); }
  else if (lv === 'marcar') lvMarcar(id);
  else if (lv === 'descartados') { lis.vDescartados = !lis.vDescartados; lis.vSel = null; renderLinkedin(); }
  else if (lv === 'generar') {
    const ids = [...lis.vElegidos];
    lvRefrescar(async () => { await api('linkedin/video/pedir', post({ ids })); lis.vElegidos.clear(); lis.vPaso = 'generando'; lis.vSel = null; });
  }
  else if (lv === 'reintentar') lvRefrescar(() => api('linkedin/video/pedir', post({ ids: [id] })));
  else if (lv === 'aprobar') lvRefrescar(() => api('linkedin/video/aprobar', post({ id })));
  else if (lv === 'desaprobar') lvRefrescar(() => api('linkedin/video/aprobar', post({ id, aprobado: false })));
  else if (lv === 'cambios') { const texto = lis.vNotas[id]; lvRefrescar(async () => { await api('linkedin/video/feedback', post({ id, texto })); delete lis.vNotas[id]; }); }
  else if (lv === 'estado') { lis.vElegidos.delete(id); lvRefrescar(() => api('linkedin/prospecto', post({ id, estado: t.dataset.estado }))); }
  else if (lv === 'copiar') lvCopiar(t, lvMensaje(lis.data.contactos.find(x => x.id === id) || {}));
  else if (lv === 'orden') lvCopiar(t, `${tituloMensaje('Producción', 'Videos a medida de la cola de LinkedIn')}\n\n${LV_ORDEN}`);
});
document.addEventListener('input', e => {
  const t = e.target.closest('#liView textarea[data-lvnota]'); if (!t) return;
  lis.vNotas[t.dataset.lvnota] = t.value;
  const bt = t.parentElement.querySelector('[data-lv="cambios"]'); if (bt) bt.disabled = !t.value.trim();
});
// Teclado: ↑↓ para moverse; E elige, X descarta, A aprueba. Nunca mientras se escribe.
document.addEventListener('keydown', e => {
  if (typeof view === 'undefined' || view !== 'linkedin' || lis.tab !== 'videos' || !lis.data || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('textarea, input, select, video')) return;
  const lista = lvLista(lis.data), i = lista.findIndex(p => p.id === lis.vSel), p = lista[i];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const q = lista[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (q) { e.preventDefault(); lis.vSel = q.id; renderLinkedin(); } }
  else if (!p) return;
  else if ((e.key === 'e' || e.key === 'E') && lvPaso(p) === 'elegir') lvMarcar(p.id);
  else if ((e.key === 'x' || e.key === 'X') && lvPaso(p) === 'elegir') lvRefrescar(() => api('linkedin/prospecto', post({ id: p.id, estado: 'descartado' })));
  else if ((e.key === 'a' || e.key === 'A') && lvPaso(p) === 'revisar') lvRefrescar(() => api('linkedin/video/aprobar', post({ id: p.id })));
});

// ---------- revisar cambios: lo de LinkedIn, no lo del calendario ----------
// En esta sección «Revisar cambios» se refiere a lo de LinkedIn. Junta lo que decidiste acá y sigue esperando algo: contactos
// sin video, videos en la cola o con cambios pedidos, posts aprobados sin programar y notas sin mandar a Claude Code.
function liPendientes() {
  const d = lis.data; if (!d) return { nuevos: [], cola: [], cambios: [], posts: [], conNotas: [], total: 0 };
  const nuevos = d.contactos.filter(p => p.estado === 'para_contactar' && lvPaso(p) === 'elegir');
  const cola = d.contactos.filter(p => p.video?.estado === 'pedido'), cambios = d.contactos.filter(p => p.video?.estado === 'corrigiendo');
  const posts = d.borradores.filter(b => liEst(b) === 'aprobado');
  const conNotas = d.borradores.filter(b => (b.feedback || []).some(n => n.estado === 'pendiente'));
  return { nuevos, cola, cambios, posts, conNotas, total: nuevos.length + cola.length + cambios.length + posts.length + conNotas.length };
}
function liContador() {
  const n = liPendientes().total;
  $('changeCount').textContent = n; $('review').disabled = !n;
}
function liCambiosFila(p, detalle, sacar) {
  return `<div class="prow li-cam"><button class="prow-open" data-licam="ver" data-id="${esc(p.id)}" aria-label="Abrir a ${esc(lvNombre(p))}">${liAvatar(p)}</button>
    <div style="min-width:0"><button class="prow-title" data-licam="ver" data-id="${esc(p.id)}">${esc(lvNombre(p))}${p.empresa && p.empresa !== lvNombre(p) ? ` · ${esc(p.empresa)}` : ''}</button><div class="prow-extra">${esc(detalle)}</div></div>
    ${sacar ? `<button class="icon" data-licam="sacar" data-id="${esc(p.id)}" title="Sacar de Para contactar" aria-label="Sacar a ${esc(lvNombre(p))} de Para contactar">${ICON.trash}</button>` : '<span></span>'}</div>`;
}
function liCambiosRender() {
  const { nuevos, cola, cambios, posts, conNotas } = liPendientes(), producir = nuevos.length + cola.length, hay = producir + cambios.length;
  const seccion = (titulo, filas, primera) => filas.length ? `<div class="sub-label"${primera ? ' style="margin-top:0"' : ''}>${titulo}</div>${filas.join('')}` : '';
  $('liCambiosLista').innerHTML = seccion('Videos para producir', [...nuevos.map(p => liCambiosFila(p, 'Para contactar, todavía sin video', true)), ...cola.map(p => liCambiosFila(p, 'En la cola', false))], true)
    + seccion('Videos con cambios', cambios.map(p => liCambiosFila(p, `Tu pedido: «${(p.video.notas || []).filter(n => !n.aplicada).pop()?.texto || ''}»`, false)), !producir)
    + seccion('Posts para programar', posts.map(b => `<div class="prow li-cam"><span class="li-cam-ic">${liIc('cal')}</span><div style="min-width:0"><button class="prow-title" data-licam="post" data-id="${esc(b.id)}">${esc((b.texto || '').split('\n')[0])}</button><div class="prow-extra">Aprobado, sin día ni hora</div></div><button class="ghost li-cam-ir" data-licam="post" data-id="${esc(b.id)}">Programar</button></div>`), !hay)
    + seccion('Posts con feedback', conNotas.map(b => `<div class="prow li-cam"><span class="li-cam-ic">${ICON.mic}</span><div style="min-width:0"><button class="prow-title" data-licam="nota" data-id="${esc(b.id)}">${esc((b.texto || '').split('\n')[0])}</button><div class="prow-extra">Notas sin mandar a Claude</div></div><button class="ghost li-cam-ir" data-licam="nota" data-id="${esc(b.id)}">Ver</button></div>`), !hay && !posts.length)
    || '<div class="empty">No quedan cambios.</div>';
  $('liCambiosPie').innerHTML = hay
    ? `<span class="muted">${producir ? `${producir === 1 ? '1 video' : `${producir} videos`}${lvCosto(producir)}` : 'Sin gasto nuevo: corrección de un video'}</span><button class="primary" data-licam="pedir">Preparar pedido</button>`
    : '<span class="muted">Los posts se corrigen y programan desde su tarjeta.</span>';
  $('liCambiosPie').hidden = false; $('liCambiosPedido').hidden = true;
}
function liCambiosAbrir() { liCambiosRender(); $('liCambios').showModal(); }
// Deja a los contactos en la cola y arma el mensaje para Claude: el planner no arranca a Claude por su cuenta.
async function liCambiosPedir() {
  const { nuevos, cola, cambios } = liPendientes(), todos = [...nuevos, ...cola, ...cambios];
  if (nuevos.length) await api('linkedin/video/pedir', post({ ids: nuevos.map(p => p.id) }));
  lis.data = liPartir(await api('linkedin')); lis.vPaso = 'generando'; lis.vSel = null; renderLinkedin();
  const nombres = todos.map(lvNombre);
  const titulo = tituloMensaje('Producción', nombres.length > 3 ? `${nombres.length} videos a medida de LinkedIn` : `${nombres.length === 1 ? 'Video' : 'Videos'} a medida para ${nombres.slice(0, -1).join(', ')}${nombres.length > 1 ? ' y ' : ''}${nombres.at(-1)}`);
  const texto = `${titulo}\n\n${LV_ORDEN.slice(0, -1)}: ${todos.map(p => `${lvNombre(p)}${p.empresa && p.empresa !== lvNombre(p) ? ` (${p.empresa})` : ''}`).join(', ')}.`;
  liCambiosRender();
  $('liCambiosPie').hidden = true; $('liCambiosPedido').hidden = false;
  $('liCambiosPedido').innerHTML = `<div class="sub-label" style="margin-top:0"><b>Quedaron en la cola.</b></div><p class="hint" style="margin:0">Pegá este mensaje en Claude Code para que arranque.</p><textarea readonly aria-label="Mensaje para Claude">${esc(texto)}</textarea><button class="primary" data-licam="copiar"><span>Copiar mensaje</span></button>`;
}
$('liCambios').addEventListener('click', async e => {
  if (e.target === $('liCambios')) { $('liCambios').close(); return; }
  const t = e.target.closest('[data-licam]'); if (!t) return;
  const { licam, id } = t.dataset;
  try {
    if (licam === 'ver') { $('liCambios').close(); lis.tab = 'videos'; store.set('liTabV', 'videos'); lis.vPaso = lvPaso(lis.data.contactos.find(p => p.id === id) || {}); lis.vSel = id; renderLinkedin(); }
    else if (licam === 'post') { $('liCambios').close(); lis.tab = 'posts'; store.set('liTabV', 'posts'); lis.postFiltro = 'aprobado'; store.set('liPostFiltro', 'aprobado'); lis.postSel = id; renderLinkedin(); }
    else if (licam === 'nota') { const b = liBorrador(id); $('liCambios').close(); lis.tab = 'posts'; store.set('liTabV', 'posts'); lis.postFiltro = b ? liEst(b) : 'borrador'; store.set('liPostFiltro', lis.postFiltro); lis.postSel = id; renderLinkedin(); }
    else if (licam === 'sacar') { await liProspecto(id, 'nuevo'); if (liPendientes().total) liCambiosRender(); else $('liCambios').close(); }
    else if (licam === 'pedir') { t.disabled = true; await liCambiosPedir(); }
    else if (licam === 'copiar') lvCopiar(t, $('liCambiosPedido').querySelector('textarea').value);
  } catch (err) { t.disabled = false; alert(err.message); }
});

// ---------- posts: el mini artículo como se ve en LinkedIn ----------
const liEst = b => b.estado || 'borrador';
const liPostsLista = d => d.borradores.filter(b => liEst(b) === lis.postFiltro);

function liPostsHtml(d) {
  const lista = liPostsLista(d);
  if (!lista.some(b => b.id === lis.postSel)) lis.postSel = lista[0]?.id || null;
  const cuenta = k => d.borradores.filter(b => liEst(b) === k).length;
  const barra = `<div class="rf-bar liv-bar"><div class="liv-chips" role="group" aria-label="Estado">${LI_POSTS.map(([k, l]) => `<button class="liv-chip${lis.postFiltro === k ? ' on' : ''}" data-lipostfiltro="${k}" aria-pressed="${lis.postFiltro === k}">${l}<span class="n">${cuenta(k) || ''}</span></button>`).join('')}</div>
    <span class="rf-bar-fin liv-nota-in">Revisás texto e imagen, aprobás y elegís día y hora. Se publica sólo lo que programes.</span></div>`;
  if (!lista.length) return barra + `<div class="liv-empty">${lis.postFiltro === 'borrador'
    ? '<b>No hay mini artículos por revisar.</b><span>Pedile a Claude Code «armá los posts de LinkedIn de la semana» (skill linkedin-posts). Salen de lunes a viernes, uno por día, cada uno con su imagen.</span>'
    : `<b>Nada en ${esc(Object.fromEntries(LI_POSTS)[lis.postFiltro].toLowerCase())}.</b>`}</div>`;
  const filas = lista.map(b => {
    const primera = String(b.texto || '').split('\n').find(Boolean) || '(vacío)';
    return `<div class="lipr${b.id === lis.postSel ? ' on' : ''}" data-lipostsel="${esc(b.id)}" role="option" aria-selected="${b.id === lis.postSel}" tabindex="-1">
      <span class="lipr-dia">${esc(liDia(b.fecha))}</span><b>${esc(primera)}</b>
      <small>${esc([LI_GANCHO[b.tipo_gancho] || b.tipo_gancho, b.tema].filter(Boolean).join(' · '))}</small></div>`;
  }).join('');
  const sel = lista.find(b => b.id === lis.postSel);
  return barra + `<div class="lid2">
    <div class="rfb-list lid2-list" role="listbox" aria-label="Mini artículos"><div class="rfb-head"><b>${lista.length}</b> ${lista.length === 1 ? 'post' : 'posts'}</div><div class="rfb-rows">${filas}</div></div>
    <section class="rf-panel lip" aria-label="Mini artículo">${sel ? liPostHtml(sel, d) : ''}</section>
  </div>`;
}

// Día y hora para LinkedIn. El clic en Programar es tu OK para esa publicación.
const liHoy = () => { const n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); return n.toISOString().slice(0, 10); };
// Lo que ya sale en LinkedIn ese día, de los datos de Postiz que el planner tiene cargados; la hora sugerida deja 2 horas con cada una.
function liOcupadas(dia) {
  const horas = (data.items || []).flatMap(i => (i.channels || []).filter(c => c.network === 'linkedin' && c.when?.slice(0, 10) === dia && !['ERROR', 'DRAFT'].includes(c.state)).map(c => c.when.slice(11, 16)));
  return [...new Set(horas)].sort();
}
function liHoraLibre(dia) {
  const min = h => +h.slice(0, 2) * 60 + +h.slice(3), ocupadas = liOcupadas(dia).map(min);
  return ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00', '08:00', '22:00'].find(h => ocupadas.every(m => Math.abs(m - min(h)) >= 120)) || null;
}
const liOcupadasTxt = dia => { const o = liOcupadas(dia); return !o.length ? 'Ese día no sale nada más en LinkedIn.' : `Ese día ya sale en LinkedIn a las ${o.join(', ')}.${liHoraLibre(dia) ? '' : ' No queda lugar con 2 horas de distancia.'}`; };
// Primer día hábil con lugar, desde el que propuso el borrador.
function liDiaLibre(b) {
  const n = new Date((b.fecha && b.fecha.slice(0, 10) > liHoy() ? b.fecha.slice(0, 10) : liHoy()) + 'T12:00:00');
  if (b.fecha && b.fecha.slice(0, 10) > liHoy()) n.setDate(n.getDate() - 1);
  for (let i = 0; i < 21; i++) {
    n.setDate(n.getDate() + 1);
    const dia = n.toISOString().slice(0, 10);
    if (![0, 6].includes(n.getDay()) && !['08:00', '22:00', null].includes(liHoraLibre(dia))) return dia;
  }
  return n.toISOString().slice(0, 10);
}
function liProgramarHtml(b) {
  const dia = liDiaLibre(b);
  return `<div class="lip-prog"><h3>Programar en LinkedIn</h3>
    <div class="lip-prog-fila"><label>Día<input type="date" data-liprogdia="${esc(b.id)}" min="${liHoy()}" value="${dia}"></label><label>Hora<input type="time" data-liproghora="${esc(b.id)}" step="300" value="${liHoraLibre(dia) || '09:00'}"></label></div>
    <p class="lip-prog-dia" data-liprogocup="${esc(b.id)}">${esc(liOcupadasTxt(dia))}</p>
    ${b.imagen ? `<button class="lif-si lv-grande" data-liprog="${esc(b.id)}">${liIc('cal')}Programar</button>` : '<p class="lip-prog-falta">Falta la imagen: pedísela a Claude antes de programarlo.</p>'}
    <p class="lip-prog-err" data-liprogerr="${esc(b.id)}" role="alert"></p>
    <p class="liv-nota">Sale en tu perfil a esa hora, con su imagen. <button class="lip-volver" data-lipestado="borrador" data-liid="${esc(b.id)}">Volver a revisar</button></p></div>`;
}
async function liPostProgramar(id, btn) {
  const dia = document.querySelector(`[data-liprogdia="${CSS.escape(id)}"]`)?.value, hora = document.querySelector(`[data-liproghora="${CSS.escape(id)}"]`)?.value;
  const err = document.querySelector(`[data-liprogerr="${CSS.escape(id)}"]`); if (err) err.textContent = '';
  if (!dia || !hora) { if (err) err.textContent = 'Elegí día y hora.'; return; }
  const texto = btn.textContent; btn.disabled = true; btn.textContent = 'Programando…';
  try {
    const b = liBorrador(id), t = document.querySelector(`#liBody textarea[data-lipid="${CSS.escape(id)}"]`);
    if (t && t.value !== b.texto) { const r0 = await api('linkedin/borrador', post({ id, texto: t.value, editado: b.editado || null })); Object.assign(b, r0.borrador); }
    const r = await api('linkedin/borrador/programar', post({ id, cuando: `${dia}T${hora}` })); Object.assign(b, r.borrador);
    lis.postFiltro = 'agendado'; store.set('liPostFiltro', 'agendado'); lis.postSel = id; renderLinkedin();
  } catch (e) { btn.disabled = false; btn.textContent = texto; if (err) err.textContent = e.message; }
}

function liPostHtml(b, d) {
  const c = d.cuenta || {}, estado = liEst(b), editable = estado === 'borrador' || estado === 'aprobado';
  const texto = String(b.texto || ''), largo = texto.length, corta = largo > LI_CORTE && !lis.entero;
  const visible = corta ? texto.slice(0, LI_CORTE).replace(/\s+\S*$/, '') : texto;
  const img = b.imagen ? `<img class="lip-img" src="${esc(liMedia(b.imagen))}${b.imagen_v ? `&v=${b.imagen_v}` : ''}" alt="Imagen del post" loading="lazy">` : '<div class="lip-img ph">Sin imagen todavía</div>';
  const av = c.avatar ? `<img class="liav" src="${esc(liMedia(c.avatar))}" alt="" referrerpolicy="no-referrer">` : `<span class="liav ph">${esc(String(c.nombre || '?').slice(0, 1))}</span>`;
  const decide = estado === 'borrador'
    ? `<div class="lif-decide"><button class="lif-si" data-lipestado="aprobado" data-liid="${esc(b.id)}">${liIc('check')}Aprobar</button>
       <button class="lif-no" data-lipestado="descartado" data-liid="${esc(b.id)}">${liIc('x')}Descartar</button></div>`
    : estado === 'aprobado' ? liProgramarHtml(b)
    : estado === 'descartado' ? `<div class="lif-estado"><span><b>Descartado</b>${b.motivo ? ` · ${esc(b.motivo)}` : ''}</span><button class="ghost" data-lipestado="borrador" data-liid="${esc(b.id)}">${liIc('volver')}Recuperar</button></div>`
    : `<div class="lif-estado">${liIc('cal')}<span><b>${estado === 'publicado' ? 'Publicado' : 'Programado'}</b>${b.fecha ? ` · ${esc(liDia(b.fecha))}${b.programado ? `, ${esc(b.programado.slice(11, 16))}` : ''}` : ''}</span></div>`;
  return `<div class="lip-grid">
    <div class="lip-card" aria-label="Así se ve en LinkedIn">
      <div class="lip-h">${av}<div><b>${esc(c.nombre || 'Tu perfil')}</b><small>${esc(c.titular || '')}</small><small>${esc(b.fecha ? liDia(b.fecha) : 'Ahora')} · ${liIc('mundo')}</small></div></div>
      <div class="lip-t">${esc(visible).replace(/\n/g, '<br>')}${corta ? '<button class="lip-mas" data-limas>…ver más</button>' : ''}</div>
      ${img}
      ${b.mencion_pagina !== false && c.pagina ? `<p class="lip-mencion">${liIc('in')}Nombra a la página <b>${esc(c.pagina)}</b> y la página lo comparte.</p>` : ''}
      ${b.por_que || b.referencia ? `<div class="lip-origen"><h3>De dónde sale</h3>${b.por_que ? `<p>${esc(b.por_que)}</p>` : ''}${b.referencia?.url ? `<a class="ghost" href="${esc(b.referencia.url)}" target="_blank" rel="noopener">${liIc('abrir')}${esc(b.referencia.autor || 'Referencia')}</a>` : ''}</div>` : ''}
    </div>
    <div class="lip-ed">
      <div class="lip-ed-h"><b>Texto</b><span class="lip-save" data-lisave="${esc(b.id)}" aria-live="polite"></span></div>
      <textarea class="lip-txt" data-lipid="${esc(b.id)}" ${editable ? '' : 'readonly'} aria-label="Texto del post">${esc(texto)}</textarea>
      <p class="lip-cnt"><span data-licnt="${esc(b.id)}" class="${largo > LI_LIMITE ? 'pasado' : ''}">${largo.toLocaleString('es-AR')}/${LI_LIMITE.toLocaleString('es-AR')}</span> · ${LI_CORTE} antes del «ver más»</p>
      ${decide}
      ${editable ? liFeedbackHtml(b) : ''}
    </div></div>`;
}

// ---------- feedback por post: escrito o grabado, como en Twitter ----------
// Una nota escrita o un audio por post, para corregir el texto o la imagen; aprobar, descartar y dejar audio quedan a la vista sin
// scrollear. Las notas viajan con «Mandar a Claude»: el planner no arranca a Claude Code por su cuenta.
const LI_NOTA = { pendiente: ['Pendiente', 'accent'], enviado: ['Enviado a Claude', 'warn'], aplicado: ['Aplicado', 'ok'] };
const liPorMandar = d => (d?.borradores || []).reduce((n, b) => n + (b.feedback || []).filter(x => x.estado === 'pendiente').length, 0);

function liFeedbackHtml(b) {
  const notas = b.feedback || [], rec = lis.rec?.id === b.id ? lis.rec : null, guardando = lis.fbGuardando[b.id], pendientes = liPorMandar(lis.data);
  const nota = n => { const [t, c] = LI_NOTA[n.estado] || LI_NOTA.pendiente;
    return `<div class="fb-entry${n.estado === 'aplicado' ? ' done' : ''}"><div class="fb-head"><span>${esc(new Date(n.created_at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''))}</span><span class="tag ${c}">${t}</span>
      ${n.estado !== 'aplicado' ? `<button class="icon fb-del" data-lifbdel="${esc(n.file)}" data-liid="${esc(b.id)}" title="Borrar la nota" aria-label="Borrar la nota">${ICON.trash}</button>` : ''}</div>
      ${n.text ? `<p class="fb-text">${esc(n.text)}</p>` : ''}${n.audio ? `<audio controls preload="none" src="${esc(liMedia(n.audio))}"></audio>` : ''}
      ${n.transcript && !n.text ? `<p class="fb-text lip-transc">«${esc(n.transcript)}»</p>` : ''}${n.cambio ? `<p class="lip-cambio">${liIc('check')}${esc(n.cambio)}</p>` : ''}</div>`; };
  return `<div class="lip-fb">
    ${notas.length ? `<div class="fb-list">${notas.map(nota).join('')}</div>` : ''}
    <div class="lip-fb-in">
      ${rec ? `<button class="lif-no rec on" data-lirec="${esc(b.id)}" title="Detener y guardar">${ICON.stop}<span data-liclock>${clock((performance.now() - rec.start) / 1000)}</span></button>`
        : `<button class="lif-no rec" data-lirec="${esc(b.id)}" title="Grabar lo que cambiarías del texto o de la imagen" ${guardando ? 'disabled' : ''}>${ICON.mic}Dejar audio</button>`}
      <input type="text" data-lifbtext="${esc(b.id)}" value="${esc(lis.fbBorrador[b.id] || '')}" placeholder="${guardando ? 'Guardando…' : 'O escribilo y apretá Enter'}" ${guardando ? 'disabled' : ''} aria-label="Qué cambiar en este post">
    </div>
    ${pendientes ? `<button class="secondary lip-fb-mandar" data-limandar title="Copia tus notas para pegarlas en Claude">${liIc('copiar')}Mandar a Claude <span class="count">${pendientes}</span></button>` : ''}
  </div>`;
}

async function liFeedbackGuardar(id, text, clip) {
  lis.fbGuardando[id] = true; renderLinkedin();
  const body = { id, text: text || '' };
  try {
    if (clip) { body.audio = await blobB64(clip.blob); body.mime = clip.mime; body.audio_seconds = clip.seconds; }
    const r = await api('linkedin/borrador/feedback', post(body)), b = liBorrador(id); if (b) b.feedback = r.feedback;
    delete lis.fbBorrador[id];
    toast(clip ? 'Audio guardado.' : 'Nota guardada.');
  } catch (e) { toast((clip ? 'No se guardó el audio: ' : 'No se guardó la nota: ') + e.message); }
  finally { delete lis.fbGuardando[id]; renderLinkedin(); liContador(); }
}

async function liGrabar(id) {
  if (lis.rec) { if (lis.rec.id === id) lis.rec.mr.stop(); else toast('Ya hay una grabación en curso.'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar audio.');
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('No hay permiso para usar el micrófono.'); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(lis.rec?.timer);
    const seconds = (performance.now() - lis.rec.start) / 1000, type = mr.mimeType || mime || 'audio/webm';
    const txt = lis.fbBorrador[id] || '';
    lis.rec = null;
    // Se guarda aunque se haya cambiado de post: el audio no se pierde.
    liFeedbackGuardar(id, txt, { blob: new Blob(chunks, { type }), mime: type.split(';')[0], seconds });
  };
  lis.rec = { id, mr, start: performance.now(), timer: setInterval(() => { const c = document.querySelector('[data-liclock]'); if (c && lis.rec) c.textContent = clock((performance.now() - lis.rec.start) / 1000); }, 500) };
  mr.start(); renderLinkedin();
}

async function liFeedbackBorrar(id, file) {
  if (!confirm('¿Borrar esta nota? Queda guardada aparte en feedback/.borradas.')) return;
  try { const r = await api('linkedin/borrador/feedback/remove', post({ id, file })), b = liBorrador(id); if (b) b.feedback = r.feedback; renderLinkedin(); liContador(); }
  catch (e) { toast(e.message); }
}

async function liMandarFeedback() {
  try {
    const r = await api('linkedin/borrador/feedback/copiar', post({}));
    lis.data = liPartir(await api('linkedin')); renderLinkedin(); liContador();
    // Las notas ya quedaron como enviadas: si el portapapeles falla, el pedido se muestra para copiarlo a mano y no se pierde.
    try { await navigator.clipboard.writeText(r.prompt); toast('Copiado. Pegalo en Claude: aplica tus notas.'); }
    catch {
      $('liCambiosLista').innerHTML = ''; $('liCambiosPie').hidden = true; $('liCambiosPedido').hidden = false;
      $('liCambiosPedido').innerHTML = `<p class="hint" style="margin:0">Pegá este mensaje en Claude Code para que aplique tus notas.</p><textarea readonly aria-label="Mensaje para Claude">${esc(r.prompt)}</textarea><button class="primary" data-licam="copiar"><span>Copiar mensaje</span></button>`;
      $('liCambios').showModal();
    }
  } catch (e) { toast(e.message); }
}

const liBorrador = id => lis.data?.borradores.find(b => b.id === id);
function liGuardar(id) {
  clearTimeout(lis.timers[id]);
  lis.timers[id] = setTimeout(async () => {
    const b = liBorrador(id), t = document.querySelector(`#liBody textarea[data-lipid="${CSS.escape(id)}"]`); if (!b || !t) return;
    const el = document.querySelector(`[data-lisave="${CSS.escape(id)}"]`); if (el) el.textContent = 'Guardando…';
    try { const r = await api('linkedin/borrador', post({ id, texto: t.value, editado: b.editado || null })); Object.assign(b, r.borrador); if (el) el.textContent = 'Guardado'; }
    catch (e) { if (el) el.textContent = e.message; if (e.status === 409) { lis.data = null; liCargar(); } }
  }, 900);
}
async function liPostEstado(id, estado) {
  clearTimeout(lis.timers[id]);
  try {
    const b = liBorrador(id), t = document.querySelector(`#liBody textarea[data-lipid="${CSS.escape(id)}"]`);
    if (t && t.value !== b.texto) { const r0 = await api('linkedin/borrador', post({ id, texto: t.value, editado: b.editado || null })); Object.assign(b, r0.borrador); }
    const r = await api('linkedin/borrador/estado', post({ id, estado })); Object.assign(b, r.borrador);
    const lista = liPostsLista(lis.data), i = lista.findIndex(x => x.id === id); lis.postSel = (lista[i + 1] || lista[i - 1])?.id || null;
    renderLinkedin();
  } catch (e) { alert(e.message); }
}

// ---------- números: semana por semana ----------
function liNumerosHtml(d) {
  const semanas = Array.from({ length: 6 }, (_, i) => dateAdd(monday(todayStr()), -7 * i));
  const enSemana = (f, s) => !!f && f.slice(0, 10) >= s && f.slice(0, 10) <= dateAdd(s, 6);
  // Cuántos prospectos llegaron a cada paso en esa semana, según la fecha de cada cambio de estado.
  const llego = (estado, s) => d.prospectos.filter(p => (p.decision?.historial || []).some(h => h.estado === estado && enSemana(h.at, s))).length;
  const posts = (estado, s) => d.borradores.filter(b => (estado === 'publicado' ? liEst(b) === 'publicado' && enSemana(b.publicado || b.fecha, s) : (b.historial || []).some(h => h.accion === estado && enSemana(h.at, s)))).length;
  const suma = (k, s) => d.borradores.filter(b => liEst(b) === 'publicado' && enSemana(b.publicado || b.fecha, s)).reduce((n, b) => n + (Number(b.metricas?.[k]) || 0), 0);
  const cols = [['Detectados', s => d.prospectos.filter(p => enSemana(p.detectado, s)).length], ['Nivel A', s => d.prospectos.filter(p => p.nivel === 'A' && enSemana(p.detectado, s)).length],
    ['Para contactar', s => llego('para_contactar', s)], ['Contactados', s => llego('contactado', s)], ['Respondieron', s => llego('respondio', s)], ['Agendaron', s => llego('agendo', s)],
    ['Posts aprobados', s => posts('aprobado', s)], ['Publicados', s => posts('publicado', s)], ['Reacciones', s => suma('reacciones', s)], ['Comentarios', s => suma('comentarios', s)]];
  const fmt = s => new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
  const filas = semanas.map(s => `<tr><td>${s === monday(todayStr()) ? '<b>Esta semana</b>' : `Semana del ${esc(fmt(s))}`}</td>${cols.map(([, f]) => { const v = f(s); return `<td class="n">${v || '<span class="liv-sd">0</span>'}</td>`; }).join('')}</tr>`).join('');
  const total = (k) => d.prospectos.filter(p => p.estado === k).length;
  const porRubro = Object.entries(d.prospectos.reduce((m, p) => { const k = p.rubro || 'Sin rubro'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<div class="lin-tot">
      ${[['Prospectos', d.prospectos.length], ['Para contactar', total('para_contactar')], ['Contactados', total('contactado') + total('respondio') + total('agendo')], ['Respondieron', total('respondio') + total('agendo')], ['Agendaron', total('agendo')]]
        .map(([l, v]) => `<div><b>${liNum(v)}</b><span>${l}</span></div>`).join('')}
    </div>
    <div class="rfc-wrap lin-wrap"><table class="rfc-table lin-table"><thead><tr><th>Semana</th>${cols.map(([l]) => `<th class="n">${l}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div>
    <div class="lin-dos">
      <div class="rf-panel"><h3>Prospectos por rubro</h3><ul class="lin-lista">${porRubro.map(([k, v]) => `<li><span>${esc(k)}</span><b>${v}</b></li>`).join('') || '<li><span>Todavía no hay</span></li>'}</ul></div>
      <div class="rf-panel"><h3>Qué mide cada cosa</h3><ul class="lin-explica">
        <li><b>Detectados:</b> empresas nuevas que la búsqueda encontró esa semana.</li>
        <li><b>Contactados, respondieron y agendaron:</b> cuando marcás cada paso en la ficha.</li>
        <li><b>Reacciones y comentarios:</b> de los posts publicados, que mide <code>engine/linkedin/posts.py metricas</code> a las 72 horas, sin tu cuenta. Impresiones y visitas al perfil sólo las ves vos en LinkedIn.</li>
      </ul></div>
    </div>`;
}

// ---------- referencias: el research de lo viral en el nicho ----------
function liReferenciasHtml(d) {
  const todos = d.referencias?.posts || [];
  const lista = todos.filter(p => lis.idioma === 'todos' || p.idioma === lis.idioma).sort((a, b) => (b.reacciones || 0) - (a.reacciones || 0));
  const barra = `<div class="rf-bar liv-bar"><div class="segmented liv-seg" role="group" aria-label="Idioma">${[['todos', 'Todos'], ['es', 'Castellano'], ['en', 'Inglés']].map(([k, l]) => `<button class="${lis.idioma === k ? 'on' : ''}" data-liidioma="${k}" aria-pressed="${lis.idioma === k}">${l}<span class="n">${k === 'todos' ? todos.length : todos.filter(p => p.idioma === k).length}</span></button>`).join('')}</div>
    <span class="rf-bar-fin liv-nota-in">${esc([d.referencias?.actualizado ? `Research del ${new Date(d.referencias.actualizado.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}` : 'Research', d.referencias?.fuente || d.referencias?.carpeta].filter(Boolean).join(' · '))}</span></div>
    <p class="liv-nota liv-limites">${esc(d.referencias?.notas || 'Sin login sólo se ven los últimos posts de cada perfil y sólo reacciones y comentarios (sin impresiones). Es una foto del momento, no un ranking. Los ganchos van contados con otras palabras.')}</p>`;
  if (!lista.length) return barra + `<div class="liv-empty"><b>Todavía no hay research de lo viral.</b><span>Pedile a Claude Code «buscá los posts que mejor funcionan en LinkedIn en mi nicho» (skill linkedin-posts): los deja en ${esc(d.referencias?.carpeta || 'referencias.json')}.</span></div>`;
  const filas = lista.map(p => `<tr>
      <td><b>${esc(p.autor)}</b><small>${liNum(p.seguidores_cuenta)} seguidores</small></td>
      <td class="lir-gancho">${esc(p.gancho_parafraseado || '')}<small>${esc(String(p.tipo_gancho || '').replace(/_/g, ' '))}${p.tema ? ` · ${esc(p.tema)}` : ''}</small></td>
      <td class="n">${liNum(p.reacciones)}</td><td class="n">${liNum(p.comentarios)}</td><td>${esc(p.formato || '')}</td><td class="n">${liNum(p.largo_caracteres)}</td>
      <td>${esc(p.fecha ? new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '') : '')}</td>
      <td>${p.url ? `<a class="ghost" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Abrir el post de ${esc(p.autor)}">${liIc('abrir')}</a>` : ''}</td></tr>`).join('');
  return barra + `<div class="rfc-wrap"><table class="rfc-table lir-table"><thead><tr><th>Cuenta</th><th>De qué va el gancho</th><th class="n">Reacciones</th><th class="n">Comentarios</th><th>Formato</th><th class="n">Caracteres</th><th>Fecha</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

// ---------- eventos ----------
document.addEventListener('change', e => {
  const id = e.target.dataset?.liprogdia; if (!id || !e.target.value) return;
  const hora = document.querySelector(`[data-liproghora="${CSS.escape(id)}"]`), nota = document.querySelector(`[data-liprogocup="${CSS.escape(id)}"]`);
  if (hora) hora.value = liHoraLibre(e.target.value) || hora.value;
  if (nota) nota.textContent = liOcupadasTxt(e.target.value);
});
document.addEventListener('click', e => {
  const t = e.target.closest('#liView [data-litab], #liView [data-lifiltro], #liView [data-lisel], #liView [data-liestado], #liView [data-lipostfiltro], #liView [data-lipostsel], #liView [data-lipestado], #liView [data-limas], #liView [data-liidioma], #liView [data-licopiar], #liView [data-lisenal], #liView [data-liprog], #liView [data-lirec], #liView [data-lifbdel], #liView [data-limandar]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.lirec) liGrabar(ds.lirec);
  else if (ds.lifbdel) liFeedbackBorrar(ds.liid, ds.lifbdel);
  else if ('limandar' in ds) liMandarFeedback();
  else if (ds.litab) { lis.tab = ds.litab; store.set('liTabV', lis.tab); renderLinkedin(); }
  else if (ds.lifiltro) { lis.filtro = ds.lifiltro; store.set('liFiltro', lis.filtro); lis.sel = null; renderLinkedin(); }
  else if (ds.linivel) { lis.nivel = ds.linivel; store.set('liNivel', lis.nivel); lis.sel = null; renderLinkedin(); }
  else if (ds.lisenal) { lis.senal = ds.lisenal; store.set('liSenalV2', lis.senal); lis.sel = null; renderLinkedin(); }
  else if (ds.lisel) { lis.sel = ds.lisel; renderLinkedin(); }
  else if (ds.liestado) liProspecto(ds.liid, ds.liestado);
  else if (ds.lipostfiltro) { lis.postFiltro = ds.lipostfiltro; store.set('liPostFiltro', lis.postFiltro); lis.postSel = null; lis.entero = false; renderLinkedin(); }
  else if (ds.lipostsel) { lis.postSel = ds.lipostsel; lis.entero = false; renderLinkedin(); }
  else if (ds.lipestado) liPostEstado(ds.liid, ds.lipestado);
  else if (ds.liprog) liPostProgramar(ds.liprog, t);
  else if ('limas' in ds) { lis.entero = true; renderLinkedin(); }
  else if (ds.liidioma) { lis.idioma = ds.liidioma; store.set('liIdioma', lis.idioma); renderLinkedin(); }
  else if (ds.licopiar) {
    const pr = lis.data.prospectos.find(x => x.id === ds.licopiar), tx = pr?.textos || {};
    const texto = ds.campo === 'email' && tx.email_asunto ? `Asunto: ${tx.email_asunto}\n\n${tx.email}` : tx[ds.campo] || '';
    navigator.clipboard.writeText(texto).then(() => { t.lastChild.textContent = 'Copiado'; setTimeout(() => { t.lastChild.textContent = 'Copiar'; }, 1600); }, () => prompt('Copiá el texto:', texto));
  }
});
document.addEventListener('input', e => {
  const fb = e.target.closest('#liView [data-lifbtext]'); if (fb) { lis.fbBorrador[fb.dataset.lifbtext] = fb.value; return; }
  const t = e.target.closest('#liView textarea.lip-txt'); if (!t) return;
  const cnt = document.querySelector(`[data-licnt="${CSS.escape(t.dataset.lipid)}"]`);
  if (cnt) { cnt.textContent = `${t.value.length.toLocaleString('es-AR')}/${LI_LIMITE.toLocaleString('es-AR')}`; cnt.classList.toggle('pasado', t.value.length > LI_LIMITE); }
  const el = document.querySelector(`[data-lisave="${CSS.escape(t.dataset.lipid)}"]`); if (el) el.textContent = 'Sin guardar';
  liGuardar(t.dataset.lipid);
});
document.addEventListener('keydown', e => {
  const t = e.target.closest?.('#liView [data-lifbtext]'); if (!t || e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault(); const id = t.dataset.lifbtext, txt = t.value.trim(); if (txt) liFeedbackGuardar(id, txt);
});
// Teclado en Prospectos: ↑↓ para moverse, A lo pasa a «Para contactar» y X lo descarta (fuera de los textos).
document.addEventListener('keydown', e => {
  if (typeof view === 'undefined' || view !== 'linkedin' || lis.tab !== 'prospectos' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('textarea, input, select')) return;
  const lista = lis.data ? liFiltrados(lis.data) : [], i = lista.findIndex(p => p.id === lis.sel);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const n = lista[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { e.preventDefault(); lis.sel = n.id; renderLinkedin(); document.querySelector('#liView .lir.on')?.scrollIntoView({ block: 'nearest' }); } }
  else if ((e.key === 'a' || e.key === 'A') && lista[i]?.estado === 'nuevo') liProspecto(lista[i].id, 'para_contactar');
  else if ((e.key === 'x' || e.key === 'X') && lista[i]?.estado === 'nuevo') liProspecto(lista[i].id, 'descartado');
});
