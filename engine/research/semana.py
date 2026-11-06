#!/usr/bin/env python3
"""El research de referencias de una semana: <referencias>/<lunes>/[<marca>/]referencias.json, el archivo que lee la
pestaña Referencias (Bandeja), y la validación de la Selección.

    python3 engine/research/semana.py armar [--semana AAAA-MM-DD] [--marca "Mi marca"] [--dias 14] [--min-x 3] [--max 40]
    python3 engine/research/semana.py validar <referencias.json>

`armar` junta los outliers de la base de competidores (lo publicado en los últimos días que superó su mediana, sin pauta)
con su cuenta, sus números y su portada, sin gancho ni análisis: eso lo completa Claude Code mirando cada uno (skill
referencias) o engine/research/analizar.py. Si el archivo ya existe, suma lo nuevo y no toca lo que ya tiene análisis.
No gasta: lee sólo la base. La Selección (seleccion-<AAAAMMDD>/referencias.json) la escribe Claude con su juicio; `validar`
revisa que tenga la forma que lee el planner.
"""
import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import base as lib  # noqa: E402
from common import write_json  # noqa: E402

TOMAR, COMO = ('recrear', 'idea', 'formato'), ('reel', 'carrusel')


def lunes(d):
    return (d - dt.timedelta(days=d.weekday())).isoformat()


def outliers(con, dias, min_x, marca_slug):
    desde = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=dias)).isoformat()
    filas = con.execute('''select c.url, c.platform, c.formato, c.publicado_at, c.texto, c.duracion_s, c.slides, a.handle, a.tags, cat.anillo, cat.idioma,
            m.views, m.likes, m.comentarios, m.guardados, m.compartidos, m.x_mediana, m.x_sobre, med.seguidores,
            lb.views_mediana, lb.likes_mediana
        from competidores_contenidos c join radar_accounts a on a.id=c.account_id
        join competidores_contenido_mediciones m on m.contenido_id=c.id and m.medido_at=(select max(medido_at) from competidores_contenido_mediciones where contenido_id=c.id)
        left join competidores_catalogo cat on cat.account_id=a.id
        left join competidores_mediciones med on med.account_id=a.id and med.medido_at=m.medido_at
        left join competidores_lineas_base lb on lb.account_id=a.id and lb.medido_at=m.medido_at and lb.formato=c.formato
        where a.enabled=1 and c.publicado_at>=? and m.x_mediana>=? and coalesce(m.pautado,0)=0 order by m.x_mediana desc''', (desde, min_x)).fetchall()
    out = []
    for r in filas:
        tags = json.loads(r['tags'] or '[]')
        marcas = [t[6:] for t in tags if t.startswith('marca-')]
        if 'propia' in tags or (marca_slug and marcas and marca_slug not in marcas):
            continue
        ident = (r['url'].rstrip('/').split('/')[-1])
        poster = lib.PORTADAS / f'{r["platform"]}-{ident}.jpg'
        texto = ' '.join((r['texto'] or '').split())
        out.append({'id': lib.url_key(r['url']), 'url': r['url'], 'red': r['platform'], 'origen': 'competidores', 'origen_detalle': 'Base de competidores',
                    'cuenta': '@' + r['handle'], 'seguidores': r['seguidores'], 'fecha': str(r['publicado_at'] or '')[:10], 'tipo': 'carrusel' if r['formato'] == 'carrusel' else 'reel',
                    'idioma': r['idioma'] or '', 'titulo': texto[:180], 'caption': texto[:1200],
                    'media': {'poster': lib.rel(poster) if poster.exists() else None},
                    'metricas': {'vistas': r['views'], 'likes': r['likes'], 'comentarios': r['comentarios'], 'guardados': r['guardados'], 'compartidos': r['compartidos'],
                                 'multiplo': r['x_mediana'], 'mediana_cuenta': r['views_mediana'] if r['x_sobre'] == 'views' else r['likes_mediana'],
                                 'base': f'{r["x_sobre"] or "views"} contra la mediana de sus {"carruseles" if r["formato"] == "carrusel" else "reels"}', 'duracion_s': r['duracion_s']},
                    'hook': {'texto': '', 'visual': '', 'tipo': ''}, 'analisis': {}, 'encaje': {'anillo': r['anillo'], 'anillo_estimado': True},
                    'recomendacion': {'como': 'carrusel' if r['formato'] == 'carrusel' else 'reel', 'tomar': None, 'nota': ''}})
    return out


def cmd_armar(a):
    semana = a.semana or lunes(dt.date.today())
    marca = a.marca or ''
    destino = lib.referencias_dir() / semana / (lib.slug(marca) if marca else '') / 'referencias.json'
    previo = lib.read_json(destino) if destino.exists() else {}
    refs = {r.get('id') or lib.url_key(r.get('url')): r for r in previo.get('referencias') or []}
    nuevos = 0
    for r in outliers(lib.connect(), a.dias, a.min_x, lib.slug(marca) if marca else ''):
        if r['id'] in refs:
            refs[r['id']]['metricas'] = {**(refs[r['id']].get('metricas') or {}), **{k: v for k, v in r['metricas'].items() if v is not None}}
            continue
        if len(refs) >= a.max:
            break
        refs[r['id']] = r
        nuevos += 1
    doc = {'tipo': 'referencias', 'semana': semana, **({'marca': marca} if marca else {}), 'generado': lib.now(),
           'titulo': previo.get('titulo') or f'Referencias de la semana del {semana}', 'lectura': previo.get('lectura') or [],
           'referencias': list(refs.values())}
    write_json(destino, doc)
    print(f'{lib.rel(destino)}: {nuevos} nuevas, {len(refs)} en total. Falta el gancho y el análisis de las que no lo tienen.')


def cmd_validar(a):
    d = lib.read_json(a.archivo)
    errores = []
    if not isinstance(d.get('referencias'), list) or not d['referencias']:
        errores.append('falta la lista «referencias»')
    sel = d.get('seleccion')
    for i, r in enumerate(d.get('referencias') or []):
        if not r.get('url'):
            errores.append(f'referencia {i + 1}: falta la url')
        if sel is not None:
            s = r.get('seleccion') or {}
            como = s.get('como') or {}
            if s.get('nivel') not in ('candidata', 'top'):
                errores.append(f'referencia {i + 1}: seleccion.nivel tiene que ser «candidata» o «top»')
            if como.get('tomar') not in TOMAR or como.get('reel_o_carrusel') not in COMO:
                errores.append(f'referencia {i + 1}: seleccion.como.tomar ({"/".join(TOMAR)}) y reel_o_carrusel ({"/".join(COMO)})')
            if not s.get('razon'):
                errores.append(f'referencia {i + 1}: falta seleccion.razon')
    if sel is not None and sum(1 for r in d.get('referencias') or [] if (r.get('seleccion') or {}).get('nivel') == 'candidata') > 20:
        errores.append('más de 20 candidatas: el planner pasa las que sobran a top')
    print('\n'.join(errores) if errores else f'{a.archivo}: bien ({len(d["referencias"])} referencias{", con Selección" if sel is not None else ""})')
    sys.exit(1 if errores else 0)


def main():
    ap = argparse.ArgumentParser(description='Research de referencias de la semana')
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('armar')
    p.add_argument('--semana')
    p.add_argument('--marca')
    p.add_argument('--dias', type=int, default=14)
    p.add_argument('--min-x', type=float, default=3)
    p.add_argument('--max', type=int, default=40)
    p.set_defaults(fn=cmd_armar)
    p = sp.add_parser('validar')
    p.add_argument('archivo')
    p.set_defaults(fn=cmd_validar)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
