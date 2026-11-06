"""Rutas y utilidades de la sección LinkedIn, sobre engine/common.py.

Todo vive en <publicar>/linkedin/ (o en `linkedin.carpeta` de planner.config.json, relativa a la carpeta de publicar):
  prospectos.json   lo que arma prospectos.py y lee la pestaña Prospectos
  contactos.json    los contactos para video a medida (pestaña Videos)
  estado.json       lo que decidís en el planner: prospectos y videos
  borradores/       un post por archivo (pestaña Posts); imagenes/ y feedback/ al lado
  referencias.json  el research de lo viral en tu nicho (pestaña Referencias)
  logs/gastos.ndjson  lo que se gastó en APIs pagas, una línea por llamada
"""
import json, os, re, sys
from datetime import datetime, timezone
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ENGINE))
from common import CFG, PUBLISH, REPO, ROOT, read_json, rel, write_json  # noqa: E402,F401


def carpeta():
    raw = str((CFG.get('linkedin') or {}).get('carpeta') or 'linkedin')
    p = Path(os.path.expanduser(raw))
    return (p if p.is_absolute() else PUBLISH / p).resolve()


LI = carpeta()
BORRADORES, FEEDBACK, IMAGENES = LI / 'borradores', LI / 'feedback', LI / 'imagenes'
ESTADO, PROSPECTOS, CONTACTOS = LI / 'estado.json', LI / 'prospectos.json', LI / 'contactos.json'
ID_OK = re.compile(r'^[a-z0-9][a-z0-9-]{0,120}$')


def cfg_li():
    return CFG.get('linkedin') or {}


def ahora():
    return datetime.now(timezone.utc).isoformat()


def ruta(p):
    """Una ruta guardada en los JSON (relativa a la carpeta de contenido, o absoluta) → Path."""
    if not p:
        return None
    q = Path(os.path.expanduser(str(p)))
    return (q if q.is_absolute() else ROOT / q).resolve()


def guardada(p):
    """Cómo se guarda una ruta en los JSON: relativa a la carpeta de contenido si está adentro; si no, absoluta."""
    return rel(p) or str(Path(p).resolve())


def clave(nombre):
    """Una API key de las variables de entorno o del .env del repo (engine/common.py ya lo carga)."""
    return (os.environ.get(nombre) or '').strip()


def gasto(proveedor, modelo, unidades, unidad, usd, detalle):
    """Una línea por llamada paga en logs/gastos.ndjson, para saber cuánto salió cada búsqueda o transcripción."""
    f = LI / 'logs/gastos.ndjson'
    f.parent.mkdir(parents=True, exist_ok=True)
    with f.open('a', encoding='utf-8') as h:
        h.write(json.dumps({'at': ahora(), 'proveedor': proveedor, 'modelo': modelo, 'unidades': unidades, 'unidad': unidad,
                            'usd': round(float(usd or 0), 5), 'detalle': detalle}, ensure_ascii=False) + '\n')


def borrador(bid):
    if not ID_OK.match(bid or ''):
        sys.exit(f'id inválido: {bid}')
    f = BORRADORES / f'{bid}.json'
    if not f.exists():
        sys.exit(f'no existe el borrador {bid} ({f})')
    return f, read_json(f)
