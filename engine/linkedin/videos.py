#!/usr/bin/env python3
"""Puente entre la producción de videos a medida (skill video-a-medida) y la pestaña LinkedIn → Videos del planner.

    python3 engine/linkedin/videos.py pendientes                    lo que dejaste en la cola, con el contacto y tus notas (JSON)
    python3 engine/linkedin/videos.py paso <id> guion|voz|avatar|video
    python3 engine/linkedin/videos.py listo <id> <video.mp4> [--guion archivo.txt] [--mensaje archivo.txt] [--run carpeta] [--duracion S]
    python3 engine/linkedin/videos.py error <id> "motivo, en una frase"
    python3 engine/linkedin/videos.py contactos agregar <archivo.json>   suma o actualiza contactos (contactos.json)
    python3 engine/linkedin/videos.py contactos listar

Escribe en estado.json → videos lo mismo que el planner (con el planner abierto o cerrado): el planner lo ve al refrescar.
`listo` necesita el video ya terminado y comprimido para mandar, dentro de tu carpeta de contenido o de publicar. Si hay
`--mensaje`, ese texto reemplaza al mensaje del prospecto. Crear un video no lo manda: el envío lo hacés vos.
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import CONTACTOS, ESTADO, ID_OK, PROSPECTOS, ahora, guardada, read_json, ruta, write_json  # noqa: E402
from common import PUBLISH, ROOT, file_lock  # noqa: E402

PASOS = ('guion', 'voz', 'avatar', 'video')
# Lo que tiene que traer cada contacto para que el planner lo muestre (lo demás es opcional).
CAMPOS = ('id', 'empresa')
OPCIONALES = ('pais', 'rubro', 'nivel', 'puntaje', 'web', 'autor', 'por_que', 'ideas', 'posteos', 'post', 'textos', 'logo', 'detectado', 'video')


def contactos():
    return {c['id']: c for c in (read_json(CONTACTOS).get('contactos') or []) if isinstance(c, dict) and c.get('id')}


def todos():
    """Los contactos para video y los prospectos de la búsqueda (los que pasaste a «Para contactar» entran a la misma cola)."""
    out = {p['id']: p for p in (read_json(PROSPECTOS).get('prospectos') or []) if isinstance(p, dict) and p.get('id')}
    out.update(contactos())
    return out


def cambiar(cid, cambio):
    if cid not in todos():
        sys.exit(f'no encuentro el contacto {cid}')
    with file_lock(ESTADO.with_suffix('.lock')):
        est = read_json(ESTADO)
        est.setdefault('videos', {})
        est['videos'][cid] = cambio(est['videos'].get(cid) or {})
        write_json(ESTADO, est)
    return est['videos'][cid]


def pendientes():
    videos, gente = read_json(ESTADO).get('videos') or {}, todos()
    cola = [{'id': i, 'tipo': v['estado'], 'run': v.get('run') or (gente[i].get('video') or {}).get('run'),
             'notas': [n['texto'] for n in v.get('notas', []) if not n.get('aplicada')],
             'contacto': {k: gente[i].get(k) for k in ('empresa', 'pais', 'rubro', 'web', 'autor', 'por_que', 'ideas', 'post', 'posteos', 'logo') if gente[i].get(k)}}
            for i, v in sorted(videos.items(), key=lambda x: x[1].get('pedido_at') or '') if v.get('estado') in ('pedido', 'corrigiendo') and i in gente]
    print(json.dumps(cola, ensure_ascii=False, indent=1))


def listo(cid, video, guion=None, mensaje=None, run=None, duracion=None):
    v = ruta(video)
    if not v or not v.is_file():
        sys.exit(f'no existe {video}')
    adentro = lambda base: base == v or base in v.parents
    if not (adentro(ROOT) or adentro(PUBLISH)):
        sys.exit(f'{v} tiene que estar en tu carpeta de contenido o en la de publicar para que el planner lo muestre')

    def poner(x):
        n = {**x, 'estado': 'listo', 'archivo': guardada(v), 'paso': None, 'error': None, 'listo_at': ahora()}
        n['version'] = (x.get('version') or 1) + (1 if any(not y.get('aplicada') for y in x.get('notas') or []) else 0)
        n['notas'] = [{**y, 'aplicada': True} for y in x.get('notas') or []]
        if guion:
            n['guion'] = Path(guion).read_text(encoding='utf-8').strip()
        if mensaje:
            n['mensaje'] = Path(mensaje).read_text(encoding='utf-8').strip()
        if run:
            n['run'] = guardada(ruta(run))
        if duracion:
            n['duracion_s'] = round(float(duracion))
        return n
    print(json.dumps(cambiar(cid, poner), ensure_ascii=False)[:200])


def agregar(archivo):
    """Suma o actualiza contactos desde un JSON ({contactos: [...]} o una lista). No toca lo que ya decidiste en el planner."""
    data = json.loads(Path(archivo).read_text(encoding='utf-8'))
    nuevos = data.get('contactos') if isinstance(data, dict) else data
    if not isinstance(nuevos, list):
        sys.exit('el archivo tiene que ser una lista de contactos o {"contactos": [...]}')
    actuales, malos = contactos(), []
    for c in nuevos:
        if not isinstance(c, dict) or not all(c.get(k) for k in CAMPOS) or not ID_OK.match(str(c['id'])):
            malos.append(c.get('id') if isinstance(c, dict) else c)
            continue
        actuales[c['id']] = {**actuales.get(c['id'], {}), **{k: c[k] for k in CAMPOS + OPCIONALES if k in c},
                             'detectado': actuales.get(c['id'], {}).get('detectado') or c.get('detectado') or ahora()[:10]}
    write_json(CONTACTOS, {'actualizado': ahora(), 'contactos': list(actuales.values())})
    print(f'{len(nuevos) - len(malos)} contactos sumados o actualizados · {len(actuales)} en total')
    if malos:
        print(f'!! sin id válido (minúsculas, números y guiones) o sin empresa: {malos}', file=sys.stderr)


def main():
    a = sys.argv[1:]
    op = lambda k: a[a.index(k) + 1] if k in a and a.index(k) + 1 < len(a) else None
    if a[:1] == ['pendientes']:
        pendientes()
    elif a[:1] == ['paso'] and len(a) == 3 and a[2] in PASOS:
        print(json.dumps(cambiar(a[1], lambda x: {**x, 'estado': 'produciendo', 'paso': a[2], 'error': None}), ensure_ascii=False)[:200])
    elif a[:1] == ['listo'] and len(a) >= 3:
        listo(a[1], a[2], op('--guion'), op('--mensaje'), op('--run'), op('--duracion'))
    elif a[:1] == ['error'] and len(a) == 3:
        print(json.dumps(cambiar(a[1], lambda x: {**x, 'estado': 'error', 'error': a[2][:300], 'paso': None}), ensure_ascii=False)[:200])
    elif a[:2] == ['contactos', 'agregar'] and len(a) == 3:
        agregar(a[2])
    elif a[:2] == ['contactos', 'listar']:
        for c in contactos().values():
            print(f"{c['id']}: {c.get('empresa')} · {(c.get('autor') or {}).get('nombre') or ''}")
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
