"""Lo común de los scripts de Twitter (X): rutas, lectura y escritura segura, credenciales y la cuenta.

Todo vive en la carpeta de X de la cola (`<publicar>/x`, se cambia con `x.carpeta` en planner.config.json):

  cuenta.json             nombre, usuario y foto de tu cuenta (lo completa bookmarks.py)
  bajadas/                cada bajada de bookmarks, tal como vino de la API
  bookmarks.json          el índice que lee el planner (indice.py)
  estado.json             lo que decidís en el planner: «Me interesa», «No me interesa» y qué cuentas son tu tono
  temas.json              tus temas y el tema de cada bookmark (temas.py)
  busquedas/<id>.json     lo que trae buscar.py
  borradores/<id>.json    los tweets que escribe Claude Code y editás en el planner
  feedback/<id>/          tus notas escritas o grabadas, por borrador o por tweet marcado
  cuentas.json            la base de cuentas que seguís, con su tipo y por qué están
  voz.md                  tu guía de voz (se arma desde la plantilla de la skill x-borradores)

Las credenciales van en el .env del planner, que nunca se sube: X_BEARER_TOKEN (búsquedas y lecturas sueltas),
X_OAUTH2_CLIENT_ID / X_OAUTH2_CLIENT_SECRET / X_OAUTH2_REDIRECT_URI (tus bookmarks, de sólo lectura), TYPEFULLY_API_KEY
(citar un post al agendar) y OPENAI_API_KEY (transcribir tus notas de audio). Los tokens de tus bookmarks los escribe
oauth.py en el mismo .env.
"""
import json, os, re, sys, tempfile, unicodedata
from datetime import datetime, timezone
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ENGINE))
from common import CFG, PUBLISH, REPO, ROOT, STATE, rel, tz  # noqa: E402  (también carga el .env del planner)

SKILL = REPO / '.claude/skills/x-borradores'
HORARIOS = ['10:00', '14:00', '19:00']


def carpeta():
    raw = str((CFG.get('x') or {}).get('carpeta') or 'x')
    p = Path(os.path.expanduser(raw))
    return p if p.is_absolute() else PUBLISH / p


X = carpeta()
BORR, FB, BUSQ, BAJADAS = X / 'borradores', X / 'feedback', X / 'busquedas', X / 'bajadas'
INDICE = X / 'bookmarks.json'
ENV = REPO / '.env'


def ahora():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def leer(p, d=None):
    try:
        return json.loads(Path(p).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return d


def escribir(p, data):
    """Escritura atómica: el planner lee estos archivos mientras corren los scripts."""
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix='.' + p.name + '.', suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def slug(s, largo=50):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:largo] or 'x'


def clave(nombre):
    """Una credencial del .env del planner (o del entorno). Nunca se imprime."""
    return os.environ.get(nombre) or None


def guardar_en_env(valores):
    """Escribe o reemplaza esas líneas del .env del planner, sin tocar las demás. Escritura atómica."""
    lineas = ENV.read_text(encoding='utf-8').splitlines() if ENV.exists() else []
    pendientes = dict(valores)
    out = []
    for ln in lineas:
        m = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=', ln)
        if m and m.group(1) in pendientes:
            out.append(f'{m.group(1)}={pendientes.pop(m.group(1))}')
        else:
            out.append(ln)
    out += [f'{k}={v}' for k, v in pendientes.items()]
    fd, tmp = tempfile.mkstemp(dir=str(ENV.parent), prefix='.env.', suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')
    os.chmod(tmp, 0o600)
    os.replace(tmp, ENV)
    os.environ.update({k: str(v) for k, v in valores.items()})


def canal():
    """La cuenta de X conectada en Postiz (channels.x de la config), o None."""
    ch = (CFG.get('channels') or {}).get('x')
    return ch if ch and ch.get('id') and ch.get('enabled', True) is not False else None


def cuenta():
    """Tu cuenta de X: lo de cuenta.json, la config (`x.usuario`) o la cuenta conectada en Postiz."""
    ch, cfg = canal() or {}, CFG.get('x') or {}
    c = leer(X / 'cuenta.json', {}) or {}
    handle = (c.get('handle') or cfg.get('usuario') or ch.get('profile') or '').lstrip('@')
    return {'handle': handle or None, 'nombre': c.get('nombre') or cfg.get('nombre') or ch.get('name') or handle or None,
            'avatar': c.get('avatar'), 'verificado': bool(c.get('verificado'))}


def horarios():
    h = (CFG.get('x') or {}).get('horarios')
    return [x for x in h if re.fullmatch(r'\d{2}:\d{2}', str(x))] if isinstance(h, list) and h else HORARIOS


def voz():
    """Tu guía de voz. La primera vez se copia de la plantilla de la skill."""
    p = X / 'voz.md'
    if not p.exists():
        plantilla = SKILL / 'references/voz-plantilla.md'
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(plantilla.read_text(encoding='utf-8') if plantilla.exists() else '# Mi voz en X\n', encoding='utf-8')
    return p


def temas():
    """Tus temas y el tema de cada bookmark. La primera vez, la lista de la plantilla."""
    t = leer(X / 'temas.json')
    if not isinstance(t, dict) or not isinstance(t.get('temas'), list):
        base = leer(SKILL / 'temas-plantilla.json', {'temas': []}) or {'temas': []}
        t = {'temas': base.get('temas') or [], 'asignados': (t or {}).get('asignados') if isinstance(t, dict) else {}}
    t.setdefault('asignados', {})
    return t


def borradores():
    for f in sorted(BORR.glob('*.json')) if BORR.exists() else []:
        b = leer(f)
        if isinstance(b, dict) and isinstance(b.get('partes'), list):
            yield f, b


def notas(tid):
    d = FB / str(tid)
    return [(f, leer(f, {}) or {}) for f in sorted(d.glob('*-planner.json'))] if d.exists() else []


def ruta(p):
    """Una ruta guardada en una nota o un borrador (relativa a la carpeta de contenido o absoluta)."""
    p = Path(str(p))
    return p if p.is_absolute() else ROOT / p


__all__ = ['X', 'BORR', 'FB', 'BUSQ', 'BAJADAS', 'INDICE', 'ENV', 'SKILL', 'STATE', 'ROOT', 'REPO', 'CFG', 'rel', 'tz', 'ahora',
           'leer', 'escribir', 'slug', 'clave', 'guardar_en_env', 'canal', 'cuenta', 'horarios', 'voz', 'temas', 'borradores',
           'notas', 'ruta']
