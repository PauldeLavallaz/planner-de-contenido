// Métricas del contenido propio, como centro de control: qué te funcionó, cómo creciste en cada red y qué formato y tema
// rinden. Lo junta engine/research/metricas.py en <research>/radar.db (Postiz, archivos CSV o cargas a mano) y lo clasifica
// engine/research/temas.py. Toda la pestaña responde a un período (una semana, un mes, un año, los últimos días o las fechas
// que se elijan, desde el calendario del título; las flechas lo corren) y lo compara con el anterior del mismo largo. Cada
// cuenta encendida en la barra lateral tiene la misma tarjeta, con sus seguidores semana a semana.
// Usa las utilidades de planner.js (cuentas elegidas) y de referencias.js (rfNum, rfXtxt, rfThumb, rfIcono, rfSemana, rfSlug).
const mt = { data: null, loading: false, rango: null, eje: store.get('mtEje', 'formato'), medida: store.get('mtMedida', 'rendimiento') === 'vistas' ? 'rendimiento' : store.get('mtMedida', 'rendimiento'), grupo: null, cruce: null,
  // La grilla cruza siempre los temas, en filas, con el formato o el anillo; un botón la da vuelta.
  mapa: { eje: store.get('mtMapaEje', 'formato'), girado: store.get('mtMapaGirado', false), tema: [], anillo: [], celda: null } };
// Los íconos de los temas y formatos propios, con los de la taxonomía de referencias (referencias.js).
if (typeof RF_TAX_IC !== 'undefined') for (const [k, de] of Object.entries({ experimentos: 'ia', lanzamientos: 'ia', seguridad: 'ia', curiosidades: 'ciencia', tecnologia: 'ciencia', cuerpo: 'ciencia', fisica: 'ciencia', deporte: 'cultura', 'reel-explicativo': '_animado', comparacion: 'comp', 'avatar-reel': 'opinion', hiperrealismo: 'video', 'hook-real': 'video', carrusel: 'lista', otros: 'humor' })) RF_TAX_IC[k] ||= RF_TAX_IC[de];
const MT_RED = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X' };
const MT_FUENTE = { postiz: 'Postiz', csv: 'Archivo CSV', manual: 'Carga a mano', windsor: 'Windsor', composio: 'Composio' };
const MT_VIEJA = 8 * 864e5;
const mtDia = iso => iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }) : '';
const mtCuentaTxt = (red, c) => { const x = String(c || '').replace(/^(YouTube|LinkedIn|TikTok|Instagram)\s+/i, ''); return /\s/.test(x) || !['tiktok', 'instagram'].includes(red) ? x : '@' + x; };
const mtMediana = xs => { const v = xs.filter(x => x != null).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const mtSuma = xs => xs.reduce((s, x) => s + (x || 0), 0);
// Seguidores nuevos cada mil vistas: la conversión que propone Kallaway, que pone precio a cada
// anillo por alcance y por conversión. Comentarios no, porque sin ManyChat no hay llamados a comentar. Sólo TikTok trae
// los seguidores de cada video.
const mtConv = p => p.seguidores_nuevos != null && p.vistas > 0 ? 1000 * p.seguidores_nuevos / p.vistas : null;
const mtConvTxt = v => v == null ? '' : (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('es-AR');
// El rendimiento dice qué superó lo normal; el total, cuánto sumó; el crecimiento, qué siguió ganando vistas en el
// período, aunque se haya publicado antes.
const MT_MEDIDAS = [['rendimiento', 'Rendimiento'], ['total', 'Total'], ['crecimiento', 'Crecimiento'], ['seguidores', 'Seguidores']];
const mtMedidaSeg = (solo = null) => `<div class="segmented" title="Rendimiento: el balance entre Instagram y TikTok contra lo normal de cada cuenta. Total: vistas sumadas. Crecimiento: vistas ganadas en el período. Seguidores: cuántos trajo cada mil vistas.">${MT_MEDIDAS.filter(([k]) => !solo || solo.includes(k)).map(([k, l]) => `<button class="${(solo && !solo.includes(mt.medida) ? 'rendimiento' : mt.medida) === k ? 'on' : ''}" data-mtmedida="${k}">${l}</button>`).join('')}</div>`;
const mtInter = p => p.likes == null && p.comentarios == null ? null : mtSuma([p.likes, p.comentarios, p.compartidos, p.guardados]);
const mtCuando = iso => { const d = mtDia(iso), h = new Date(iso).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return d === todayStr() ? `hoy ${h}` : d === dateAdd(todayStr(), -1) ? `ayer ${h}` : mtCorto(d); };
const mtMil = v => (v > 0 ? '+' : '') + Math.round(v).toLocaleString('es-AR');
// Contra el período anterior, con signo y en texto: el color acompaña, no informa solo. Un salto de más de diez veces
// (contra un período casi sin datos) se dice como múltiplo: «×426» y no «+42509%». Contra un período anterior en cero o
// negativo no hay porcentaje: de -3 a +534 seguidores daría «+17900%».
const mtDelta = (a, b, antes) => { if (a == null || b == null || b <= 0) return '';
  const d = Math.round((a - b) / Math.abs(b) * 100), x = b > 0 && a / b >= 10 ? '×' + Math.round(a / b).toLocaleString('es-AR') : null;
  return `<span class="mt-delta ${d > 0 ? 'sube' : d < 0 ? 'baja' : ''}" title="Período anterior: ${esc(antes || rfNum(b))}">${x || `${d > 0 ? '+' : ''}${d}%`}</span>`; };
const mtSinDato = '<span class="mt-sd">sin dato</span>';

// ---------- fechas y período ----------
const mtEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const mtMes = (d, n) => { const x = new Date(d.slice(0, 7) + '-01T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const mtFinMes = d => dateAdd(mtMes(d, 1), -1);
const mtCorto = d => fmt(d, { day: 'numeric', month: 'short' }) + (d.slice(0, 4) !== todayStr().slice(0, 4) ? ' ' + d.slice(0, 4) : '');
const mtTramo = (a, b) => a === b ? mtCorto(a) : `${a.slice(0, 7) === b.slice(0, 7) ? Number(a.slice(8)) : fmt(a, { day: 'numeric', month: 'short' }) + (a.slice(0, 4) === b.slice(0, 4) ? '' : ' ' + a.slice(0, 4))} – ${mtCorto(b)}`;
const mtMayus = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const MT_ATAJOS = [['semana', 'Esta semana'], ['semana-1', 'Semana pasada'], ['dias15', 'Últimos 15 días'], ['dias30', 'Últimos 30 días'], ['dias90', 'Últimos 90 días'],
  ['mes', 'Este mes'], ['mes-1', 'Mes pasado'], ['anio', 'Este año'], ['todo', 'Todo']];
function mtAtajo(k) {
  const hoy = todayStr(), lu = monday(hoy);
  if (k === 'semana') return { tipo: 'semana', desde: lu, hasta: dateAdd(lu, 6) };
  if (k === 'semana-1') return { tipo: 'semana', desde: dateAdd(lu, -7), hasta: dateAdd(lu, -1) };
  if (k.startsWith('dias')) { const n = Number(k.slice(4)) || 15; return { tipo: 'dias', n, desde: dateAdd(hoy, 1 - n), hasta: hoy }; }
  if (k === 'mes') return { tipo: 'mes', desde: mtMes(hoy, 0), hasta: mtFinMes(hoy) };
  if (k === 'mes-1') return { tipo: 'mes', desde: mtMes(hoy, -1), hasta: dateAdd(mtMes(hoy, 0), -1) };
  if (k === 'anio') return { tipo: 'anio', desde: hoy.slice(0, 4) + '-01-01', hasta: hoy.slice(0, 4) + '-12-31' };
  return { tipo: 'todo', desde: null, hasta: hoy };
}
// Un período que incluye hoy sigue a hoy: «Esta semana» o «Últimos 15 días» se recalculan al volver otro día. Uno que
// se eligió a mano o al que se llegó con las flechas queda tal cual, así que recargar no lo pierde.
const mtVivo = r => r.tipo === 'todo' || (r.tipo !== 'custom' && r.desde <= todayStr() && r.hasta >= todayStr());
const mtRangoGuardado = () => rangoGuardado('mtRango', 'semana');
// Un rango guardado: el que sigue a hoy se recalcula; el elegido a mano queda tal cual (también lo usa Referencias).
function rangoGuardado(clave, def) {
  const r = store.get(clave, null);
  if (!r?.tipo || (r.tipo !== 'todo' && !(r.desde && r.hasta))) return rangoNormal(mtAtajo(def));
  return rangoNormal(r.vivo ? mtAtajo(r.tipo === 'dias' ? 'dias' + r.n : r.tipo) : r);
}
// Unas fechas elegidas a mano que son una semana, un mes o un año enteros pasan a serlo, y las flechas avanzan por eso.
function rangoNormal(r) {
  r = { ...r };
  if (r.tipo === 'custom') {
    if (r.desde === monday(r.desde) && r.hasta === dateAdd(r.desde, 6)) r.tipo = 'semana';
    else if (r.desde.endsWith('-01') && r.hasta === mtFinMes(r.desde)) r.tipo = 'mes';
    else if (r.desde.endsWith('-01-01') && r.hasta === r.desde.slice(0, 4) + '-12-31') r.tipo = 'anio';
  }
  r.vivo = mtVivo(r); return r;
}
// Las flechas corren el período por su largo; no hay futuro que mirar.
function rangoCorrido(r, s) {
  if (!r || r.tipo === 'todo') return null;
  let n;
  if (r.tipo === 'semana') n = { ...r, desde: dateAdd(r.desde, 7 * s), hasta: dateAdd(r.hasta, 7 * s) };
  else if (r.tipo === 'mes') { const d = mtMes(r.desde, s); n = { ...r, desde: d, hasta: mtFinMes(d) }; }
  else if (r.tipo === 'anio') { const y = Number(r.desde.slice(0, 4)) + s; n = { ...r, desde: y + '-01-01', hasta: y + '-12-31' }; }
  else { const l = mtEntre(r.desde, r.hasta) + 1; n = { ...r, desde: dateAdd(r.desde, l * s), hasta: dateAdd(r.hasta, l * s) }; }
  return n.desde > todayStr() ? null : n;
}
function rangoDeHoy(r) {
  if (r.tipo !== 'custom') return mtAtajo(r.tipo === 'dias' ? 'dias' + r.n : r.tipo);
  const l = mtEntre(r.desde, r.hasta) + 1; return { tipo: 'custom', desde: dateAdd(todayStr(), 1 - l), hasta: todayStr() };
}
function mtSetRango(r) { r = rangoNormal(r); mt.rango = r; mt.grupo = null; mt.cruce = null; store.set('mtRango', r); renderMetricas(true); }
function mtMover(s) { const n = rangoCorrido(mt.rango, s); if (n) mtSetRango(n); }
function mtHoy() { mtSetRango(rangoDeHoy(mt.rango)); }
const mtPrimerDia = () => (mt.data?.publicaciones || []).map(p => mtDia(p.publicado_at)).filter(Boolean).sort()[0] || todayStr();
// El período en fechas concretas y su comparación: el anterior del mismo largo. Si el período sigue en curso, se
// compara el mismo tramo (de lunes a hoy contra de lunes al mismo día de la semana anterior).
function mtPeriodo() {
  const r = mt.rango, hoy = todayStr(), desde = r.tipo === 'todo' ? mtPrimerDia() : r.desde, fin = r.tipo === 'todo' ? hoy : r.hasta;
  const hasta = fin > hoy ? hoy : fin, dias = mtEntre(desde, hasta) + 1;
  let pd = null, tope = null;
  if (r.tipo === 'semana') pd = dateAdd(desde, -7);
  else if (r.tipo === 'mes') { pd = mtMes(desde, -1); tope = mtFinMes(pd); }
  else if (r.tipo === 'anio') { const y = Number(desde.slice(0, 4)) - 1; pd = y + '-01-01'; tope = y + '-12-31'; }
  else if (r.tipo !== 'todo') pd = dateAdd(desde, -(mtEntre(desde, fin) + 1));
  let ph = pd && dateAdd(pd, dias - 1); if (tope && ph > tope) ph = tope;
  return { desde, hasta, fin, dias, pd, ph, parcial: fin > hoy, futuro: desde > hoy };
}
const MT_ANTERIOR = { semana: 'la semana anterior', mes: 'el mes anterior', anio: 'el año anterior' };
function mtTitulo(r) {
  if (r.tipo === 'semana') return rfSemana(r.desde) + (r.hasta.slice(0, 4) !== todayStr().slice(0, 4) ? ' de ' + r.hasta.slice(0, 4) : '');
  if (r.tipo === 'mes') return mtMayus(fmt(r.desde, { month: 'long', year: 'numeric' }));
  if (r.tipo === 'anio') return 'Año ' + r.desde.slice(0, 4);
  if (r.tipo === 'todo') return 'Todo el historial';
  if (r.tipo === 'dias' && r.vivo) return `Últimos ${r.n} días`;
  return mtTramo(r.desde, r.hasta);
}
function mtComparaTxt(r, P) {
  if (P.futuro) return 'Este período todavía no empezó.';
  const fechas = ['dias', 'mes', 'anio', 'todo'].includes(r.tipo) ? mtTramo(P.desde, P.hasta) + ' · ' : '';
  if (!P.pd) return fechas + 'Sin comparación';
  const ant = MT_ANTERIOR[r.tipo] || 'el período anterior del mismo largo';
  return `${fechas}Comparado con ${P.parcial ? 'el mismo tramo ' + (ant.startsWith('el ') ? 'del ' + ant.slice(3) : 'de ' + ant) : ant} (${mtTramo(P.pd, P.ph)})`;
}
const mtEnTramo = (p, a, b) => { const d = mtDia(p.publicado_at); return d >= a && d <= b; };

// El calendario del período: los atajos a la izquierda, el mes a la derecha (dos toques: el primer día y el último) y
// las fechas exactas abajo. Las flechas de la cabecera siguen corriendo el período elegido. o: { rango(), periodo(),
// atajos, set(r) }. Lo usan Métricas y Referencias.
function rangoMenu(anchor, o) {
  const hoy = todayStr(); let mes = o.periodo().hasta.slice(0, 7), ini = null;
  const igual = (x, r) => x.tipo === r.tipo && (x.tipo === 'todo' || (x.desde === r.desde && x.hasta === r.hasta));
  const flecha = (n, l, d) => `<button class="icon" data-mes="${n}" aria-label="${l}"${d ? ' disabled' : ''}><svg viewBox="0 0 16 16"><path d="${n < 0 ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'}"/></svg></button>`;
  const html = () => {
    const r = o.rango(), P = o.periodo(), primero = mes + '-01', fin = mtFinMes(primero), dias = [];
    for (let d = monday(primero); d <= fin || dias.length % 7; d = dateAdd(d, 1)) dias.push(d);
    const [a, b] = ini ? [ini, ini] : [P.desde, P.hasta];
    return `<div class="mt-cal">
      <div class="mt-cal-atajos" role="group" aria-label="Atajos">${o.atajos.map(([k, l]) => { const on = !ini && igual(mtAtajo(k), r);
        return `<button class="gv-pop-opt${on ? ' on' : ''}" data-atajo="${k}">${on ? ICON.check : '<i></i>'}<span>${l}</span></button>`; }).join('')}</div>
      <div class="mt-cal-mes">
        <div class="gv-cal-h">${flecha(-1, 'Mes anterior')}<b>${esc(fmt(primero, { month: 'long', year: 'numeric' }))}</b>${flecha(1, 'Mes siguiente', mes >= hoy.slice(0, 7))}</div>
        <div class="mt-cal-grilla">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span>${d}</span>`).join('')}${dias.map(d => {
          const cls = [d.slice(0, 7) !== mes && 'fuera', d === hoy && 'hoy', d >= a && d <= b && 'en', d === a && 'ini', d === b && 'fin'].filter(Boolean).join(' ');
          return `<button class="mt-cal-d ${cls}" data-d="${d}"${d > hoy ? ' disabled' : ''} aria-label="${esc(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }))}">${Number(d.slice(8))}</button>`; }).join('')}</div>
        <p class="mt-cal-ayuda">${ini ? `Desde el ${esc(mtCorto(ini))}: tocá el último día.` : 'Tocá el primer día y después el último.'}</p>
        <div class="mt-cal-fechas"><label>Desde<input type="date" data-f="desde" value="${ini || P.desde}" max="${hoy}"></label><label>Hasta<input type="date" data-f="hasta" value="${ini ? '' : P.hasta}" max="${hoy}"></label><button class="ghost" data-aplicar>Aplicar</button></div>
      </div></div>`;
  };
  gvMenu(anchor, html(), e => {
    const t = e.target, pop = document.getElementById('gvPop');
    const at = t.closest('[data-atajo]'); if (at) { gvMenuClose(); o.set(mtAtajo(at.dataset.atajo)); return; }
    const m = t.closest('[data-mes]'); if (m) { mes = mtMes(mes + '-01', Number(m.dataset.mes)).slice(0, 7); pop.innerHTML = html(); return; }
    const d = t.closest('[data-d]');
    if (d) { if (!ini) { ini = d.dataset.d; pop.innerHTML = html(); return; } const [x, y] = [ini, d.dataset.d].sort(); gvMenuClose(); o.set({ tipo: 'custom', desde: x, hasta: y }); return; }
    if (t.closest('[data-aplicar]')) {
      const v = k => pop.querySelector(`[data-f="${k}"]`).value, [x, y] = [v('desde'), v('hasta')].sort();
      if (!x || !y) return; gvMenuClose(); o.set({ tipo: 'custom', desde: x, hasta: y > hoy ? hoy : y });
    }
  });
  // Con el primer día elegido, el tramo se dibuja mientras el mouse busca el último.
  const pop = document.getElementById('gvPop');
  pop.onpointerover = e => {
    if (!ini || !pop.querySelector('.mt-cal')) return;
    const d = e.target.closest('[data-d]')?.dataset.d; if (!d || d > hoy) return;
    const [x, y] = [ini, d].sort();
    pop.querySelectorAll('[data-d]').forEach(b => { const v = b.dataset.d; b.classList.toggle('en', v >= x && v <= y); b.classList.toggle('ini', v === x); b.classList.toggle('fin', v === y); });
  };
}

async function loadMetricas() {
  mt.loading = true;
  try { mt.data = { ...(await api('metricas')), at: Date.now() }; } catch (e) { mt.data = { error: e.message, at: Date.now() }; }
  finally { mt.loading = false; }
  if (view === 'metricas') renderMetricas(true);
}

// ---------- cuentas ----------
// Las cuentas encendidas en la barra lateral, en su orden: por marca y, dentro de cada una, por red.
function mtCuentasBarra() {
  const sel = cuentasSel(), ms = marcas(), lugar = a => { const k = ms.indexOf(a.brand); return k < 0 ? ms.length : k; };
  return cuentasDelPerfil().filter(a => sel.has(a.key)).sort((a, b) => lugar(a) - lugar(b) || NET_ORDER.indexOf(a.net) - NET_ORDER.indexOf(b.net));
}
// Una fila de la base es de una cuenta de la barra si coincide la red y el @ (o el nombre, en YouTube y LinkedIn).
const mtNorm = x => String(x || '').replace(/^(YouTube|LinkedIn|TikTok|Instagram)\s+/i, '').replace(/^@/, '').toLowerCase();
const mtEs = (a, red, cuenta) => a.net === red && [a.profile, a.label].some(x => x && mtNorm(x) === mtNorm(cuenta));
const mtFormato = p => ['carrusel', 'carousel'].includes(p.formato_pieza) ? 'carrusel' : p.formato_pieza === 'story' ? 'historia' : p.trial ? 'trial' : 'reel';
function mtPublicaciones() {
  const cs = mtCuentasBarra();
  return (mt.data?.publicaciones || []).filter(p => cs.some(a => mtEs(a, p.red, p.cuenta)) && (todosFormatos() || formatosSel().has(mtFormato(p))));
}
// Las tarjetas de cada cuenta cuentan toda la cuenta; lo que analiza qué funciona mira sólo la marca. Un tema con
// `categoria` en la taxonomía se cuenta dentro de esa categoría. Un video le habla a otra gente en cada marca: su anillo es
// el de esa marca (`anillos_perfil`), si lo tiene.
const mtMarca = () => perfilActual === 'all' ? 'todas' : rfSlug(perfilActual);
const mtAnilloDe = x => x?.[mtMarca()]?.anillo;
function mtDelPerfil(pubs) {
  const conAnillo = p => { const a = mtAnilloDe(p.clase?.anillos); return a ? { ...p, clase: { ...p.clase, anillo: a } } : p; };
  const temas = mt.data?.taxonomia?.temas || [], cat = Object.fromEntries(temas.filter(t => t.categoria).map(t => [t.id, temas.find(x => x.id === t.categoria)]));
  return pubs.map(conAnillo).map(p => p.clase && cat[p.clase.tema] ? { ...p, clase: { ...p.clase, tema: cat[p.clase.tema].id } } : p);
}
function mtTax() {
  const t = mt.data?.taxonomia; if (!t?.temas) return t;
  // Los nombres de los anillos también pueden ser de la marca: sin los suyos, los de la taxonomía.
  const propios = t.anillos_por_perfil?.[mtMarca()]?.anillos, anillos = (t.anillos || []).map(a => { const d = propios?.find(x => x.n === a.n && x.corto); return d ? { ...a, corto: d.corto, nombre: d.corto, que: d.quien } : a; });
  return { ...t, anillos, temas: t.temas.filter(x => !x.categoria) };
}

// Lo que se sabe de los seguidores de una cuenta: el total de cada día (TikTok por Windsor; Instagram desde el 29 de
// octubre) o, donde no hay total, las altas por día (Instagram, de dos lecturas de septiembre y octubre, sin las
// bajas).
function mtSeguidores(serie) {
  const hoy = todayStr(), tot = serie.filter(s => s.seguidores != null).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const al = d => { let x = null; for (const s of tot) { if (s.fecha > d) break; x = s; } return x; };
  const altasEn = (a, h) => serie.filter(s => s.seguidores == null && s.nuevos != null && s.fecha >= a && s.fecha <= h);
  const crece = (a, b) => {
    const h = b > hoy ? hoy : b, t1 = al(h);
    if (t1 && t1.fecha >= a) {
      const t0 = al(dateAdd(a, -1));
      if (t0 && mtEntre(t0.fecha, a) <= 4) return { v: t1.seguidores - t0.seguidores, neto: true };
      // Si el total empieza dentro del tramo, lo de antes son las altas de cada día y lo de después, la diferencia de
      // totales. Antes se descartaban las altas y octubre daba sólo el último día.
      const primero = tot.find(s => s.fecha >= a), previas = altasEn(a, dateAdd(primero.fecha, -1));
      if (previas.length && previas.length + mtEntre(primero.fecha, h) + 1 >= .7 * (mtEntre(a, h) + 1))
        return { v: mtSuma(previas.map(s => s.nuevos)) + t1.seguidores - primero.seguidores, neto: false, mixto: primero.fecha };
      if (primero.fecha < t1.fecha) return { v: t1.seguidores - primero.seguidores, neto: true, desde: primero.fecha };
    }
    // Las altas sólo cuentan si cubren casi todo el tramo: una semana con un día medido no es una semana.
    const altas = altasEn(a, h);
    return altas.length && altas.length >= .7 * (mtEntre(a, h) + 1) ? { v: mtSuma(altas.map(s => s.nuevos)), neto: false } : null;
  };
  // Un período que empieza antes del primer dato se mide desde ese dato. «Últimos 90 días» daba en Instagram sólo lo
  // ganado desde la primera lectura del total (+1.060 «desde el 29 oct»), porque las altas, que empiezan el 30 de
  // agosto, no cubrían el 70 % de los 90 días.
  const ini = serie.map(s => s.fecha).sort()[0];
  const periodo = (a, b) => { if (!ini || ini <= a) return crece(a, b); const r = ini <= b && crece(ini, b); return r ? { ...r, desde: ini } : null; };
  return { total: d => al(d > hoy ? hoy : d), crece, periodo, desde: ini, hay: serie.length > 0 };
}
// Los tramos del gráfico de seguidores: semana a semana y, si lo que hay pasa de medio año, mes a mes. Si el período
// tiene menos de 12 semanas, se completan hacia atrás para ver la tendencia; las del período van resaltadas.
function mtCubos(P, inicio) {
  const hoy = todayStr(), desde = inicio && inicio > P.desde ? inicio : P.desde, out = [];
  if (mtEntre(desde, P.hasta) > 182) {
    for (let m = mtMes(desde, 0); m <= P.hasta; m = mtMes(m, 1)) { const b = mtFinMes(m); out.push({ a: m, b: b > hoy ? hoy : b, en: true, mes: true }); }
    return out;
  }
  const ult = monday(P.hasta), n = Math.max(mtEntre(monday(desde), ult) / 7 + 1, Math.min(12, mtEntre(monday(inicio || P.desde), ult) / 7 + 1), 1);
  for (let i = n - 1; i >= 0; i--) { const a = dateAdd(ult, -7 * i), b = dateAdd(a, 6); out.push({ a, b: b > hoy ? hoy : b, en: b >= P.desde && a <= P.hasta }); }
  return out;
}
function mtFicha(a, pubs, P, cubos) {
  const ps = pubs.filter(p => mtEs(a, p.red, p.cuenta)), serie = (mt.data?.seguidores || []).filter(s => mtEs(a, s.red, s.cuenta));
  const fs = (mt.data?.fuentes || []).filter(f => mtEs(a, f.red, f.cuenta)), seg = mtSeguidores(serie);
  const sem = ps.filter(p => mtEnTramo(p, P.desde, P.hasta)), ant = P.pd ? ps.filter(p => mtEnTramo(p, P.pd, P.ph)) : [];
  const vistas = xs => { const m = xs.filter(p => p.vistas != null); return m.length ? mtSuma(m.map(p => p.vistas)) : null; };
  const inter = xs => { const m = xs.map(mtInter).filter(v => v != null); return m.length ? mtSuma(m) : null; };
  return { a, red: a.net, nombre: cuentaNombre(a), serie, sem, ant, conPeriodo: !!P.pd,
    ultima: fs.map(f => f.ultima_lectura).filter(Boolean).sort().pop() || null,
    fuente: [...new Set(fs.flatMap(f => String(f.fuentes || '').split(',')).filter(Boolean))].map(x => MT_FUENTE[x] || x).join(' y '),
    publicadas: mtSuma(fs.map(f => f.publicaciones)), medidas: mtSuma(fs.map(f => f.medidas)),
    vistas: vistas(sem), vistasAnt: vistas(ant), mediana: mtMediana(sem.map(p => p.vistas)), medianaAnt: mtMediana(ant.map(p => p.vistas)),
    inter: inter(sem), interAnt: inter(ant), total: seg.total(P.hasta), crec: seg.periodo(P.desde, P.hasta), crecAnt: P.pd && seg.desde && seg.desde <= P.pd ? seg.crece(P.pd, P.ph) : null,
    hayseg: seg.hay, cubos: cubos.map(c => ({ ...c, v: seg.crece(c.a, c.b) })) };
}

// ---------- tarjeta de cada cuenta: la misma para todas ----------
// Los seguidores ganados por tramo, en barras (dataviz: una serie, puntas redondeadas sobre la línea del cero, el valor
// al pasar el mouse). Son HTML y no SVG para que las barras no se deformen con el ancho de la tarjeta.
const mtTipCubo = c => `${c.mes ? mtMayus(fmt(c.a, { month: 'long', year: 'numeric' })) : mtTramo(c.a, c.b)}: ${c.v ? `${mtMil(c.v.v)} seguidores${c.v.mixto ? ` (altas hasta el ${mtCorto(dateAdd(c.v.mixto, -1))}, total desde el ${mtCorto(c.v.mixto)})` : c.v.neto ? '' : ' (altas, sin las bajas)'}${c.v.desde ? ` desde el ${mtCorto(c.v.desde)}` : ''}` : 'sin dato'}`;
// En grande: cada semana con su fecha abajo y el valor del pico y de la última semana con dato arriba.
function mtBarras(c) {
  const vs = c.cubos.map(x => x.v?.v).filter(v => v != null);
  if (!vs.length) return `<div class="mt-bars vacio"><span>${c.hayseg ? 'Sin datos de seguidores en estas semanas' : 'Ninguna fuente lee sus seguidores'}</span></div>`;
  const max = Math.max(0, ...vs), min = Math.min(0, ...vs), rango = max - min || 1;
  const pico = c.cubos.findIndex(x => x.v && x.v.v === Math.max(...vs)), ult = c.cubos.map(x => !!x.v).lastIndexOf(true);
  const salto = Math.ceil(c.cubos.length / 14);
  return `<div class="mt-bars" style="--cero:${(max / rango * 100).toFixed(1)}%" role="img" aria-label="${esc(c.cubos.map(mtTipCubo).join('; '))}">${c.cubos.map((x, i) => {
    if (!x.v) return `<span class="mt-bar nada${x.en ? ' en' : ''}" data-tip="${esc(mtTipCubo(x))}"></span>`;
    const etiqueta = i === pico || i === ult ? `<b class="mt-bar-v">${esc(mtMil(x.v.v))}</b>` : '';
    return `<span class="mt-bar${x.en ? ' en' : ''}${x.v.v < 0 ? ' neg' : ''}" style="--alto:${Math.max(2, Math.abs(x.v.v) / rango * 100).toFixed(1)}%" data-tip="${esc(mtTipCubo(x))}">${etiqueta}</span>`; }).join('')}</div>
    <div class="mt-bars-x">${c.cubos.map((x, i) => `<span>${(c.cubos.length - 1 - i) % salto ? '' : esc(x.mes ? fmt(x.a, { month: 'short' }) : fmt(x.a, { day: 'numeric', month: 'short' }))}</span>`).join('')}</div>`;
}
function mtTarjeta(c) {
  const vieja = c.ultima && Date.now() - new Date(c.ultima).getTime() > MT_VIEJA;
  const estado = !c.ultima ? '<span class="mt-fuente sin" title="Ninguna fuente trae sus métricas: sólo se cuentan las publicaciones (Postiz)">Sin métricas</span>'
    : `<span class="mt-fuente${vieja ? ' vieja' : ''}" title="${esc(`${c.fuente}: última lectura ${new Date(c.ultima).toLocaleString('es-AR')}`)}">${esc(c.fuente)} · ${vieja ? 'del ' : ''}${esc(mtCuando(c.ultima))}</span>`;
  const sd = '<b class="mt-sd-n">sin dato</b>', medida = !!c.ultima;
  const total = c.total ? `<b>${c.total.seguidores.toLocaleString('es-AR')}</b><small>${c.total.fecha === todayStr() ? 'hoy' : 'al ' + esc(mtCorto(c.total.fecha))}</small>`
    : `${sd}<small>${c.hayseg ? 'sin lectura' : 'sin fuente'}</small>`;
  const ganados = c.crec ? `<b>${mtMil(c.crec.v)}</b><small${c.crec.mixto ? ` title="${esc(`Altas por día hasta el ${mtCorto(dateAdd(c.crec.mixto, -1))} (sin las bajas) y diferencia del total desde el ${mtCorto(c.crec.mixto)}`)}"` : ''}>${c.crecAnt ? `${mtDelta(c.crec.v, c.crecAnt.v, mtMil(c.crecAnt.v))} antes ${mtMil(c.crecAnt.v)}` : c.crec.desde ? `desde el ${esc(mtCorto(c.crec.desde))}` : c.crec.mixto ? 'altas y total' : c.crec.neto ? 'netos' : 'altas, sin las bajas'}</small>`
    : `${sd}<small>${!c.hayseg ? 'sin fuente' : c.total?.fecha === todayStr() && !c.serie.some(s => s.seguidores != null && s.fecha < todayStr()) ? 'desde mañana' : 'sin lectura'}</small>`;
  const dato = (v, ant) => v != null ? `${rfNum(v)}${mtDelta(v, ant)}` : mtSinDato;
  const pri = c.cubos[0], cab = `<header><span class="net" title="${esc(MT_RED[c.red] || c.red)}">${NET_ICON[c.red] || ''}</span><b title="${esc(`${MT_RED[c.red] || c.red} · ${c.nombre}`)}">${esc(c.nombre)}</b>${estado}</header>`;
  const stats = `<dl class="mt-semana">
      <div><dt>Publicaciones</dt><dd>${c.sem.length}${c.conPeriodo && (c.ant.length || c.sem.length) ? mtDelta(c.sem.length, c.ant.length, String(c.ant.length)) : ''}</dd></div>
      <div><dt>Vistas</dt><dd>${medida ? dato(c.vistas, c.vistasAnt) : mtSinDato}</dd></div>
      <div><dt>Mediana por pieza</dt><dd>${medida ? dato(c.mediana, c.medianaAnt) : mtSinDato}</dd></div>
      <div><dt>Interacciones</dt><dd>${medida ? dato(c.inter, c.interAnt) : mtSinDato}</dd></div>
    </dl>`;
  // Las cuentas sin seguidores medidos van chicas y abajo: las que tienen su serie de seguidores son las que se leen en detalle.
  if (!c.hayseg) return `<article class="mt-card chica${vieja ? ' vieja' : ''}">${cab}${stats}</article>`;
  return `<article class="mt-card grande${vieja ? ' vieja' : ''}">${cab}
    <div class="mt-resumen"><div class="mt-kpi"><span>Seguidores</span>${total}</div><div class="mt-kpi"><span>Ganados en el período</span>${ganados}</div>${stats}</div>
    <figure class="mt-crece"><figcaption><span>Seguidores ganados por ${pri?.mes ? 'mes' : 'semana'}</span><span class="mt-crece-max">pasá el mouse por una barra para ver su número</span></figcaption>${mtBarras(c)}</figure>
  </article>`;
}

// Lo normal de cada cuenta: la mediana de sus vistas en los 90 días que terminan con el período (o en todo el período,
// si es más largo). Así una pieza de Instagram y una de TikTok se comparan, y un período corto no se mide contra sí
// mismo.
function mtBase(pubs, P) {
  const ini = P.dias > 90 ? P.desde : dateAdd(P.hasta, -89), med = {};
  for (const p of pubs) if (p.vistas != null && mtEnTramo(p, ini, P.hasta)) (med[p.red + '|' + p.cuenta] ||= []).push(p.vistas);
  const m = Object.fromEntries(Object.entries(med).map(([k, v]) => [k, v.length >= 3 ? mtMediana(v) : null]));
  // Instagram y TikTok ya traen su rendimiento de videos_propios.py: varias señales, contra lo normal de esa cuenta
  // cuando se publicó.
  const f = p => { if (p.x_red != null) return p.x_red; const x = m[p.red + '|' + p.cuenta]; return x && p.vistas != null ? p.vistas / x : null; };
  f.normal = p => p.normal_vistas ?? (m[p.red + '|' + p.cuenta] || null);
  return f;
}
const mtLineaTxt = v => Object.values(mt.data?.taxonomia?.lineas || {}).flat().find(x => x.id === v)?.nombre || '';
const mtNombreTax = (k, v) => { const tax = mtTax(); return ((k === 'tema' ? tax?.temas : tax?.formatos) || []).find(x => x.id === v)?.nombre || ''; };

// Lo que mejor funcionó en el período, con la portada grande para reconocer cada pieza.
function mtMejor(pubs, P, base) {
  const xs = mtUnicas(pubs.filter(p => p.vistas != null && mtEnTramo(p, P.desde, P.hasta)).map(p => ({ ...p, rinde: base(p) })))
    .sort((a, b) => (b.rinde ?? -1) - (a.rinde ?? -1) || b.vistas - a.vistas).slice(0, 12);
  const porRed = p => [p.x_ig != null && `Instagram ${rfXtxt(p.x_ig)}`, p.x_tt != null && `TikTok ${rfXtxt(p.x_tt)}`].filter(Boolean).join(' · ');
  const tile = (p, i) => `<a class="mt-tile" href="${esc(p.url || '#')}" target="_blank" rel="noopener" title="Abrir en ${esc(MT_RED[p.red] || p.red)}">
    <span class="mt-tile-img">${p.media ? `<img src="${rfThumb(p.media)}" alt="" loading="lazy">` : `<i class="net">${NET_ICON[p.red] || ''}</i>`}<em class="mt-rank">${i + 1}</em>${p.rinde != null ? `<em class="rf-x ${p.rinde >= 2 ? 'hot' : p.rinde >= 1.2 ? 'warm' : ''}" title="${esc(p.provisional ? 'Todavía suma vistas: tiene menos de una semana' : 'Balance contra lo normal de cada cuenta')}">${esc(rfXtxt(p.rinde))}</em>` : ''}</span>
    <b>${esc(p.titulo || p.texto || 'Sin texto')}</b>
    <small><span class="net">${NET_ICON[p.red] || ''}</span>${esc(mtCuentaTxt(p.red, p.cuenta))} · ${esc(mtCuando(p.publicado_at))}${mtOtras(p)}</small>
    ${porRed(p) ? `<span class="mt-tile-c">${esc(porRed(p))}</span>` : ''}
    <span class="mt-tile-n"><b>${rfNum(p.vistas_total ?? p.vistas)}</b> vistas${p.likes != null ? ` · ${rfNum(p.likes)} likes` : ''}${p.seguidores_nuevos ? ` · <i>+${rfNum(p.seguidores_nuevos)} seguidores</i>` : ''}</span>
    ${p.clase ? `<span class="mt-tile-c">${rfIcono('formato', p.clase.formato)}${esc([mtNombreTax('formato', p.clase.formato), mtLineaTxt(p.clase.linea), mtNombreTax('tema', p.clase.tema)].filter(Boolean).join(' · '))}</span>` : ''}</a>`;
  return `<section class="mt-panel mt-mejor"><header class="mt-panel-h"><h3>Lo que mejor funcionó</h3><span class="mt-panel-sub">Ordenado por el balance de cada video entre Instagram y TikTok</span></header>
    ${xs.length ? `<div class="mt-tiles">${xs.map(tile).join('')}</div>` : '<p class="gv-empty muted">No hay piezas con métricas en este período.</p>'}</section>`;
}

// Instagram y TikTok juntos, en una nota al pie. Los seguidores de cada red, cuánto suman con Instagram pesando más y
// en qué red rindió mejor cada video.
function mtBalance(fichas, pubs, P, base) {
  const w = mt.data?.taxonomia?.balance?.redes; if (!w) return '';
  const de = red => fichas.filter(c => c.red === red && c.crec), suma = red => mtSuma(de(red).map(c => c.crec.v)), hayIg = de('instagram').length > 0, hayTt = de('tiktok').length > 0;
  const f = w.instagram / w.tiktok, ig = suma('instagram'), tt = suma('tiktok'), frases = [];
  if (hayIg && hayTt) frases.push(`En este período ganaste <b>${mtMil(ig)}</b> seguidores en Instagram y <b>${mtMil(tt)}</b> en TikTok. Si cada seguidor de Instagram vale ${String(Math.round(f * 10) / 10).replace('.', ',')} de TikTok, son <b>${mtMil(ig * f + tt)}</b>.`);
  const ambas = mtUnicas(pubs.filter(p => p.vistas != null && mtEnTramo(p, P.desde, P.hasta)).map(p => ({ ...p, rinde: base(p), normal: base.normal(p), conv: mtConv(p) }))).filter(p => p.x_ig != null && p.x_tt != null);
  if (ambas.length) { const m = ambas.filter(p => p.x_ig > p.x_tt).length; frases.push(`De los ${ambas.length} videos que salieron en las dos redes, ${m} rindieron mejor en Instagram y ${ambas.length - m} en TikTok.`); }
  return frases.length ? `<p class="mt-pie">${frases.join(' ')}</p>` : '';
}

// El mapa de tu contenido. La diana y la grilla de Referencias (dianaSvg, referencias.js) con las piezas propias del
// período: cada video una vez (la red donde mejor rindió), en la medida elegida: cuánto superó lo normal de su cuenta o
// cuántos seguidores trajo cada mil vistas. Tocar un anillo, un tema o una celda muestra esas piezas abajo.
const MT_EJES_MAPA = [['formato', 'Formato'], ['anillo', 'Anillo']];
const mtVideos = () => { const d = mt.data; if (d && !d._videos) d._videos = new Map((d.videos || []).map(v => [v.id, v])); return d?._videos || new Map(); };
const mtDeEje = (k, p) => k === 'anillo' ? (p.clase?.anillo ? String(p.clase.anillo) : null) : p.clase?.[k] || null;
// El mismo video en varias redes es una sola pieza en todo Métricas. Queda la red con más vistas, «el mejor de ambas
// redes» (con Seguidores, la que los mide), y las demás se anotan. Se reconoce por el comienzo del título o del texto:
// el TikTok de «Cuatro IA solas en una ciudad» no trae título y empieza como el texto del de Instagram. Dos piezas de
// la misma red nunca se juntan, porque una serie arranca igual.
function mtUnicas(xs, seg = false) {
  const clave = t => String(t || '').toLowerCase().replace(/[^a-z0-9áéíóúñü]/g, '').slice(0, 30), out = [], vids = mtVideos(), por = new Map();
  const val = seg ? p => p.conv : p => p.vistas;
  for (const p of [...xs].sort((a, b) => (val(b) ?? -1) - (val(a) ?? -1) || b.vistas - a.vistas)) {
    // Desde el 04-11 el video lo reconoce videos_propios.py por su run, y su número es el balance entre redes, no la
    // mejor de las dos. La comparación por texto queda para lo que todavía no tiene video.
    if (p.video_id) {
      const u = por.get(p.video_id);
      if (u) { if (!u.redes.includes(p.red)) u.redes.push(p.red); continue; }
      const v = vids.get(p.video_id), n = { ...p, redes: [p.red] };
      if (v) Object.assign(n, { rinde: v.balance ?? p.rinde, x_ig: v.x_instagram, x_tt: v.x_tiktok, provisional: !!v.provisional, vistas_total: mtSuma([v.vistas_instagram, v.vistas_tiktok, v.vistas_youtube]) || p.vistas });
      por.set(p.video_id, n); out.push(n); continue;
    }
    const ks = [clave(p.titulo), clave(p.texto)].filter(k => k.length >= 12), d = mtDia(p.publicado_at);
    const par = out.find(u => !u.redes.includes(p.red) && Math.abs(mtEntre(u._d, d)) <= 4 && ks.some(k => u._ks.includes(k)));
    if (par) { par.redes.push(p.red); par._ks.push(...ks); } else out.push({ ...p, _ks: ks, _d: d, redes: [p.red] });
  }
  return out;
}
// Las otras redes del mismo video, en íconos (el texto «también en» no entraba en la tarjeta).
const mtOtras = p => { const o = (p.redes || []).filter(r => r !== p.red); return o.length ? ` · <span class="mt-otras" title="${esc('También en ' + o.map(r => MT_RED[r] || r).join(' y '))}">+${o.map(r => `<span class="net">${NET_ICON[r] || esc(r)}</span>`).join('')}</span>` : ''; };
function mtMapa(pubs, P, base) {
  const tax = mtTax(), M = mt.mapa;
  if (!tax?.temas?.length || typeof dianaSvg !== 'function') return '';
  const cab = `<header class="mt-panel-h"><h3>Mapa de tu contenido</h3><span class="mt-panel-sub">Dónde cayó cada pieza del período y cómo rindió</span></header>`;
  const seg = mt.medida === 'seguidores';
  const xs = mtUnicas(pubs.filter(p => p.clase && p.vistas != null && mtEnTramo(p, P.desde, P.hasta)).map(p => ({ ...p, rinde: base(p), normal: base.normal(p), conv: mtConv(p) })), seg);
  if (!xs.length) return `<section class="mt-panel">${cab}<p class="gv-empty muted">No hay piezas clasificadas con métricas en este período.</p></section>`;
  // Con Seguidores, cada pieza se compara con la mediana de seguidores cada mil vistas del período, como la × compara
  // sus vistas con lo normal de su cuenta.
  const refConv = mtConjunto(xs, true);
  const val = p => seg ? (p.conv != null && refConv ? p.conv / refConv : null) : p.rinde;
  const valTxt = p => seg ? (p.conv != null ? `${mtConvTxt(p.conv)} seguidores cada mil vistas` : 'sin seguidores medidos') : p.rinde != null ? rfXtxt(p.rinde) + ' lo normal de su cuenta' : '';
  // Como propone Kallaway: el punto en el color de su anillo y del tamaño de cuánto superó lo normal; lo que
  // quedó por debajo, transparente (nunca en rojo).
  const tam = p => Math.min(14, 3 + 3.2 * Math.log2(1 + Math.max(0, val(p) ?? .5)));
  const svg = dianaSvg(xs, tax, { selT: M.tema, selA: M.anillo, tam, nivel: p => val(p) == null ? (seg ? 'bajo' : '') : val(p) < 1 ? 'bajo' : '',
    titulo: p => `${p.titulo || p.texto || ''} · ${rfNum(p.vistas)} vistas${valTxt(p) ? ' · ' + valTxt(p) : ''}`,
    attrPunto: 'data-mtpunto', attrAnillo: 'data-mtanillo', attrTema: 'data-mttema', aria: 'Tus piezas por anillo y por tema' });
  // La grilla, con lo que deja la diana: sólo las filas y columnas que tienen piezas.
  const ejes = { formato: tax.formatos.map(f => [f.id, f.nombre, f.que]), tema: tax.temas.map(t => [t.id, t.nombre, t.largo]), anillo: tax.anillos.map(a => [String(a.n), `${a.n} · ${a.corto}`, a.nombre]) };
  const F = M.girado ? M.eje : 'tema', C = M.girado ? 'tema' : M.eje, ic = (k, v) => k === 'anillo' ? rfAnilloIc(v) : rfIcono(k, v);
  const ys = xs.filter(p => (!M.tema.length || M.tema.includes(p.clase.tema)) && (!M.anillo.length || M.anillo.includes(String(p.clase.anillo))));
  const celda = {}; for (const p of ys) if (mtDeEje(F, p) && mtDeEje(C, p)) (celda[mtDeEje(F, p) + '|' + mtDeEje(C, p)] ||= []).push(p);
  const filas = ejes[F].filter(([k]) => ys.some(p => mtDeEje(F, p) === k)), cols = ejes[C].filter(([k]) => ys.some(p => mtDeEje(C, p) === k));
  const tono = x => x == null || x < 1 ? ' bajo' : seg ? (x >= 2.2 ? ' g4' : x >= 1.6 ? ' g3' : x >= 1.25 ? ' g2' : ' g1') : x >= 4 ? ' g4' : x >= 2 ? ' g3' : x >= 1.4 ? ' g2' : ' g1';
  const grilla = `<div class="rfm-grilla"><table><thead><tr><th class="rfm-esq"></th>${cols.map(([k, l, que]) => `<th title="${esc(que || '')}">${ic(C, k)}<span>${esc(l)}</span><small>${ys.filter(p => mtDeEje(C, p) === k).length}</small></th>`).join('')}</tr></thead>
    <tbody>${filas.map(([fk, fl, fque]) => `<tr><th title="${esc(fque || '')}"><span class="rfm-th">${ic(F, fk)}<span>${esc(fl)}</span></span><small>${ys.filter(p => mtDeEje(F, p) === fk).length}</small></th>${cols.map(([ck, cl]) => {
      const v = celda[fk + '|' + ck] || [], k = `${fk}|${ck}`; if (!v.length) return '<td class="rfm-celda vacia"></td>';
      const c = mtConjunto(v, seg), x = seg ? (c != null && refConv ? c / refConv : null) : c, lbl = seg ? mtConvTxt(c) : rfXtxt(c);
      const dice = seg ? (c != null ? `, en conjunto ${mtConvTxt(c)} seguidores cada mil vistas` : ', sin seguidores medidos') : c != null ? ', en conjunto ' + rfXtxt(c) + ' lo normal' : '';
      return `<td class="rfm-celda${tono(x)}${M.celda === k ? ' on' : ''}" data-mtcelda="${esc(k)}" title="${esc(`${fl} × ${cl}: ${v.length} pieza${v.length === 1 ? '' : 's'}${dice}`)}"><b>${v.length}</b>${lbl ? `<small>${esc(lbl)}</small>` : ''}<span class="rfm-thumbs">${v.slice(0, 3).map(p => p.media ? `<img src="${rfThumb(p.media)}" alt="" loading="lazy">` : '<i></i>').join('')}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  // Lo elegido: una celda o, si no, el anillo o el tema de la diana.
  const [cf, cc] = (M.celda || '').split('|'), sel = M.celda ? ys.filter(p => mtDeEje(F, p) === cf && mtDeEje(C, p) === cc) : M.tema.length || M.anillo.length ? ys : null;
  const nombreSel = M.celda ? `${(ejes[F].find(x => x[0] === cf) || [])[1] || cf} × ${(ejes[C].find(x => x[0] === cc) || [])[1] || cc}` : [...M.anillo.map(a => 'anillo ' + a), ...M.tema.map(t => (tax.temas.find(x => x.id === t) || {}).nombre || t)].join(', ');
  const eje = `<span class="mt-mapa-eje">Temas por <span class="segmented">${MT_EJES_MAPA.map(([v, l]) => `<button class="${M.eje === v ? 'on' : ''}" data-mtmeje="${v}">${l}</button>`).join('')}</span></span>
    <button class="icon mt-mapa-girar${M.girado ? ' on' : ''}" data-mtmgirar aria-pressed="${M.girado}" aria-label="Dar vuelta la grilla" title="Dar vuelta la grilla: invierte filas y columnas"><svg viewBox="0 0 16 16"><path d="m11 2 2 2-2 2"/><path d="M13 4H6a3 3 0 0 0-3 3"/><path d="m5 14-2-2 2-2"/><path d="M3 12h7a3 3 0 0 0 3-3"/></svg></button>`;
  const sub = seg ? `Dónde cayó cada pieza del período y cuántos seguidores trajo cada mil vistas (en todo el período, ${mtConvTxt(refConv) || 'sin dato'}). En la diana, el color es el anillo y el tamaño, cuánto superó ese número; en la grilla, cuanto más intenso el color, más seguidores trajo. Sólo TikTok mide los seguidores de cada video`
    : 'Dónde cayó cada pieza del período y cómo rindió. En la diana, el color es el anillo y el tamaño, cuánto superó lo normal de su cuenta (lo que quedó por debajo, transparente); en la grilla, cuanto más intenso el color, mejor rindió';
  return `<section class="mt-panel mt-mapa-p"><header class="mt-panel-h"><h3>Mapa de tu contenido</h3>${mtMedidaSeg(['rendimiento', 'seguidores'])}<span class="mt-panel-sub">${esc(sub)}</span></header>
    <div class="mt-mapa"><figure class="rfm-diana">${svg}<figcaption>Del centro hacia afuera, qué tan cerca está de tu comprador; alrededor, de qué habla. Tocá un anillo o un tema; un punto abre la pieza.</figcaption>
      <div class="rfm-leyenda">${dianaLeyenda(xs, tax, M.tema, M.anillo, 'data-mtanillo')}</div></figure>
      <div class="mt-mapa-g"><div class="mt-mapa-ejes">${eje}</div>${grilla}</div></div>
    ${sel ? `<div class="mt-abierto mt-mapa-sel"><p><b>${esc(nombreSel)}</b>: ${sel.length} pieza${sel.length === 1 ? '' : 's'}${sel.length ? (c => c == null ? (seg ? ', sin seguidores medidos' : '') : seg ? `, en conjunto ${esc(mtConvTxt(c))} seguidores cada mil vistas` : `, en conjunto ${esc(rfXtxt(c))} lo normal de su cuenta`)(mtConjunto(sel, seg)) : ''}. <button class="link" data-mtmlimpiar>Ver todo</button></p><div class="mt-pzs">${sel.slice(0, 24).map(mtPieza).join('')}</div></div>` : ''}
  </section>`;
}

// Qué tan amplio hablarle (el Audience Bullseye de Kallaway). Cada video está en el anillo de quien se detendría por la
// promesa de su gancho, no el de su tema, y cada anillo se mide por alcance, conversión y eficiencia. Los seguidores
// son una medida provisoria: sin ManyChat no hay leads atribuidos a cada video, y sólo TikTok los trae. Los videos de
// menos de una semana todavía suman y no entran. Cómo se definió cada anillo. Cada perfil puede tener su definición en
// taxonomia_propia.json (`anillos_por_perfil`, por marca); la que no la tiene usa la general, y se dice. El ejemplo es el video del perfil que
// mejor rindió en ese anillo.
function mtDefAnillos(pubs) {
  const tax = mtTax(), por = tax?.anillos_por_perfil || {}, def = por[mtMarca()] || por.todas || Object.values(por)[0]; if (!def) return '';
  const vids = mtVideos(), urls = new Map();
  for (const p of pubs) if (p.video_id && p.url && (!urls.has(p.video_id) || p.red === 'instagram')) urls.set(p.video_id, p.url);
  const anillo = v => mtAnilloDe(v?.anillos_perfil) ?? v?.anillo, senal = v => v?.anillos_perfil?.[mtMarca()]?.senal ?? v?.anillo_senal;
  const ejemplo = n => [...urls.keys()].map(i => vids.get(i)).filter(v => v && anillo(v) === n && senal(v) && v.balance != null && !v.provisional).sort((a, b) => b.balance - a.balance)[0];
  // Cuántos videos del perfil hay en cada anillo: en una cuenta sin lecturas, es lo único que se puede saber.
  const delPerfil = [...new Set(pubs.filter(p => p.video_id && p.clase).map(p => p.video_id))].map(i => vids.get(i)), cuantos = n => delPerfil.filter(v => anillo(v) === n).length;
  const perfil = perfilActual === 'all' ? '' : BRAND_LABEL[perfilActual] || perfilActual;
  const ajena = !por[mtMarca()] && perfil ? `<p class="mt-pocas">${esc(perfil)} todavía no tiene anillos propios: sus videos se clasificaron con la definición general, así que leelos con esa salvedad.</p>` : '';
  const filas = def.anillos.map(d => { const a = tax.anillos.find(x => x.n === d.n) || {}, ex = ejemplo(d.n);
    return `<div class="mt-def-f"><div class="mt-def-n">${rfAnilloIc(d.n)}<span><b>${d.n} · ${esc(a.corto || '')}</b><small>${cuantos(d.n)} video${cuantos(d.n) === 1 ? '' : 's'}</small></span></div>
      <div class="mt-def-t"><p>${esc(d.quien)}</p><small>${esc(d.senales)}</small></div>
      <div class="mt-def-e">${ex ? `<a href="${esc(urls.get(ex.id))}" target="_blank" rel="noopener">${esc(ex.titulo)}</a><small>${esc(senal(ex))}</small>` : '<small>Todavía sin un video medido en este anillo.</small>'}</div></div>`; }).join('');
  return `<h4 class="mt-sub">Cómo se definió cada anillo</h4>${ajena}
    <p class="mt-como"><b>La prueba: ${esc(def.prueba)}</b> ${esc(def.reglas)} <b>Tu centro:</b> ${esc(def.centro)} ${esc(def.origen)}</p>
    <div class="mt-def"><div class="mt-def-f cab"><span>Anillo</span><span>Quién se detiene, y qué lo delata en el gancho</span><span>Tu video que mejor rindió ahí, y por qué cayó ahí</span></div>${filas}</div>`;
}
function mtAnillos(pubs, P) {
  const tax = mtTax(), vids = mtVideos(); if (!tax?.anillos?.length) return '';
  const ps = pubs.filter(p => p.clase?.anillo && p.vistas > 0 && !p.trial && !['carrusel', 'carousel'].includes(p.formato_pieza) && mtEnTramo(p, P.desde, P.hasta) && !p.pub_provisional);
  const filas = tax.anillos.map(a => {
    const xs = ps.filter(p => p.clase.anillo === a.n), ig = xs.filter(p => p.red === 'instagram'), tt = xs.filter(p => p.red === 'tiktok'), ids = [...new Set(xs.map(p => p.video_id))];
    const vistasTt = mtSuma(tt.map(p => p.vistas));
    return { a, n: ids.length, ig: mtMediana(ig.map(p => p.vistas)), tt: mtMediana(tt.map(p => p.vistas)), bal: mtMediana(ids.map(i => vids.get(i)?.provisional ? null : vids.get(i)?.balance ?? null)),
      seg: tt.length ? mtMediana(tt.map(p => p.seguidores_nuevos || 0)) : null, mil: vistasTt ? 1000 * mtSuma(tt.map(p => p.seguidores_nuevos)) / vistasTt : null };
  });
  const cab = '<header class="mt-panel-h"><h3>Qué tan amplio hablarle</h3><span class="mt-panel-sub">Cada anillo con su alcance, su conversión y su eficiencia</span></header>';
  const validas = filas.filter(f => f.n >= MT_MIN);
  if (!pubs.some(p => p.vistas > 0)) return `<section class="mt-panel">${cab}<p class="mt-pocas">Todavía no hay lecturas de estas cuentas: se puede ver a quién le habla cada video, no cuánto rinde.</p>${mtDefAnillos(pubs)}</section>`;
  if (validas.length < 2) return `<section class="mt-panel">${cab}<p class="mt-pocas">Hacen falta al menos dos anillos con ${MT_MIN} videos que ya tengan una semana${P.dias >= 90 ? '' : `. Mirá <button class="link" data-mtatajo="dias90">los últimos 90 días</button>`}.</p>${mtDefAnillos(pubs)}</section>`;
  const mejor = k => { const c = validas.filter(f => f[k] != null); return c.length ? c.reduce((m, f) => f[k] > m[k] ? f : m) : null; };
  const M = { bal: mejor('bal'), tt: mejor('tt'), ig: mejor('ig'), seg: mejor('seg'), mil: mejor('mil') };
  const celda = (f, k, txt) => `<td class="n${M[k] === f ? ' mejor' : ''}">${f[k] == null ? '<span class="muted">–</span>' : esc(txt(f[k]))}</td>`;
  const dec = v => (Math.round(v * 10) / 10).toLocaleString('es-AR');
  const nom = f => f ? `${f.a.n} · ${f.a.corto}` : 'sin dato';
  return `<section class="mt-panel mt-anillos">${cab}
    <p class="mt-como">Cada video está en el anillo de quien se detendría por la promesa de su gancho, no en el de su tema. Lo marcado es lo mejor de cada columna: <b>alcance en ${esc(nom(M.tt))}</b> en TikTok y <b>${esc(nom(M.ig))}</b> en Instagram, <b>seguidores por video en ${esc(nom(M.seg))}</b> y <b>eficiencia en ${esc(nom(M.mil))}</b>. Medianas de los videos con más de una semana, sin Trial ni carruseles; los seguidores son sólo de TikTok y son una medida provisoria.</p>
    <div class="mt-anillos-t"><table><thead><tr><th>Anillo</th><th class="n">Videos</th><th class="n">Rendimiento</th><th class="n">Vistas TikTok</th><th class="n">Vistas Instagram</th><th class="n">Seguidores por video</th><th class="n">Seguidores cada mil vistas</th></tr></thead>
      <tbody>${filas.filter(f => f.n).map(f => `<tr class="${f.n < MT_MIN ? 'poca' : ''}"><th title="${esc(f.a.que)}">${rfAnilloIc(f.a.n)}<span>${esc(nom(f))}</span></th><td class="n">${f.n}</td>${celda(f, 'bal', v => rfXtxt(v))}${celda(f, 'tt', v => rfNum(v))}${celda(f, 'ig', v => rfNum(v))}${celda(f, 'seg', dec)}${celda(f, 'mil', dec)}</tr>`).join('')}</tbody></table></div>
    ${mtDefAnillos(pubs)}
  </section>`;
}

// Qué te funciona. Un ranking por formato, por tema o por anillo de las piezas del período, cada una contra lo normal
// de su cuenta; al tocar una fila se ven sus piezas con portada y un resumen; abajo, los cruces que mejor rinden.
const MT_EJES = [['formato', 'Por formato'], ['linea', 'Por línea'], ['estilo', 'Por estilo'], ['tema', 'Por tema'], ['anillo', 'Por anillo']];
// Cuánto rindió un grupo en conjunto: sus vistas contra las que hubiera tenido si cada pieza hacía lo normal de su
// cuenta, o sus seguidores nuevos cada mil vistas. Antes era la mediana de las piezas, y dos piezas de 68 mil y 3.700
// vistas le ganaban a un tema con videos de 559, 261 y 131 mil. Así un éxito pesa lo que pesó.
const MT_MIN = 3;  // como propone Kallaway: con menos de tres piezas un grupo no se compara
function mtConjunto(ps, seg) {
  if (seg) { const c = ps.filter(p => p.conv != null), v = mtSuma(c.map(p => p.vistas)); return v ? 1000 * mtSuma(c.map(p => p.seguidores_nuevos)) / v : null; }
  // El promedio del balance de cada video: no se apaga un éxito, y Instagram y TikTok pesan lo mismo en todos los
  // grupos.
  const c = ps.filter(p => p.rinde != null);
  return c.length ? mtSuma(c.map(p => p.rinde)) / c.length : null;
}
function mtGrupos(xs, clave, seg = false) {
  const g = new Map(), val = seg ? p => p.conv : p => p.rinde;
  for (const p of xs) { const k = clave(p); if (k) (g.get(k) || g.set(k, []).get(k)).push(p); }
  return [...g.entries()].map(([k, ps]) => ({ k, ps: ps.sort((a, b) => (val(b) ?? 0) - (val(a) ?? 0)), x: mtConjunto(ps, seg), vistas: mtSuma(ps.map(p => p.vistas_total ?? p.vistas)),
    seguidores: ps.some(p => p.seguidores_nuevos != null) ? mtSuma(ps.map(p => p.seguidores_nuevos)) : null }))
    .sort((a, b) => (b.ps.length >= MT_MIN) - (a.ps.length >= MT_MIN) || (b.x ?? 0) - (a.x ?? 0));
}
// Vistas ganadas por cada video en las semanas que tocan un tramo, con Instagram y TikTok en la proporción del balance
// para ordenar. La semana en curso cuenta hasta la última lectura; una semana partida por el tramo, por los días que
// tiene adentro.
function mtGanadas(a, b) {
  const w = mt.data?.taxonomia?.balance?.redes || { instagram: .5, tiktok: .5 }, hoy = todayStr(), out = new Map();
  for (const s of mt.data?.semanas || []) {
    const fin = dateAdd(s.semana, 6); if (fin < a || s.semana > b) continue;
    const dias = mtEntre(s.semana > a ? s.semana : a, fin < b ? fin : b) + 1, parte = fin >= hoy ? 1 : dias / 7;
    const e = out.get(s.video_id) || out.set(s.video_id, { instagram: 0, tiktok: 0, seguidores: 0, peso: 0 }).get(s.video_id);
    e[s.red] += s.vistas * parte; e.seguidores += (s.seguidores || 0) * parte; e.peso += s.vistas * parte * 2 * (w[s.red] ?? .5);
  }
  return out;
}
const mtNombre = (tax, eje, k) => eje === 'linea' ? (l => l ? `${(tax.formatos.find(f => (tax.lineas[f.id] || []).includes(l)) || {}).nombre} · ${l.nombre}` : k)(Object.values(tax.lineas || {}).flat().find(l => l.id === k))
  : eje === 'estilo' ? (tax.estilos || []).find(e => e.id === k)?.nombre || k : eje === 'anillo' ? (a => a ? `${a.n} · ${a.corto}` : k)(tax.anillos.find(a => String(a.n) === String(k)))
  : ((eje === 'tema' ? tax.temas : tax.formatos).find(x => x.id === k) || {})[eje === 'tema' ? 'largo' : 'nombre'] || k;
const mtQue = (tax, eje, k) => eje === 'linea' ? Object.values(tax.lineas || {}).flat().find(l => l.id === k)?.que || '' : eje === 'estilo' ? '' : eje === 'anillo' ? tax.anillos.find(a => String(a.n) === String(k))?.que || '' : ((eje === 'tema' ? tax.temas : tax.formatos).find(x => x.id === k) || {}).que || '';
function mtPieza(p) {
  const img = p.media ? `<img src="${rfThumb(p.media)}" alt="" loading="lazy">` : `<i class="net">${NET_ICON[p.red] || ''}</i>`;
  return `<a class="mt-pz" href="${esc(p.url || '#')}" target="_blank" rel="noopener" title="Abrir en ${esc(MT_RED[p.red] || p.red)}">
    <span class="mt-pz-img">${img}${mt.medida === 'crecimiento' ? (p.ganadas != null ? `<em class="rf-x over" title="Vistas ganadas en el período">+${esc(rfNum(p.ganadas))}</em>` : '') : mt.medida === 'seguidores' ? (p.conv != null ? `<em class="rf-x over" title="Seguidores nuevos cada mil vistas">${esc(mtConvTxt(p.conv))}</em>` : '')
      : p.rinde != null ? `<em class="rf-x over ${p.rinde >= 2 ? 'hot' : p.rinde >= 1.2 ? 'warm' : ''}">${esc(rfXtxt(p.rinde))}</em>` : ''}</span>
    <b>${esc(p.titulo || p.texto || 'Sin texto')}</b>
    <small title="${esc(fmt(mtDia(p.publicado_at), { day: 'numeric', month: 'long' }) + ((p.redes || []).length > 1 ? `, también en ${p.redes.filter(r => r !== p.red).map(r => MT_RED[r] || r).join(' y ')}` : ''))}"><span class="net">${NET_ICON[p.red] || ''}</span>${rfNum(p.vistas_total ?? p.vistas)} vistas${p.seguidores_nuevos ? `<span class="mt-pz-seg">+${rfNum(p.seguidores_nuevos)} seguidores</span>` : ''}</small></a>`;
}
const mtResumen = gr => { const mejor = gr.ps[0], n = `${gr.ps.length} pieza${gr.ps.length === 1 ? '' : 's'}`, tit = mejor ? `«${(mejor.titulo || mejor.texto || '').slice(0, 70)}»` : '';
  if (mt.medida === 'crecimiento') return `${n}: ganaron ${rfNum(gr.x)} vistas en el período (Instagram +${rfNum(gr.ig)}, TikTok +${rfNum(gr.tt)}).${mejor ? ` La que más creció: ${tit}, +${rfNum(mejor.ganadas)}.` : ''}`;
  if (mt.medida === 'total') return `${n}: ${rfNum(gr.x)} vistas en total${gr.seguidores != null ? `, y sumaron ${rfNum(gr.seguidores)} seguidores` : ''}.${mejor ? ` La que más sumó: ${tit}, ${rfNum(mejor.vistas_total ?? mejor.vistas)}.` : ''}`;
  if (mt.medida === 'seguidores') return `${n}: en conjunto, ${mtConvTxt(gr.x)} seguidores cada mil vistas, con ${rfNum(gr.vistas)} vistas en total${gr.seguidores != null ? `, y sumaron ${rfNum(gr.seguidores)} seguidores` : ''}.${mejor ? ` La que más trajo: ${tit}, ${mtConvTxt(mejor.conv)} cada mil vistas.` : ''}`;
  return `${n}: en conjunto rindieron ${rfXtxt(gr.x)} lo normal de su cuenta, con ${rfNum(gr.vistas)} vistas en total${gr.seguidores != null ? `, y sumaron ${rfNum(gr.seguidores)} seguidores` : ''}.${mejor ? ` La que mejor anduvo: ${tit}, ${rfXtxt(mejor.rinde)}.` : ''}`; };
function mtAnalisis(pubs, P, base) {
  const tax = mtTax();
  if (!tax?.temas?.length) return '';
  // Con Seguidores, sólo entran las piezas con seguidores medidos y la línea es la mediana del período en vez de ×1.
  // Con Crecimiento entran los videos que ganaron vistas en el período, se hayan publicado cuando se hayan publicado.
  const seg = mt.medida === 'seguidores', crece = mt.medida === 'crecimiento', total = mt.medida === 'total';
  const unicas = pp => mtUnicas(pp.map(p => ({ ...p, rinde: base(p), normal: base.normal(p), conv: mtConv(p) })), seg);
  let xs;
  if (crece) {
    const ahora = mtGanadas(P.desde, P.hasta), antes = P.pd ? mtGanadas(P.pd, P.ph) : new Map();
    xs = unicas(pubs.filter(p => p.clase && p.video_id && ahora.has(p.video_id))).map(p => { const g = ahora.get(p.video_id); return { ...p, ganadas: g.instagram + g.tiktok, ganadas_ig: g.instagram, ganadas_tt: g.tiktok, peso: g.peso, antes: antes.get(p.video_id)?.peso ?? 0 }; }).filter(p => p.ganadas > 0);
  } else xs = unicas(pubs.filter(p => p.clase && p.vistas != null && mtEnTramo(p, P.desde, P.hasta))).filter(p => seg ? p.conv != null : total || p.rinde != null);
  const ref = seg ? mtConjunto(xs, true) || 1 : 1;
  const xTxt = x => crece ? '+' + rfNum(x) : total ? rfNum(x) : seg ? mtConvTxt(x) : rfXtxt(x), cls = x => x == null || crece || total ? '' : x / ref >= 2 ? 'hot' : x / ref >= 1.2 ? 'warm' : '';
  const eje = mt.eje, claveDe = p => eje === 'anillo' ? String(p.clase.anillo || '') : p.clase[eje];
  const medir = gs => gs.map(g => crece ? { ...g, ps: [...g.ps].sort((a, b) => b.peso - a.peso), x: mtSuma(g.ps.map(p => p.ganadas)), peso: mtSuma(g.ps.map(p => p.peso)), antes: mtSuma(g.ps.map(p => p.antes)), ig: mtSuma(g.ps.map(p => p.ganadas_ig)), tt: mtSuma(g.ps.map(p => p.ganadas_tt)) }
    : total ? { ...g, ps: [...g.ps].sort((a, b) => (b.vistas_total ?? b.vistas) - (a.vistas_total ?? a.vistas)), x: g.vistas } : g)
    .sort((a, b) => crece ? b.peso - a.peso : total ? b.x - a.x : 0);
  const grupos = medir(mtGrupos(xs, claveDe, seg));
  const escala = Math.max(crece || total ? 0 : 3 * ref, ...grupos.filter(g => crece || total || g.ps.length >= MT_MIN).map(g => g.x || 0)) || 1;
  const fila = g => { const on = mt.grupo === g.k, poca = g.ps.length < MT_MIN;
    return `<button class="mt-rk${on ? ' on' : ''}${poca ? ' poca' : ''}" data-mtgrupo="${esc(g.k)}" aria-expanded="${on}"${poca ? ' title="Menos de 3 piezas: todavía no alcanza para compararlo"' : ''}>
      <span class="mt-rk-ic">${rfIcono(eje, g.k)}</span><span class="mt-rk-t"><b>${esc(mtNombre(tax, eje, g.k))}</b><small>${g.ps.length} pieza${g.ps.length === 1 ? '' : 's'}${crece ? ` · Instagram +${rfNum(g.ig)} · TikTok +${rfNum(g.tt)}` : ` · ${rfNum(g.vistas)} vistas`}${g.seguidores != null && !crece ? ` · +${rfNum(g.seguidores)} seguidores` : ''}</small></span>
      <span class="mt-rk-barra" aria-hidden="true"><i style="width:${Math.min(100, (g.x || 0) / escala * 100).toFixed(1)}%"></i>${crece || total ? '' : `<em style="left:${(100 * ref / escala).toFixed(1)}%"></em>`}</span>
      <b class="mt-rk-x rf-x ${cls(g.x)}">${esc(xTxt(g.x))}${crece && P.pd ? (g.antes >= 1000 ? mtDelta(g.peso, g.antes, rfNum(g.antes)) : '<span class="mt-delta sube" title="En el período anterior casi no tenía vistas">nuevo</span>') : ''}</b></button>
      ${on ? `<div class="mt-abierto"><p>${esc(mtQue(tax, eje, g.k))}${mtQue(tax, eje, g.k) ? '. ' : ''}${esc(mtResumen(g))}</p><div class="mt-pzs">${g.ps.slice(0, 12).map(mtPieza).join('')}</div></div>` : ''}`; };
  const cruces = medir(mtGrupos(xs, p => p.clase.formato + '|' + p.clase.tema, seg)).filter(g => g.ps.length >= MT_MIN).slice(0, 6);
  const cruce = cruces.find(g => g.k === mt.cruce);
  const pocas = xs.length < 8 ? `<p class="mt-pocas">${xs.length ? `Hay ${xs.length} pieza${xs.length === 1 ? '' : 's'} clasificada${xs.length === 1 ? '' : 's'} con ${seg ? 'seguidores medidos' : 'métricas'} en este período: pocas para sacar conclusiones.` : `No hay piezas clasificadas con ${seg ? 'seguidores medidos' : 'métricas'} en este período.`}
      Mirá <button class="link" data-mtatajo="dias30">los últimos 30 días</button> o <button class="link" data-mtatajo="dias90">los últimos 90</button>.</p>` : '';
  return `<section class="mt-panel mt-que"><header class="mt-panel-h"><h3>Qué te funciona</h3>
      <div class="mt-panel-ctl">${mtMedidaSeg()}<div class="segmented">${MT_EJES.map(([k, l]) => `<button class="${eje === k ? 'on' : ''}" data-mteje="${k}">${l}</button>`).join('')}</div></div></header>
    <p class="mt-como">${crece ? `Las vistas que ganó cada grupo en el período, se hayan publicado cuando se hayan publicado, y cuánto cambió contra el período anterior. Va ordenado con Instagram y TikTok en la proporción del balance. Sale de lecturas repetidas: entre dos lecturas se reparte parejo, por semanas.`
      : total ? 'Las vistas absolutas de lo publicado en el período, sumando Instagram, TikTok y YouTube, sin comparar con nada. Dice qué sumó más, no qué superó lo normal.'
      : seg ? `Cuántos seguidores nuevos trajo cada pieza por cada mil vistas: dice qué te suma público, no sólo vistas. La línea marca todo el período junto (<b>${esc(mtConvTxt(ref))}</b>). Sólo TikTok mide los seguidores de cada video; Instagram y YouTube no entran acá.`
      : 'El balance de cada video entre Instagram y TikTok, promediado por grupo: <b>×1</b> es lo normal de cada cuenta cuando se publicó, <b>×2</b> el doble. Mezcla vistas, envíos y guardados, tiempo de reproducción y, en TikTok, seguidores. La línea marca ×1.'} Con menos de 3 piezas, el grupo va abajo y atenuado. Tocá una fila para ver sus piezas.</p>
    ${pocas}
    ${grupos.length ? `<div class="mt-rks">${grupos.map(fila).join('')}</div>` : ''}
    ${cruces.length ? `<h4 class="mt-sub">Los cruces que mejor rinden</h4><div class="mt-cruces">${cruces.map(g => { const [f, t] = g.k.split('|');
      return `<button class="mt-cruce${mt.cruce === g.k ? ' on' : ''}" data-mtcruce="${esc(g.k)}"><span class="mt-cruce-ic">${rfIcono('formato', f)}${rfIcono('tema', t)}</span><span class="t"><b>${esc(mtNombre(tax, 'formato', f))}</b> sobre <b>${esc(mtNombre(tax, 'tema', t))}</b><small>${g.ps.length} piezas · ${rfNum(g.vistas)} vistas</small></span><b class="rf-x ${cls(g.x)}">${esc(xTxt(g.x))}</b></button>`; }).join('')}</div>
      ${cruce ? `<div class="mt-abierto"><p>${esc(mtResumen(cruce))}</p><div class="mt-pzs">${cruce.ps.slice(0, 12).map(mtPieza).join('')}</div></div>` : ''}` : ''}
  </section>`;
}

// De dónde sale cada número y qué falta medir, plegado al pie.
function mtFuentes(fichas) {
  const segTxt = c => { const tot = c.serie.filter(s => s.seguidores != null), alt = c.serie.filter(s => s.seguidores == null && s.nuevos != null);
    return [tot.length && `total por día desde el ${mtCorto(tot[0].fecha)}`, alt.length && `altas por día del ${mtCorto(alt[0].fecha)} al ${mtCorto(alt[alt.length - 1].fecha)}`].filter(Boolean).join('; ') || 'sin lectura'; };
  const filas = fichas.map(c => { const vieja = c.ultima && Date.now() - new Date(c.ultima).getTime() > MT_VIEJA;
    return `<tr><td><span class="net">${NET_ICON[c.red] || ''}</span> ${esc(c.nombre)}</td><td>${c.ultima ? esc(c.fuente) : '<span class="muted">Ninguna</span>'}</td>
      <td class="${vieja ? 'mt-vieja' : ''}">${c.ultima ? esc(mtCuando(c.ultima)) : '<span class="muted">sin lecturas</span>'}</td><td class="n">${c.publicadas}</td><td class="n">${c.medidas}</td><td>${esc(segTxt(c))}</td></tr>`; }).join('');
  return `<details class="mt-panel mt-fuentes"><summary><h3>De dónde sale cada número</h3></summary>
    <table><thead><tr><th>Cuenta</th><th>Fuente</th><th>Última lectura</th><th class="n">Publicadas</th><th class="n">Con métricas</th><th>Seguidores</th></tr></thead><tbody>${filas}</tbody></table>
    <ul class="hint">
      <li>Postiz: las métricas de cada publicación y de cada cuenta que da su API, sólo lectura (<code>python3 engine/research/metricas.py postiz</code>). Una pieza aparece cuando salió por la cola del planner o cuando la importás.</li>
      <li>Lo que Postiz no trae (por ejemplo, guardados o tiempo de reproducción de una red) se suma con un CSV exportado de la red (<code>metricas.py importar</code>) o a mano (<code>metricas.py seguidores</code> y <code>metricas.py cargar</code>).</li>
      <li>Actualizar es pedirle a Claude Code «actualizá mis métricas»: corre lo de arriba y vuelve a armar los videos y su balance (<code>metricas.py videos</code>).</li>
      <li>Rendimiento: cada red contra lo normal de esa cuenta en los 45 días antes y después de publicar. El balance de un video pesa cada red según <code>balance.redes</code> de <code>taxonomia_propia.json</code> (por defecto, Instagram y TikTok igual); un video que salió en una sola red usa esa. Lo que tiene menos de una semana es provisorio.</li>
      <li>Lo que dice «Sin métricas» sólo cuenta publicaciones: esa cuenta todavía no tiene una fuente con números.</li>
    </ul></details>`;
}

function renderMetricas(fresh) {
  if (!mt.rango) mt.rango = mtRangoGuardado();
  const r = mt.rango;
  if (!mt.loading && (!mt.data || Date.now() - mt.data.at > 60000)) loadMetricas();
  const P = mtPeriodo(), paso = { semana: 'Semana', mes: 'Mes', anio: 'Año' }[r.tipo] || 'Período';
  $('mtWeekTitle').innerHTML = `<span>${esc(mtTitulo(r))}</span><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6.5 3 3 3-3"/></svg>`;
  $('mtCompara').textContent = mtComparaTxt(r, P);
  $('mtPrev').disabled = r.tipo === 'todo'; $('mtNext').disabled = r.tipo === 'todo' || P.fin >= todayStr(); $('mtToday').disabled = r.tipo === 'todo' || !!r.vivo;
  $('mtPrev').title = `${paso} anterior (←)`; $('mtNext').title = `${paso} siguiente (→)`;
  const d = mt.data, cont = $('mtMain'), scroll = scrollY;
  if (!d) { cont.innerHTML = skeleton('cards'); return; }
  if (d.error) { cont.innerHTML = `<p class="gv-empty">${esc(d.error)}</p>`; return; }
  if (!d.disponible) { cont.innerHTML = '<div class="gv-empty"><p>Todavía no hay métricas de tus cuentas.</p><p class="muted">Pedile a Claude Code «actualizá mis métricas» (skill referencias, sección Métricas): lee de Postiz lo que publicaste y sus números, y suma lo que le pases en CSV.</p></div>'; return; }
  if (P.futuro) { cont.innerHTML = '<p class="gv-empty muted">Este período todavía no empezó.</p>'; return; }
  const pubs = mtPublicaciones(), cuentas = mtCuentasBarra(), propias = mtDelPerfil(pubs), base = mtBase(propias, P);
  const inicio = (d.seguidores || []).filter(s => cuentas.some(a => mtEs(a, s.red, s.cuenta))).map(s => s.fecha).sort()[0];
  const cubos = mtCubos(P, inicio), fichas = cuentas.map(a => mtFicha(a, pubs, P, cubos));
  const grandes = fichas.filter(c => c.hayseg), chicas = fichas.filter(c => !c.hayseg);
  cont.innerHTML = `${grandes.length ? `<div class="mt-cards grandes">${grandes.map(mtTarjeta).join('')}</div>` : ''}${chicas.length ? `<div class="mt-cards chicas">${chicas.map(mtTarjeta).join('')}</div>` : ''}
    ${mtMejor(propias, P, base)}
    ${mtAnalisis(propias, P, base)}
    ${mtMapa(propias, P, base)}
    ${mtAnillos(propias, P)}
    ${mtFuentes(fichas)}
    ${mtBalance(fichas, propias, P, base)}`;
  if (fresh) scrollTo(0, scroll);
}

$('metricasView').addEventListener('click', e => {
  const t = e.target;
  const at = t.closest('[data-mtatajo]'); if (at) { mtSetRango(mtAtajo(at.dataset.mtatajo)); return; }
  const M = mt.mapa, alternar = (xs, v) => xs.includes(v) ? xs.filter(x => x !== v) : [...xs, v];
  const an = t.closest('[data-mtanillo]'); if (an) { M.anillo = alternar(M.anillo, an.dataset.mtanillo); M.celda = null; renderMetricas(true); return; }
  const tm = t.closest('[data-mttema]'); if (tm) { M.tema = alternar(M.tema, tm.dataset.mttema); M.celda = null; renderMetricas(true); return; }
  const ce = t.closest('[data-mtcelda]'); if (ce) { M.celda = M.celda === ce.dataset.mtcelda ? null : ce.dataset.mtcelda; renderMetricas(true); return; }
  const me = t.closest('[data-mtmeje]'); if (me) { M.eje = me.dataset.mtmeje; M.celda = null; store.set('mtMapaEje', M.eje); renderMetricas(true); return; }
  if (t.closest('[data-mtmgirar]')) { M.girado = !M.girado; M.celda = null; store.set('mtMapaGirado', M.girado); renderMetricas(true); return; }
  if (t.closest('[data-mtmlimpiar]')) { M.tema = []; M.anillo = []; M.celda = null; renderMetricas(true); return; }
  const pu = t.closest('[data-mtpunto]'); if (pu) { const p = (mt.data?.publicaciones || []).find(x => x.id === pu.dataset.mtpunto); if (p?.url) window.open(p.url, '_blank', 'noopener,noreferrer'); return; }
  const md = t.closest('[data-mtmedida]'); if (md) { mt.medida = md.dataset.mtmedida; mt.grupo = null; mt.cruce = null; store.set('mtMedida', mt.medida); renderMetricas(true); return; }
  const ej = t.closest('[data-mteje]'); if (ej) { mt.eje = ej.dataset.mteje; mt.grupo = null; store.set('mtEje', mt.eje); renderMetricas(true); return; }
  const gr = t.closest('[data-mtgrupo]'); if (gr) { mt.grupo = mt.grupo === gr.dataset.mtgrupo ? null : gr.dataset.mtgrupo; renderMetricas(true); return; }
  const cr = t.closest('[data-mtcruce]'); if (cr) { mt.cruce = mt.cruce === cr.dataset.mtcruce ? null : cr.dataset.mtcruce; renderMetricas(true); return; }
});
// El valor de cada barra al pasar el mouse: toda la columna es el blanco, no sólo la barra.
const mtTip = () => { let t = $('mtTip'); if (!t) { t = document.createElement('span'); t.id = 'mtTip'; t.className = 'mt-tip'; t.hidden = true; document.body.appendChild(t); } return t; };
$('metricasView').addEventListener('pointerover', e => {
  const b = e.target.closest?.('.mt-bar'), tip = mtTip();
  if (!b) { tip.hidden = true; return; }
  tip.textContent = b.dataset.tip; tip.hidden = false;
  const r = b.getBoundingClientRect(), caja = b.parentElement.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px';
  tip.style.top = Math.max(8, caja.top - tip.offsetHeight - 6) + 'px';
});
$('metricasView').addEventListener('pointerleave', () => { mtTip().hidden = true; });
addEventListener('scroll', () => { const t = $('mtTip'); if (t) t.hidden = true; }, { passive: true });
$('mtWeekTitle').onclick = () => rangoMenu($('mtWeekTitle'), { rango: () => mt.rango, periodo: mtPeriodo, atajos: MT_ATAJOS, set: mtSetRango });
$('mtPrev').onclick = () => mtMover(-1);
$('mtNext').onclick = () => mtMover(1);
$('mtToday').onclick = () => mtHoy();
document.addEventListener('visibilitychange', () => { if (!document.hidden && view === 'metricas') loadMetricas(); });
if (view === 'metricas') renderMetricas();
