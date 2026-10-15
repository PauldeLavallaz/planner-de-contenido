#!/usr/bin/env python3
"""Cola de publicación: <publish_root>/{inbox,agendado,publicado} operada contra Postiz.

Subcomandos:
  listo <carpeta|archivo> [--titulo --redes --portada S --trial --sin-colab --cuenta red=cuenta ...]
                                                 copia el final a inbox/ con su ficha (sidecar .json)
  cronograma [--dias N] [--apply] [--draft]      reparte inbox/ en los horarios libres
  agendar <slug> [--fecha AAAA-MM-DD] [--slot N | --hora HH:MM] [--draft]
  semana [--dias N] [--json]                     muestra la grilla, no toca nada
  mover <slug> --fecha AAAA-MM-DD [--slot|--hora]
  quitar <slug>                                  saca de Postiz y devuelve a inbox/
  reemplazar <slug> <archivo>                    otra versión del video para una pieza sin agendar
  pausar <slug> [--motivo]                       saca de Postiz y la retiene: cronograma no la toma
  reanudar <slug>                                levanta la pausa: vuelve a inbox/ lista
  ahora <slug> [--redes instagram,tiktok]        publica ya: recrea los posts programados con envío inmediato
  modo-ig <slug> feed|trial                      Instagram del reel: feed o Trial; sólo la ficha, sin Postiz
  publicado                                      reconcilia con Postiz y archiva lo que ya salió
  reconciliar [--json]                           actualiza estados desde Postiz sin mover nada
  fijado <slug> [--descartar]                    registra que fijaste el comentario a mano
  capacidades                                    qué formatos admite cada cuenta conectada
  aplicar <id-de-propuesta> [--ejecutar]         ejecuta una propuesta del planner (sin --ejecutar, sólo el plan)

Nada de esto corre solo: el agente lo ejecuta cuando el usuario confirma una propuesta en el chat.
"""
import argparse, hashlib, json, re, shlex, shutil, subprocess, sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (AGENDADO, CFG, INBOX, PUBLICADO, PUBLISH, REPO, ROOT, STATE, VIDEO, IMAGE, ConfigError, die,
                    file_lock, humanize, inside_root, kebab, now_local, parse_json, postiz_bin, rel, to_utc, tz, load_config)
from estado_publicacion import aggregate_state, channel_state, format_capability
from postiz_errors import PostizError, error_for_output
import piezas

POSTIZ_TIMEOUT = 60
UPLOAD_SECONDS_PER_MB = 2
UPLOAD_TIMEOUT_CAP = 600
HEAVY_MEDIA_MB = 60
QUEUE_MEDIA = {'.mp4', '.mov', '.jpg', '.jpeg', '.png', '.webp'}


def ensure_dirs():
    for d in (INBOX, AGENDADO, PUBLICADO):
        d.mkdir(parents=True, exist_ok=True)


def channels():
    return CFG.get('channels') or {}


# ---------------------------------------------------------------- postiz
def upload_timeout(path):
    try:
        mb = Path(path).stat().st_size / 1e6
    except OSError:
        return POSTIZ_TIMEOUT
    return min(UPLOAD_TIMEOUT_CAP, POSTIZ_TIMEOUT + round(mb * UPLOAD_SECONDS_PER_MB))


def warn_heavy_media(files, show_encode=False):
    for p in map(Path, files):
        try:
            mb = p.stat().st_size / 1e6
        except OSError:
            continue
        if mb <= HEAVY_MEDIA_MB:
            continue
        print(f'  ⚠ {p.name} pesa {mb:.0f} MB: la subida a Postiz puede tardar hasta {upload_timeout(p)} s. '
              'Un encode H.264 con CRF 18 y +faststart, misma resolución, sube más rápido')
        if show_encode and p.suffix.lower() in {'.mp4', '.mov'}:
            light = p.with_name(f'{p.stem}_web.mp4')
            print(f'    ffmpeg -i {shlex.quote(str(p))} -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p '
                  f'-c:a aac -b:a 192k -movflags +faststart {shlex.quote(str(light))}')


def postiz(*args):
    """Exactamente una llamada al CLI. Un timeout en una escritura deja el intento como incierto: nunca se reintenta solo."""
    if not args:
        raise PostizError('POSTIZ_REQUEST_REJECTED')
    timeout = upload_timeout(args[1]) if args[0] == 'upload' and len(args) > 1 else POSTIZ_TIMEOUT
    try:
        p = subprocess.run([postiz_bin(), *args], capture_output=True, text=True, timeout=timeout, encoding='utf-8', errors='replace')
    except subprocess.TimeoutExpired:
        raise PostizError('POSTIZ_RESPONSE_UNCERTAIN') from None
    except FileNotFoundError:
        raise PostizError('POSTIZ_NOT_AVAILABLE') from None
    except OSError:
        raise PostizError('POSTIZ_RESPONSE_UNCERTAIN') from None
    out = (p.stdout or '') + '\n' + (p.stderr or '')
    if p.returncode:
        raise error_for_output(out) from None
    result = parse_json(p.stdout or '')
    if result is None:
        result = parse_json(p.stderr or '')
    if result is None:
        if args[0] == 'posts:delete':
            return {'acknowledged': True}  # se verifica después que el ID ya no esté
        raise PostizError('POSTIZ_SCHEMA_INVALID')
    return result


def unwrap_posts(data):
    if isinstance(data, dict):
        data = data.get('posts', data.get('data', []))
    if not isinstance(data, list):
        raise RuntimeError('Postiz devolvió una lista de posts no reconocida')
    return data


def postiz_posts(start_local, end_local):
    posts = unwrap_posts(postiz('posts:list', '--startDate', to_utc(start_local), '--endDate', to_utc(end_local)))
    out = []
    for p in posts or []:
        raw = p.get('publishDate') or p.get('date')
        if not raw:
            continue
        when = datetime.fromisoformat(raw.replace('Z', '+00:00')).astimezone(tz())
        integ = p.get('integration') or {}
        out.append({
            'id': p.get('id'), 'group': p.get('group'), 'state': p.get('state'), 'when': when,
            'provider': integ.get('providerIdentifier') or integ.get('identifier'),
            'publishDate': raw, 'publishedAt': p.get('publishedAt'), 'content': (p.get('content') or '')[:60],
            'integration_id': integ.get('id'), 'releaseId': p.get('releaseId'), 'releaseURL': p.get('releaseURL'),
            'settings': p.get('settings'), 'error': p.get('error') or p.get('errorMessage'),
        })
    return out


def integrations():
    data = postiz('integrations:list')
    if isinstance(data, dict):
        data = data.get('integrations', data.get('data', []))
    return data or []


# ---------------------------------------------------------------- tiempo
def jitter(seed, minutes):
    if not minutes:
        return 0
    h = int(hashlib.sha1(seed.encode()).hexdigest(), 16)
    return h % (2 * minutes + 1) - minutes


def slot_times(day):
    out = []
    for n, base in enumerate(CFG['slots'], start=1):
        hh, mm = map(int, base.split(':'))
        dt = datetime(day.year, day.month, day.day, hh, mm, tzinfo=tz())
        dt += timedelta(minutes=jitter(f'{day}:{base}', CFG.get('jitter_minutes') or 0))
        out.append((n, base, dt))
    return out


def parse_when(fecha, slot=None, hora=None):
    day = date.fromisoformat(fecha)
    if hora:
        hh, mm = map(int, hora.split(':'))
        return datetime(day.year, day.month, day.day, hh, mm, tzinfo=tz()), None
    n = int(slot or 1)
    for k, base, dt in slot_times(day):
        if k == n:
            return dt, base
    die(f'el horario {n} no existe (hay {len(CFG["slots"])} en config: {", ".join(CFG["slots"])})')


# ---------------------------------------------------------------- piezas de la cola
def sidecar_path(media):
    return media.with_suffix('.json')


def load_meta(media):
    return json.loads(sidecar_path(media).read_text(encoding='utf-8'))


def save_meta(media, meta):
    target = sidecar_path(media)
    tmp = target.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(target)


def queue_pieces(directory):
    out = []
    for sidecar in sorted(directory.glob('*.json')):
        try:
            meta = json.loads(sidecar.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(meta, dict) or not meta.get('slug'):
            continue
        media = next((p for p in (sidecar.with_suffix(e) for e in ('.mp4', '.mov', '.jpg', '.jpeg', '.png', '.webp')) if p.exists()), None)
        if media:
            out.append((media, meta))
    return out


def inbox_pieces():
    return queue_pieces(INBOX)


def agendado_pieces():
    return queue_pieces(AGENDADO)


def archived_pieces():
    return [x for d in PUBLICADO.iterdir() if d.is_dir() for x in queue_pieces(d)] if PUBLICADO.exists() else []


def find_piece(slug):
    for d in (INBOX, AGENDADO):
        for media, meta in queue_pieces(d):
            if meta['slug'] == slug or media.stem == slug:
                return media
    die(f'no encuentro la pieza «{slug}» en inbox/ ni en agendado/')


def queue_lock():
    ensure_dirs()
    return file_lock(PUBLISH / '.cola.lock')


def media_files(media, meta):
    return [Path(p) if Path(p).is_absolute() else ROOT / p for p in meta.get('media_files', [])] or [media]


def format_for(meta):
    return meta.get('formato', 'reel')


def content_digest(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def ordered_media_digest(paths):
    hashes = [content_digest(p) for p in paths]
    return hashes[0] if len(hashes) == 1 else hashlib.sha256('\n'.join(hashes).encode()).hexdigest()


def caption_for(meta, red):
    caps = meta.get('captions', {})
    if red == 'youtube':
        return caps.get('youtube_description') or caps.get('youtube') or caps.get('general') or meta['titulo']
    return caps.get(red) or caps.get('general') or next((v for k, v in caps.items() if isinstance(v, str) and v and k != 'youtube_title'), '') or meta['titulo']


LINK_RE = re.compile(r'https?://\S+|\bwww\.\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|ai|io|ar|mx|es|co|cl|uy|pe|net|org|app|dev|me|ly|so|gg|tv|xyz|link|site|pro|bio)\b(?:/\S*)?', re.I)


def links_en(texto, red=None):
    return [m.group(0) for m in LINK_RE.finditer(texto or '')
            if not (red == 'instagram' and m.start() and texto[m.start() - 1] == '@')]


def title90(meta):
    t = (meta.get('captions', {}).get('tiktok_title') or meta['titulo']).split('\n')[0]
    if len(t) <= 90:
        return t
    return t[:90].rsplit(' ', 1)[0].rstrip(',;:') + '…'


def aplicar_portada(dst, final, t, slug):
    """El cuadro elegido pasa a ser el cuadro 0 de la copia que se sube (Instagram y LinkedIn toman el primero
    como portada y Postiz no expone cover para ellos). El original no se toca. Guarda el JPG para YouTube."""
    if not shutil.which('ffmpeg'):
        raise RuntimeError('La portada necesita ffmpeg instalado')
    img = PUBLISH / '.assets' / slug / 'portada.jpg'
    img.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', str(final), '-frames:v', '1', '-q:v', '2', str(img)], check=True)
    tmp = dst.with_name(dst.stem + '.portada' + dst.suffix)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(final), '-i', str(img), '-filter_complex',
                    "[1:v][0:v]scale2ref[c][v];[v][c]overlay=0:0:enable='eq(n,0)'[o]", '-map', '[o]', '-map', '0:a?',
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'copy',
                    '-movflags', '+faststart', str(tmp)], check=True)
    tmp.replace(dst)
    return {'t': round(t, 3), 'imagen': str(img), 'primer_cuadro': True}


PINNABLE = ('instagram', 'tiktok', 'youtube', 'facebook', 'linkedin')


def pinned_comment_step(texto, formato, redes):
    targets = [r for r in redes if r in PINNABLE] if str(texto or '').strip() and formato != 'story' else []
    if not targets:
        return None
    return {'modo': 'manual', 'estado': 'pendiente', 'redes': targets, 'hecho_at': None,
            'motivo': 'Las APIs no permiten fijar comentarios: publicarlo y fijarlo desde la app cuando salga.'}


def pinned_pending(meta):
    step = meta.get('comentario_fijado_manual')
    return isinstance(step, dict) and step.get('estado') == 'pendiente'


# ---------------------------------------------------------------- cuentas
def account_options(red):
    ch = channels()[red]
    return [{k: ch.get(k) for k in ('id', 'label', 'profile', 'marca', 'colab_default', 'type')}] + list(ch.get('alternativas') or [])


def channel_for(meta, red):
    ch = channels()[red]
    chosen = (meta.get('cuentas') or {}).get(red)
    if not chosen or chosen == ch['id']:
        return ch
    alt = next((a for a in ch.get('alternativas') or [] if a['id'] == chosen), None)
    if alt is None:
        raise RuntimeError(f'La cuenta {chosen} de {red} ya no está en planner.config.json; corré conectar.py')
    # Una cuenta alternativa hereda el modo de la red, pero no los ajustes fijos (tablero, etc.) de la principal.
    return {**ch, **{k: v for k, v in alt.items() if v is not None}, 'settings': alt.get('settings') or {}, 'alternativas': None}


def parse_cuentas(values):
    """`--cuenta instagram=micuenta` (id, usuario o marca de la cuenta) → {red: id de integración}."""
    out = {}
    for value in values or []:
        red, _, who = value.partition('=')
        red, who = red.strip(), who.strip().lstrip('@').lower()
        if red not in channels() or not who:
            die(f'--cuenta inválida: {value} (formato red=cuenta)')
        match = [o for o in account_options(red) if who in {str(o.get('id')).lower(), str(o.get('profile') or '').lstrip('@').lower(), str(o.get('marca') or '').lower(), str(o.get('label') or '').lower()}]
        if len(match) != 1:
            die(f'--cuenta {value}: opciones de {red}: ' + ', '.join(f"{o.get('profile') or o.get('label')} ({o.get('marca') or '-'})" for o in account_options(red)))
        out[red] = match[0]['id']
    return out


def apply_cuentas(meta, cuentas):
    if not cuentas:
        return
    current = dict(meta.get('cuentas') or {})
    for red, integ in cuentas.items():
        if integ == channels()[red]['id']:
            current.pop(red, None)
        else:
            current[red] = integ
    if current:
        meta['cuentas'] = current
    else:
        meta.pop('cuentas', None)


def default_collaborators(redes, formato, meta=None):
    if 'instagram' not in redes or formato == 'story' or 'instagram' not in channels():
        return []
    ch = channel_for(meta or {}, 'instagram')
    base = ch.get('colab_default')
    return list(base if base is not None else CFG['instagram'].get('default_collaborators') or [])


# ---------------------------------------------------------------- listo
PLANNER_IG_MODE = STATE / 'instagram-mode.json'


def planner_trial(source_rel):
    try:
        rec = json.loads(PLANNER_IG_MODE.read_text(encoding='utf-8')).get(source_rel)
    except (OSError, json.JSONDecodeError, AttributeError):
        return None
    return rec['trial'] if isinstance(rec, dict) and isinstance(rec.get('trial'), bool) else None


def new_instagram_trial(formato, redes, requested=None):
    if formato not in {'reel', 'video'} or 'instagram' not in redes:
        return False
    if requested is not None:
        return bool(requested)
    return CFG['instagram'].get('reels_trial_default') is True


def cmd_listo(a):
    with queue_lock():
        _listo(a)


def _listo(a):
    ensure_dirs()
    if not channels():
        die('No hay cuentas de Postiz configuradas: corré `python3 engine/conectar.py`')
    src = Path(a.source).expanduser().resolve()
    if not src.exists():
        die(f'no existe {src}')
    if not inside_root(src):
        die(f'{src} está fuera de la carpeta de contenido ({ROOT})')
    folder = src if src.is_dir() else None
    if folder:
        final = piezas.find_final(folder)
        slides = [] if final else piezas.find_slides(folder)
        sources = [final] if final else slides
        if not sources:
            die(f'{folder.name} no tiene un video final ni láminas para publicar')
    else:
        sources = [src]
        folder = src.parent if any((src.parent / n).is_file() for n in CFG['content']['meta_files'] + CFG['content']['caption_files']) else None
    sources += [Path(p).expanduser().resolve() for p in (a.media or [])]
    if any(not p.is_file() or p.suffix.lower() not in QUEUE_MEDIA for p in sources):
        die('la cola admite mp4/mov y jpg/jpeg/png/webp')
    final = sources[0]
    formato = a.formato or ('carousel' if len(sources) > 1 else 'reel' if final.suffix.lower() in VIDEO else 'image')
    kit = piezas.read_publish_kit(folder) if folder else {}
    meta_src, _ = piezas.read_meta(folder) if folder else ({}, None)
    source_rel = rel(src)
    slug = kebab(a.slug or (folder.name if folder and src.is_dir() else final.stem))
    slug = re.sub(r'-\d{8}-\d{4,6}$', '', slug) or slug
    everything = inbox_pieces() + agendado_pieces() + archived_pieces()
    if any(m.get('slug') == slug for _, m in everything):
        die(f'«{slug}» ya está en la cola; usá --slug para otro nombre')
    digest = ordered_media_digest(sources)
    for existing, em in everything:
        files = media_files(existing, em)
        if len(files) == len(sources) and (em.get('content_sha256') or '') == digest:
            die(f'el mismo contenido ya está en la cola como «{em["slug"]}»')
    dst = INBOX / f'{slug}{final.suffix.lower()}'
    shutil.copy2(final, dst)
    portada = None
    portada_t = a.portada if a.portada is not None else kit.get('portada')
    if formato in {'reel', 'video'} and portada_t is not None:
        portada = aplicar_portada(dst, final, float(portada_t), slug)
    extra = []
    for i, s in enumerate(sources[1:], 2):
        target = PUBLISH / '.assets' / slug / f'{i:02d}{s.suffix.lower()}'
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, target)
        extra.append(str(target))
    titulo = a.titulo or meta_src.get('titulo') or meta_src.get('title') or kit.get('title') or humanize(slug)
    caption = kit.get('caption') or meta_src.get('caption') or ''
    requested_trial = a.trial
    from_planner = requested_trial is None and planner_trial(source_rel) is not None
    if from_planner:
        requested_trial = planner_trial(source_rel)
    redes = [r.strip() for r in a.redes.split(',')] if a.redes else [r for r in (CFG.get('default_networks') or list(channels())) if r in channels()]
    unknown = [r for r in redes if r not in channels()]
    if unknown:
        die(f'redes sin cuenta conectada: {", ".join(unknown)} (conectadas: {", ".join(channels())})')
    meta = {
        'slug': slug, 'titulo': str(titulo)[:180], 'source_run': source_rel, 'source_final': str(final),
        'content_sha256': digest, 'formato': formato, 'media_files': [str(dst)] + extra,
        'created_at': now_local().isoformat(timespec='seconds'),
        'marca': meta_src.get('marca') or meta_src.get('brand') or a.marca,
        'serie': a.serie or meta_src.get('serie'), 'categoria': a.categoria or meta_src.get('categoria'),
        'tipo': a.tipo, 'vence': a.vence,
        'trial': new_instagram_trial(formato, redes, requested_trial),
        'redes': redes,
        'captions': {'general': caption, 'youtube_title': str(titulo)[:100],
                     **({'linkedin': kit['linkedin']} if kit.get('linkedin') else {}),
                     **({'youtube_description': kit['youtube']} if kit.get('youtube') else {})},
        'comentario_fijado': kit.get('comentario', ''),
        'comentario_fijado_manual': pinned_comment_step(kit.get('comentario', ''), formato, redes),
        'portada': portada, 'portada_requerida': bool(CFG.get('require_cover')) and formato in {'reel', 'video'},
        'estado': 'inbox', 'slot': None, 'postiz': {'media_path': None, 'posts': []}, 'publicado_at': None,
    }
    apply_cuentas(meta, parse_cuentas(a.cuenta))
    meta['instagram_collaborators'] = [] if a.sin_colab else default_collaborators(redes, formato, meta)
    if from_planner:
        meta['trial_origen'] = 'planner'
    if meta['trial']:
        meta['trial_integration_id'] = channel_for(meta, 'instagram')['id']
    save_meta(dst, meta)
    print(f'✓ {slug} → inbox/  ({formato} · {", ".join(redes)}{" · TRIAL" if meta["trial"] else ""})')
    if meta['portada_requerida'] and not portada:
        print('  ⚠ sin portada: elegí el cuadro con --portada <segundos> o «## Portada» en publish_kit.md')
    if not caption:
        print(f'  ⚠ sin texto: completá captions.general en {sidecar_path(dst)} (o agregá un caption.txt a la pieza) antes de agendar')
    if CFG['captions'].get('block_links') and (hits := sorted({h for red in redes for h in links_en(caption_for(meta, red), red)})):
        print(f'  ⚠ el texto tiene links ({", ".join(hits)}): sacalos antes de agendar')
    if meta['comentario_fijado_manual']:
        print(f'  ⚑ comentario fijado manual: publicalo y fijalo desde la app; después `cola.py fijado {slug}`')
    warn_heavy_media(sources, show_encode=True)


# ---------------------------------------------------------------- horarios
def all_slots(days, start=None):
    start = start or now_local()
    out = []
    for i in range(days + 1):
        for n, base, dt in slot_times(start.date() + timedelta(days=i)):
            if dt >= start + timedelta(minutes=45):
                out.append({'n': n, 'base': base, 'when': dt})
    return out


def occupied_slots(slots, posts, local):
    win = timedelta(minutes=CFG.get('occupied_window_minutes') or 75)
    for s in slots:
        s['piece'] = s['remote'] = None
        for _, meta in local:
            sl = meta.get('slot') or {}
            if sl.get('fecha') == s['when'].date().isoformat() and (sl.get('slot_base') == s['base'] or (sl.get('hora') and abs(datetime.fromisoformat(sl['fecha'] + 'T' + sl['hora']).replace(tzinfo=tz()) - s['when']) <= win)):
                s['piece'] = meta['slug']
        if s['piece']:
            continue
        for p in posts:
            if p.get('state') not in ('QUEUE', 'PUBLISHED', 'SCHEDULED', 'PROCESSING'):
                continue
            if p['provider'] and 'tiktok' in p['provider'] and (channels().get('tiktok') or {}).get('mode') == 'inbox':
                continue
            if abs(p['when'] - s['when']) <= win:
                s['remote'] = p['content'] or p['id']
                break
    return slots


def order_inbox(pieces):
    """Noticias por vencimiento primero; después el resto alternando serie y categoría."""
    news = sorted([x for x in pieces if x[1].get('tipo') == 'noticia'], key=lambda x: (x[1].get('vence') or '9999', x[1]['created_at']))
    pool = sorted([x for x in pieces if x[1].get('tipo') != 'noticia'], key=lambda x: x[1]['created_at'])
    out, prev = list(news), None
    while pool:
        pick = next((c for c in pool if prev is None or (c[1].get('serie') != prev.get('serie') and c[1].get('categoria') != prev.get('categoria'))), None)
        pick = pick or next((c for c in pool if prev is None or c[1].get('serie') != prev.get('serie')), None) or pool[0]
        pool.remove(pick)
        out.append(pick)
        prev = pick[1]
    return out


def plan(days):
    start = now_local()
    posts = postiz_posts(start - timedelta(days=1), start + timedelta(days=days + 1))
    slots = occupied_slots(all_slots(days, start), posts, agendado_pieces())
    free = [s for s in slots if not s['piece'] and not s['remote']]
    queue = order_inbox([(m, x) for m, x in inbox_pieces() if x.get('estado') in ('inbox', 'listo') and not x.get('pausa') and not planner_blocked(x)])
    assignments = []
    for (media, meta), s in zip(queue, free):
        warn = f'vence {meta["vence"]}' if meta.get('vence') and s['when'].date().isoformat() > meta['vence'] else None
        assignments.append({'media': media, 'meta': meta, 'slot': s, 'warn': warn})
        s['piece'] = meta['slug'] + ' *'
    return slots, assignments, queue[len(free):], posts


def planner_blocked(meta):
    """Piezas que el usuario sacó de «Listo» en el planner o descartó: cronograma no las toma."""
    pid = 'queue:' + meta['slug']
    stages = json.loads((STATE / 'stages.json').read_text(encoding='utf-8')) if (STATE / 'stages.json').exists() else {}
    discards = json.loads((STATE / 'discarded.json').read_text(encoding='utf-8')) if (STATE / 'discarded.json').exists() else {}
    st = stages.get(pid) or {}
    return bool((st.get('active') and st.get('stage') in ('review', 'development')) or (discards.get(pid) or {}).get('active'))


def print_grid(slots, title):
    print(title)
    by_day = {}
    for s in slots:
        by_day.setdefault(s['when'].date(), []).append(s)
    names = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    for d, ss in sorted(by_day.items()):
        cells = [f"{s['when'].strftime('%H:%M')} {s['piece'] or ('[postiz] ' + s['remote'] if s['remote'] else '· libre ·')}" for s in ss]
        print(f"{names[d.weekday()]} {d.strftime('%d/%m')}  " + '   |   '.join(cells))


def cmd_semana(a):
    ensure_dirs()
    start = now_local()
    posts = postiz_posts(start - timedelta(days=1), start + timedelta(days=a.dias + 1))
    slots = occupied_slots(all_slots(a.dias, start), posts, agendado_pieces())
    if a.json:
        print(json.dumps([{**s, 'when': s['when'].isoformat()} for s in slots], ensure_ascii=False, indent=1))
        return
    print_grid(slots, f'Próximos {a.dias} días (hora {CFG["timezone"]})')
    inbox = inbox_pieces()
    print(f'\nInbox: {len(inbox)} pieza(s)' + (': ' + ', '.join(m['slug'] for _, m in inbox) if inbox else ''))
    print_pinned_pending(agendado_pieces() + archived_pieces())


def print_pinned_pending(pieces):
    pending = [m for _, m in pieces if pinned_pending(m) and m.get('estado') != 'inbox']
    if not pending:
        return
    print(f'\nComentario fijado pendiente ({len(pending)}): publicalo y fijalo desde la app, después `cola.py fijado <slug>`')
    for m in pending:
        print(f"  ⚑ {m['slug']} [{m.get('estado')}] {', '.join(m['comentario_fijado_manual']['redes'])}: {m['comentario_fijado']}")


def cmd_cronograma(a):
    ensure_dirs()
    slots, assignments, left, _ = plan(a.dias)
    print_grid(slots, f'Cronograma próximos {a.dias} días (hora {CFG["timezone"]}; * = propuesto)')
    for x in assignments:
        m = x['meta']
        print(f"  * {x['slot']['when'].strftime('%a %d/%m %H:%M')}  {m['slug']}  [{','.join(m['redes'])}{' TRIAL' if m.get('trial') else ''}]" + (f"  ⚠ {x['warn']}" if x['warn'] else ''))
    if left:
        print(f"\nQuedan en inbox sin horario: {', '.join(m['slug'] for _, m in left)}")
    if not assignments:
        print('\nNada que asignar.')
        return
    if not a.apply:
        print('\n(sin cambios; con --apply se agenda en Postiz)')
        return
    for x in assignments:
        schedule_piece(x['media'], x['meta'], x['slot']['when'], x['slot']['base'], draft=a.draft)


# ---------------------------------------------------------------- agendar
def tiktok_inbox(ch):
    return ch.get('mode') == 'inbox'


def build_body(meta, redes, when_local, ptype):
    posts = []
    fmt = format_for(meta)
    for red in redes:
        ch = channel_for(meta, red)
        if ch.get('enabled') is False:
            raise RuntimeError(f'la cuenta de {red} está deshabilitada en planner.config.json')
        media = meta['postiz'].get('media') or [{'id': f"m-{meta['slug'][:24]}", 'path': meta['postiz']['media_path']}]
        settings = {'__type': ch['type']}
        if red == 'tiktok':
            video = fmt in {'reel', 'video'}
            settings.update({'title': title90(meta), 'content_posting_method': 'UPLOAD' if tiktok_inbox(ch) else 'DIRECT_POST',
                             'privacy_level': ch.get('privacy_level') or 'PUBLIC_TO_EVERYONE', 'comment': True, 'duet': False,
                             'stitch': False, 'autoAddMusic': 'no', 'brand_content_toggle': False, 'brand_organic_toggle': False})
            if video:
                settings['video_made_with_ai'] = bool(ch.get('made_with_ai', False))
        elif red == 'instagram':
            settings['post_type'] = 'story' if fmt == 'story' else 'post'
            if fmt in {'reel', 'video'} and meta.get('trial') is True:
                if meta.get('trial_integration_id') and meta['trial_integration_id'] != ch['id']:
                    raise RuntimeError('Cambió la cuenta de Instagram desde que se eligió Trial; revisá la ficha antes de enviar.')
                settings['is_trial_reel'] = True
                settings['graduation_strategy'] = CFG['instagram'].get('graduation_strategy') or 'SS_PERFORMANCE'
            if meta.get('instagram_collaborators') and settings['post_type'] != 'story' and not settings.get('is_trial_reel'):
                settings['collaborators'] = [{'label': u.lstrip('@')} for u in meta['instagram_collaborators']]
        elif red == 'linkedin':
            settings['post_as_images_carousel'] = fmt == 'carousel'
        elif red == 'youtube':
            settings.update({'title': meta['captions'].get('youtube_title', meta['titulo'])[:100], 'type': ch.get('privacy') or 'public',
                             'selfDeclaredMadeForKids': CFG['youtube'].get('made_for_kids') or 'no'})
            if CFG['youtube'].get('tags'):
                settings['tags'] = [{'value': t, 'label': t} for t in CFG['youtube']['tags']]
            if th := meta['postiz'].get('thumbnail'):
                settings['thumbnail'] = {'id': th['id'], 'path': th['path']}
        # Ajustes fijos de la cuenta (por ejemplo el tablero de Pinterest), cargados al conectar.
        settings.update(ch.get('settings') or {})
        posts.append({'integration': {'id': ch['id']}, 'value': [{'content': caption_for(meta, red), 'image': media}], 'settings': settings})
    return {'type': ptype, 'date': to_utc(when_local), 'shortLink': False, 'tags': [], 'posts': posts}


def created_ids(resp):
    out = []

    def walk(o):
        if isinstance(o, dict):
            if 'postId' in o or ('id' in o and ('integration' in o or 'integrationId' in o)):
                out.append({'id': o.get('postId') or o.get('id'),
                            'integration': o.get('integration') if isinstance(o.get('integration'), str) else (o.get('integration') or {}).get('id') or o.get('integrationId')})
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(resp)
    return out


def lead(red, meta):
    ch = channel_for(meta, red)
    return timedelta(minutes=CFG.get('tiktok_inbox_lead_minutes') or 0) if red == 'tiktok' and tiktok_inbox(ch) else timedelta()


def preflight_piece(media, meta, when_local, draft=False):
    if when_local.tzinfo is None:
        raise RuntimeError('La fecha debe incluir zona horaria')
    if meta.get('portada_requerida') and not (meta.get('portada') or {}).get('imagen'):
        raise RuntimeError('Falta la portada: volvé a correr listo con --portada <segundos>')
    earliest = min([when_local - lead(r, meta) for r in meta['redes']] or [when_local])
    if earliest <= now_local() + timedelta(minutes=1):
        raise RuntimeError('La hora del envío tiene que ser futura')
    if meta.get('vence') and when_local.date().isoformat() > meta['vence']:
        raise RuntimeError(f'La pieza vence el {meta["vence"]}; no se agenda después')
    by_id = {i['id']: i for i in integrations()}
    files = media_files(media, meta)
    if any(not p.is_file() for p in files):
        raise RuntimeError('Falta un archivo de la pieza; no se sube media incompleta')
    kinds = ['video' if p.suffix.lower() in {'.mp4', '.mov'} else 'image' for p in files]
    caps, schemas = {}, {}
    for red in meta['redes']:
        if red not in channels():
            raise RuntimeError(f'No hay cuenta de {red} en planner.config.json')
        ch = channel_for(meta, red)
        live = by_id.get(ch['id'])
        if live and live.get('identifier') != ch['type']:
            raise RuntimeError(f'La cuenta de {red} cambió de proveedor en Postiz; corré conectar.py')
        schema = postiz('integrations:settings', ch['id']) if live else None
        schemas[red] = (schema or {}).get('output', schema or {})
        cap = format_capability(red, format_for(meta), kinds, live, schemas[red])
        if ch.get('enabled') is False:
            cap = {'status': 'pendiente', 'reason': 'Cuenta deshabilitada en planner.config.json.'}
        caps[red] = cap
        if cap['status'] != 'soportado':
            meta['capabilities'] = caps
            save_meta(media, meta)
            raise RuntimeError(f"{red}: {cap['reason']}")
        text = caption_for(meta, red)
        if CFG['captions'].get('block_links') and (hits := links_en(text, red)):
            raise RuntimeError(f'Texto de {red} con links ({", ".join(hits)}): la configuración pide publicar sin links')
        if (mx := schemas[red].get('maxLength')) and len(text) > mx:
            raise RuntimeError(f'El texto de {red} supera {mx} caracteres; acortalo antes de enviar')
        if red == 'youtube' and len(meta.get('captions', {}).get('youtube_title') or meta['titulo']) < 2:
            raise RuntimeError('YouTube necesita un título de al menos 2 caracteres')
    meta['capabilities'] = caps
    probe = {**meta, 'postiz': {**meta['postiz'], 'media_path': 'preflight'}}
    body = build_body(probe, meta['redes'], when_local, 'draft' if draft else 'schedule')
    for red, post in zip(meta['redes'], body['posts']):
        spec = schemas[red].get('settings', {})
        settings = post['settings']
        missing = [r for r in spec.get('required', []) if r not in settings]
        if missing:
            raise RuntimeError(f'{red}: Postiz pide {", ".join(missing)}. Cargalo en channels.{red}.settings de planner.config.json')
        for name, value in settings.items():
            field = spec.get('properties', {}).get(name, {})
            if field.get('enum') and value not in field['enum']:
                raise RuntimeError(f'{red}: el valor de {name} no es válido para el schema vigente ({", ".join(map(str, field["enum"]))})')
    meta['postiz']['preflight_at'] = now_local().isoformat()
    save_meta(media, meta)
    return files


def move_piece(media, destination, meta):
    if media == destination:
        save_meta(media, meta)
        return media
    if destination.exists() or sidecar_path(destination).exists():
        raise RuntimeError(f'El destino ya existe: {destination}')
    old = sidecar_path(media)
    shutil.move(str(media), destination)
    meta['media_files'] = [str(destination) if p == str(media) else p for p in meta.get('media_files', [])]
    save_meta(destination, meta)
    old.unlink()
    return destination


def reconcile_piece(meta, remote_posts):
    by_id = {p['id']: p for p in remote_posts}
    updated = []
    for post in meta.get('postiz', {}).get('posts', []):
        updated.append(post if post.get('estado') == 'cancelado' else channel_state(post, by_id.get(post.get('id')), now_local(), inbox_default=False))
    meta['postiz']['posts'] = updated
    meta['estado'] = aggregate_state(updated, meta['redes'])
    meta['reconciled_at'] = now_local().isoformat()
    dates = [p.get('published_at') or p.get('scheduled_at') for p in updated if p.get('estado') == 'publicado']
    meta['publicado_at'] = max(d for d in dates if d) if meta['estado'] == 'publicado' and any(dates) else None
    return meta


def resume_pause(meta):
    if meta.get('pausa'):
        meta.setdefault('pausas', []).append({**meta.pop('pausa'), 'hasta': now_local().isoformat(timespec='seconds')})


def schedule_piece(media, meta, when_local, slot_base=None, draft=False):
    """Guarda cada intento antes de crearlo; un resultado incierto nunca se reintenta solo."""
    with queue_lock():
        meta = load_meta(media)
        resume_pause(meta)
        ptype = 'draft' if draft else 'schedule'
        existing = [p for p in meta['postiz'].get('posts', []) if p.get('estado') != 'cancelado']
        if existing:
            reconcile_piece(meta, postiz_posts(when_local - timedelta(days=45), when_local + timedelta(days=7)))
            save_meta(media, meta)
            old = (meta.get('slot') or {}).get('utc')
            if old and old != to_utc(when_local):
                raise RuntimeError('Ya hay envíos previos de esta pieza: usá mover o reconciliar, sin recrearlos')
        files = preflight_piece(media, meta, when_local, draft)
        uploaded = meta['postiz'].setdefault('media', [])
        warn_heavy_media(files[len(uploaded):])
        for i, f in enumerate(files):
            if len(uploaded) > i:
                continue
            up = postiz('upload', str(f))
            if not up or not up.get('path'):
                raise RuntimeError('Postiz no devolvió la ruta del archivo subido')
            uploaded.append({'id': up.get('id') or f"m-{meta['slug'][:20]}-{i}", 'path': up['path']})
            meta['postiz']['media_path'] = uploaded[0]['path']
            save_meta(media, meta)
        cover = (meta.get('portada') or {}).get('imagen')
        if 'youtube' in meta['redes'] and cover and not meta['postiz'].get('thumbnail'):
            th = postiz('upload', cover)
            if not th or not th.get('path'):
                raise RuntimeError('Postiz no devolvió la ruta de la portada subida')
            meta['postiz']['thumbnail'] = {'id': th.get('id') or f"t-{meta['slug'][:24]}", 'path': th['path']}
            save_meta(media, meta)
        meta['slot'] = {'fecha': when_local.date().isoformat(), 'hora': when_local.strftime('%H:%M'), 'slot_base': slot_base, 'utc': to_utc(when_local)}
        records = meta['postiz'].setdefault('posts', [])
        tmp = PUBLISH / '.tmp'
        tmp.mkdir(exist_ok=True)
        for red in meta['redes']:
            if any(p.get('red') == red and p.get('estado') != 'cancelado' for p in records):
                continue
            body = build_body(meta, [red], when_local - lead(red, meta), ptype)
            digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
            intent = {'red': red, 'id': None, 'integration_id': channel_for(meta, red)['id'], 'date_utc': body['date'], 'type': ptype,
                      'estado': 'incierto', 'request_digest': digest, 'attempted_at': now_local().isoformat(),
                      'posting_method': body['posts'][0]['settings'].get('content_posting_method', 'direct')}
            records.append(intent)
            meta['estado'] = aggregate_state(records, meta['redes'])
            save_meta(media, meta)
            f = tmp / f"{meta['slug']}-{red}-{digest[:12]}.json"
            f.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
            try:
                ids = {x['id'] for x in created_ids(postiz('posts:create', '--json', str(f))) if x.get('id') and x.get('integration') in (None, intent['integration_id'])}
                if len(ids) != 1:
                    raise RuntimeError('Postiz respondió sin un único ID; reconciliar antes de reintentar')
                intent['id'], intent['estado'] = ids.pop(), 'pendiente_confirmacion'
                save_meta(media, meta)
            except RuntimeError as error:
                intent['error'] = str(error)
                meta['estado'] = aggregate_state(records, meta['redes'])
                save_meta(media, meta)
                note_in_source(meta)
                raise
        try:
            reconcile_piece(meta, postiz_posts(when_local - timedelta(days=1), when_local + timedelta(days=1)))
        except RuntimeError as error:
            meta['verification_error'] = str(error)
            meta['estado'] = aggregate_state(records, meta['redes'])
        save_meta(media, meta)
        new = move_piece(media, AGENDADO / f"{when_local.strftime('%Y-%m-%d_%H%M')}_{meta['slug']}{media.suffix}", meta)
        note_in_source(meta)
        print(f"✓ {meta['slug']} · {meta['estado']} · {when_local.isoformat()} · ids: {[p.get('id') for p in records if p.get('estado') != 'cancelado']}")
        return new


def note_in_source(meta):
    """Historial de publicación dentro de la carpeta de la pieza (publicacion.json), si es una carpeta."""
    src = meta.get('source_run')
    folder = ROOT / src if src else None
    if not folder or not folder.is_dir():
        return
    f = folder / 'publicacion.json'
    try:
        hist = json.loads(f.read_text(encoding='utf-8')) if f.exists() else []
    except json.JSONDecodeError:
        hist = []
    hist.append({'at': now_local().isoformat(timespec='seconds'), 'estado': meta['estado'], 'slot': meta.get('slot'),
                 'redes': meta['redes'], 'postiz': [{k: p.get(k) for k in ('red', 'id', 'estado', 'date_utc', 'native_url')} for p in meta['postiz']['posts']]})
    f.write_text(json.dumps(hist, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def cmd_agendar(a):
    ensure_dirs()
    media = find_piece(a.slug)
    if media.parent != INBOX:
        die(f'«{a.slug}» ya está agendada; usá mover')
    meta = load_meta(media)
    apply_cuentas(meta, parse_cuentas(a.cuenta))
    if a.redes:
        meta['redes'] = [r.strip() for r in a.redes.split(',')]
    if a.colab is not None:
        meta['instagram_collaborators'] = [c.strip().lstrip('@') for c in a.colab.split(',') if c.strip()]
    save_meta(media, meta)
    if a.fecha:
        when, base = parse_when(a.fecha, a.slot, a.hora)
    else:
        slots, _, _, _ = plan(a.dias)
        free = [s for s in slots if (not s['piece'] or s['piece'].endswith(' *')) and not s['remote']]
        if not free:
            die('no hay horarios libres en el rango')
        when, base = free[0]['when'], free[0]['base']
    schedule_piece(media, meta, when, base, draft=a.draft)


def unschedule(meta, media):
    with queue_lock():
        meta.update(load_meta(media))
        records = [p for p in meta['postiz'].get('posts', []) if p.get('estado') != 'cancelado']
        if not records:
            return
        dates = [datetime.fromisoformat(p['date_utc'].replace('Z', '+00:00')) for p in records]
        start, end = min(dates) - timedelta(days=1), max(dates) + timedelta(days=1)
        remote = {p['id']: p for p in postiz_posts(start, end)}
        for r in records:
            seen = remote.get(r.get('id'))
            if not seen or seen.get('state') not in {'QUEUE', 'DRAFT', 'SCHEDULED'}:
                raise RuntimeError(f"No se borra {r.get('id')}: sólo se mueven o quitan envíos confirmados que todavía no salieron")
        for r in records:
            r['delete_attempted_at'] = now_local().isoformat()
            save_meta(media, meta)
            try:
                postiz('posts:delete', r['id'])
                if r['id'] in {p['id'] for p in postiz_posts(start, end)}:
                    raise RuntimeError('Postiz todavía devuelve el ID después de borrarlo')
                r['estado'], r['cancelled_at'] = 'cancelado', now_local().isoformat()
            except RuntimeError as error:
                r.update(estado='incierto', error=str(error))
                meta['estado'] = aggregate_state(meta['postiz']['posts'], meta['redes'])
                save_meta(media, meta)
                raise
            save_meta(media, meta)


def cmd_mover(a):
    media = find_piece(a.slug)
    meta = load_meta(media)
    if media.parent != AGENDADO:
        die('la pieza no está agendada; usá agendar')
    when, base = parse_when(a.fecha, a.slot, a.hora)
    cuentas = parse_cuentas(a.cuenta)
    apply_cuentas(meta, cuentas)
    if a.redes:
        meta['redes'] = [r.strip() for r in a.redes.split(',')]
    if a.colab is not None:
        meta['instagram_collaborators'] = [c.strip().lstrip('@') for c in a.colab.split(',') if c.strip()]
    preflight_piece(media, meta, when, a.draft)  # fecha, formato o cuenta inválidos frenan antes de borrar nada
    redes, colab = meta['redes'], meta.get('instagram_collaborators')
    unschedule(meta, media)
    apply_cuentas(meta, cuentas)
    meta['redes'], meta['instagram_collaborators'] = redes, colab
    meta['estado'], meta['slot'] = 'inbox', None
    back = move_piece(media, INBOX / f"{meta['slug']}{media.suffix}", meta)
    schedule_piece(back, meta, when, base, draft=a.draft)


def cmd_quitar(a):
    media = find_piece(a.slug)
    meta = load_meta(media)
    unschedule(meta, media)
    meta['estado'], meta['slot'] = 'inbox', None
    move_piece(media, INBOX / f"{meta['slug']}{media.suffix}", meta)
    note_in_source(meta)
    print(f"✓ {meta['slug']} fuera de Postiz, de vuelta en inbox/")


def cmd_reemplazar(a):
    with queue_lock():
        media = find_piece(a.slug)
        if media.parent != INBOX:
            die(f'«{a.slug}» está agendada: quitala, reemplazala y volvé a agendarla')
        meta = load_meta(media)
        # Historias e imágenes sueltas también: el planner las reemplaza cuando se editó la imagen.
        fija = format_for(meta) in {'story', 'image'}
        if len(meta.get('media_files') or []) > 1 or format_for(meta) not in {'reel', 'video', 'story', 'image'}:
            die('reemplazar admite piezas de un solo video, historias o imágenes sueltas')
        new = Path(a.archivo).expanduser().resolve()
        tipos = IMAGE if fija else {'.mp4', '.mov'}
        if not new.is_file() or new.suffix.lower() not in tipos or not inside_root(new):
            die(f"el archivo nuevo tiene que ser {'una imagen' if fija else 'un mp4/mov'} dentro de la carpeta de contenido")
        if fija and new.suffix.lower() != media.suffix.lower():
            die(f'la imagen nueva tiene que ser {media.suffix} como la anterior')
        if meta.get('content_sha256') == ordered_media_digest([new]):
            die('la pieza ya tiene esa versión')
        old = PUBLISH / '.assets' / meta['slug'] / f"reemplazado-{now_local().strftime('%Y%m%d-%H%M%S')}{media.suffix}"
        old.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(media, old)
        shutil.copy2(new, media)
        t = None if fija else a.portada if a.portada is not None else (meta.get('portada') or {}).get('t')
        meta['portada'] = aplicar_portada(media, new, float(t), meta['slug']) if t is not None else None
        meta.setdefault('reemplazos', []).append({'at': now_local().isoformat(timespec='seconds'), 'antes': meta.get('source_final'), 'copia_anterior': str(old), 'motivo': a.motivo})
        meta['source_final'], meta['content_sha256'] = str(new), ordered_media_digest([new])
        meta['postiz']['media_path'] = None
        meta['postiz'].pop('media', None)
        meta['postiz'].pop('thumbnail', None)
        save_meta(media, meta)
    print(f"✓ {meta['slug']} ahora usa {rel(new)}")


def cmd_pausar(a):
    media = find_piece(a.slug)
    meta = load_meta(media)
    if meta.get('pausa'):
        die(f"«{meta['slug']}» ya está pausada")
    before = meta.get('slot')
    if media.parent == AGENDADO:
        unschedule(meta, media)
        meta['estado'], meta['slot'] = 'inbox', None
    meta['pausa'] = {'desde': now_local().isoformat(timespec='seconds'), 'slot_anterior': before, 'motivo': a.motivo or ''}
    move_piece(media, INBOX / f"{meta['slug']}{media.suffix}", meta)
    note_in_source(meta)
    print(f"✓ {meta['slug']} en pausa" + (f"; salió de Postiz (estaba para el {before['fecha']} {before['hora']})" if before else ''))


def cmd_reanudar(a):
    media = find_piece(a.slug)
    meta = load_meta(media)
    if not meta.get('pausa'):
        die(f"«{meta['slug']}» no está pausada")
    resume_pause(meta)
    save_meta(media, meta)
    print(f"✓ {meta['slug']} sale de la pausa: vuelve a inbox/ lista para agendar")


def cmd_ahora(a):
    media = find_piece(a.slug)
    with queue_lock():
        meta = load_meta(media)
        if media.parent != AGENDADO:
            die('la pieza no está agendada; agendala primero')
        redes = [r.strip() for r in a.redes.split(',')] if a.redes else list(meta['redes'])
        if ajenas := [r for r in redes if r not in meta['redes']]:
            die(f"la pieza no va a: {', '.join(ajenas)}")
        records = meta['postiz'].setdefault('posts', [])
        now, sent = now_local(), []
        tmp = PUBLISH / '.tmp'
        tmp.mkdir(exist_ok=True)
        for red in redes:
            old = next((p for p in records if p.get('red') == red and p.get('estado') != 'cancelado'), None)
            if old and (old.get('type') == 'now' or old.get('estado') in ('publicado', 'enviado_inbox')):
                print(f"  {red}: ya salió ({old.get('id')}), no se toca")
                continue
            if old and not old.get('id'):
                die(f'{red}: hay un intento sin ID; reconciliar antes de publicar ya')
            if old:
                postiz('posts:delete', old['id'])
                old.update(estado='cancelado', reason='publicado ya con `ahora`')
                save_meta(media, meta)
            body = build_body(meta, [red], now, 'now')
            digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
            intent = {'red': red, 'id': None, 'integration_id': channel_for(meta, red)['id'], 'date_utc': body['date'], 'type': 'now',
                      'estado': 'incierto', 'request_digest': digest, 'attempted_at': now.isoformat(),
                      'posting_method': body['posts'][0]['settings'].get('content_posting_method', 'direct')}
            records.append(intent)
            save_meta(media, meta)
            f = tmp / f"{meta['slug']}-{red}-now-{digest[:12]}.json"
            f.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
            ids = {x['id'] for x in created_ids(postiz('posts:create', '--json', str(f))) if x.get('id') and x.get('integration') in (None, intent['integration_id'])}
            if len(ids) != 1:
                intent['error'] = 'Postiz respondió sin un único ID; reconciliar'
                save_meta(media, meta)
                die(f"{red}: {intent['error']}")
            intent['id'], intent['estado'] = ids.pop(), 'pendiente_confirmacion'
            save_meta(media, meta)
            print(f"  {red}: {old.get('id') if old else '-'} → {intent['id']} (ya)")
            sent.append(red)
        meta['estado'] = aggregate_state(records, meta['redes'])
        save_meta(media, meta)
        note_in_source(meta)
    print(f"✓ {meta['slug']} · publicando ya en {', '.join(sent)}; confirmá con `reconciliar` en unos minutos" if sent else f"✓ {meta['slug']} · nada para mandar")


def cmd_modo_ig(a):
    trial = a.modo == 'trial'
    with queue_lock():
        media = find_piece(a.slug)
        meta = load_meta(media)
        if format_for(meta) not in {'reel', 'video'}:
            die('Feed o Trial aplica sólo a reels')
        scheduled = media.parent == AGENDADO
        if scheduled and not a.aunque_agendada:
            die('la pieza ya está en Postiz: el cambio se aplica al reagendarla; repetí con --aunque-agendada')
        if (meta.get('trial') is True) == trial:
            print(f"= {meta['slug']}: Instagram ya estaba en {'Trial' if trial else 'feed'}")
            return
        meta['trial'] = trial
        if trial:
            meta['trial_integration_id'] = channel_for(meta, 'instagram')['id']
        else:
            meta.pop('trial_integration_id', None)
        meta.setdefault('modo_instagram_cambios', []).append({'trial': trial, 'at': now_local().isoformat(timespec='seconds'), 'por': a.por, 'agendada': scheduled})
        save_meta(media, meta)
    print(f"✓ {meta['slug']}: Instagram en {'Trial' if trial else 'feed'}" + (' · ya agendada: Postiz sigue igual hasta reagendarla' if scheduled else ''))


def reconcile_queue(include_archived=False, archive=False):
    with queue_lock():
        pieces = [(m, x) for m, x in inbox_pieces() + agendado_pieces() + (archived_pieces() if include_archived else []) if x.get('postiz', {}).get('posts')]
        if not pieces:
            return []
        dates = [datetime.fromisoformat(p['date_utc'].replace('Z', '+00:00')) for _, meta in pieces for p in meta['postiz']['posts'] if p.get('date_utc')]
        now = now_local()
        remote = postiz_posts(min(dates + [now]) - timedelta(days=1), max(dates + [now]) + timedelta(days=1))
        summary = []
        for media, meta in pieces:
            before = meta.get('estado')
            reconcile_piece(meta, remote)
            save_meta(media, meta)
            if archive and meta['estado'] == 'publicado' and media.parent == AGENDADO:
                dest = PUBLICADO / meta['slot']['fecha'][:7]
                dest.mkdir(parents=True, exist_ok=True)
                media = move_piece(media, dest / media.name, meta)
            if before != meta['estado']:
                note_in_source(meta)
            summary.append({'slug': meta['slug'], 'before': before, 'estado': meta['estado'], 'posts': meta['postiz']['posts']})
        return summary


def cmd_reconciliar(a):
    ensure_dirs()
    summary = reconcile_queue(include_archived=a.archivados)
    if a.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        for x in summary:
            print(f"{x['slug']}: {x['before']} → {x['estado']}")


def cmd_publicado(a):
    ensure_dirs()
    for x in reconcile_queue(archive=True):
        print(f"{x['slug']}: {x['estado']} · " + ', '.join(f"{p['red']}={p['estado']}" for p in x['posts'] if p.get('estado') != 'cancelado'))
    print_pinned_pending(agendado_pieces() + archived_pieces())


def cmd_fijado(a):
    with queue_lock():
        found = [(m, x) for m, x in inbox_pieces() + agendado_pieces() + archived_pieces() if x.get('slug') == a.slug or m.stem == a.slug]
        if len(found) != 1:
            die(f'no encuentro una única pieza «{a.slug}» en la cola')
        media, meta = found[0]
        if not str(meta.get('comentario_fijado') or '').strip():
            die(f'«{a.slug}» no tiene comentario fijado')
        step = meta.get('comentario_fijado_manual') or pinned_comment_step(meta['comentario_fijado'], format_for(meta), meta.get('redes', []))
        step.update(estado='descartado' if a.descartar else 'hecho', hecho_at=now_local().isoformat(timespec='seconds'))
        meta['comentario_fijado_manual'] = step
        save_meta(media, meta)
    print(f"✓ {meta['slug']} · fijado {step['estado']}")


def cmd_capacidades(a):
    by_id = {i['id']: i for i in integrations()}
    rows = []
    for red, ch in channels().items():
        for opt in account_options(red):
            live = by_id.get(opt['id'])
            schema = postiz('integrations:settings', opt['id']) if live else None
            for formato, kinds in (('reel', ['video']), ('carousel', ['image', 'image']), ('story', ['image']), ('image', ['image'])):
                cap = format_capability(red, formato, kinds, live, (schema or {}).get('output'))
                rows.append({'red': red, 'cuenta': opt.get('profile') or opt.get('label'), 'formato': formato, **cap})
    for r in rows:
        print(f"{r['red']:<10} {str(r['cuenta'])[:24]:<24} {r['formato']:<9} {'✓' if r['status'] == 'soportado' else '·'} {'' if r['status'] == 'soportado' else r['reason']}")


# ---------------------------------------------------------------- propuestas del planner
def ns(**kw):
    base = dict(slug=None, titulo=None, serie=None, categoria=None, marca=None, tipo='evergreen', vence=None, trial=None,
                redes=None, formato=None, media=None, portada=None, sin_colab=False, cuenta=None, fecha=None, slot=None,
                hora=None, draft=False, colab=None, dias=14, motivo=None)
    base.update(kw)
    return argparse.Namespace(**base)


def proposal_steps(prop):
    """Traduce cada cambio de la propuesta a pasos de la cola, sin ejecutar nada."""
    stages = read_state('stages.json')
    discards = read_state('discarded.json')
    pubs = read_state('manual-publications.json')
    steps = []
    for c in sorted(prop.get('changes', []), key=lambda x: x.get('requested') or '9999'):
        pid, act, title = c['id'], c.get('requested_action'), c.get('title') or c['id']
        cuentas = [f'{r}={v}' for r, v in (c.get('requested_accounts') or {}).items()]
        redes = ','.join(c.get('requested_networks') or [])
        colab = ','.join(c.get('requested_collaborators') or [])
        when = c.get('requested')
        skip = None
        if (discards.get(pid) or {}).get('active'):
            skip = 'está descartada en el planner'
        elif (pubs.get(pid) or {}).get('active'):
            skip = 'ya la marcaste como publicada'
        elif pid.startswith('remote:'):
            skip = 'se creó directo en Postiz: cambiala desde Postiz'
        elif c.get('missing_final') and act in ('schedule', 'move'):
            skip = 'todavía no tiene archivo final: queda como reserva'
        elif act == 'schedule' and (stages.get(pid) or {}).get('active') and stages[pid].get('stage') in ('development', 'review') and not c.get('approved_by_calendar'):
            skip = 'está en «' + stages[pid]['stage'] + '» en el planner, no aprobada'
        if skip:
            steps.append({'id': pid, 'title': title, 'skip': skip})
            continue
        ops = []
        slug = c.get('slug') if pid.startswith('queue:') else None
        if pid.startswith('piece:') and act in ('schedule', 'move', 'update'):
            source = c.get('requested_version') or c.get('source')
            ops.append(('listo', ns(source=str(ROOT / source), redes=redes or None, cuenta=cuentas or None, sin_colab=not colab and 'instagram' in redes.split(','),
                                    trial=True if c.get('instagram_trial') else None)))
            slug = None  # se conoce al crear la ficha
        elif c.get('requested_version') and pid.startswith('queue:'):
            if c.get('original'):
                ops.append(('quitar', ns(slug=slug)))
            ops.append(('reemplazar', ns(slug=slug, archivo=str(ROOT / c['requested_version']))))
            if c.get('original') and act == 'move':
                act = 'schedule'
        day, hour = (when.split('T') if when else (None, None))
        sched = dict(fecha=day, hora=hour, redes=redes or None, cuenta=cuentas or None, colab=colab)
        if act == 'schedule':
            ops.append(('agendar', ns(slug=slug, **sched)))
        elif act == 'move':
            ops.append(('mover', ns(slug=slug, **sched)))
        elif act == 'unschedule':
            ops.append(('quitar', ns(slug=slug)))
        elif act == 'pause':
            ops.append(('pausar', ns(slug=slug, motivo=c.get('note') or 'pausada desde el planner')))
        elif act == 'resume':
            ops.append(('reanudar', ns(slug=slug)))
        elif act == 'update' and pid.startswith('queue:'):
            if c.get('original'):
                d, h = c['original'].split('T')
                ops.append(('mover', ns(slug=slug, fecha=d, hora=h[:5], redes=redes or None, cuenta=cuentas or None, colab=colab)))
            else:
                ops.append(('ficha', ns(slug=slug, redes=redes or None, cuenta=cuentas or None, colab=colab)))
        steps.append({'id': pid, 'title': title, 'ops': ops, 'when': when, 'note': c.get('note') or ''})
    return steps


def read_state(name):
    try:
        return json.loads((STATE / name).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def update_card(a):
    """Redes, cuentas y colaboradores de una pieza sin fecha: sólo la ficha, sin Postiz."""
    media = find_piece(a.slug)
    meta = load_meta(media)
    if a.redes:
        meta['redes'] = [r.strip() for r in a.redes.split(',')]
    apply_cuentas(meta, parse_cuentas(a.cuenta))
    if a.colab is not None:
        meta['instagram_collaborators'] = [c.strip().lstrip('@') for c in a.colab.split(',') if c.strip()]
    save_meta(media, meta)
    print(f"✓ {meta['slug']}: ficha actualizada")


RUNNERS = {'listo': cmd_listo, 'agendar': cmd_agendar, 'mover': cmd_mover, 'quitar': cmd_quitar, 'reemplazar': cmd_reemplazar,
           'pausar': cmd_pausar, 'reanudar': cmd_reanudar, 'ficha': update_card}


def describe_op(name, a):
    bits = {'listo': lambda: f'entra a la cola desde {rel(Path(a.source))}', 'agendar': lambda: f'se agenda el {a.fecha} a las {a.hora}',
            'mover': lambda: f'se mueve al {a.fecha} a las {a.hora}', 'quitar': lambda: 'sale de Postiz (queda sin fecha)',
            'reemplazar': lambda: f'cambia el archivo por {rel(Path(a.archivo))}', 'pausar': lambda: 'se pausa (sale de Postiz)',
            'reanudar': lambda: 'sale de la pausa', 'ficha': lambda: 'se actualiza su ficha'}[name]()
    extra = []
    if name in ('listo', 'agendar', 'mover', 'ficha') and a.redes:
        extra.append('en ' + a.redes.replace(',', ', '))
    if a.cuenta:
        def who(v):
            red, _, cid = v.partition('=')
            o = next((x for x in account_options(red) if x.get('id') == cid), {}) if red in channels() else {}
            return f"{red} @{o['profile']}" if o.get('profile') else v
        extra.append('desde ' + ', '.join(map(who, a.cuenta)))
    if name in ('agendar', 'mover', 'ficha') and a.colab:
        extra.append('collab ' + a.colab)
    return bits + (' · ' + ' · '.join(extra) if extra else '')


def cmd_aplicar(a):
    f = STATE / f'proposal-{a.id}.json'
    if not f.is_file():
        die(f'no existe la propuesta {a.id} ({f})')
    prop = json.loads(f.read_text(encoding='utf-8'))
    if prop.get('status') in ('applied',) and not a.forzar:
        die(f'la propuesta {a.id} ya se aplicó el {prop.get("applied_at")}')
    steps = proposal_steps(prop)
    print(f'Propuesta {a.id} · {len(steps)} pieza(s)' + (f" · {len(prop.get('feedback') or [])} con feedback de contenido" if prop.get('feedback') else ''))
    for st in steps:
        if st.get('skip'):
            print(f"  · {st['title']}: no se toca ({st['skip']})")
            continue
        print(f"  → {st['title']}: " + '; '.join(describe_op(n, x) for n, x in st['ops']) + (f"  [nota: {st['note']}]" if st['note'] else ''))
    if prop.get('feedback'):
        print('  ⚑ El feedback de contenido no lo aplica el motor: lo resuelve Claude Code siguiendo las notas.')
    if not a.ejecutar:
        print('\n(plan sin ejecutar; con --ejecutar se aplica en Postiz; con --ejecutar --borrador quedan como borradores)')
        return
    results = []
    for st in steps:
        if st.get('skip'):
            results.append({'id': st['id'], 'resultado': 'omitido', 'motivo': st['skip']})
            continue
        slug, done = None, []
        try:
            for name, x in st['ops']:
                x.draft = a.borrador
                if name != 'listo' and not x.slug:
                    x.slug = slug
                if name == 'listo':
                    before = {m['slug'] for _, m in inbox_pieces()}
                    RUNNERS[name](x)
                    slug = next(iter({m['slug'] for _, m in inbox_pieces()} - before))
                else:
                    RUNNERS[name](x)
                    slug = slug or x.slug
                done.append(name)
            results.append({'id': st['id'], 'slug': slug, 'resultado': 'aplicado', 'pasos': done})
        except SystemExit:
            results.append({'id': st['id'], 'slug': slug, 'resultado': 'error', 'pasos': done, 'motivo': 'ver la salida de error'})
        except (RuntimeError, ValueError) as e:
            print(f'✗ {st["title"]}: {e}', file=sys.stderr)
            results.append({'id': st['id'], 'slug': slug, 'resultado': 'error', 'pasos': done, 'motivo': str(e)})
    ok = all(r['resultado'] != 'error' for r in results)
    prop.update(status='applied' if ok else 'partial', applied_at=now_local().isoformat(timespec='seconds'), results=results)
    f.write_text(json.dumps(prop, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Del borrador sale sólo lo aplicado que sigue igual a la propuesta; ediciones posteriores quedan.
    draft_f = STATE / 'draft.json'
    draft = read_state('draft.json')
    applied = {r['id'] for r in results if r['resultado'] in ('aplicado', 'omitido')}
    by_id = {c['id']: c for c in prop.get('changes', [])}
    removed = [pid for pid in list((draft.get('changes') or {})) if pid in applied and (draft['changes'][pid].get('when') or None) == (by_id[pid].get('requested') or None)]
    for pid in removed:
        del draft['changes'][pid]
    if removed:
        draft['revision'] = int(draft.get('revision') or 0) + 1
        draft['saved_at'] = now_local().isoformat()
        tmp = draft_f.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(draft_f)
    print(f"\n{'✓' if ok else '⚠'} Propuesta {a.id}: " + ', '.join(f"{r['resultado']} {r.get('slug') or r['id']}" for r in results))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('listo'); p.add_argument('source')
    p.add_argument('--slug'); p.add_argument('--titulo'); p.add_argument('--serie'); p.add_argument('--categoria'); p.add_argument('--marca')
    p.add_argument('--tipo', choices=['noticia', 'evergreen'], default='evergreen'); p.add_argument('--vence')
    p.add_argument('--trial', action='store_true', default=None, help='Reel de prueba en Instagram (Trial).')
    p.add_argument('--redes', help='instagram,tiktok,…; por defecto default_networks de la config')
    p.add_argument('--formato', choices=['reel', 'video', 'carousel', 'story', 'image'])
    p.add_argument('--media', nargs='*', help='Archivos extra (láminas de un carrusel armado a mano).')
    p.add_argument('--portada', type=float, help='Segundo del cuadro de portada.')
    p.add_argument('--sin-colab', action='store_true', help='Instagram sin colaboradores.')
    p.add_argument('--cuenta', action='append', help='red=cuenta para salir desde otra cuenta conectada.')
    p.set_defaults(fn=cmd_listo)
    p = sp.add_parser('cronograma'); p.add_argument('--dias', type=int, default=7); p.add_argument('--apply', action='store_true'); p.add_argument('--draft', action='store_true'); p.set_defaults(fn=cmd_cronograma)
    p = sp.add_parser('semana'); p.add_argument('--dias', type=int, default=7); p.add_argument('--json', action='store_true'); p.set_defaults(fn=cmd_semana)
    for name, fn in (('agendar', cmd_agendar), ('mover', cmd_mover)):
        p = sp.add_parser(name); p.add_argument('slug'); p.add_argument('--fecha', required=name == 'mover'); p.add_argument('--slot'); p.add_argument('--hora')
        p.add_argument('--draft', action='store_true', help='Crea el post como borrador de Postiz (no sale).')
        p.add_argument('--cuenta', action='append', help='red=cuenta')
        p.add_argument('--redes', help='Redes de esta pieza (reemplaza las de la ficha).')
        p.add_argument('--colab', help='Colaboradores de Instagram separados por coma; vacío = ninguno.')
        if name == 'agendar':
            p.add_argument('--dias', type=int, default=14)
        p.set_defaults(fn=fn)
    p = sp.add_parser('quitar'); p.add_argument('slug'); p.set_defaults(fn=cmd_quitar)
    p = sp.add_parser('reemplazar'); p.add_argument('slug'); p.add_argument('archivo'); p.add_argument('--portada', type=float); p.add_argument('--motivo'); p.set_defaults(fn=cmd_reemplazar)
    p = sp.add_parser('pausar'); p.add_argument('slug'); p.add_argument('--motivo'); p.set_defaults(fn=cmd_pausar)
    p = sp.add_parser('reanudar'); p.add_argument('slug'); p.set_defaults(fn=cmd_reanudar)
    p = sp.add_parser('ahora'); p.add_argument('slug'); p.add_argument('--redes'); p.set_defaults(fn=cmd_ahora)
    p = sp.add_parser('modo-ig'); p.add_argument('slug'); p.add_argument('modo', choices=['feed', 'trial'])
    p.add_argument('--aunque-agendada', action='store_true'); p.add_argument('--por', default='planner'); p.set_defaults(fn=cmd_modo_ig)
    p = sp.add_parser('publicado'); p.set_defaults(fn=cmd_publicado)
    p = sp.add_parser('reconciliar'); p.add_argument('--archivados', action='store_true'); p.add_argument('--json', action='store_true'); p.set_defaults(fn=cmd_reconciliar)
    p = sp.add_parser('fijado'); p.add_argument('slug'); p.add_argument('--descartar', action='store_true'); p.set_defaults(fn=cmd_fijado)
    p = sp.add_parser('capacidades'); p.set_defaults(fn=cmd_capacidades)
    p = sp.add_parser('aplicar'); p.add_argument('id'); p.add_argument('--ejecutar', action='store_true'); p.add_argument('--forzar', action='store_true')
    p.add_argument('--borrador', action='store_true', help='Crea los posts como borradores de Postiz: no sale nada. Para probar.'); p.set_defaults(fn=cmd_aplicar)
    a = ap.parse_args()
    try:
        load_config(required=True)
        a.fn(a)
    except (RuntimeError, ValueError, ConfigError) as e:
        refresh_snapshot(a)
        die(str(e))
    refresh_snapshot(a)


MUTATING = {'agendar', 'mover', 'quitar', 'pausar', 'ahora', 'publicado', 'reconciliar', 'aplicar'}


def refresh_snapshot(a):
    """Después de tocar Postiz, el planner tiene que ver lo nuevo sin esperar a que alguien toque «Actualizar»."""
    if a.cmd not in MUTATING and not (a.cmd == 'cronograma' and getattr(a, 'apply', False)):
        return
    if a.cmd == 'aplicar' and not getattr(a, 'ejecutar', False):
        return
    try:
        import inventario
        inventario.refresh()
    except Exception as e:  # el estado ya quedó guardado; sólo la vista se actualiza más tarde
        print(f'  (no pude actualizar la vista del planner: {e}; tocá el botón de Postiz en el planner)', file=sys.stderr)


if __name__ == '__main__':
    main()
