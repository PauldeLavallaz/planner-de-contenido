#!/usr/bin/env python3
"""Programa en Postiz un post de LinkedIn aprobado. Lo dispara el botón Programar de LinkedIn → Posts: ese clic, con día y
hora elegidos, es el OK del usuario para esa publicación.

    python3 engine/linkedin/agendar.py <id> --cuando 2026-11-04T09:00 [--prueba]

Pasa por la cola como cualquier pieza: `cola.py listo <imagen> --redes linkedin` (con el texto del post como copy) y
`cola.py agendar <slug> --fecha --hora`, que guarda cada intento antes de enviarlo y no duplica. Antes mira que no haya otra
publicación de LinkedIn a menos de `linkedin.separacion_horas` (2 por defecto). --prueba muestra lo que haría y no toca nada.
Al programar escribe en el borrador `estado: agendado`, `programado`, `cola_slug` y los IDs de Postiz.
"""
import argparse, subprocess, sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import ENGINE, ahora, borrador, cfg_li, read_json, ruta, write_json  # noqa: E402
from common import AGENDADO, CFG, INBOX, PUBLISH, file_lock, now_local, to_utc, tz  # noqa: E402

MAX_TEXTO = 3000


def pieza_en_cola(slug):
    for d in (INBOX, AGENDADO):
        for f in sorted(d.glob('*.json')) if d.is_dir() else []:
            m = read_json(f)
            if isinstance(m, dict) and m.get('slug') == slug:
                return f, m
    return None, None


def cola(*args):
    p = subprocess.run([sys.executable, str(ENGINE / 'cola.py'), *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if p.returncode:
        sys.exit((p.stderr or p.stdout).strip().splitlines()[-1].lstrip('✗ ').strip() if (p.stderr or p.stdout).strip() else 'La cola no pudo con el pedido.')
    return p.stdout


def main():
    a = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    a.add_argument('id'); a.add_argument('--cuando', required=True); a.add_argument('--prueba', action='store_true')
    o = a.parse_args()
    f, b = borrador(o.id)
    canal = (CFG.get('channels') or {}).get('linkedin')
    if not canal:
        sys.exit('No hay una cuenta de LinkedIn conectada: corré python3 engine/conectar.py')
    if b.get('estado') in ('agendado', 'publicado'):
        sys.exit(f'Ya está en Postiz: para cambiarle el horario, cola.py mover {b.get("cola_slug") or "<slug>"}')
    if b.get('estado') != 'aprobado':
        sys.exit('Primero aprobalo.')
    try:
        cuando = datetime.fromisoformat(o.cuando).replace(tzinfo=tz())
    except ValueError:
        sys.exit('La fecha tiene que ser AAAA-MM-DDTHH:MM.')
    if cuando <= now_local() + timedelta(minutes=5):
        sys.exit('Ese horario ya pasó: elegí otro.')
    img = ruta(b.get('imagen'))
    if not img or not img.is_file():
        sys.exit('Le falta la imagen.')
    texto = (b.get('texto') or '').strip()
    if not texto or len(texto) > MAX_TEXTO:
        sys.exit('El texto está vacío o pasa de 3.000 caracteres.')

    # Lo demás de LinkedIn en Postiz, a menos de la separación (cualquier cuenta de LinkedIn conectada).
    horas = float(cfg_li().get('separacion_horas', 2) or 0)
    if horas:
        sys.path.insert(0, str(ENGINE))
        import cola as motor
        sep = timedelta(hours=horas)
        ids = {canal.get('id')} | {x.get('id') for x in canal.get('alternativas') or []}
        try:
            otros = motor.postiz_posts(cuando - sep, cuando + sep)
        except Exception as e:  # sin Postiz no se puede saber si choca: no se programa a ciegas
            sys.exit(f'No pude leer Postiz para ver qué más sale ese día: {e}')
        choca = [p for p in otros if p.get('integration_id') in ids and p.get('state') not in ('ERROR', 'DRAFT') and abs(p['when'] - cuando) < sep]
        if choca:
            n = int(horas) if horas == int(horas) else horas
            sys.exit(f'Ya hay otra publicación en LinkedIn a las {choca[0]["when"]:%H:%M}: dejá {n} {"hora" if n == 1 else "horas"} entre las dos.')

    slug = b.get('cola_slug') or f'linkedin-{o.id}'[:80]
    titulo = texto.split('\n')[0][:170]
    sidecar, meta = pieza_en_cola(slug)
    if meta and sidecar.parent == AGENDADO:
        sys.exit(f'«{slug}» ya está agendada: cola.py mover {slug} --fecha … para cambiarla.')
    if o.prueba:
        print(f'{"ya en la cola" if meta else "cola.py listo " + str(img) + f" --slug {slug} --redes linkedin --formato image"}\n'
              f'copy: {len(texto)} caracteres\ncola.py agendar {slug} --fecha {cuando:%Y-%m-%d} --hora {cuando:%H:%M}')
        return
    if not meta:
        cola('listo', str(img), '--slug', slug, '--titulo', titulo, '--redes', 'linkedin', '--formato', 'image', '--sin-colab')
        sidecar, meta = pieza_en_cola(slug)
        if not meta:
            sys.exit(f'La cola no dejó la pieza «{slug}».')
    # El copy es el texto del post, tal cual; si se editó en el planner después de pasar a la cola, va el último.
    with file_lock(PUBLISH / '.cola.lock'):
        meta = read_json(sidecar)
        meta['titulo'] = titulo
        meta['captions'] = {**(meta.get('captions') or {}), 'general': texto, 'linkedin': texto}
        meta['linkedin_borrador'] = o.id
        write_json(sidecar, meta)
    cola('agendar', slug, '--fecha', f'{cuando:%Y-%m-%d}', '--hora', f'{cuando:%H:%M}', '--redes', 'linkedin')

    _, meta = pieza_en_cola(slug)
    posts = [p for p in (meta or {}).get('postiz', {}).get('posts', []) if p.get('estado') != 'cancelado']
    b.update(estado='agendado', programado=o.cuando, agendado_para=to_utc(cuando), fecha=o.cuando[:10], cola_slug=slug,
             postiz={'ids': [p.get('id') for p in posts if p.get('id')], 'creado': ahora()})
    b['historial'] = (b.get('historial') or []) + [{'at': ahora(), 'accion': 'agendado', 'fecha': o.cuando}]
    write_json(f, b)
    print(f'✓ {o.id} → {slug} · {o.cuando} · ids: {b["postiz"]["ids"]}')


if __name__ == '__main__':
    main()
