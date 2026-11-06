#!/usr/bin/env python3
"""Sube a una carpeta compartida (Google Drive u otra que maneje rclone) los videos elegidos en el planner para pautar.

En Publicadas, el detalle de un video publicado o agendado tiene «Sumar a <carpeta>». La selección viaja en «Revisar
cambios» y, cuando pegás el mensaje en Claude Code, el agente corre:

    python3 engine/anuncios.py subir <id-de-la-propuesta>
    python3 engine/anuncios.py estado

La carpeta va en planner.config.json → `anuncios`: `nombre` (lo que muestra el planner), `remoto` (el remoto de rclone
con permiso de escritura, por ejemplo `drive:Anuncios`), y opcionales `drive_id` (el id de la carpeta de Drive, si el
remoto apunta a la raíz) y `url` (el link para abrirla). Hace falta rclone instalado y configurado (`rclone config`).
Subir no tiene costo. Un video que ya está en la carpeta no se vuelve a subir; otro con el mismo nombre lleva sufijo.
La selección y lo subido viven en `<publicar>/.planner/anuncios-drive.json`, que el planner lee.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CFG, ROOT, STATE, ConfigError, load_config

ADS = STATE / 'anuncios-drive.json'


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return fallback


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f'{path.name}.{uuid.uuid4()}.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)


def folder() -> dict:
    cfg = CFG.get('anuncios') or {}
    if not cfg.get('remoto'):
        sys.exit('Falta anuncios.remoto en planner.config.json (el remoto de rclone de la carpeta, por ejemplo «drive:Anuncios»).')
    did = cfg.get('drive_id')
    return {'nombre': cfg.get('nombre') or 'Anuncios', 'remoto': cfg['remoto'], 'drive_id': did,
            'url': cfg.get('url') or (f'https://drive.google.com/drive/folders/{did}' if did else None)}


def base(carpeta: dict) -> str:
    # «drive:» o «drive:Anuncios»: lo que va antes del nombre de cada archivo.
    r = carpeta['remoto']
    return r if r.endswith(':') or r.endswith('/') else r + ('/' if ':' in r else ':')


def rclone(carpeta: dict, *args: str) -> str:
    extra = ['--drive-root-folder-id', carpeta['drive_id']] if carpeta.get('drive_id') else []
    try:
        r = subprocess.run(['rclone', *args, *extra], capture_output=True, text=True)
    except FileNotFoundError:
        raise RuntimeError('No encuentro rclone: instalalo (https://rclone.org/install/) y configurá el remoto con `rclone config`.')
    if r.returncode:
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else f'rclone salió con {r.returncode}')
    return r.stdout


def archivos(carpeta: dict) -> list[dict]:
    return json.loads(rclone(carpeta, 'lsjson', base(carpeta), '--files-only', '--hash') or '[]')


def link(carpeta: dict, f: dict | None) -> str | None:
    # Drive da un link por archivo; otros remotos, el de la carpeta.
    drive = carpeta.get('drive_id') or 'drive.google.com' in (carpeta.get('url') or '')
    return f'https://drive.google.com/file/d/{f["ID"]}/view' if f and f.get('ID') and drive else carpeta.get('url')


def md5_local(path: Path) -> str:
    h = hashlib.md5()
    with path.open('rb') as fh:
        for bloque in iter(lambda: fh.read(1 << 20), b''):
            h.update(bloque)
    return h.hexdigest()


def sacar_de_seleccion(ads: dict, v: dict, prop: dict) -> None:
    """Sale de la selección lo que esta propuesta llevó; una elección hecha después de la propuesta se respeta."""
    sel = ads.setdefault('seleccion', {})
    elegido = sel.get(v['id'])
    if elegido and (elegido.get('video') == v['video'] or (elegido.get('added_at') or '') <= (prop.get('created_at') or '')):
        del sel[v['id']]


def file_name(title: str, video: str, taken: set[str]) -> str:
    # Nombres que se descargan bien en Mac y Windows: «Tema: la clave» → «Tema - la clave».
    raiz = re.sub(r'\s+', ' ', re.sub(r'[\\/*?"<>|]+', '-', title.replace(':', ' -'))).strip(' .-') or Path(video).stem
    ext = Path(video).suffix.lower() or '.mp4'
    name, n = raiz + ext, 2
    while name in taken:
        name, n = f'{raiz} ({n}){ext}', n + 1
    return name


def proposal_path(ref: str) -> Path:
    p = Path(ref)
    if p.suffix == '.json':
        return p if p.is_absolute() else ROOT / p
    return STATE / f"proposal-{ref.removeprefix('proposal-')}.json"


def guardar(v: dict, prop: dict, registro: dict | None) -> None:
    # Se relee justo antes de escribir: el planner puede haber cambiado la selección mientras subía.
    ads = read_json(ADS, {})
    if registro:
        ads.setdefault('subidos', {})[v['id']] = registro
    sacar_de_seleccion(ads, v, prop)
    ads['revision'] = int(ads.get('revision') or 0) + 1
    ads['saved_at'] = now()
    write_json(ADS, ads)


def subir(ref: str) -> int:
    path = proposal_path(ref)
    prop = read_json(path, None)
    if not prop:
        sys.exit(f'No encuentro la propuesta {path}')
    videos = (prop.get('anuncios') or {}).get('videos') or []
    if not videos:
        print('La propuesta no trae videos para anuncios.')
        return 0
    carpeta = folder()
    hay = {f['Name']: f for f in archivos(carpeta)}
    por_md5 = {(f.get('Hashes') or {}).get('md5'): f['Name'] for f in hay.values() if (f.get('Hashes') or {}).get('md5')}
    subidos = read_json(ADS, {}).get('subidos') or {}
    resultado, ok = [], 0
    for v in videos:
        local = ROOT / v['video']
        previo = subidos.get(v['id'])
        if previo and previo.get('video') == v['video'] and previo.get('nombre') in hay:
            igual = previo['nombre']
        elif not local.is_file():
            resultado.append({'id': v['id'], 'estado': 'falta el archivo', 'video': v['video']})
            print(f"! falta el archivo: {v['video']}")
            continue
        else:
            # El mismo archivo con otro nombre (la cola lo renombra al agendar) no es un video nuevo.
            igual = por_md5.get(md5_local(local))
        if igual in hay:
            guardar(v, prop, None)
            resultado.append({'id': v['id'], 'estado': 'ya estaba', 'nombre': igual, 'url': link(carpeta, hay[igual])})
            print(f'= ya estaba: {igual}')
            continue
        nombre = file_name(v.get('title') or local.stem, v['video'], set(hay))
        try:
            rclone(carpeta, 'copyto', str(local), base(carpeta) + nombre)
            hay = {f['Name']: f for f in archivos(carpeta)}
            subido = hay[nombre]
        except (RuntimeError, KeyError) as e:
            resultado.append({'id': v['id'], 'estado': 'error', 'error': str(e)})
            print(f"! no se pudo subir «{v.get('title')}»: {e}")
            continue
        url = link(carpeta, subido)
        guardar(v, prop, {'title': v.get('title'), 'video': v['video'], 'nombre': nombre, 'id_remoto': subido.get('ID'), 'url': url,
                          'subido_at': now(), 'propuesta': prop.get('id')})
        resultado.append({'id': v['id'], 'estado': 'subido', 'nombre': nombre, 'url': url})
        ok += 1
        print(f'+ {nombre}  {url or ""}')
    prop = read_json(path, prop)
    prop.setdefault('anuncios', {})['resultado'] = resultado
    prop['anuncios']['procesado_at'] = now()
    write_json(path, prop)
    fallas = [r for r in resultado if r['estado'] in ('error', 'falta el archivo')]
    print(f'\n{ok} subidos, {len(resultado) - ok - len(fallas)} ya estaban, {len(fallas)} con problemas.')
    print(f"Carpeta «{carpeta['nombre']}»: {carpeta['url'] or carpeta['remoto']}")
    return 1 if fallas else 0


def estado() -> int:
    ads = read_json(ADS, {})
    carpeta = folder()
    print(f"Carpeta «{carpeta['nombre']}»: {carpeta['url'] or carpeta['remoto']}")
    sel, sub = ads.get('seleccion') or {}, ads.get('subidos') or {}
    print(f'\nElegidos, por subir ({len(sel)}):')
    for s in sel.values():
        print(f"  - {s.get('title')}  ({s.get('video')})")
    print(f'\nEn la carpeta ({len(sub)}):')
    for s in sorted(sub.values(), key=lambda x: x.get('subido_at') or ''):
        print(f"  - {s.get('nombre')}  {s.get('url') or ''}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sp = ap.add_subparsers(dest='cmd', required=True)
    s = sp.add_parser('subir', help='sube los videos de una propuesta del planner')
    s.add_argument('propuesta', help='id de la propuesta (o la ruta a proposal-<id>.json)')
    sp.add_parser('estado', help='elegidos y ya subidos')
    a = ap.parse_args()
    try:
        load_config(required=True)
    except ConfigError as e:
        sys.exit(str(e))
    return subir(a.propuesta) if a.cmd == 'subir' else estado()


if __name__ == '__main__':
    sys.exit(main())
