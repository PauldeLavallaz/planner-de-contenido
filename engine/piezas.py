"""Cómo el planner reconoce una pieza en las carpetas del usuario.

Una *fuente* (content.sources) es una carpeta, o un patrón glob, cuyos hijos son piezas:
cada subcarpeta es una pieza y cada archivo de video o imagen suelto también.
El estado sale de la fuente (si es fija) o del archivo de metadatos de la pieza (stage: auto).
"""
import re
from datetime import datetime
from pathlib import Path
from common import (CFG, COMPOSITE, IMAGE, MEDIA, PUBLISH, REPO, ROOT, VIDEO, AUDIO, humanize, read_json, rel, tz)

STAGES = ('development', 'review', 'ready', 'published', 'archived')
# Palabras que el usuario puede usar en su pieza.json (o run.json) para el estado.
STATUS_WORDS = {
    'development': ['development', 'desarrollo', 'en_desarrollo', 'en desarrollo', 'draft', 'borrador', 'wip',
                    'running', 'in_progress', 'rendering', 'idea', 'guion', 'produccion', 'producción', 'en_proceso'],
    'review': ['review', 'revision', 'revisión', 'por_revisar', 'por revisar', 'needs_review', 'terminado', 'terminada', 'done', 'completed'],
    'ready': ['ready', 'listo', 'lista', 'aprobado', 'aprobada', 'approved', 'para_publicar', 'para publicar'],
    'published': ['published', 'publicado', 'publicada'],
    'archived': ['archived', 'archivado', 'archivada', 'descartado', 'descartada', 'cancelled', 'canceled', 'superseded', 'abandoned'],
}
WORD_TO_STAGE = {w: k for k, words in STATUS_WORDS.items() for w in words}
POSTER_NAME = re.compile(r'^(portada|cover|poster|thumbnail|miniatura)\b', re.I)
DOC_EXT = {'.md', '.txt'}


def natural(p):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', Path(p).name)]


def asset(p, label=None):
    if not p or not Path(p).is_file() or Path(p).suffix.lower() not in MEDIA:
        return None
    p = Path(p)
    kind = 'video' if p.suffix.lower() in VIDEO else 'audio' if p.suffix.lower() in AUDIO else 'image'
    st = p.stat()
    return {'path': rel(p), 'name': label or p.name, 'kind': kind, 'size': st.st_size, 'modified': str(st.st_mtime_ns)}


def stage_from_word(value):
    return WORD_TO_STAGE.get(str(value or '').strip().lower().replace('-', '_')) or \
        WORD_TO_STAGE.get(str(value or '').strip().lower())


def ignored(p):
    names = set(CFG['content'].get('ignore') or [])
    return p.name.startswith('.') or p.name in names


def under_publish(p):
    try:
        Path(p).resolve().relative_to(PUBLISH)
        return True
    except ValueError:
        return False


def source_dirs():
    """[(carpeta, fuente)] de cada fuente configurada, con los globs expandidos."""
    out, seen = [], set()
    for src in CFG['content'].get('sources') or []:
        pattern = str(src.get('path') or '').strip().strip('/') or '.'
        matches = [ROOT] if pattern == '.' else sorted(ROOT.glob(pattern))
        for d in matches:
            d = d.resolve()
            if d.is_dir() and not under_publish(d) and d != REPO and d not in seen:
                seen.add(d)
                out.append((d, src))
    return out


def pieces():
    """[(ruta, fuente)] de cada pieza: subcarpetas y archivos sueltos de cada fuente."""
    out = []
    for d, src in source_dirs():
        for child in sorted(d.iterdir(), key=natural):
            # El propio planner puede vivir dentro de la carpeta de contenido: no es una pieza.
            if ignored(child) or under_publish(child) or child.resolve() == REPO:
                continue
            if child.is_dir() or (child.is_file() and child.suffix.lower() in VIDEO | IMAGE):
                out.append((child.resolve(), src))
    return out


def read_meta(folder):
    for name in CFG['content'].get('meta_files') or []:
        f = folder / name
        if f.is_file():
            d = read_json(f)
            if isinstance(d, dict):
                return d, f
    return {}, None


CAPTION_SECTION = re.compile(r'(caption|texto|descripci|copy\b(?!\s+de\s+(las\s+)?l[áa]minas))')


def read_publish_kit(folder):
    """Texto de publicación de la pieza: publish_kit.md por secciones, o un caption.txt plano.
    Un kit sin sección de texto («## Caption», «## Copy»…) toma el texto del siguiente archivo de caption_files;
    «## Copy de las láminas» es el texto de un carrusel, no el de la publicación."""
    if not folder or not folder.is_dir():
        return {}
    out = None
    for name in CFG['content'].get('caption_files') or []:
        f = folder / name
        if not f.is_file():
            continue
        text = f.read_text(encoding='utf-8', errors='replace')
        if not re.search(r'^##\s+', text, re.M):
            if out is None:
                return {'caption': text.strip()}
            if text.strip():
                out['caption'] = text.strip()
                return out
            continue
        if out is not None:
            continue
        sections, cur = {}, None
        for line in text.splitlines():
            m = re.match(r'^##\s+(.*)', line)
            if m:
                cur = re.sub(r'^\d+[.)]\s*', '', m.group(1).strip().lower())
                sections[cur] = []
            elif cur is not None:
                sections[cur].append(line)
        out = {}
        for k, v in sections.items():
            txt = '\n'.join(v).strip()
            block = re.search(r'```[a-z]*\n(.*?)\n```', txt, re.S)
            if block:
                txt = block.group(1).strip()
            if CAPTION_SECTION.match(k) and 'caption' not in out:
                # Una sección que sólo apunta a otro archivo («## Copy» → copy.txt) toma el texto de ese archivo.
                ref = re.match(r'^([\w.-]+\.(?:txt|md))\b', txt)
                if ref and len(txt) < 80 and (folder / ref.group(1)).is_file():
                    txt = (folder / ref.group(1)).read_text(encoding='utf-8', errors='replace').strip()
                if txt:
                    out['caption'] = txt
            elif k in {'title', 'titulo', 'título'} and 'title' not in out:
                out['title'] = txt.splitlines()[0].strip() if txt else ''
            elif k.startswith('linkedin') and 'linkedin' not in out:
                out['linkedin'] = txt
            elif k.startswith('youtube') and 'youtube' not in out:
                out['youtube'] = txt
            elif ('comentario' in k or 'fijado' in k) and 'comentario' not in out:
                out['comentario'] = txt
            elif k.startswith('portada') or k.startswith('cover'):
                if m := re.search(r'\d+(?:[.,]\d+)?', txt):
                    out.setdefault('portada', float(m.group(0).replace(',', '.')))
        if 'caption' in out:
            return out
    return out or {}


def find_final(folder):
    """El video final de la pieza: el patrón más específico que encuentre algo; entre varios, el más nuevo."""
    for pattern in CFG['content'].get('final_patterns') or []:
        found = [p for p in folder.glob(pattern) if p.is_file() and p.suffix.lower() in VIDEO and not p.name.startswith('.')]
        if found:
            return max(found, key=lambda p: p.stat().st_mtime_ns)
    return None


def find_slides(folder):
    for pattern in CFG['content'].get('carousel_patterns') or []:
        found = [p for p in folder.glob(pattern) if p.is_file() and p.suffix.lower() in IMAGE | VIDEO
                 and not COMPOSITE.search(p.name) and not POSTER_NAME.match(p.name) and not p.name.startswith('.')]
        if found and (pattern != '*' or not any(p.suffix.lower() in VIDEO for p in found)):
            return sorted(found, key=natural)
    return []


def created_of(meta, path):
    for k in ('created_at', 'creado', 'fecha', 'date', 'created'):
        v = meta.get(k)
        if isinstance(v, str) and re.match(r'\d{4}-\d{2}-\d{2}', v):
            return v
    name = Path(path).name
    if m := re.search(r'(20\d{2})(\d{2})(\d{2})[-_]?(\d{2})(\d{2})(\d{2})?', name):
        y, mo, d, h, mi, s = m.groups()
        try:
            return datetime(int(y), int(mo), int(d), int(h), int(mi), int(s or 0), tzinfo=tz()).isoformat()
        except ValueError:
            pass
    if m := re.search(r'(20\d{2})-(\d{2})-(\d{2})', name):
        return '-'.join(m.groups()) + 'T12:00:00'
    try:
        return datetime.fromtimestamp(Path(path).stat().st_mtime, tz()).isoformat(timespec='seconds')
    except OSError:
        return None


def describe(path, src):
    """Todo lo que el planner necesita de una pieza local."""
    path = Path(path)
    is_dir = path.is_dir()
    folder = path if is_dir else None
    meta, meta_file = read_meta(folder) if is_dir else ({}, None)
    kit = read_publish_kit(folder) if is_dir else {}
    final = find_final(folder) if is_dir else (path if path.suffix.lower() in VIDEO else None)
    slides = [] if final else (find_slides(folder) if is_dir else ([path] if path.suffix.lower() in IMAGE else []))
    fmt = (meta.get('formato') or meta.get('format') or src.get('format') or
           ('reel' if final else 'carousel' if len(slides) > 1 else 'image' if slides else 'reel'))
    if fmt in ('carrusel',):
        fmt = 'carousel'
    poster = None
    if is_dir:
        poster = next((asset(p) for p in sorted(folder.iterdir()) if p.is_file() and POSTER_NAME.match(p.name) and p.suffix.lower() in IMAGE), None)
    primary = asset(final) if final else asset(slides[0]) if slides else None
    media = [asset(final)] if final else [a for a in (asset(s) for s in slides) if a]
    components = []
    if is_dir:
        seen = {a['path'] for a in media if a}
        ignore = set(CFG['content'].get('ignore') or [])
        near = list(folder.glob('*')) + [p for d in folder.iterdir() if d.is_dir() and d.name not in ignore and not d.name.startswith('.') for p in d.glob('*')]
        for p in sorted(near, key=natural):
            if len(components) >= 40:
                break
            if p.is_file() and p.suffix.lower() in VIDEO | AUDIO:
                a = asset(p, ('Versión · ' if p.suffix.lower() in VIDEO else '') + p.relative_to(folder).as_posix())
                if a and a['path'] not in seen:
                    seen.add(a['path'])
                    components.append(a)
    documents = []
    if is_dir:
        documents = [{'name': p.name, 'path': rel(p)} for p in sorted(folder.iterdir()) if p.is_file() and p.suffix.lower() in DOC_EXT][:12]
    raw = meta.get('estado') or meta.get('status') or meta.get('stage')
    fixed = src.get('stage') if src.get('stage') in STAGES else None
    stage = fixed or stage_from_word(raw) or ('review' if primary else 'development')
    if not primary and stage in ('review', 'ready'):
        stage = 'development'  # sin archivo final no hay nada que revisar ni publicar
    brand = meta.get('marca') or meta.get('brand') or src.get('brand') or (CFG.get('brands') or ['Mi marca'])[0]
    if isinstance(brand, dict):
        brand = brand.get('name') or brand.get('slug')
    title = meta.get('titulo') or meta.get('title') or meta.get('nombre') or meta.get('name') or kit.get('title') or humanize(path.stem if not is_dir else path.name)
    # La huella cambia con la ficha, el final o las láminas; no con la carpeta, que cambia cuando el planner guarda
    # una nota en feedback/ (una nota no hace vieja una edición de agenda).
    finger = [p for p in (meta_file, final, *slides, None if is_dir else path) if p]
    fingerprint = str(max((Path(p).stat().st_mtime_ns for p in finger if Path(p).exists()), default=0))
    caption = kit.get('caption') or meta.get('caption') or meta.get('texto') or ''
    captions = {'general': caption} if caption else {}
    if kit.get('linkedin'):
        captions['linkedin'] = kit['linkedin']
    return {
        'id': 'piece:' + rel(path), 'slug': path.stem if not is_dir else path.name, 'title': str(title)[:180],
        'brand': str(brand), 'status': stage, 'raw_status': raw, 'source': rel(path), 'format': fmt,
        'created': created_of(meta, final or path), 'updated': meta.get('updated_at'), 'primary': primary,
        'media': media, 'components': components, 'documents': documents, 'poster': poster,
        'scheduled': None, 'channels': [], 'networks': meta.get('redes') or src.get('networks') or [],
        'captions': captions, 'approved': stage == 'ready', 'cover': False,
        'note': '', 'fingerprint': fingerprint, 'published_on': meta.get('publicado_el') or meta.get('published_on'),
        'source_stage': fixed, 'source_label': src.get('label') or src.get('path'),
    }
