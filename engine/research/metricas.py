#!/usr/bin/env python3
"""Tus métricas para la pestaña Métricas: tus publicaciones, sus números, tus seguidores y tus videos con su balance entre
redes, en <research>/radar.db (tablas propias_*). Sólo lee: no publica ni cambia nada en ninguna red.

    python3 engine/research/metricas.py postiz [--dias 30]       # lo publicado por la cola y sus números, de Postiz
    python3 engine/research/metricas.py importar <archivo.csv> [--red instagram] [--cuenta micuenta] [--fecha AAAA-MM-DD]
    python3 engine/research/metricas.py cargar --url <link> --vistas 1200 [--likes 80 ...] [--red ...] [--cuenta ...] [--fecha ...]
    python3 engine/research/metricas.py seguidores <red> <cuenta> <total> [--fecha AAAA-MM-DD] [--nuevos N]
    python3 engine/research/metricas.py videos                   # agrupa cada pieza entre redes y calcula su rendimiento
    python3 engine/research/metricas.py actualizar               # postiz + videos + temas.py --propias

- postiz: cada publicación que salió por la cola del planner (sus fichas en <publicar>/agendado y /publicado) con
  `postiz analytics:post <id>`, y los seguidores de cada cuenta conectada con `postiz analytics:platform <id>`. Postiz
  devuelve lo que la red le da: algunas métricas (guardados, tiempo de reproducción) pueden faltar.
- importar: un CSV exportado de la red o armado a mano. Reconoce encabezados en castellano o inglés: url, red, cuenta,
  fecha, titulo, texto, vistas, alcance, likes, comentarios, compartidos, guardados, seguidores_nuevos, tiempo_promedio_s, completo.
- videos: la misma pieza publicada en varias redes es un solo video. Cada publicación se compara con lo normal de su
  cuenta (la mediana de las vistas de las otras publicaciones de ±45 días) y el balance del video pesa cada red según
  `balance.redes` de <research>/taxonomia_propia.json (por defecto Instagram y TikTok igual).
Windsor o Composio, si los usás, pueden volcar en las mismas tablas (fuente «windsor» o «composio»): la pestaña los muestra igual.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import re
import statistics
import subprocess
import sys
import unicodedata
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import base as lib  # noqa: E402
from common import AGENDADO, CFG, PUBLICADO, parse_json, read_json, rel, run_postiz  # noqa: E402

CAMPOS = ('vistas', 'alcance', 'likes', 'comentarios', 'compartidos', 'guardados', 'seguidores_nuevos', 'visitas_perfil', 'completo', 'tiempo_promedio_s', 'skip_rate')
TZ = ZoneInfo(CFG.get('timezone') or 'America/Argentina/Buenos_Aires')


def cuentas_propias():
    """Las cuentas conectadas de la config: (red, id de la integración, nombre visible, marca)."""
    out = []
    for red, ch in (CFG.get('channels') or {}).items():
        for c in [ch, *(ch.get('alternativas') or [])]:
            if c.get('id'):
                out.append({'red': red, 'id': c['id'], 'cuenta': str(c.get('profile') or c.get('label') or ch.get('label') or red).lstrip('@'), 'marca': c.get('marca') or ch.get('marca')})
    return out


def etiqueta(label):
    """El nombre de una serie de Postiz -> la columna de propias_metricas (o None si no es una que guardemos)."""
    l = str(label or '').lower()
    for clave, col in (('follow', 'seguidores_nuevos'), ('reach', 'alcance'), ('impression', 'vistas'), ('view', 'vistas'), ('play', 'vistas'),
                       ('like', 'likes'), ('reaction', 'likes'), ('comment', 'comentarios'), ('share', 'compartidos'), ('repost', 'compartidos'),
                       ('save', 'guardados'), ('favorite', 'guardados'), ('bookmark', 'guardados')):
        if clave in l:
            return col
    return None


def valor(puntos):
    """Una serie de Postiz en un número: un solo punto es ese total; si la serie nunca baja, es acumulada y vale el último;
    si sube y baja, son valores por día y se suman."""
    xs = [float(p.get('total')) for p in puntos if isinstance(p, dict) and str(p.get('total', '')).replace('.', '', 1).isdigit()]
    if not xs:
        return None
    return xs[-1] if len(xs) == 1 or all(b >= a for a, b in zip(xs, xs[1:])) else sum(xs)


def postiz_leer(args):
    cp = run_postiz(args, timeout=60)
    if cp.returncode:
        return None
    d = parse_json(cp.stdout or '')
    return d if isinstance(d, list) else (d.get('data') if isinstance(d, dict) and isinstance(d.get('data'), list) else None)


def fichas_publicadas():
    """Las fichas de la cola con publicaciones en Postiz que ya salieron (de reels, videos y carruseles; no historias)."""
    ahora = dt.datetime.now(dt.timezone.utc).isoformat()
    for f in [*sorted(AGENDADO.glob('*.json')), *sorted(PUBLICADO.glob('*/*.json'))]:
        d = read_json(f)
        if not isinstance(d, dict) or not d.get('slug') or d.get('formato') == 'story':
            continue
        posts = [p for p in (d.get('postiz') or {}).get('posts') or [] if p.get('id') and p.get('estado') != 'cancelado' and str(p.get('date_utc') or '') <= ahora]
        if posts:
            yield f, d, posts


def guardar_pub(con, pid, red, cuenta, marca, url, publicado_at, texto, titulo, formato, fuente, media=None, trial=0, postiz_id=None, serie=None):
    con.execute('''insert into propias_publicaciones(id,red,cuenta,marca,perfil,url,publicado_at,texto,titulo,formato_pieza,serie,postiz_id,fuente,actualizado_at,media,trial)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(id) do update set cuenta=coalesce(excluded.cuenta,cuenta), url=coalesce(excluded.url,url),
        publicado_at=coalesce(excluded.publicado_at,publicado_at), texto=coalesce(excluded.texto,texto), titulo=coalesce(excluded.titulo,titulo),
        formato_pieza=coalesce(excluded.formato_pieza,formato_pieza), media=coalesce(excluded.media,media), actualizado_at=excluded.actualizado_at''',
                (pid, red, cuenta, marca, lib.slug(marca) if marca else None, url, publicado_at, texto, titulo, formato, serie, postiz_id, fuente, lib.now(), media, int(bool(trial))))


def guardar_metricas(con, pid, medido_at, fuente, valores):
    vals = {k: valores.get(k) for k in CAMPOS}
    if not any(v is not None for v in vals.values()):
        return False
    con.execute(f'insert or replace into propias_metricas(id,medido_at,fuente,{",".join(CAMPOS)}) values(?,?,?,{",".join("?" * len(CAMPOS))})', (pid, medido_at, fuente, *vals.values()))
    return True


def cmd_postiz(a):
    con, medido, cuentas = lib.connect(), lib.now(), cuentas_propias()
    por_id = {c['id']: c for c in cuentas}
    pubs = leidas = 0
    for _f, d, posts in fichas_publicadas():
        caption = (d.get('captions') or {}).get('general') or next(iter((d.get('captions') or {}).values()), '') or ''
        poster = (d.get('portada') or {}).get('imagen')
        for p in posts:
            red = p.get('red')
            acc = por_id.get((d.get('cuentas') or {}).get(red)) or next((c for c in cuentas if c['red'] == red), {})
            pid = f'postiz:{p["id"]}'
            guardar_pub(con, pid, red, acc.get('cuenta'), d.get('marca') or acc.get('marca'), p.get('native_url'), p.get('date_utc'), caption[:2000], d.get('titulo') or d['slug'],
                        'carrusel' if d.get('formato') in ('carousel', 'carrusel') else 'reel', 'postiz', poster, red == 'instagram' and d.get('trial'), p['id'], d.get('serie'))
            con.execute('insert or ignore into propias_video_pubs(pub_id, video_id) values(?,?)', (pid, f'v:{d["slug"]}'))
            pubs += 1
            serie = postiz_leer(['analytics:post', p['id'], '-d', str(a.dias)])
            if serie:
                vals = {}
                for s in serie:
                    col = etiqueta(s.get('label'))
                    if col and s.get('data') is not None and vals.get(col) is None:
                        vals[col] = valor(s.get('data') or [])
                leidas += guardar_metricas(con, pid, medido, 'postiz', vals)
    seg = 0
    for c in cuentas:
        for s in postiz_leer(['analytics:platform', c['id'], '-d', str(a.dias)]) or []:
            if 'follow' not in str(s.get('label') or '').lower():
                continue
            for pto in s.get('data') or []:
                fecha = str(pto.get('date') or '')[:10]
                if re.fullmatch(r'\d{4}-\d{2}-\d{2}', fecha) and str(pto.get('total', '')).isdigit():
                    con.execute('insert or replace into propias_seguidores values(?,?,?,?,?,?,?)', (c['red'], c['cuenta'], fecha, 'postiz', int(pto['total']), None, None))
                    seg += 1
    con.commit()
    print(f'{pubs} publicaciones, {leidas} con números de Postiz y {seg} lecturas de seguidores')


ALIAS = {'url': ('url', 'link', 'enlace', 'permalink'), 'red': ('red', 'plataforma', 'platform', 'network'), 'cuenta': ('cuenta', 'account', 'usuario', 'username', 'handle'),
         'fecha': ('fecha', 'publicado', 'publicado_at', 'date', 'published', 'publish time', 'fecha de publicacion'), 'titulo': ('titulo', 'title'),
         'texto': ('texto', 'caption', 'descripcion', 'description'), 'vistas': ('vistas', 'views', 'reproducciones', 'plays', 'impressions', 'impresiones', 'video views'),
         'alcance': ('alcance', 'reach'), 'likes': ('likes', 'me gusta', 'reactions'), 'comentarios': ('comentarios', 'comments'), 'compartidos': ('compartidos', 'shares', 'veces compartido'),
         'guardados': ('guardados', 'saves', 'saved'), 'seguidores_nuevos': ('seguidores_nuevos', 'follows', 'new followers', 'seguidores'),
         'tiempo_promedio_s': ('tiempo_promedio_s', 'average watch time', 'tiempo promedio'), 'completo': ('completo', 'completion rate', 'finished', 'vistas completas')}


def norm(s):
    return unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().strip().lower()


def numero(v):
    t = str(v or '').strip().replace('%', '')
    if not t:
        return None
    t = t.replace('.', '').replace(',', '.') if re.fullmatch(r'\d{1,3}(\.\d{3})+(,\d+)?', t) else t.replace(',', '')
    try:
        return float(t)
    except ValueError:
        return None


def id_externo(url, red, cuenta, fecha, titulo, con):
    """La publicación de un CSV: la que ya está en la base con ese link o una nueva."""
    if url:
        fila = con.execute('select id from propias_publicaciones where url=?', (url,)).fetchone()
        if fila:
            return fila['id']
        return 'ext:' + (lib.url_key(url) or hashlib.sha1(url.encode()).hexdigest()[:16])
    return 'ext:' + hashlib.sha1(f'{red}|{cuenta}|{fecha}|{titulo}'.encode()).hexdigest()[:16]


def cmd_importar(a):
    con, n = lib.connect(), 0
    with open(a.archivo, newline='', encoding='utf-8-sig') as fh:
        filas = list(csv.DictReader(fh))
    if not filas:
        sys.exit('El CSV está vacío.')
    cols = {norm(k): k for k in filas[0]}
    col = {c: next((cols[x] for x in alias if x in cols), None) for c, alias in ALIAS.items()}
    medido = (a.fecha + 'T23:59:00+00:00') if a.fecha else lib.now()
    for f in filas:
        g = lambda c: (f.get(col[c]) or '').strip() if col[c] else ''  # noqa: E731
        red, cuenta = (g('red') or a.red or '').lower(), (g('cuenta') or a.cuenta or '').lstrip('@')
        if not red or not (g('url') or g('titulo') or g('texto')):
            continue
        pid = id_externo(g('url') or None, red, cuenta, g('fecha'), g('titulo'), con)
        guardar_pub(con, pid, red, cuenta or None, a.marca, g('url') or None, g('fecha') or None, g('texto')[:2000] or None, g('titulo') or None, None, 'csv')
        con.execute('insert or ignore into propias_video_pubs(pub_id, video_id) values(?,?)', (pid, 'v:' + pid))
        n += guardar_metricas(con, pid, medido, 'csv', {c: numero(g(c)) for c in CAMPOS if c in col})
    con.commit()
    print(f'{n} publicaciones con números desde {Path(a.archivo).name}')


def cmd_cargar(a):
    con = lib.connect()
    pid = id_externo(a.url, a.red, a.cuenta, a.fecha, a.titulo, con)
    if not con.execute('select 1 from propias_publicaciones where id=?', (pid,)).fetchone():
        if not a.red:
            sys.exit('Es una publicación nueva: pasá también --red (y --cuenta).')
        guardar_pub(con, pid, a.red, (a.cuenta or '').lstrip('@') or None, a.marca, a.url, a.fecha, None, a.titulo, None, 'manual')
        con.execute('insert or ignore into propias_video_pubs(pub_id, video_id) values(?,?)', (pid, 'v:' + pid))
    ok = guardar_metricas(con, pid, lib.now(), 'manual', {c: getattr(a, c) for c in CAMPOS})
    con.commit()
    print(f'{pid}: {"guardado" if ok else "sin números para guardar"}')


def cmd_seguidores(a):
    con = lib.connect()
    con.execute('insert or replace into propias_seguidores values(?,?,?,?,?,?,?)', (a.red, a.cuenta.lstrip('@'), a.fecha or dt.date.today().isoformat(), 'manual', a.total, a.nuevos, None))
    con.commit()
    print(f'@{a.cuenta.lstrip("@")} ({a.red}): {a.total} seguidores')


def lunes(d):
    return d - dt.timedelta(days=d.weekday())


def semanas_de(lecturas, publicado):
    """Lo que ganó una publicación en cada semana, de lunes a domingo. Entre dos lecturas se reparte parejo; lo anterior a
    la primera lectura se marca estimado y después de la última no se dice nada."""
    serie = [(publicado, 0.0, 0.0)]
    for m, v, s in sorted(lecturas, key=lambda x: x[0]):
        if v is None or m <= publicado:
            continue
        v, s = max(v, serie[-1][1]), max(s or 0, serie[-1][2])
        if v == serie[-1][1] and s == serie[-1][2] and len(serie) > 1:
            continue
        serie.append((m, v, s))
    if len(serie) < 2:
        return []

    def en(t):
        if t <= serie[0][0]:
            return serie[0][1:]
        for (a_, va, sa), (b_, vb, sb) in zip(serie, serie[1:]):
            if t <= b_:
                r = (t - a_).total_seconds() / max(1, (b_ - a_).total_seconds())
                return va + (vb - va) * r, sa + (sb - sa) * r
        return serie[-1][1:]
    primera, ultima, out = serie[1][0], serie[-1][0], []
    d = lunes(publicado.astimezone(TZ).date())
    while True:
        ini = dt.datetime(d.year, d.month, d.day, tzinfo=TZ)
        fin = ini + dt.timedelta(days=7)
        if ini >= ultima:
            break
        v0, s0 = en(max(ini, publicado))
        v1, s1 = en(min(fin, ultima))
        out.append((d.isoformat(), v1 - v0, s1 - s0, 1 if fin <= primera else 0))
        d += dt.timedelta(days=7)
    return out


def fecha(v):
    try:
        x = dt.datetime.fromisoformat(str(v).replace('Z', '+00:00'))
        return x if x.tzinfo else x.replace(tzinfo=TZ)
    except (TypeError, ValueError):
        return None


def pesos_balance():
    t = read_json(lib.RESEARCH / 'taxonomia_propia.json')
    w = ((t.get('balance') or {}).get('redes') if isinstance(t, dict) else None) or {'instagram': .5, 'tiktok': .5}
    return {k: float(v) for k, v in w.items()}


def cmd_videos(_a):
    con, ahora, pesos = lib.connect(), dt.datetime.now(dt.timezone.utc), pesos_balance()
    pubs = {r['id']: dict(r) for r in con.execute('''select p.*, m.vistas, m.seguidores_nuevos from propias_publicaciones p
        left join propias_metricas m on m.id=p.id and m.medido_at=(select max(medido_at) from propias_metricas where id=p.id)''')}
    for pid in pubs:
        con.execute('insert or ignore into propias_video_pubs(pub_id, video_id) values(?,?)', (pid, 'v:' + pid))
    mapa = dict(con.execute('select pub_id, video_id from propias_video_pubs').fetchall())
    clases = {r['id']: dict(r) for r in con.execute('select * from contenido_clase')}
    # Lo normal de cada cuenta: la mediana de las vistas de sus otras publicaciones de ±45 días (con al menos 3).
    def normal(p):
        t = fecha(p['publicado_at'])
        if not t:
            return None
        otras = [q['vistas'] for q in pubs.values() if q['id'] != p['id'] and q['red'] == p['red'] and q['cuenta'] == p['cuenta'] and q['vistas']
                 and (fecha(q['publicado_at']) and abs((fecha(q['publicado_at']) - t).days) <= 45) and (ahora - fecha(q['publicado_at'])).days >= 7]
        return statistics.median(otras) if len(otras) >= 3 else None
    videos = {}
    for pid, p in pubs.items():
        videos.setdefault(mapa[pid], []).append(p)
    con.execute('delete from propias_videos')
    con.execute('delete from propias_video_semanas')
    for vid, ps in videos.items():
        xs, vistas = {}, {}
        for p in ps:
            n = normal(p)
            x = round(p['vistas'] / n, 3) if p['vistas'] and n else None
            con.execute('update propias_video_pubs set x_red=?, normal_vistas=?, provisional=? where pub_id=?',
                        (x, n, int(bool(fecha(p['publicado_at']) and (ahora - fecha(p['publicado_at'])).days < 7)), p['id']))
            if x is not None:
                xs[p['red']] = x
            vistas[p['red']] = (vistas.get(p['red']) or 0) + (p['vistas'] or 0)
            lecturas = [(fecha(m['medido_at']), m['vistas'], m['seguidores_nuevos']) for m in con.execute('select medido_at, vistas, seguidores_nuevos from propias_metricas where id=?', (p['id'],))]
            if fecha(p['publicado_at']):
                for semana, v, s, est in semanas_de([x_ for x_ in lecturas if x_[0]], fecha(p['publicado_at'])):
                    con.execute('insert into propias_video_semanas values(?,?,?,?,?,?) on conflict(video_id, red, semana) do update set vistas=vistas+excluded.vistas, seguidores=seguidores+excluded.seguidores',
                                (vid, p['red'], semana, round(v, 1), round(s, 1), est))
        conpeso = {r: x for r, x in xs.items() if pesos.get(r)}
        balance = (sum(x * pesos[r] for r, x in conpeso.items()) / sum(pesos[r] for r in conpeso)) if conpeso else (next(iter(xs.values())) if len(xs) == 1 else None)
        primero = min(ps, key=lambda p: str(p['publicado_at'] or '9'))
        cl = next((clases[p['id']] for p in ps if p['id'] in clases), {}) or next((clases[lib.url_key(p['url'])] for p in ps if p['url'] and lib.url_key(p['url']) in clases), {})
        tt = next((p for p in ps if p['red'] == 'tiktok'), None)
        nuevo = any(fecha(p['publicado_at']) and (ahora - fecha(p['publicado_at'])).days < 7 for p in ps)
        con.execute('insert into propias_videos values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (vid, primero['titulo'], primero['publicado_at'], primero['perfil'], cl.get('formato'), None, None, cl.get('tema'), cl.get('anillo'), 'contenido_clase' if cl else None,
                     xs.get('instagram'), xs.get('tiktok'), None if balance is None else round(balance, 3), int(nuevo), json.dumps(sorted({p['red'] for p in ps})),
                     vistas.get('instagram'), vistas.get('tiktok'), vistas.get('youtube'), tt['seguidores_nuevos'] if tt else None,
                     vid[2:] if vid.startswith('v:') and not vid.startswith('v:ext:') and not vid.startswith('v:postiz:') else None, 0, None, '{}'))
    con.commit()
    print(f'{len(videos)} videos con su balance entre redes')


def cmd_actualizar(a):
    cmd_postiz(a)
    subprocess.run([sys.executable, str(Path(__file__).with_name('temas.py')), 'clasificar', '--propias'], check=False)
    cmd_videos(a)


def main():
    ap = argparse.ArgumentParser(description='Tus métricas para la pestaña Métricas')
    sp = ap.add_subparsers(dest='cmd', required=True)
    for n, fn in (('postiz', cmd_postiz), ('actualizar', cmd_actualizar)):
        p = sp.add_parser(n)
        p.add_argument('--dias', type=int, default=30)
        p.set_defaults(fn=fn)
    p = sp.add_parser('importar')
    p.add_argument('archivo')
    p.add_argument('--red')
    p.add_argument('--cuenta')
    p.add_argument('--marca')
    p.add_argument('--fecha', help='cuándo se midieron esos números (por defecto, ahora)')
    p.set_defaults(fn=cmd_importar)
    p = sp.add_parser('cargar')
    p.add_argument('--url')
    p.add_argument('--red')
    p.add_argument('--cuenta')
    p.add_argument('--marca')
    p.add_argument('--fecha')
    p.add_argument('--titulo')
    for c in CAMPOS:
        p.add_argument(f'--{c.replace("_", "-")}', dest=c, type=float)
    p.set_defaults(fn=cmd_cargar)
    p = sp.add_parser('seguidores')
    p.add_argument('red')
    p.add_argument('cuenta')
    p.add_argument('total', type=int)
    p.add_argument('--fecha')
    p.add_argument('--nuevos', type=int)
    p.set_defaults(fn=cmd_seguidores)
    sp.add_parser('videos').set_defaults(fn=cmd_videos)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
