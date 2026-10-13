"""Configuración, rutas y utilidades compartidas por el motor del planner.

Todo sale de planner.config.json (en la raíz del repo, o la ruta de la variable PLANNER_CONFIG).
Las rutas de contenido son relativas a content.root; la cola de publicación vive en publish_root.
"""
import json, os, re, shutil, subprocess, sys, unicodedata
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(os.environ.get('PLANNER_CONFIG') or REPO / 'planner.config.json').expanduser().resolve()

VIDEO = {'.mp4', '.mov', '.webm'}
IMAGE = {'.jpg', '.jpeg', '.png', '.webp'}
AUDIO = {'.mp3', '.wav', '.m4a'}
MEDIA = VIDEO | IMAGE | AUDIO
# Grillas, hojas de contacto y previews no son láminas de un carrusel.
COMPOSITE = re.compile(r'grilla|grid|contact|preview|sheet|mosaic', re.I)

DEFAULTS = {
    'timezone': 'America/Argentina/Buenos_Aires',
    'locale': 'es-AR',
    'brands': ['Mi marca'],
    'content': {
        'root': '..',
        'sources': [],
        'meta_files': ['pieza.json', 'run.json', 'meta.json'],
        'final_patterns': ['final*.mp4', 'final*.mov', '*.mp4', '*.mov'],
        'carousel_patterns': ['slides/*', 'carrusel/*', 'laminas/*', '*'],
        'caption_files': ['publish_kit.md', 'caption.md', 'caption.txt', 'copy.md', 'copy.txt'],
        'ignore': ['feedback', 'tmp', 'node_modules', '.git'],
    },
    'publish_root': 'publicar',
    'slots': ['12:30', '18:30', '21:30'],
    'suggested_times': [],
    'jitter_minutes': 0,
    'occupied_window_minutes': 75,
    'tiktok_inbox_lead_minutes': 15,
    'default_networks': [],
    'channels': {},
    'instagram': {'reels_trial_default': False, 'graduation_strategy': 'SS_PERFORMANCE',
                  'default_collaborators': [], 'collaborator_options': []},
    'youtube': {'made_for_kids': 'no', 'tags': []},
    'captions': {'block_links': False},
    'require_cover': False,
    'categorias': [],
    'series': [],
}


class ConfigError(RuntimeError):
    pass


def _merge(base, extra):
    out = dict(base)
    for k, v in (extra or {}).items():
        out[k] = _merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def load_config(required=True):
    if not CONFIG_PATH.is_file():
        if required:
            raise ConfigError(f'Falta {CONFIG_PATH.name}. Abrí Claude Code en {REPO} y pedile «instalá el planner».')
        return _merge(DEFAULTS, {})
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    except ValueError as e:
        raise ConfigError(f'{CONFIG_PATH.name} no es un JSON válido: {e}') from None
    return _merge(DEFAULTS, raw)


def save_config(cfg):
    """Escribe sólo las claves que difieren de lo mínimo; conserva el orden legible."""
    tmp = CONFIG_PATH.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(CONFIG_PATH)


CFG = load_config(required=False)


def content_root(cfg=None):
    cfg = cfg or CFG
    root = Path(os.path.expanduser(str(cfg['content']['root'])))
    return (root if root.is_absolute() else (CONFIG_PATH.parent / root)).resolve()


def publish_root(cfg=None):
    cfg = cfg or CFG
    p = Path(os.path.expanduser(str(cfg['publish_root'])))
    return (p if p.is_absolute() else content_root(cfg) / p).resolve()


ROOT = content_root()
PUBLISH = publish_root()
STATE = PUBLISH / '.planner'
INBOX, AGENDADO, PUBLICADO = PUBLISH / 'inbox', PUBLISH / 'agendado', PUBLISH / 'publicado'


def tz():
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    try:
        return ZoneInfo(CFG['timezone'])
    except ZoneInfoNotFoundError:
        raise ConfigError(f'Zona horaria desconocida: {CFG["timezone"]}. En Windows: pip install tzdata') from None


def now_local():
    return datetime.now(tz())


def to_utc(dt_local):
    return dt_local.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {} if default is None else default


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def rel(p):
    """Ruta relativa a la raíz de contenido, con barras /; vacía si queda afuera."""
    if not p:
        return ''
    try:
        return Path(p).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return ''


def inside_root(p):
    try:
        Path(p).resolve().relative_to(ROOT)
        return True
    except ValueError:
        return False


def kebab(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode().lower().strip()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def humanize(slug):
    s = re.sub(r'[-_ ]?\d{8}[-_]?\d{4,6}$', '', str(slug))
    s = re.sub(r'^\d{4}-\d{2}-\d{2}[-_ ]?', '', s)
    s = s.replace('-', ' ').replace('_', ' ').strip()
    return (s[:1].upper() + s[1:]) if s else str(slug)


# Postiz llama a las redes por proveedor (instagram-standalone, tiktok-business, linkedin-page…).
# El planner agrupa por red: varias cuentas de la misma red son alternativas entre sí.
NETWORK_OF = {
    'instagram': 'instagram', 'instagram-standalone': 'instagram', 'instagram-business': 'instagram',
    'facebook': 'facebook', 'tiktok': 'tiktok', 'tiktok-business': 'tiktok', 'youtube': 'youtube',
    'linkedin': 'linkedin', 'linkedin-page': 'linkedin', 'x': 'x', 'threads': 'threads',
    'bluesky': 'bluesky', 'pinterest': 'pinterest', 'mastodon': 'mastodon', 'gmb': 'google',
}


def network_of(identifier):
    ident = str(identifier or '').lower()
    return NETWORK_OF.get(ident) or re.sub(r'-(standalone|business|page)$', '', ident)


@contextmanager
def file_lock(path):
    """Lock exclusivo entre procesos, en macOS, Linux y Windows."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'a+') as handle:
        if os.name == 'nt':
            import msvcrt, time
            while True:
                try:
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    time.sleep(0.2)
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)


def postiz_bin():
    found = shutil.which('postiz')
    if not found:
        raise FileNotFoundError('postiz')
    return found


def load_dotenv():
    """Variables de .env del repo (POSTIZ_API_KEY, POSTIZ_API_URL) para el servicio en segundo plano."""
    env = REPO / '.env'
    if not env.is_file():
        return
    for line in env.read_text(encoding='utf-8').splitlines():
        m = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip('"\'')


load_dotenv()


def parse_json(text):
    starts = [i for i in (text.find('{'), text.find('[')) if i >= 0]
    if not starts:
        return None
    try:
        return json.loads(text[min(starts):])
    except json.JSONDecodeError:
        return None


def die(msg):
    print(f'✗ {msg}', file=sys.stderr)
    sys.exit(1)


def run_postiz(args, timeout=60):
    return subprocess.run([postiz_bin(), *args], capture_output=True, text=True, timeout=timeout,
                          encoding='utf-8', errors='replace')
