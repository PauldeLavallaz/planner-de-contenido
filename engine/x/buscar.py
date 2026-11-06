#!/usr/bin/env python3
"""buscar.py — Busca en X y guarda lo que trae para verlo en Twitter → Búsquedas, con el mismo formato que los bookmarks.

API oficial con X_BEARER_TOKEN (de sólo lectura, de tu app de X), sin ninguna sesión. En el plan de pago por uso de X
cuesta US$0,005 por post devuelto; usuario, media y cita se completan con el embed público, gratis.

Uso:  buscar.py "<consulta de X>" [--titulo "cómo se ve en el planner"] [--max 25] [--reciente] [--todo]
      --max       de 10 a 100 posts (por default 25: US$0,125)
      --reciente  los más nuevos primero; por default, los más relevantes
      --todo      todo el historial de X (sólo con acceso a la búsqueda completa); por default, los últimos 7 días
"""
import argparse, json, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import BUSQ, clave, escribir, slug  # noqa: E402
from indice import articulo_de, autor_de, cita_de, media_de, syndication  # noqa: E402

USD_POR_POST = 0.005


def item_de(t):
    pm = t.get('public_metrics') or {}
    b = {'id': t['id'], 'autor': {'id': t.get('author_id')}, 'texto': (t.get('note_tweet') or {}).get('text') or t.get('text', ''),
         'fecha': t.get('created_at'), 'lang': t.get('lang'), 'media': [], 'cita': None,
         'metricas': {'likes': pm.get('like_count'), 'reposts': pm.get('retweet_count'), 'respuestas': pm.get('reply_count'),
                      'citas': pm.get('quote_count'), 'guardados': pm.get('bookmark_count'), 'vistas': pm.get('impression_count')}}
    s = syndication(t['id'])
    if s:
        b['autor'] = {**b['autor'], **autor_de(s.get('user') or {})}
        b['media'], b['cita'] = media_de(s), cita_de(s)
    a = t.get('article')
    if a or (s and articulo_de(s)):
        b['articulo'] = {'titulo': (a or {}).get('title'), 'resumen': (a or {}).get('preview_text'), 'texto': (a or {}).get('plain_text'), **((s and articulo_de(s)) or {})}
    b['url'] = f"https://x.com/{b['autor'].get('handle') or 'i'}/status/{t['id']}"
    return b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('consulta')
    ap.add_argument('--titulo')
    ap.add_argument('--max', type=int, default=25)
    ap.add_argument('--reciente', action='store_true')
    ap.add_argument('--todo', action='store_true')
    a = ap.parse_args()

    tok = clave('X_BEARER_TOKEN')
    if not tok:
        sys.exit('Falta X_BEARER_TOKEN en el .env del planner (el «Bearer Token» de tu app en developer.x.com).')
    query = a.consulta
    for filtro in ('-is:retweet', '-is:reply'):
        if filtro not in query:
            query += ' ' + filtro
    params = {'query': query, 'max_results': max(10, min(a.max, 100)), 'sort_order': 'recency' if a.reciente else 'relevancy',
              'tweet.fields': 'created_at,public_metrics,note_tweet,article,lang,author_id'}
    url = f"https://api.x.com/2/tweets/search/{'all' if a.todo else 'recent'}?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + tok}), timeout=45) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"X respondió {e.code}: {e.read()[:300].decode('utf8', 'replace')} (un 402 es saldo agotado, no un tema sin resultados)")

    tweets = data.get('data') or []
    usd = round(len(tweets) * USD_POR_POST, 3)
    if not tweets:
        print(json.dumps({'tweets': 0, 'usd_estimado': 0, 'query': query}, ensure_ascii=False))
        return
    items = []
    for t in tweets:
        items.append(item_de(t))
        time.sleep(0.3)
    hoy = datetime.now(timezone.utc)
    id_ = f"{hoy.strftime('%Y%m%d-%H%M%S')}-{slug(a.titulo or a.consulta)}"
    salida = BUSQ / f'{id_}.json'
    escribir(salida, {'consulta': a.titulo or a.consulta, 'query': query, 'creado': hoy.strftime('%Y-%m-%dT%H:%M:%SZ'),
                      'orden': 'reciente' if a.reciente else 'relevancia', 'periodo': 'todo' if a.todo else '7 días', 'usd_estimado': usd, 'items': items})
    print(json.dumps({'id': id_, 'tweets': len(items), 'usd_estimado': usd, 'archivo': str(salida)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
