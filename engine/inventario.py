#!/usr/bin/env python3
"""Inventario de sólo lectura para el planner: piezas de tus carpetas, la cola y lo que hay en Postiz.

Nunca modifica tus carpetas, las fichas de la cola ni Postiz. Con --refresh sólo hace un `posts:list`.
Imprime un JSON en stdout que lee la app (app/src/publication-planner.ts).
"""
import hashlib, json, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (CFG, CONFIG_PATH, PUBLISH, ROOT, STATE, ConfigError, load_config, network_of, read_json, rel, run_postiz, parse_json, tz)
import piezas

QUEUE_DIRS = ('inbox', 'agendado')


def date_value(value):
    try:
        d = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return (d.replace(tzinfo=timezone.utc) if not d.tzinfo else d).astimezone(tz())
    except (ValueError, TypeError):
        return None


def queue_path(value):
    if not isinstance(value, str) or not value:
        return None
    p = Path(value)
    p = p if p.is_absolute() else ROOT / p
    try:
        p.resolve().relative_to(ROOT)
        return p.resolve()
    except ValueError:
        return None


def newer_final(d):
    """Si el archivo de origen cambió después de entrar a la cola, el planner ofrece traer esa versión."""
    sf = queue_path(d.get('source_final'))
    if not sf or not sf.is_file() or sf.suffix.lower() not in ('.mp4', '.mov') or len(d.get('media_files') or []) > 1:
        return None
    try:
        since = datetime.fromisoformat(str(d.get('created_at'))).timestamp()
    except ValueError:
        return None
    if sf.stat().st_mtime <= since + 60:
        return None
    if d.get('content_sha256'):
        h = hashlib.sha256()
        with sf.open('rb') as fh:
            for block in iter(lambda: fh.read(1 << 20), b''):
                h.update(block)
        if h.hexdigest() == d['content_sha256']:
            return None
    return piezas.asset(sf, 'Versión nueva · ' + sf.name)


def queue_items(live):
    items, covered, used = [], set(), set()
    files = [f for sub in QUEUE_DIRS for f in sorted((PUBLISH / sub).glob('*.json'))]
    files += sorted((PUBLISH / 'publicado').glob('*/*.json'))
    for f in files:
        d = read_json(f)
        if not isinstance(d, dict) or not d.get('slug'):
            continue
        src = queue_path(d.get('source_run'))
        if src:
            covered.add(rel(src))
        all_posts = (d.get('postiz') or {}).get('posts', [])
        used.update(p.get('id') for p in all_posts if p.get('id'))
        # Las historias se manejan en la pestaña Historias: no son piezas sueltas de Semana ni del Tablero.
        if d.get('formato') == 'story':
            continue
        channels = []
        for lp in [p for p in all_posts if p.get('estado') != 'cancelado']:
            p = live.get(lp.get('id'))
            dt = date_value(p.get('publishDate') if p else lp.get('date_utc'))
            settings = (p or {}).get('settings') or {}
            if isinstance(settings, str):
                try:
                    settings = json.loads(settings)
                except ValueError:
                    settings = {}
            trial = bool(settings.get('is_trial_reel')) if p else bool(lp.get('red') == 'instagram' and d.get('trial'))
            channels.append({'id': lp.get('id'), 'network': lp.get('red'), 'state': p.get('state') if p else lp.get('provider_state', 'UNKNOWN'),
                             'verified': bool(p), 'when': dt.isoformat() if dt else None, 'trial': trial,
                             'error': (p or {}).get('error'), 'account': (p or {}).get('integrationName'), 'url': (p or {}).get('releaseURL') or lp.get('native_url')})
        current = []
        for network in dict.fromkeys(c['network'] for c in channels):
            group = [c for c in channels if c['network'] == network]
            current.extend([c for c in group if c['verified']] or group[-1:])
        channels = current
        queued = [c for c in channels if c['state'] == 'QUEUE' and c['verified']]
        published = bool(channels) and all(c['state'] == 'PUBLISHED' for c in channels)
        status = 'scheduled' if queued else 'published' if published or f.parent.parent.name == 'publicado' else 'ready' if f.parent.name == 'inbox' else 'attention'
        if status == 'ready' and d.get('pausa'):
            status = 'paused'
        media = [a for a in (piezas.asset(queue_path(n)) for n in d.get('media_files', [])) if a] or [a for a in [piezas.asset(queue_path(d.get('source_final')))] if a]
        primary = next((a for a in media if a['kind'] == 'video'), media[0] if media else None)
        components = []
        if src and src.is_dir():
            try:
                components = piezas.describe(src, {}).get('components', [])
            except OSError:
                components = []
        newer = newer_final(d) if status in ('ready', 'scheduled', 'paused', 'attention') else None
        scheduled = next((c['when'] for c in queued if c['network'] == 'instagram'), None) or next((c['when'] for c in queued if c['network'] != 'tiktok'), None) or next((c['when'] for c in queued), None)
        slot = d.get('slot') or {}
        reference = (slot.get('fecha') + 'T' + (slot.get('hora') or '00:00')) if slot.get('fecha') else next((c['when'] for c in channels if c['when']), None)
        caps = d.get('captions') or {}
        items.append({
            'id': 'queue:' + d['slug'], 'slug': d['slug'], 'title': d.get('titulo') or d['slug'],
            'brand': d.get('marca') or (CFG.get('brands') or ['Mi marca'])[0], 'status': status, 'raw_status': d.get('estado'),
            'source': rel(src) if src else '', 'sidecar': rel(f), 'format': d.get('formato'), 'created': d.get('created_at'),
            'updated': d.get('reconciled_at'), 'primary': primary, 'media': media, 'components': components,
            'poster': piezas.asset(queue_path((d.get('portada') or {}).get('imagen'))),
            'scheduled': scheduled[:16] if scheduled else None, 'channels': channels, 'networks': d.get('redes', []),
            'accounts': d.get('cuentas') or {}, 'newer_final': newer, 'captions': caps, 'trial': bool(d.get('trial')),
            'approved': True, 'note': d.get('nota') or '', 'cover': bool(d.get('portada')), 'fingerprint': str(f.stat().st_mtime_ns),
            'publication_reference': reference, 'collaborators': d.get('instagram_collaborators') or [],
            'series': d.get('serie'), 'category': d.get('categoria'), 'kind': d.get('tipo'), 'expires': d.get('vence'), 'pause': d.get('pausa'),
        })
    return items, covered, used


def scan(snapshot):
    live = {p['id']: p for p in snapshot.get('posts', []) if p.get('id')}
    ig_mode = read_json(STATE / 'instagram-mode.json')
    items, covered, used = queue_items(live)
    for path, src in piezas.pieces():
        source = rel(path)
        if source in covered:
            continue
        try:
            it = piezas.describe(path, src)
        except OSError:
            continue
        it['trial'] = bool((ig_mode.get(source) or {}).get('trial'))
        if it['status'] == 'published' and it.get('published_on'):
            it['publication_reference'] = str(it['published_on'])[:10] + 'T12:00'
        items.append(it)
    default_brand = (CFG.get('brands') or ['Mi marca'])[0]
    for p in live.values():
        if p['id'] in used or p.get('state') not in ['QUEUE', 'ERROR']:
            continue
        dt = date_value(p.get('publishDate'))
        net = network_of(p.get('platform'))
        items.append({'id': 'remote:' + p['id'], 'slug': p['id'], 'title': (p.get('content') or 'Publicación sin ficha local').split('\n')[0][:170],
                      'brand': default_brand, 'status': 'scheduled' if p['state'] == 'QUEUE' else 'attention', 'raw_status': p['state'],
                      'source': '', 'format': 'sin ficha', 'created': p.get('publishDate'), 'primary': None, 'media': [], 'components': [],
                      'scheduled': dt.isoformat()[:16] if dt else None,
                      'channels': [{'id': p['id'], 'network': net, 'state': p['state'], 'verified': True, 'when': dt.isoformat() if dt else None, 'account': p.get('integrationName')}],
                      'networks': [net], 'captions': {}, 'approved': False, 'note': 'Creada en Postiz, sin archivo local.', 'fingerprint': p.get('publishDate') or ''})
    return sorted(items, key=lambda x: x.get('created') or '', reverse=True)


def refresh():
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=90)).isoformat(timespec='seconds').replace('+00:00', 'Z')
    end = (now + timedelta(days=366)).isoformat(timespec='seconds').replace('+00:00', 'Z')
    cp = run_postiz(['posts:list', '--startDate', start, '--endDate', end], timeout=55)
    if cp.returncode:
        raise RuntimeError('Postiz no respondió correctamente. Se conserva la consulta anterior.')
    data = parse_json(cp.stdout or '')
    posts = data.get('posts', data.get('data', [])) if isinstance(data, dict) else data
    if not isinstance(posts, list):
        raise RuntimeError('Respuesta de Postiz no reconocida')
    for p in posts:
        integ = p.get('integration') or {}
        p['platform'] = p.get('platform') or integ.get('identifier') or integ.get('providerIdentifier')
        p['integrationName'] = p.get('integrationName') or integ.get('name')
    STATE.mkdir(parents=True, exist_ok=True)
    tmp = STATE / 'postiz-snapshot.tmp'
    tmp.write_text(json.dumps({'fetched_at': now.isoformat(), 'start': start, 'end': end, 'posts': posts}, ensure_ascii=False), encoding='utf-8')
    tmp.replace(STATE / 'postiz-snapshot.json')


def ui_config():
    channels = CFG.get('channels') or {}
    ig = CFG.get('instagram') or {}
    networks = []
    for k, v in channels.items():
        if v.get('enabled', True) is False:
            continue
        accounts = [{'id': v.get('id'), 'label': v.get('label', k), 'profile': v.get('profile'), 'brand': v.get('marca'), 'collab': v.get('colab_default')}]
        accounts += [{'id': x.get('id'), 'label': x.get('label'), 'profile': x.get('profile'), 'brand': x.get('marca'), 'collab': x.get('colab_default')} for x in v.get('alternativas') or []]
        networks.append({'id': k, 'label': v.get('label', k), 'accounts': accounts, 'mode': v.get('mode')})
    return {
        'slots': CFG.get('slots'), 'suggested_times': CFG.get('suggested_times') or CFG.get('slots'),
        'jitter_minutes': CFG.get('jitter_minutes', 0), 'occupied_window_minutes': CFG.get('occupied_window_minutes', 75),
        'default_networks': [n for n in (CFG.get('default_networks') or list(channels)) if n in channels],
        'networks': networks, 'brands': CFG.get('brands') or [], 'locale': CFG.get('locale') or 'es-AR',
        'default_collaborators': ig.get('default_collaborators') or [], 'collaborator_options': ig.get('collaborator_options') or [],
        'content_root': str(ROOT), 'publish_root': rel(PUBLISH) or str(PUBLISH), 'config_path': str(CONFIG_PATH),
        'sources': [{'path': s.get('path'), 'stage': s.get('stage', 'auto'), 'label': s.get('label')} for s in CFG['content'].get('sources') or []],
    }


if __name__ == '__main__':
    try:
        load_config(required=True)
        if '--refresh' in sys.argv:
            refresh()
        snapshot = read_json(STATE / 'postiz-snapshot.json')
        out = {'generated_at': datetime.now(tz()).isoformat(), 'postiz_fetched_at': snapshot.get('fetched_at'),
               'timezone': CFG['timezone'], 'config': ui_config(), 'items': scan(snapshot)}
    except ConfigError as e:
        print(json.dumps({'error': str(e), 'needs_setup': True}, ensure_ascii=False))
        sys.exit(3)
    except (RuntimeError, FileNotFoundError) as e:
        print(json.dumps({'error': str(e) if not isinstance(e, FileNotFoundError) else 'No encuentro el CLI de Postiz: npm install -g postiz'}, ensure_ascii=False))
        sys.exit(2)
    print(json.dumps(out, ensure_ascii=False))
