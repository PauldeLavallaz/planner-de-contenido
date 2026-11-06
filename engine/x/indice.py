#!/usr/bin/env python3
"""indice.py — Junta todas las bajadas de bookmarks en el índice que lee el planner (<x>/bookmarks.json), en el orden en
que los guardaste y sin repetir.

Lo que falta para que un tweet se vea como en X (usuario, foto, imágenes, video, el post que cita, la tarjeta de un
artículo) se completa con el endpoint público de embeds de X (cdn.syndication.twimg.com): es gratis y no usa ninguna
sesión. --completar N toma los N más nuevos que no lo tengan; --completar 0 no consulta nada.

Uso:  indice.py [--completar 200]
"""
import argparse, json, re, sys, time, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import BAJADAS, INDICE, ahora, escribir, leer  # noqa: E402

LINK = re.compile(r'https://t\.co/\S+')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'


def syndication(tid):
    url = f'https://cdn.syndication.twimg.com/tweet-result?id={tid}&lang=en&token=a'
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=20) as r:
            return json.load(r)
    except Exception:
        return None


def media_de(s):
    out = []
    for m in s.get('mediaDetails') or []:
        url, vi = m.get('media_url_https'), m.get('video_info') or {}
        if m.get('type') in ('video', 'animated_gif'):
            mp4 = [v for v in vi.get('variants', []) if v.get('content_type') == 'video/mp4']
            if mp4:
                url = max(mp4, key=lambda v: v.get('bitrate') or 0)['url']
        dims = m.get('original_info') or {}
        out.append({'tipo': m.get('type'), 'url': url, 'preview': m.get('media_url_https'), 'duracion_ms': vi.get('duration_millis'),
                    'ancho': dims.get('width'), 'alto': dims.get('height')})
    return out


def autor_de(u):
    return {'handle': u.get('screen_name'), 'nombre': u.get('name'),
            'avatar': (u.get('profile_image_url_https') or '').replace('_normal.', '_200x200.') or None,
            'verificado': bool(u.get('is_blue_verified') or u.get('verified'))}


def articulo_de(s):
    """Un artículo de X, o un tweet que es sólo un link, se ve en X con portada, título y resumen."""
    a = s.get('article')
    if a:
        return {'titulo': a.get('title'), 'resumen': a.get('preview_text'),
                'portada': ((a.get('cover_media') or {}).get('media_info') or {}).get('original_img_url')}
    v = (s.get('card') or {}).get('binding_values') or {}
    if not v or LINK.sub('', s.get('text') or '').strip():
        return None
    txt = lambda k: (v.get(k) or {}).get('string_value')
    img = (v.get('summary_photo_image_large') or v.get('thumbnail_image_large') or v.get('photo_image_full_size_large') or {}).get('image_value') or {}
    urls = (s.get('entities') or {}).get('urls') or []
    return {'titulo': txt('title') or txt('domain') or txt('vanity_url'), 'resumen': txt('description'), 'portada': img.get('url'),
            'sitio': txt('domain') or txt('vanity_url'), 'url': urls[0].get('expanded_url') if urls else None}


def cita_de(s):
    q = s.get('quoted_tweet')
    if not q:
        return None
    return {'id': q.get('id_str'), 'autor': autor_de(q.get('user') or {}), 'texto': q.get('text') or '', 'fecha': q.get('created_at'),
            'media': media_de(q), 'articulo': articulo_de(q)}


def completar(b):
    """Usuario, media, cita y artículo de un tweet, desde el embed público. Devuelve si pudo."""
    s = syndication(b['id'])
    if not s:
        return False
    b['autor'] = {**b.get('autor', {}), **{k: v for k, v in autor_de(s.get('user') or {}).items() if v}}
    b['media'], b['cita'] = media_de(s), cita_de(s)
    art = articulo_de(s)
    if art:
        b['articulo'] = {**(b.get('articulo') or {}), **{k: v for k, v in art.items() if v}}
    b['completo'] = True
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--completar', type=int, default=200)
    a = ap.parse_args()

    bajadas = sorted(BAJADAS.glob('bookmarks-*.json'), reverse=True) if BAJADAS.exists() else []
    previo = {b['id']: b for b in (leer(INDICE, {}) or {}).get('items', []) if isinstance(b, dict) and b.get('id')}
    items, por_id = [], {}
    for f in bajadas:
        d = leer(f, {}) or {}
        for b in (d.get('items') or []) + (d.get('fuera_de_ventana_nuevos') or []):
            if not isinstance(b, dict) or not b.get('id'):
                continue
            ya = por_id.get(b['id'])
            if ya:  # una bajada más vieja puede traer lo que a la nueva le falta
                ya['autor'] = {**{k: v for k, v in (b.get('autor') or {}).items() if v}, **{k: v for k, v in ya['autor'].items() if v}}
                if not ya.get('media') and b.get('media'):
                    ya['media'] = b['media']
                continue
            b = {**b, 'autor': dict(b.get('autor') or {})}
            b.pop('nuevo', None)
            p = previo.get(b['id'])
            if p:  # lo completado antes no se vuelve a pedir, y gana el texto más largo (lo viejo puede venir cortado)
                for k in ('cita', 'completo'):
                    if p.get(k) is not None:
                        b[k] = p[k]
                if p.get('articulo'):
                    b['articulo'] = {**p['articulo'], **(b.get('articulo') or {})}
                if p.get('media') and not b.get('media'):
                    b['media'] = p['media']
                if len(p.get('texto') or '') > len(b.get('texto') or ''):
                    b['texto'] = p['texto']
                b['autor'] = {**{k: v for k, v in (p.get('autor') or {}).items() if v}, **{k: v for k, v in b['autor'].items() if v}}
            por_id[b['id']] = b
            items.append(b)
    # Lo que estaba en el índice y ninguna bajada trae (bajadas borradas) se conserva.
    items += [b for i, b in previo.items() if i not in por_id]

    # El orden real de guardado: cada bajada guarda en `orden_ids` cómo vinieron de la API.
    rango = {}
    for f in bajadas:
        for tid in (leer(f, {}) or {}).get('orden_ids') or []:
            rango.setdefault(tid, len(rango))
    items.sort(key=lambda b: rango.get(b['id'], len(rango)))

    faltan = [b for b in items if not b.get('completo')][:max(0, a.completar)]
    hechos = 0
    for i, b in enumerate(faltan):
        hechos += completar(b)
        if i % 25 == 24:
            print(f'completados {i + 1}/{len(faltan)}', file=sys.stderr)
        time.sleep(0.3)
    for b in items:
        b['url'] = f"https://x.com/{b['autor'].get('handle') or 'i'}/status/{b['id']}"

    escribir(INDICE, {'actualizado': ahora(), 'items': items})
    print(json.dumps({'bookmarks': len(items), 'completados': hechos, 'sin_usuario': sum(1 for b in items if not b['autor'].get('handle'))}))


if __name__ == '__main__':
    main()
