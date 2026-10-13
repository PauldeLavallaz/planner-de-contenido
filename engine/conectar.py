#!/usr/bin/env python3
"""Lee las cuentas conectadas en tu Postiz y las escribe en planner.config.json → channels.

  python3 engine/conectar.py                     sincroniza y muestra el resultado
  python3 engine/conectar.py --principal instagram=micuenta
                                                 elige qué cuenta sale por defecto en una red
  python3 engine/conectar.py --tiktok inbox|direct
                                                 TikTok: borrador en la app (inbox) o publicación directa
  python3 engine/conectar.py --verificar         además consulta el schema de cada cuenta y avisa qué falta
  python3 engine/conectar.py --json              imprime el resumen como JSON

Varias cuentas de la misma red (dos Instagram, un LinkedIn personal y una página) quedan como alternativas:
la principal sale por defecto y en el planner elegís otra por pieza. Conserva lo que hayas ajustado a mano
(marca, mode, privacy, settings, colab_default, enabled). Sólo lee de Postiz; no publica nada.
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CONFIG_PATH, DEFAULTS, die, load_config, network_of, parse_json, run_postiz, save_config

NAMES = {'instagram': 'Instagram', 'tiktok': 'TikTok', 'youtube': 'YouTube', 'linkedin': 'LinkedIn', 'facebook': 'Facebook',
         'x': 'X', 'threads': 'Threads', 'bluesky': 'Bluesky', 'pinterest': 'Pinterest', 'mastodon': 'Mastodon', 'google': 'Google Business'}
KEEP = ('marca', 'mode', 'privacy', 'privacy_level', 'settings', 'colab_default', 'enabled', 'made_with_ai')
# Ajustes que el motor ya completa solo por red; el resto de los obligatorios hay que cargarlos en channels.<red>.settings.
FILLED = {'tiktok': {'title', 'content_posting_method', 'privacy_level', 'comment', 'duet', 'stitch', 'autoAddMusic', 'brand_content_toggle', 'brand_organic_toggle', 'video_made_with_ai'},
          'instagram': {'post_type', 'collaborators', 'is_trial_reel', 'graduation_strategy'},
          'youtube': {'title', 'type', 'selfDeclaredMadeForKids', 'tags', 'thumbnail'},
          'linkedin': {'post_as_images_carousel'}, 'facebook': {'post_type'}}


def postiz_json(args):
    try:
        cp = run_postiz(args)
    except FileNotFoundError:
        die('No encuentro el CLI de Postiz. Instalalo con: npm install -g postiz')
    if cp.returncode:
        text = (cp.stdout or '') + (cp.stderr or '')
        if 'auth' in text.lower() or '401' in text:
            die('Postiz no está autenticado. Corré «postiz auth:login» (o cargá POSTIZ_API_KEY en .env) y volvé a intentar.')
        die('Postiz respondió con un error: ' + text.strip()[-400:])
    data = parse_json(cp.stdout or '')
    if data is None:
        die('Postiz no devolvió JSON')
    return data


def account(i, prev=None):
    out = {'id': i['id'], 'type': i.get('identifier'), 'label': f"{NAMES.get(network_of(i.get('identifier')), i.get('identifier'))} {i.get('name') or ''}".strip(),
           'profile': (i.get('profile') or '').lstrip('@') or None, 'name': i.get('name')}
    if i.get('disabled'):
        out['enabled'] = False
    for k in KEEP:
        if prev and k in prev:
            out[k] = prev[k]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--principal', action='append', default=[], help='red=perfil|nombre|id')
    ap.add_argument('--tiktok', choices=['inbox', 'direct'])
    ap.add_argument('--verificar', action='store_true')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    cfg = load_config(required=False)
    if not CONFIG_PATH.is_file():
        die(f'Primero creá {CONFIG_PATH.name} (copiá planner.config.example.json).')
    data = postiz_json(['integrations:list'])
    found = data.get('integrations', data.get('data', [])) if isinstance(data, dict) else data
    if not found:
        die('Tu Postiz no tiene cuentas conectadas. Conectalas en la web de Postiz («Add channel») y volvé a correr esto.')
    old = cfg.get('channels') or {}
    prev_by_id = {}
    for red, ch in old.items():
        prev_by_id[ch.get('id')] = ch
        for alt in ch.get('alternativas') or []:
            prev_by_id[alt.get('id')] = alt
    groups = {}
    for i in found:
        groups.setdefault(network_of(i.get('identifier')), []).append(i)
    wanted = {}
    for v in a.principal:
        red, _, who = v.partition('=')
        wanted[red.strip()] = who.strip().lstrip('@').lower()
    channels, removed = {}, [ch.get('label') for ch in prev_by_id.values() if ch.get('id') not in {i['id'] for i in found}]
    for red, accs in groups.items():
        current = (old.get(red) or {}).get('id')
        pick = None
        if red in wanted:
            pick = next((x for x in accs if wanted[red] in {x['id'].lower(), (x.get('profile') or '').lstrip('@').lower(), (x.get('name') or '').lower()}), None)
            if not pick:
                die(f"--principal {red}={wanted[red]}: opciones: " + ', '.join((x.get('profile') or x.get('name')) for x in accs))
        pick = pick or next((x for x in accs if x['id'] == current), None) or next((x for x in accs if not x.get('disabled')), accs[0])
        main_acc = account(pick, prev_by_id.get(pick['id']))
        prev_main = old.get(red) or {}
        for k in KEEP:
            if k in prev_main and k not in main_acc and prev_main.get('id') == pick['id']:
                main_acc[k] = prev_main[k]
        alts = [account(x, prev_by_id.get(x['id'])) for x in accs if x['id'] != pick['id']]
        if alts:
            main_acc['alternativas'] = alts
        if red == 'tiktok':
            main_acc['mode'] = a.tiktok or main_acc.get('mode') or 'direct'
        if red == 'youtube':
            main_acc.setdefault('privacy', 'public')
        channels[red] = main_acc
    cfg['channels'] = channels
    if not cfg.get('default_networks') or any(n not in channels for n in cfg['default_networks']):
        cfg['default_networks'] = [n for n in (cfg.get('default_networks') or []) if n in channels] or list(channels)
    pending = []
    if a.verificar:
        for red, ch in channels.items():
            for acc in [ch] + list(ch.get('alternativas') or []):
                schema = postiz_json(['integrations:settings', acc['id']])
                spec = (schema.get('output', schema) if isinstance(schema, dict) else {}).get('settings', {})
                have = FILLED.get(red, set()) | set((acc.get('settings') or {}).keys()) | {'__type'}
                for field in spec.get('required', []):
                    if field not in have:
                        desc = (spec.get('properties', {}).get(field) or {}).get('description', '')
                        pending.append({'red': red, 'cuenta': acc.get('profile') or acc.get('name'), 'campo': field, 'detalle': desc[:200]})
    on_disk = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    on_disk['channels'], on_disk['default_networks'] = cfg['channels'], cfg['default_networks']
    save_config(on_disk)
    summary = {'config': str(CONFIG_PATH), 'redes': {red: {'principal': ch.get('profile') or ch.get('name'), 'tipo': ch.get('type'), 'modo': ch.get('mode'),
               'alternativas': [x.get('profile') or x.get('name') for x in ch.get('alternativas') or []]} for red, ch in channels.items()},
               'por_defecto': cfg['default_networks'], 'ya_no_estan': removed, 'ajustes_pendientes': pending}
    if a.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    print(f'✓ {len(found)} cuenta(s) de Postiz en {CONFIG_PATH.name}')
    for red, s in summary['redes'].items():
        extra = f" · también: {', '.join(map(str, s['alternativas']))}" if s['alternativas'] else ''
        mode = f" · {'borrador en la app' if s['modo'] == 'inbox' else 'publicación directa'}" if red == 'tiktok' else ''
        print(f"  {NAMES.get(red, red):<16} @{s['principal']}{mode}{extra}")
    print(f"  Redes por defecto de cada pieza: {', '.join(cfg['default_networks'])}")
    if removed:
        print(f"  ⚠ Ya no están en Postiz: {', '.join(map(str, removed))}")
    for p in pending:
        print(f"  ⚠ {p['red']} (@{p['cuenta']}): Postiz pide «{p['campo']}». Cargalo en channels.{p['red']}.settings. {p['detalle']}")


if __name__ == '__main__':
    main()
