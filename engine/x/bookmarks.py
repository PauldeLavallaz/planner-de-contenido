#!/usr/bin/env python3
"""bookmarks.py — Baja tus bookmarks de X por la API oficial (sólo lectura) y arma el índice que lee el planner.

La API devuelve los bookmarks del último guardado al más viejo, pero no cuándo guardaste cada uno: `--horas` filtra por
la fecha del tweet y `nuevo` marca lo que no estaba en la bajada anterior. Los tweets viejos recién guardados se
conservan aparte, como señal nueva.

Cuesta por post leído (en el plan de pago por uso de X, US$0,001 por post): una bajada de 3 páginas de 50 son unos
US$0,15. Una por día alcanza: si ya corrió hoy, no se repite salvo con --forzar.

Uso:  bookmarks.py [--horas 168] [--paginas 3] [--todo] [--forzar] [--sin-indice]
Escribe <x>/bajadas/bookmarks-<AAAAMMDD>.json y, salvo --sin-indice, corre indice.py.
"""
import argparse, json, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
import datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from comun import BAJADAS, X, ahora, escribir, leer  # noqa: E402
import oauth  # noqa: E402

USD_POR_POST = 0.001


def api(path, params, tok):
    url = f'https://api.x.com/2/{path}?' + urllib.parse.urlencode(params, doseq=True)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': f'Bearer {tok}'}), timeout=45) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'X respondió {e.code} en {path}: {e.read()[:300].decode("utf-8", "replace")} (un 402 es saldo agotado)')


def item_de(t, users, media, vistos):
    u = users.get(t.get('author_id'), {})
    pm = t.get('public_metrics', {})
    ms = []
    for mk in (t.get('attachments') or {}).get('media_keys', []):
        m = media.get(mk)
        if not m:
            continue
        url = m.get('url')
        if m.get('type') in ('video', 'animated_gif'):
            mp4 = [v for v in m.get('variants') or [] if v.get('content_type') == 'video/mp4' and v.get('url')]
            if mp4:
                url = max(mp4, key=lambda v: v.get('bit_rate') or 0)['url']
        ms.append({'tipo': m.get('type'), 'url': url or m.get('preview_image_url'), 'preview': m.get('preview_image_url') or url,
                   'duracion_ms': m.get('duration_ms'), 'ancho': m.get('width'), 'alto': m.get('height')})
    b = {'id': t['id'], 'autor': {'id': t.get('author_id'), 'handle': u.get('username'), 'nombre': u.get('name'),
                                  'avatar': (u.get('profile_image_url') or '').replace('_normal.', '_200x200.') or None,
                                  'verificado': bool(u.get('verified'))},
         'texto': (t.get('note_tweet') or {}).get('text') or t.get('text', ''), 'fecha': t.get('created_at'), 'lang': t.get('lang'),
         'metricas': {'likes': pm.get('like_count'), 'reposts': pm.get('retweet_count'), 'respuestas': pm.get('reply_count'),
                      'citas': pm.get('quote_count'), 'guardados': pm.get('bookmark_count'), 'vistas': pm.get('impression_count')},
         'media': ms, 'nuevo': t['id'] not in vistos}
    if t.get('article'):  # un artículo de X: su texto es sólo un link
        a = t['article']
        b['articulo'] = {'titulo': a.get('title'), 'resumen': a.get('preview_text'), 'texto': a.get('plain_text')}
    return b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--horas', type=int, default=168)
    ap.add_argument('--paginas', type=int, default=3)
    ap.add_argument('--todo', action='store_true', help='sin ventana: todo lo paginado')
    ap.add_argument('--forzar', action='store_true', help='repetir aunque ya se haya bajado hoy (es pago)')
    ap.add_argument('--sin-indice', action='store_true')
    a = ap.parse_args()

    salida = BAJADAS / f"bookmarks-{time.strftime('%Y%m%d')}.json"
    if salida.exists() and not a.forzar:
        sys.exit(f'Ya hay una bajada de hoy ({salida.name}): es una corrida paga, no se repite. Usá --forzar a propósito.')
    tok = oauth.token()
    yo = api('users/me', {'user.fields': 'name,username,profile_image_url,verified'}, tok).get('data') or {}
    if not yo.get('id'):
        sys.exit('X no devolvió tu usuario: revisá la autorización con «oauth.py estado».')
    # Tu nombre, usuario y foto, para que los borradores se vean como salen.
    escribir(X / 'cuenta.json', {**(leer(X / 'cuenta.json', {}) or {}), 'handle': yo.get('username'), 'nombre': yo.get('name'),
                                 'avatar': (yo.get('profile_image_url') or '').replace('_normal.', '_200x200.') or None,
                                 'verificado': bool(yo.get('verified')), 'actualizado': ahora()})

    vistos_f = BAJADAS / 'vistos.json'
    vistos = set((leer(vistos_f, {}) or {}).get('ids') or [])
    posts, users, media, siguiente, paginas = [], {}, {}, None, 0
    while paginas < a.paginas:
        # 50 por página: con 100 la API corta la paginación antes de tiempo.
        params = {'max_results': 50, 'tweet.fields': 'created_at,public_metrics,author_id,lang,entities,note_tweet,article',
                  'expansions': 'author_id,attachments.media_keys', 'user.fields': 'username,name,profile_image_url,verified',
                  'media.fields': 'type,url,preview_image_url,duration_ms,variants,width,height'}
        if siguiente:
            params['pagination_token'] = siguiente
        d = api(f"users/{yo['id']}/bookmarks", params, tok)
        users.update({u['id']: u for u in d.get('includes', {}).get('users', [])})
        media.update({m['media_key']: m for m in d.get('includes', {}).get('media', [])})
        posts += d.get('data', [])
        paginas += 1
        siguiente = d.get('meta', {}).get('next_token')
        if not siguiente:
            break
        time.sleep(0.5)

    corte = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=a.horas)
    def en_ventana(t):
        try:
            return a.todo or dt.datetime.fromisoformat(t['created_at'].replace('Z', '+00:00')) >= corte
        except (KeyError, ValueError):
            return True
    items = [item_de(t, users, media, vistos) for t in posts if en_ventana(t)]
    fuera = [item_de(t, users, media, vistos) for t in posts if not en_ventana(t) and t['id'] not in vistos]
    usd = round((len(posts) + 1) * USD_POR_POST, 3)
    escribir(salida, {'cuenta': yo.get('username'), 'bajado': ahora(), 'ventana_horas': None if a.todo else a.horas, 'paginas': paginas,
                      'usd_estimado': usd, 'orden_ids': [t['id'] for t in posts], 'items': items, 'fuera_de_ventana_nuevos': fuera})
    # Lo visto se marca después de escribir: si algo falla antes, nada queda como visto sin haberse mostrado.
    escribir(vistos_f, {'ids': sorted(vistos | {t['id'] for t in posts}), 'actualizado': ahora()})
    print(json.dumps({'bajados': len(posts), 'en_ventana': len(items), 'nuevos': sum(1 for b in items if b['nuevo']),
                      'viejos_recien_guardados': len(fuera), 'usd_estimado': usd, 'archivo': str(salida)}, ensure_ascii=False))
    if not a.sin_indice:
        subprocess.run([sys.executable, str(HERE / 'indice.py')], check=False)


if __name__ == '__main__':
    main()
