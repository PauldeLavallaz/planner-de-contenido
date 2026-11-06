#!/usr/bin/env python3
"""La imagen de un post de LinkedIn: arriba la frase (y una figura opcional), abajo la lista. 1080×1350, en código.

    python3 engine/linkedin/lamina.py <id-del-borrador> <cuerpo.html> [--figura recorte.png] [--fondo imagen.jpg]
        deja <linkedin>/imagenes/<id>.png y la ruta en `imagen` del borrador
    python3 engine/linkedin/lamina.py <id> <cuerpo.html> --salida prueba.png
        prueba: no toca el borrador

El cuerpo trae <h1> con la palabra clave en <em> (cortes con <br>), <ol> con una fila por <li>
(<i>número</i><b>qué</b><span>detalle</span>, o <span class="barra" style="--v:53%">) y <div class="pie"><span>…</span></div>.
La plantilla es .claude/skills/linkedin-posts/lamina.css; tus colores y fuentes van en el CSS de `linkedin.lamina.css`
(planner.config.json), que se carga después, o en un <style> dentro del cuerpo. `linkedin.lamina.logo` pone tu logo en el pie.
La figura (una persona o un personaje recortado, PNG con transparencia) es opcional: se apoya en el borde del bloque y la frase
se achica hasta no tocarla. Necesita Playwright: pip install playwright && python3 -m playwright install chromium
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import IMAGENES, REPO, borrador, cfg_li, guardada, ruta, write_json  # noqa: E402

PLANTILLA = REPO / '.claude/skills/linkedin-posts/lamina.css'


def main():
    a = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    a.add_argument('id'); a.add_argument('cuerpo'); a.add_argument('--figura'); a.add_argument('--fondo'); a.add_argument('--salida')
    o = a.parse_args()
    f, b = borrador(o.id) if not o.salida else (None, None)
    cuerpo = Path(o.cuerpo).read_text(encoding='utf-8')
    salida = Path(o.salida) if o.salida else IMAGENES / f'{o.id}.png'
    cfg = cfg_li().get('lamina') or {}
    propio = ruta(cfg.get('css')) if cfg.get('css') else None
    logo = ruta(cfg.get('logo')) if cfg.get('logo') else None
    figura = Path(o.figura).resolve() if o.figura else None
    for p, que in ((figura, '--figura'), (propio, 'linkedin.lamina.css'), (logo, 'linkedin.lamina.logo')):
        if p and not p.is_file():
            sys.exit(f'no existe {p} ({que})')
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit('Falta Playwright: pip install playwright && python3 -m playwright install chromium')
    fondo = f'<style>:root{{--bloque:url("{Path(o.fondo).resolve().as_uri()}")}}</style>' if o.fondo else ''
    pie_logo = f'<style>.pie::after{{content:"";width:180px;height:40px;background:url("{logo.as_uri()}") right center/contain no-repeat}}</style>' if logo else ''
    html = (f'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="{PLANTILLA.as_uri()}">'
            + (f'<link rel="stylesheet" href="{propio.as_uri()}">' if propio else '') + fondo + pie_logo
            + f'<body><div class="arriba">{f"<img class=figura src={json.dumps(figura.as_uri())} alt>" if figura else ""}</div>{cuerpo}</body>')
    salida.parent.mkdir(parents=True, exist_ok=True)
    tmp = salida.parent / f'.{salida.stem}.html'
    tmp.write_text(html, encoding='utf-8')
    try:
        with sync_playwright() as p:
            nav = p.chromium.launch()
            pag = nav.new_page(viewport={'width': 1080, 'height': 1350})
            pag.goto(tmp.as_uri())
            pag.evaluate('document.fonts.ready')
            pag.wait_for_timeout(200)
            # Filas de 112 a 134 px: lo que sobra se lo lleva el bloque de arriba. Después, la frase centrada en el bloque y achicada
            # hasta que entre en el ancho y no toque la figura (contra su caja).
            aviso = pag.evaluate('''(() => {
              const n = Math.max(1, document.querySelectorAll("ol > li").length), fila = Math.min(670 / n, 134), arriba = Math.round(1230 - n * fila);
              document.documentElement.style.setProperty("--arriba", arriba + "px");
              const h = document.querySelector("h1"), fig = document.querySelector(".figura");
              if (h) {
                let s = parseFloat(getComputedStyle(h).fontSize);
                const choca = () => { const a = h.getBoundingClientRect(), b = fig ? fig.getBoundingClientRect() : null, m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--m"));
                  return a.right > 1080 - m || a.height > arriba - 100 || (b && a.right + 24 > b.left && a.bottom > b.top); };
                const ubicar = () => { h.style.top = Math.round((arriba - h.getBoundingClientRect().height) / 2) + "px"; };
                ubicar();
                while (choca() && s > 48) { s -= 2; h.style.fontSize = s + "px"; ubicar(); }
              }
              const largas = [...document.querySelectorAll("li b, li span:not(.barra)")].filter(e => e.getBoundingClientRect().right > e.parentElement.getBoundingClientRect().right + 1);
              return { filas: n, arriba, titulo: h ? parseFloat(h.style.fontSize || getComputedStyle(h).fontSize) : null, largas: largas.map(e => e.textContent) };
            })()''')
            pag.screenshot(path=str(salida))
            nav.close()
    finally:
        tmp.unlink(missing_ok=True)
    if aviso['largas']:
        print(f'!! no entran en una línea: {aviso["largas"]}', file=sys.stderr)
    if o.salida:
        print(salida, aviso)
        return
    b['imagen'] = guardada(salida)
    write_json(f, b)
    print(b['imagen'], aviso)


if __name__ == '__main__':
    main()
