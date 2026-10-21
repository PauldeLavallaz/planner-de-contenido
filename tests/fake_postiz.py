#!/usr/bin/env python3
"""Postiz de mentira para las pruebas: mismo formato de salida que el CLI, estado en FAKE_POSTIZ_DB."""
import json, os, sys, uuid
from pathlib import Path

DB = Path(os.environ['FAKE_POSTIZ_DB'])
INTEGRATIONS = [
    {'id': 'ig-main', 'name': 'Mi Marca', 'identifier': 'instagram-standalone', 'disabled': False, 'profile': 'mimarca'},
    {'id': 'ig-alt', 'name': 'Otra Marca', 'identifier': 'instagram-standalone', 'disabled': False, 'profile': 'otramarca'},
    {'id': 'tt-main', 'name': 'Mi Marca TT', 'identifier': 'tiktok-business', 'disabled': False, 'profile': 'mimarca'},
    {'id': 'yt-main', 'name': 'Mi Canal', 'identifier': 'youtube', 'disabled': False, 'profile': '@micanal'},
    {'id': 'x-main', 'name': 'Mi X', 'identifier': 'x', 'disabled': False, 'profile': 'mimarca'},
    {'id': 'pin-main', 'name': 'Mi Pinterest', 'identifier': 'pinterest', 'disabled': False, 'profile': 'mimarca'},
]
SCHEMAS = {
    'pinterest': {'settings': {'required': ['board'], 'properties': {'board': {'type': 'string', 'description': 'Tablero'}}}},
    'tiktok-business': {'maxLength': 2200, 'settings': {'properties': {'privacy_level': {'enum': ['PUBLIC_TO_EVERYONE', 'SELF_ONLY']}}}},
}


def load():
    return json.loads(DB.read_text()) if DB.exists() else {'posts': [], 'uploads': 0, 'calls': []}


def save(d):
    DB.write_text(json.dumps(d))


def out(x):
    print('✓ ok')
    print(json.dumps(x))


args = sys.argv[1:]
d = load()
d['calls'].append(args[:1])
cmd = args[0] if args else ''
if cmd == 'auth:status':
    print('✓ Authenticated (fake)')
elif cmd == 'integrations:list':
    out(INTEGRATIONS)
elif cmd == 'integrations:settings':
    ident = next(i['identifier'] for i in INTEGRATIONS if i['id'] == args[1])
    out({'output': SCHEMAS.get(ident, {'settings': {}})})
elif cmd == 'upload':
    d['uploads'] += 1
    out({'id': f"up{d['uploads']}", 'path': f"https://uploads.fake/{Path(args[1]).name}"})
elif cmd == 'posts:create':
    body = json.loads(Path(args[args.index('--json') + 1]).read_text())
    created = []
    for p in body['posts']:
        integ = next(i for i in INTEGRATIONS if i['id'] == p['integration']['id'])
        pid = 'p-' + uuid.uuid4().hex[:8]
        d['posts'].append({'id': pid, 'publishDate': body['date'], 'state': 'PUBLISHED' if body['type'] == 'now' else 'DRAFT' if body['type'] == 'draft' else 'QUEUE',
                           'content': p['value'][0]['content'], 'settings': p['settings'], 'integration': {'id': integ['id'], 'identifier': integ['identifier'], 'name': integ['name']}})
        if body['type'] == 'now':  # publicado ya: Postiz devuelve el ID nativo del post
            d['posts'][-1]['releaseId'] = str(17_000_000_000_000_000 + len(d['posts']))
        created.append({'postId': pid, 'integration': integ['id']})
    out(created)
elif cmd == 'posts:list':
    out({'posts': d['posts']})
elif cmd == 'posts:delete':
    d['posts'] = [p for p in d['posts'] if p['id'] != args[1]]
    out({'deleted': True})
else:
    print('unknown', file=sys.stderr)
    save(d)
    sys.exit(2)
save(d)
