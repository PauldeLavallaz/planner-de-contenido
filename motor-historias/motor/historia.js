/* Motor de historias · tiempo exacto, texto que llena el ancho, renglones, contadores y secuencias.

   Va al final de cada historia: <script src="motor/historia.js"></script>
   - Abierto en un navegador, la historia se reproduce en loop (sirve para revisar).
   - render.py la abre con ?render, espera window.historiaLista y pide cada cuadro con
     window.seek(t): todas las animaciones CSS quedan pausadas en ese instante exacto.

   Atributos que entiende:
   data-duracion="7"            en .historia: segundos totales (default 7).
   data-ajustar="2"             el texto toma el tamaño más grande que entra en su ancho en N renglones.
     data-max="420" data-min="40"   límites en px.
   data-renglones               parte el texto en sus renglones reales; cada uno sube (130 ms de desfase).
   data-palabras                lo mismo, palabra por palabra.
   data-contar="5000000"        cuenta desde data-desde (0) hasta el número, desde data-inicio (s)
     durante data-cuenta (1,5 s). data-miles="." data-decimales="0" data-prefijo="+" data-sufijo="M".
   data-secuencia="clip/%03d.jpg" en un <img>: reproduce una secuencia de cuadros
     (data-cuadros="180" data-fps="30" data-inicio="0.4" data-loop).
   window.alSeek = t => {...}   movimiento propio en JS o canvas, llamado en cada cuadro. */
(function () {
  const raiz = document.querySelector('.historia');
  const DUR = parseFloat(raiz && raiz.dataset.duracion) || 7;
  document.documentElement.style.setProperty('--dur', DUR + 's');
  const RENDER = location.search.includes('render');
  if (location.search.includes('guias')) document.documentElement.classList.add('guias');
  window.HISTORIA = { duracion: DUR };

  // ── Renglones reales de un elemento (por la posición de cada fragmento de texto) ──
  function renglonesDe(el, todo) {
    const tops = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    let n;
    while ((n = tw.nextNode())) {
      if (!n.textContent.trim()) continue;
      if (!todo && n.parentElement.closest('[data-sin-chequeo], .emoji')) continue;
      r.selectNodeContents(n);
      for (const rc of r.getClientRects()) {
        if (rc.width < 1) continue;
        const y = rc.top + rc.height / 2;
        let l = tops.find(t => Math.abs(t.y - y) < rc.height * 0.45);
        if (!l) { l = { y, izq: rc.left, der: rc.right, arriba: rc.top, abajo: rc.bottom }; tops.push(l); }
        l.izq = Math.min(l.izq, rc.left); l.der = Math.max(l.der, rc.right);
        l.arriba = Math.min(l.arriba, rc.top); l.abajo = Math.max(l.abajo, rc.bottom);
      }
    }
    return tops.sort((a, b) => a.y - b.y);
  }

  // ── data-ajustar: el tamaño más grande que entra en N renglones sin desbordar ──
  function ajustar(el) {
    const n = parseInt(el.dataset.ajustar, 10) || 1;
    let lo = parseFloat(el.dataset.min) || 24, hi = parseFloat(el.dataset.max) || 600;
    const entra = s => {
      el.style.fontSize = s + 'px';
      return el.scrollWidth <= el.clientWidth + 1 && renglonesDe(el).length <= n;
    };
    if (!entra(lo)) { el.style.fontSize = lo + 'px'; return; }
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (entra(m)) lo = m; else hi = m; }
    el.style.fontSize = Math.floor(lo) + 'px';
  }

  // ── Partir en palabras conservando estilos (<em>, <b>, spans en línea) ──
  // Cada palabra queda en un <span class="w">; si estaba dentro de un <em>, el <em> pasa adentro
  // de la palabra. Así un renglón se puede mover entero sin perder la itálica de una palabra.
  function envolverPalabras(el) {
    const explotar = nodo => {
      for (const hijo of [...nodo.childNodes]) {
        if (hijo.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const p of hijo.textContent.split(/(\s+)/)) {
            if (!p) continue;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); continue; }
            const w = document.createElement('span'); w.className = 'w'; w.textContent = p;
            frag.appendChild(w);
          }
          nodo.replaceChild(frag, hijo);
        } else if (hijo.nodeType === 1 && hijo.tagName !== 'BR' && !hijo.classList.contains('w')) {
          explotar(hijo);
          const frag = document.createDocumentFragment();
          for (const d of [...hijo.childNodes]) {
            if (d.nodeType === 1 && d.classList.contains('w')) {
              const c = hijo.cloneNode(false);
              while (d.firstChild) c.appendChild(d.firstChild);
              d.appendChild(c);
            }
            frag.appendChild(d);
          }
          nodo.replaceChild(frag, hijo);
        }
      }
    };
    explotar(el);
    return [...el.querySelectorAll('.w')];
  }

  function partirRenglones(el) {
    const palabras = envolverPalabras(el);
    const filas = [];
    for (const w of palabras) {
      const y = w.getBoundingClientRect().top;
      let f = filas.find(f => Math.abs(f.y - y) < 4);
      if (!f) { f = { y, ws: [] }; filas.push(f); }
      f.ws.push(w);
    }
    filas.sort((a, b) => a.y - b.y);
    el.textContent = '';
    filas.forEach((f, i) => {
      const r = document.createElement('span'); r.className = 'renglon';
      const ri = document.createElement('span'); ri.className = 'renglon-in'; ri.style.setProperty('--i', i);
      f.ws.forEach((w, j) => { if (j) ri.appendChild(document.createTextNode(' ')); ri.appendChild(w); });
      r.appendChild(ri); el.appendChild(r);
    });
  }

  function partirPalabras(el) {
    envolverPalabras(el).forEach((w, i) => { w.classList.add('palabra-in'); w.style.setProperty('--i', i); });
  }

  // ── Contadores ──
  const contadores = [];
  function formato(el, v) {
    const dec = parseInt(el.dataset.decimales || '0', 10);
    const miles = el.dataset.miles ?? '.';
    let s = v.toFixed(dec);
    let [ent, fr] = s.split('.');
    ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, miles);
    return (el.dataset.prefijo || '') + ent + (fr ? ',' + fr : '') + (el.dataset.sufijo || '');
  }
  const easeOut = x => 1 - Math.pow(1 - x, 3);

  // ── Secuencias de cuadros ──
  const secuencias = [];

  async function preparar() {
    if (document.fonts) await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.decode ? i.decode().catch(() => {}) : null));
    document.querySelectorAll('[data-ajustar]').forEach(ajustar);
    document.querySelectorAll('[data-renglones]').forEach(partirRenglones);
    document.querySelectorAll('[data-palabras]').forEach(partirPalabras);
    document.querySelectorAll('[data-contar]').forEach(el => {
      const hasta = parseFloat(el.dataset.contar);
      el.textContent = formato(el, hasta);
      el.style.minWidth = el.getBoundingClientRect().width + 'px';
      contadores.push({ el, hasta, desde: parseFloat(el.dataset.desde || '0'),
        ini: parseFloat(el.dataset.inicio || '0'), dur: parseFloat(el.dataset.cuenta || '1.5') });
    });
    document.querySelectorAll('img[data-secuencia]').forEach(img => {
      secuencias.push({ img, patron: img.dataset.secuencia, n: parseInt(img.dataset.cuadros, 10),
        fps: parseFloat(img.dataset.fps || '30'), ini: parseFloat(img.dataset.inicio || '0'),
        loop: img.hasAttribute('data-loop'), actual: -1 });
    });
  }

  const ruta = (patron, i) => patron.replace(/%0(\d)d/, (_, d) => String(i).padStart(+d, '0'));

  window.seek = async function (t) {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; }
    for (const c of contadores) {
      const x = Math.min(1, Math.max(0, (t - c.ini) / c.dur));
      c.el.textContent = formato(c.el, c.desde + (c.hasta - c.desde) * easeOut(x));
    }
    const esperas = [];
    for (const s of secuencias) {
      let i = Math.floor(Math.max(0, t - s.ini) * s.fps);
      i = s.loop ? i % s.n : Math.min(i, s.n - 1);
      if (i !== s.actual) {
        s.actual = i; s.img.src = ruta(s.patron, i + 1);
        esperas.push(s.img.decode().catch(() => {}));
      }
    }
    if (window.alSeek) esperas.push(Promise.resolve(window.alSeek(t)));
    await Promise.all(esperas);
    return t;
  };

  // ── Medidas para el chequeo de render.py ──
  const tieneFondo = e => { const c = getComputedStyle(e).backgroundColor; return c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c); };
  function bloqueDe(el) {
    const marcado = el.closest('[data-bloque]');
    if (marcado) return marcado;
    // texto con caja propia (caja o resaltado): se mide contra su caja
    for (let e = el; e && e !== raiz; e = e.parentElement) if (tieneFondo(e)) return e;
    const r = el.closest('.renglon');
    if (r) return r.parentElement;
    let b = el;
    while (b.parentElement && b.parentElement !== raiz && ['inline', 'contents'].includes(getComputedStyle(b).display)) b = b.parentElement;
    return b;
  }

  // Para el centrado, un resaltado dentro de una frase se mide con la frase entera.
  function contenedorDe(el) {
    let b = el;
    while (b.parentElement && b.parentElement !== raiz && ['inline', 'contents'].includes(getComputedStyle(b).display)) b = b.parentElement;
    return b;
  }

  window.medirTextos = function () {
    const salida = [];
    const vistos = new Set();
    document.querySelectorAll('.historia *').forEach(el => {
      if (el.closest('[data-sin-chequeo]') || el.closest('.sticker') || el.closest('.emoji')) return;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
      const bloque = bloqueDe(el);
      if (vistos.has(bloque)) return;
      vistos.add(bloque);
      const cs = getComputedStyle(el);
      const r = bloque.getBoundingClientRect();
      if (r.width < 2 || cs.visibility === 'hidden') return;
      const rs = renglonesDe(bloque);
      if (!rs.length) return;
      const lineas = rs.map(l => ({ y: Math.round(l.y), ancho: Math.round(l.der - l.izq),
        x0: Math.round(l.izq), x1: Math.round(l.der) }));
      // la caja es la del texto escrito, no la del elemento (un <p> ocupa todo el ancho)
      const x0 = Math.min(...rs.map(l => l.izq)), x1 = Math.max(...rs.map(l => l.der));
      const y0 = Math.min(...rs.map(l => l.arriba)), y1 = Math.max(...rs.map(l => l.abajo));
      const partes = bloque.innerText.trim().split('\n').map(x => x.trim()).filter(Boolean);
      salida.push({ texto: bloque.innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
        caja: [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)],
        color: cs.color, tam: parseFloat(cs.fontSize), lineas, libre: bloque.hasAttribute('data-libre'),
        en_grupo: !!bloque.closest('[data-grupo]'),
        // renglones enteros (con emojis y huecos para completar) para medir el centrado
        renglones_centro: renglonesDe(contenedorDe(bloque), true).map(l => Math.round((l.izq + l.der) / 2)),
        ultima_palabras: lineas.length > 1 && partes.length ? partes[partes.length - 1].split(/\s+/).length : 0 });
    });
    return salida;
  };
  // Todo va centrado. Se mide cada grupo marcado con data-grupo
  // (una fila de emojis, una caja con su emoji al lado) y cada caja, captura, recorte, flecha o zona
  // de sticker que no esté dentro de un grupo.
  window.medirCentrado = function () {
    const sel = '[data-grupo], [data-caja], .sticker, .captura, .recorte, svg.lapiz';
    return [...document.querySelectorAll(sel)].filter(el => el.matches('[data-grupo]') || !el.closest('[data-grupo]'))
      .map(el => { const r = el.getBoundingClientRect();
        return { que: el.dataset.grupo || el.dataset.caja || el.dataset.sticker || (el.getAttribute('class') || '').split(' ')[0],
                 centro: Math.round(r.left + r.width / 2), ancho: Math.round(r.width) }; })
      .filter(x => x.ancho > 2);
  };

  window.medirCajas = sel => [...document.querySelectorAll(sel)].map(el => {
    const r = el.getBoundingClientRect();
    return { que: el.dataset.sticker || el.dataset.caja || el.className, caja: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  });

  window.historiaLista = preparar().then(() => window.seek(0));

  // Vista previa en el navegador: loop con una pausa al final.
  if (!RENDER) {
    window.historiaLista.then(() => {
      const t0 = performance.now();
      const paso = () => { const t = ((performance.now() - t0) / 1000) % (DUR + 1.2); window.seek(Math.min(t, DUR)); requestAnimationFrame(paso); };
      requestAnimationFrame(paso);
    });
  }
})();
