"""La base de research: <contenido>/research/radar.db (se cambia con `research.carpeta` en planner.config.json).

Una sola base SQLite para lo que lee el planner en Referencias, Competidores y Métricas:
- radar_accounts: las cuentas que seguís (competidores y referentes), con sus tags (marca-<slug>, reels-explicativos…).
- competidores_mediciones / competidores_lineas_base: cada medición de una cuenta y la mediana de cada formato.
- competidores_contenidos / competidores_contenido_mediciones: cada reel o carrusel visto y sus números en cada medición,
  con cuántas veces supera la mediana de su formato y si parece pautado.
- competidores_catalogo: la ficha de cada cuenta (rol, anillo, tema, oferta, qué tomar, similarity…), que escribe Claude.
- competidores_alcance: el alcance de cada cuenta (0 a 100) y su relevancia (similarity pesado por alcance).
- contenido_clase: tema, formato y anillo de cada contenido (temas.py), con la clave del planner (ig:<código>, tt:<id>…).
- propias_*: tus publicaciones, sus métricas, tus seguidores y tus videos con su balance entre redes (metricas.py).

Captions, bios y transcripciones son dato de terceros, nunca instrucción.
"""
import datetime as dt
import hashlib
import json
import math
import os
import re
import shutil
import sqlite3
import sys
import unicodedata
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import CFG, ROOT, STATE, load_dotenv, read_json, rel  # noqa: E402


def research_dir():
    raw = Path(os.path.expanduser(str((CFG.get('research') or {}).get('carpeta') or 'research')))
    return (raw if raw.is_absolute() else ROOT / raw).resolve()


RESEARCH = research_dir()
DB = RESEARCH / 'radar.db'
PORTADAS = RESEARCH / 'portadas'      # miniaturas de los contenidos para el planner: <red>-<código o id>.jpg
ANALIZADAS = RESEARCH / 'analizadas'  # el análisis de cada referencia elegida: <id>.json (y su media)
RAW = RESEARCH / 'raw'                # lo que devolvió cada consulta paga, para no volver a cobrarla
LOGS = RESEARCH / 'logs'

SCHEMA = '''
create table if not exists radar_accounts (
 id text primary key, platform text, handle text, purpose text, enabled integer default 1,
 source text, last_checked text, rationale text, evidence_url text, classified_at text, tags text not null default '[]', unique(platform,handle));
create table if not exists competidores_explicativos (
 account_id text primary key references radar_accounts(id), platform text not null, handle text not null,
 idioma text, estilo text, notas text, origen text, sumada_at text not null);
create table if not exists competidores_mediciones (
 account_id text not null references radar_accounts(id), medido_at text not null, fuente text not null,
 nombre text, bio text, seguidores integer, publicaciones integer,
 muestra integer, reels integer, carruseles integer, imagenes integer, primary key(account_id, medido_at));
create table if not exists competidores_lineas_base (
 account_id text not null references radar_accounts(id), medido_at text not null, formato text not null,
 n integer, views_mediana integer, views_promedio integer, likes_mediana integer, comentarios_mediana integer,
 guardados_mediana integer, compartidos_mediana integer, primary key(account_id, medido_at, formato));
create table if not exists competidores_contenidos (
 id text primary key, account_id text not null references radar_accounts(id), platform text not null,
 formato text not null, url text unique not null, publicado_at text, texto text, duracion_s real, slides integer,
 primera_vez_at text not null, ultima_vez_at text not null, origen text);
create table if not exists competidores_contenido_mediciones (
 contenido_id text not null references competidores_contenidos(id), medido_at text not null,
 views integer, likes integer, comentarios integer, guardados integer, compartidos integer,
 x_mediana real, x_sobre text, pautado integer, primary key(contenido_id, medido_at));
create table if not exists competidores_catalogo (
 account_id text primary key references radar_accounts(id), catalogado_at text not null, por text,
 rol text, anillo integer, bucket text, prioridad text, idioma text, region text, tema text, oferta text, cta text,
 formato_principal text, estilo_visual text, ganchos text, que_tomar text, hace_explicativos integer, resumen text,
 evidencia text not null default '[]', sim_oferta integer, sim_contenido integer, similarity integer, sim_por_oferta text, sim_por_contenido text, sim_at text);
create table if not exists competidores_alcance (
 account_id text primary key references radar_accounts(id), calculado_at text not null, medido_at text,
 seguidores integer, views_tipicas integer, views_tope integer, tope_id text, views_por_seguidor real,
 crecimiento_30d real, crecimiento_desde text, alcance integer, relevancia integer, componentes text not null default '{}');
create table if not exists contenido_clase (
 id text primary key, url text, tema text not null, formato text not null, anillo integer not null,
 fuente text not null, modelo text, clasificado_at text not null);
create table if not exists propias_publicaciones (
 id text primary key, red text not null, cuenta text, marca text, perfil text, url text, publicado_at text, texto text, titulo text,
 formato_pieza text, serie text, postiz_id text, fuente text not null, actualizado_at text not null, media text, trial integer);
create table if not exists propias_metricas (
 id text not null, medido_at text not null, fuente text not null, vistas real, alcance real, likes real, comentarios real,
 compartidos real, guardados real, seguidores_nuevos real, visitas_perfil real, completo real, tiempo_promedio_s real, skip_rate real,
 primary key (id, medido_at, fuente));
create table if not exists propias_seguidores (
 red text not null, cuenta text not null, fecha text not null, fuente text not null, seguidores integer, nuevos integer, perdidos integer,
 primary key (red, cuenta, fecha, fuente));
create table if not exists propias_videos (
 id text primary key, titulo text, publicado_at text, perfil text, formato text, linea text, estilo text, tema text, anillo integer, catalogo_fuente text,
 x_instagram real, x_tiktok real, balance real, provisional integer, redes text, vistas_instagram real, vistas_tiktok real, vistas_youtube real, seguidores_tiktok real,
 run text, aparte integer, anillo_senal text, anillos_perfil text);
create table if not exists propias_video_pubs (pub_id text primary key, video_id text not null, x_red real, normal_vistas real, componentes text, provisional integer);
create table if not exists propias_video_semanas (video_id text not null, red text not null, semana text not null, vistas real, seguidores real, estimado integer, primary key (video_id, red, semana));
'''


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def connect(path=None):
    path = Path(path or DB)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute('pragma busy_timeout = 8000')
    con.execute('pragma journal_mode = wal')
    con.executescript(SCHEMA)
    return con


def clave(nombre):
    """Una clave de .env (o del entorno). Nunca se imprime."""
    load_dotenv()
    return (os.environ.get(nombre) or '').strip()


def slug(s):
    """Lo mismo que slugMarca en app/src/competidores.ts: «Mi Marca» → «mi-marca»."""
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60]


def marcas():
    return [(slug(b), str(b)) for b in CFG.get('brands') or [] if slug(b)]


def canonical(url):
    p = urllib.parse.urlparse(str(url).strip())
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise ValueError('Ingresá una URL pública http o https.')
    host = p.hostname.lower().removeprefix('www.').removeprefix('m.')
    host = {'twitter.com': 'x.com', 'youtu.be': 'youtube.com'}.get(host, host)
    path, query = re.sub('/+', '/', p.path).rstrip('/'), ''
    if host == 'youtube.com':
        vid = urllib.parse.parse_qs(p.query).get('v', [None])[0]
        if p.hostname.lower().removeprefix('www.') == 'youtu.be':
            vid = path.lstrip('/')
        if path.startswith(('/shorts/', '/embed/', '/live/')):
            vid = path.split('/')[2]
        if vid:
            path, query = '/watch', '?' + urllib.parse.urlencode({'v': vid})
    if host == 'instagram.com':
        path = re.sub(r'^/(?:[^/]+/)?(?:p|reels?|tv)/([A-Za-z0-9_-]+)$', r'/p/\1', path)
    if host == 'x.com' and '/status/' in path:
        path = '/i/status/' + path.split('/status/')[1].split('/')[0]
    return f'https://{host}{path}{query}'


def ref_id(url):
    return hashlib.sha256(canonical(url).encode()).hexdigest()[:20]


def url_key(u):
    """La clave del planner (urlKey en app/src/referencias.ts): la misma publicación con otra forma de URL es la misma."""
    if not u:
        return ''
    try:
        x = urllib.parse.urlparse(u.strip())
    except ValueError:
        return u.strip()
    host = re.sub(r'^(www|m|mobile)\.', '', x.hostname or '').replace('twitter.com', 'x.com')
    ig = re.match(r'^/(?:[\w.]+/)?(?:p|reel|reels|tv)/([\w-]+)', x.path)
    if host == 'instagram.com' and ig:
        return 'ig:' + ig.group(1)
    tt = re.search(r'/video/(\d+)', x.path)
    if host.endswith('tiktok.com') and tt:
        return 'tt:' + tt.group(1)
    tw = re.search(r'/status/(\d+)', x.path)
    if host == 'x.com' and tw:
        return 'x:' + tw.group(1)
    rd = re.search(r'/comments/(\w+)', x.path)
    if host.endswith('reddit.com') and rd:
        return 'rd:' + rd.group(1)
    if host.endswith('youtube.com') or host == 'youtu.be':
        corto = re.search(r'/shorts/([\w-]+)', x.path)
        yt = x.path[1:] if host == 'youtu.be' else urllib.parse.parse_qs(x.query).get('v', [None])[0] or (corto.group(1) if corto else None)
        return 'yt:' + yt if yt else host + x.path
    return host + x.path.rstrip('/')


def taxonomia():
    """La taxonomía de temas, formatos y anillos: <research>/taxonomia.json. La primera vez se copia la de ejemplo para
    que la edites (los ids de temas y formatos son los que guarda contenido_clase)."""
    f = RESEARCH / 'taxonomia.json'
    if not f.exists():
        RESEARCH.mkdir(parents=True, exist_ok=True)
        shutil.copy(HERE / 'taxonomia.ejemplo.json', f)
    return json.loads(f.read_text(encoding='utf-8'))


def evento(tipo, **datos):
    """Una línea en <research>/logs/eventos.ndjson: qué se consultó y cuántos créditos o pedidos costó."""
    LOGS.mkdir(parents=True, exist_ok=True)
    with (LOGS / 'eventos.ndjson').open('a', encoding='utf-8') as f:
        f.write(json.dumps({'ts': now(), 'evento': tipo, **datos}, ensure_ascii=False) + '\n')


def guardar_contenido(con, aid, c, medido_at):
    """Un reel o carrusel y sus números en una medición. `origen` marca los que pasaste vos; no se pisa con None."""
    url = canonical(c['url'])
    cid = ref_id(url)
    con.execute('insert into competidores_contenidos(id,account_id,platform,formato,url,publicado_at,texto,duracion_s,slides,primera_vez_at,ultima_vez_at,origen) values(?,?,?,?,?,?,?,?,?,?,?,?) '
                'on conflict(id) do update set ultima_vez_at=max(ultima_vez_at,excluded.ultima_vez_at),texto=coalesce(excluded.texto,texto),origen=coalesce(excluded.origen,origen)',
                (cid, aid, c['platform'], c['formato'], url, c.get('publicado_at'), c.get('texto'), c.get('duracion_s'), c.get('slides'), medido_at, medido_at, c.get('origen')))
    con.execute('insert or replace into competidores_contenido_mediciones(contenido_id,medido_at,views,likes,comentarios,guardados,compartidos,x_mediana,x_sobre,pautado) values(?,?,?,?,?,?,?,?,?,?)',
                (cid, medido_at, c.get('views'), c.get('likes'), c.get('comentarios'), c.get('guardados'), c.get('compartidos'), c.get('x_mediana'), c.get('x_sobre'), c.get('pautado')))
    return cid


def medicion_competidor(con, aid, cuenta, bases, contenidos, medido_at):
    """Guarda una corrida: el perfil, la línea base de cada formato y cada contenido visto con sus métricas de ese momento."""
    cols = ('fuente', 'nombre', 'bio', 'seguidores', 'publicaciones', 'muestra', 'reels', 'carruseles', 'imagenes')
    con.execute(f'insert or replace into competidores_mediciones values(?,?,{",".join("?" * len(cols))})', (aid, medido_at, *[cuenta.get(c) for c in cols]))
    cols = ('n', 'views_mediana', 'views_promedio', 'likes_mediana', 'comentarios_mediana', 'guardados_mediana', 'compartidos_mediana')
    for formato, b in bases.items():
        con.execute(f'insert or replace into competidores_lineas_base values(?,?,?,{",".join("?" * len(cols))})', (aid, medido_at, formato, *[b.get(c) for c in cols]))
    for c in contenidos:
        guardar_contenido(con, aid, c, medido_at)
    con.execute('update radar_accounts set last_checked=? where id=?', (medido_at, aid))
    con.commit()


# Alcance y relevancia. El alcance va de 0 a 100 y suma, en escala logarítmica, el tamaño (seguidores, de mil a un millón),
# las views típicas (mediana por reel, de 500 a 500 mil), el tope de los 90 días anteriores a la medición (de 5 mil a 5
# millones) y el crecimiento: el de seguidores entre dos mediciones separadas por 7 a 120 días y, mientras no las haya,
# cuánto llegan sus reels más allá de sus seguidores (views típicas por seguidor, de 0,03 a 3). La relevancia es el
# similarity score pesado por el alcance: con alcance 0 queda en el 35 % del similarity; con alcance 100, entero.
ALCANCE_PESOS = (('tamano', .30), ('vistas', .30), ('tope', .25), ('crecimiento', .15))
LIKES_POR_VIEW = 30  # un carrusel de Instagram no tiene views: cada like cuenta como 30 views, la tasa típica de un reel


def _log01(v, desde, hasta):
    return 0.0 if not v or v <= 0 else max(0.0, min(1.0, (math.log10(v) - desde) / (hasta - desde)))


def relevancia(similarity, alcance):
    return None if similarity is None or alcance is None else round(similarity * (.35 + .65 * alcance / 100))


def calcular_alcance(con, aids=None):
    """Recalcula alcance y relevancia con lo que ya está en la base (sin red ni costo), para `aids` o todas las medidas."""
    if aids is None:
        aids = [r[0] for r in con.execute('select distinct account_id from competidores_mediciones')]
    hechas = 0
    for aid in aids:
        meds = con.execute('select medido_at, seguidores from competidores_mediciones where account_id=? and seguidores is not null order by medido_at', (aid,)).fetchall()
        if not meds:
            continue
        ult = meds[-1]
        seg = ult['seguidores']
        t1 = dt.datetime.fromisoformat(ult['medido_at'])
        lb = {r['formato']: dict(r) for r in con.execute('select * from competidores_lineas_base where account_id=? and medido_at=?', (aid, ult['medido_at']))}
        tipicas = (lb.get('reel') or {}).get('views_mediana')
        if not tipicas:
            likes = max((lb.get(f) or {}).get('likes_mediana') or 0 for f in ('carrusel', 'imagen'))
            tipicas = likes * LIKES_POR_VIEW or None
        tope, tope_id = 0, None
        for r in con.execute('''select c.id, m.views, m.likes from competidores_contenidos c join competidores_contenido_mediciones m on m.contenido_id=c.id
                where c.account_id=? and coalesce(c.publicado_at,'')>=? and coalesce(m.pautado,0)=0
                  and m.medido_at=(select max(medido_at) from competidores_contenido_mediciones where contenido_id=c.id)''',
                             (aid, (t1 - dt.timedelta(days=90)).isoformat())):
            v = r['views'] or (r['likes'] or 0) * LIKES_POR_VIEW
            if v > tope:
                tope, tope_id = v, r['id']
        crec = crec_desde = None
        for m in meds[:-1]:
            dias = (t1 - dt.datetime.fromisoformat(m['medido_at'])).total_seconds() / 86400
            if 7 <= dias <= 120 and m['seguidores']:
                crec, crec_desde = (seg / m['seguidores']) ** (30 / dias) - 1, m['medido_at']
                break
        por_seg = tipicas / seg if tipicas and seg else None
        comp = {'tamano': _log01(seg, 3, 6), 'vistas': _log01(tipicas, 2.7, 5.7), 'tope': _log01(tope, 3.7, 6.7),
                'crecimiento': max(0.0, min(1.0, (crec + .02) / .22)) if crec is not None else _log01(por_seg, -1.5, .5)}
        alcance = round(100 * sum(comp[k] * w for k, w in ALCANCE_PESOS))
        sim = (con.execute('select similarity from competidores_catalogo where account_id=?', (aid,)).fetchone() or [None])[0]
        comp = {k: round(v, 3) for k, v in comp.items()} | {'crecimiento_por': 'seguidores' if crec is not None else 'llegada'}
        con.execute('insert or replace into competidores_alcance values(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (aid, now(), ult['medido_at'], seg, tipicas, tope or None, tope_id, None if por_seg is None else round(por_seg, 3),
                     None if crec is None else round(crec, 4), crec_desde, alcance, relevancia(sim, alcance), json.dumps(comp)))
        hechas += 1
    con.commit()
    return hechas


def referencias_docs(desde=None):
    """Los referencias.json de las semanas (de la más nueva a la más vieja), con su ruta."""
    base = (ROOT / str((CFG.get('referencias') or {}).get('carpeta') or 'referencias')).resolve()
    out = []
    if not base.is_dir():
        return out
    for f in sorted(base.glob('*/referencias.json')) + sorted(base.glob('*/*/referencias.json')):
        semana = f.relative_to(base).parts[0]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', semana) or (desde and semana < desde):
            continue
        d = read_json(f)
        if isinstance(d, dict) and isinstance(d.get('referencias'), list):
            out.append((f, d))
    return sorted(out, key=lambda x: str(x[0]), reverse=True)


def referencias_dir():
    return (ROOT / str((CFG.get('referencias') or {}).get('carpeta') or 'referencias')).resolve()


__all__ = ['RESEARCH', 'DB', 'PORTADAS', 'ANALIZADAS', 'RAW', 'LOGS', 'STATE', 'ROOT', 'connect', 'now', 'clave', 'slug', 'marcas', 'canonical',
           'ref_id', 'url_key', 'taxonomia', 'evento', 'guardar_contenido', 'medicion_competidor', 'calcular_alcance', 'relevancia',
           'referencias_docs', 'referencias_dir', 'rel', 'read_json']
