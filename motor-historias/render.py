"""Renderiza historias HTML a imagen (PNG) y, si se pide, a video (MP4 con movimiento), y las revisa.

Cada historia es un HTML de 1080x1920 armado con el motor (motor/historia.css y motor/historia.js).
El script la abre en Chromium sin ventana. Por defecto saca la imagen fija: las
historias van sin animación salvo que sea indispensable. Con --video pide cada cuadro con
window.seek(t) y se lo pasa a ffmpeg.

Uso:
  python3 render.py SEMANA/fuente/*.html --salida SEMANA/historias [--chequeo]
         [--caras RUTA/AL/BINARIO/caras] [--video] [--fps 30] [--png-en 6.5] [--paralelo 3]

Deja por historia: nombre.png, nombre.mp4 con --video (H.264, 1080x1920, sin audio) y, con
--chequeo, nombre.chequeo.json más un resumen. El chequeo mira, en el último cuadro:
  - texto arriba de 250 px, abajo de 1650 px o pegado a los bordes;
  - renglones disparejos (el más corto bajo el 80% del más largo) y palabra sola al final;
  - contraste del texto contra lo que tiene detrás (3:1 en texto de 48 px o más, 4,5:1 en el resto);
  - zonas de stickers (.sticker) pisadas por texto o por una cara;
  - todo centrado: cada renglón de texto y cada caja, recurso, flecha o zona de sticker con su centro
    en el eje de la historia (540 px); un conjunto (una fila de emojis) se marca con data-grupo y se
    mide entero;
  - con --caras (el binario compilado de caras.swift, sólo en macOS): caras tapadas por texto o cajas ([data-caja]),
    o cortadas por el borde.
Necesita: pip install playwright pillow numpy; python3 -m playwright install chromium; ffmpeg sólo para --video.
"""
import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 1080, 1920
ARRIBA, ABAJO, MARGEN = 240, 1660, 36
TOLERANCIA_CENTRO = 14  # px: todo va centrado en el eje vertical de la historia


def luminancia(rgb):
    c = np.asarray(rgb, dtype=np.float32) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def color_css(s):
    s = s.strip()
    if s.startswith('rgb'):
        v = [float(x) for x in s[s.index('(') + 1:s.index(')')].replace('/', ',').split(',')[:3]]
        return np.array(v, dtype=np.float32)
    s = s.lstrip('#')
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def solapa(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    y = max(0, min(ay + ah, by + bh) - max(ay, by))
    return x * y


def revisar(textos, stickers, cajas, fondo_png, caras, centrado=()):
    problemas = []
    # Todo centrado: cada bloque de texto, renglón por renglón, y cada
    # caja, recurso, flecha o zona de sticker que no esté dentro de un grupo centrado.
    for t in textos:
        if t.get('en_grupo'):
            continue
        for c in t.get('renglones_centro', []):
            if abs(c - W / 2) > TOLERANCIA_CENTRO:
                problemas.append(f'«{t["texto"][:40]}» no está centrado (renglón con centro en {c:.0f} px, debería ser {W // 2})')
                break
    for e in centrado:
        if abs(e['centro'] - W / 2) > TOLERANCIA_CENTRO:
            problemas.append(f'{e["que"]} no está centrado (centro en {e["centro"]} px, debería ser {W // 2})')
    bg = np.asarray(Image.open(fondo_png).convert('RGB')).astype(np.float32)
    for t in textos:
        x, y, w, h = t['caja']
        nombre = f'«{t["texto"][:40]}»'
        if y < ARRIBA:
            problemas.append(f'{nombre} empieza a {y} px: lo tapa la barra de arriba de Instagram')
        if y + h > ABAJO:
            problemas.append(f'{nombre} baja hasta {y + h} px: lo tapa la barra de respuesta')
        if x < MARGEN or x + w > W - MARGEN:
            problemas.append(f'{nombre} queda pegado al borde ({x} a {x + w} px)')
        ls = [l for l in t['lineas'] if l['ancho'] > 0]
        if len(ls) >= 2 and not t['libre']:
            sil = min(l['ancho'] for l in ls) / max(l['ancho'] for l in ls)
            if sil < 0.8:
                problemas.append(f'{nombre} tiene renglones disparejos (silueta {sil:.0%}); usá .parejo o cortá distinto')
            if t['ultima_palabras'] == 1:
                problemas.append(f'{nombre} deja una palabra sola en el último renglón')
        # contraste contra lo que queda detrás del texto, renglón por renglón
        tc = color_css(t['color'])
        lt = float(luminancia(tc))
        peor = 99.0
        for l in ls:
            y0 = int(max(0, l['y'] - t['tam'] * 0.42)); y1 = int(min(H, l['y'] + t['tam'] * 0.42))
            x0 = int(max(0, l['x0'])); x1 = int(min(W, l['x1']))
            if y1 - y0 < 2 or x1 - x0 < 2:
                continue
            zona = luminancia(bg[y0:y1, x0:x1])
            ref = np.percentile(zona, 92) if lt > np.median(zona) else np.percentile(zona, 8)
            c = (max(lt, ref) + 0.05) / (min(lt, ref) + 0.05)
            peor = min(peor, float(c))
        minimo = 3.0 if t['tam'] >= 48 else 4.5
        t['contraste'] = round(float(peor), 2) if peor < 99 else None
        if peor < minimo:
            problemas.append(f'{nombre} tiene contraste {peor:.1f} (mínimo {minimo}); oscurecé detrás o cambiá el color')
        for s in stickers:
            if solapa(t['caja'], s['caja']) > 0.02 * s['caja'][2] * s['caja'][3]:
                problemas.append(f'{nombre} pisa la zona del sticker {s["que"]}')
    for c in caras:
        area = c['caja'][2] * c['caja'][3]
        cx, cy, cw, ch = c['caja']
        if cy < 4 or cx < 4 or cx + cw > W - 4 or cy + ch > H - 4:
            problemas.append('una cara queda cortada por el borde')
        for t in textos:
            if solapa(c['caja'], t['caja']) > 0.08 * area:
                problemas.append(f'«{t["texto"][:40]}» tapa una cara')
        for k in cajas:
            if solapa(c['caja'], k['caja']) > 0.08 * area:
                problemas.append(f'{k["que"]} tapa una cara')
        for s in stickers:
            if solapa(c['caja'], s['caja']) > 0.08 * area:
                problemas.append(f'el sticker {s["que"]} queda sobre una cara')
    return problemas


def detectar_caras(binario, png):
    if not binario:
        return []
    try:
        out = subprocess.run([binario, png], capture_output=True, text=True, timeout=60).stdout
        datos = json.loads(out)[0]
    except Exception as e:  # sin Vision (no es Mac) o el binario no corre: el chequeo sigue sin caras
        print(f'  (no pude buscar caras: {e})')
        return []
    return [{'caja': [round(c['x'] * W), round(c['y'] * H), round(c['w'] * W), round(c['h'] * H)]}
            for c in datos.get('caras', []) if c.get('confianza', 1) > 0.5 and c['w'] * W > 60]


async def una(browser, html, a, sem):
    async with sem:
        html = Path(html).resolve()
        salida = Path(a.salida) if a.salida else html.parent
        salida.mkdir(parents=True, exist_ok=True)
        base = salida / html.stem
        page = await browser.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
        errores = []
        page.on('pageerror', lambda e: errores.append(str(e)))
        page.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
        await page.goto(html.as_uri() + '?render')
        await page.evaluate('window.historiaLista')
        dur = await page.evaluate('window.HISTORIA.duracion')
        fin = a.png_en if a.png_en is not None else max(0, dur - 1 / a.fps)

        if a.video:
            n = int(round(dur * a.fps))
            ff = await asyncio.create_subprocess_exec(
                'ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(a.fps), '-c:v', 'mjpeg',
                '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', str(a.crf), '-preset', 'medium',
                '-movflags', '+faststart', str(base) + '.mp4', stdin=asyncio.subprocess.PIPE)
            for i in range(n):
                await page.evaluate(f'window.seek({i / a.fps})')
                ff.stdin.write(await page.screenshot(type='jpeg', quality=95))
                await ff.stdin.drain()
            ff.stdin.close()
            await ff.wait()

        await page.evaluate(f'window.seek({fin})')
        await page.screenshot(path=str(base) + '.png', type='png')
        resumen = f'{html.name}: {dur:.1f} s'
        if a.chequeo:
            textos = await page.evaluate('medirTextos()')
            stickers = await page.evaluate("medirCajas('.sticker')")
            cajas = await page.evaluate("medirCajas('[data-caja]')")
            centrado = await page.evaluate('medirCentrado()')
            tmp = Path(tempfile.mkdtemp())
            await page.evaluate("document.documentElement.classList.add('chequeo-sin-texto')")
            await page.screenshot(path=str(tmp / 'sin-texto.png'))
            await page.evaluate("document.documentElement.classList.remove('chequeo-sin-texto');"
                                "document.documentElement.classList.add('chequeo-solo-foto')")
            await page.screenshot(path=str(tmp / 'solo-foto.png'))
            await page.evaluate("document.documentElement.classList.remove('chequeo-solo-foto')")
            caras = detectar_caras(a.caras, str(tmp / 'solo-foto.png'))
            problemas = revisar(textos, stickers, cajas, str(tmp / 'sin-texto.png'), caras, centrado)
            problemas += [f'error en la página: {e}' for e in errores]
            json.dump({'historia': html.name, 'duracion': dur, 'textos': textos, 'stickers': stickers,
                       'caras': caras, 'problemas': problemas},
                      open(str(base) + '.chequeo.json', 'w'), ensure_ascii=False, indent=1)
            shutil.rmtree(tmp, ignore_errors=True)
            resumen += ' · ' + ('sin problemas' if not problemas else f'{len(problemas)} para revisar:\n    - ' + '\n    - '.join(problemas))
        elif errores:
            resumen += ' · errores en la página:\n    - ' + '\n    - '.join(errores)
        await page.close()
        print(resumen, flush=True)


async def main():
    ap = argparse.ArgumentParser(description='Historias HTML a PNG (y MP4 con --video), con chequeo.')
    ap.add_argument('htmls', nargs='+')
    ap.add_argument('--salida', default=None, help='carpeta de salida (default: la del HTML)')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--crf', type=int, default=17)
    ap.add_argument('--video', action='store_true', help='también el MP4 con movimiento (no es el default)')
    ap.add_argument('--solo-png', action='store_true', help=argparse.SUPPRESS)  # compatibilidad: ya es el default
    ap.add_argument('--png-en', type=float, default=None, help='segundo de la imagen fija (default: el final)')
    ap.add_argument('--chequeo', action='store_true')
    ap.add_argument('--caras', default=None, help='binario compilado de caras.swift para revisar caras')
    ap.add_argument('--paralelo', type=int, default=3)
    a = ap.parse_args()
    if a.video and not shutil.which('ffmpeg'):
        sys.exit('Falta ffmpeg para --video (Mac: brew install ffmpeg). Sin --video funciona sin él.')
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--allow-file-access-from-files', '--disable-web-security',
                                                '--font-render-hinting=none'])
        sem = asyncio.Semaphore(a.paralelo)
        await asyncio.gather(*(una(browser, h, a, sem) for h in a.htmls))
        await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
