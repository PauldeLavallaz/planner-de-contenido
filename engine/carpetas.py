#!/usr/bin/env python3
"""Ayuda a mapear tus carpetas de contenido al planner, o a reorganizarlas.

  python3 engine/carpetas.py analizar [CARPETA] [--profundidad 3] [--json]
      Recorre la carpeta (por defecto content.root) y resume qué hay: dónde están los videos, las imágenes,
      las fichas y qué carpetas parecen contener piezas. No toca nada.

  python3 engine/carpetas.py crear [--en CARPETA]
      Crea la estructura estándar (1-en-desarrollo, 2-por-revisar, 3-listo, 4-publicado) y la deja
      configurada como fuentes. No mueve archivos.

  python3 engine/carpetas.py probar [--json]
      Corre el inventario con la configuración actual y cuenta cuántas piezas ve en cada estado y fuente.

  python3 engine/carpetas.py sincronizar [--aplicar]
      Si tus fuentes son carpetas por estado, propone mover cada pieza a la carpeta del estado que le diste
      en el planner (o al que llegó en Postiz). Sin --aplicar sólo muestra el plan.
"""
import argparse, json, shutil, sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (CFG, CONFIG_PATH, IMAGE, PUBLISH, ROOT, STATE, VIDEO, die, load_config, read_json, rel, save_config, write_json)
import piezas

STANDARD = [('1-en-desarrollo', 'development', 'En desarrollo'), ('2-por-revisar', 'review', 'Por revisar'),
            ('3-listo', 'ready', 'Listo para publicar'), ('4-publicado', 'published', 'Publicado')]
STAGE_LABEL = {'development': 'En desarrollo', 'review': 'Por revisar', 'ready': 'Listo', 'published': 'Publicado', 'archived': 'Archivado', 'scheduled': 'En Postiz', 'paused': 'Pausada', 'attention': 'Por confirmar'}


def summarize(folder, depth, max_depth, out):
    try:
        entries = [e for e in folder.iterdir() if not e.name.startswith('.') and e.name not in (CFG['content'].get('ignore') or [])]
    except OSError:
        return None
    files = [e for e in entries if e.is_file()]
    dirs = [e for e in entries if e.is_dir() and e.resolve() != PUBLISH]
    videos = sum(1 for f in files if f.suffix.lower() in VIDEO)
    images = sum(1 for f in files if f.suffix.lower() in IMAGE)
    metas = [f.name for f in files if f.name in (CFG['content'].get('meta_files') or [])]
    captions = [f.name for f in files if f.name in (CFG['content'].get('caption_files') or [])]
    # ¿Sus hijos parecen piezas? Subcarpetas con un video o láminas adentro, o videos sueltos.
    child_with_media = 0
    for d in dirs[:200]:
        try:
            if any(p.suffix.lower() in VIDEO | IMAGE for p in d.iterdir() if p.is_file()):
                child_with_media += 1
        except OSError:
            pass
    node = {'ruta': rel(folder) or '.', 'videos': videos, 'imagenes': images, 'subcarpetas': len(dirs),
            'subcarpetas_con_media': child_with_media, 'fichas': metas, 'textos': captions, 'profundidad': depth}
    if child_with_media >= 2 or videos >= 2:
        node['parece_fuente'] = True
    out.append(node)
    if depth < max_depth:
        for d in sorted(dirs, key=piezas.natural)[:60]:
            summarize(d, depth + 1, max_depth, out)
    return node


def cmd_analizar(a):
    base = Path(a.carpeta).expanduser().resolve() if a.carpeta else ROOT
    if not base.is_dir():
        die(f'no existe {base}')
    out = []
    summarize(base, 0, a.profundidad, out)
    if a.json:
        print(json.dumps({'base': str(base), 'carpetas': out}, ensure_ascii=False, indent=1))
        return
    print(f'Carpeta analizada: {base}\n')
    for n in out:
        if not (n['videos'] or n['imagenes'] or n['subcarpetas_con_media'] or n['fichas']) and n['profundidad'] > 1:
            continue
        mark = '◆' if n.get('parece_fuente') else ' '
        bits = [f"{n['videos']} videos" if n['videos'] else '', f"{n['imagenes']} imágenes" if n['imagenes'] else '',
                f"{n['subcarpetas_con_media']}/{n['subcarpetas']} subcarpetas con media" if n['subcarpetas'] else '',
                'ficha: ' + ', '.join(n['fichas']) if n['fichas'] else '', 'texto: ' + ', '.join(n['textos']) if n['textos'] else '']
        print(f"{mark} {'  ' * n['profundidad']}{n['ruta']}  ·  " + ' · '.join(b for b in bits if b))
    print('\n◆ = parece una fuente: sus subcarpetas (o sus archivos) son piezas.')


def cmd_crear(a):
    cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8')) if CONFIG_PATH.is_file() else die('Falta planner.config.json')
    base = Path(a.en).expanduser().resolve() if a.en else ROOT
    base.mkdir(parents=True, exist_ok=True)
    try:
        prefix = base.relative_to(ROOT).as_posix()
    except ValueError:
        die(f'{base} tiene que estar dentro de content.root ({ROOT})')
    sources = []
    for name, stage, label in STANDARD:
        (base / name).mkdir(exist_ok=True)
        sources.append({'path': f'{prefix}/{name}' if prefix not in ('', '.') else name, 'stage': stage, 'label': label})
    readme = base / 'LEEME-planner.md'
    if not readme.exists():
        readme.write_text('# Carpetas del planner\n\nCada pieza es una carpeta (o un archivo suelto) dentro de una de estas:\n\n'
                          + ''.join(f'- **{n}/**: {l}.\n' for n, _, l in STANDARD)
                          + '\nAdentro de cada pieza: el video final (`final.mp4` o cualquier `.mp4`), o las láminas del carrusel'
                            ' (`slides/01.png`, `02.png`…), y opcionalmente `caption.txt` con el texto de la publicación.\n'
                            '\n`publicar/` la maneja el planner: no muevas nada ahí a mano.\n', encoding='utf-8')
    cfg.setdefault('content', {})['sources'] = sources
    save_config(cfg)
    print(f'✓ Estructura creada en {base}')
    for s in sources:
        print(f"  {s['path']}/  → {s['label']}")
    print('  Configurado en content.sources. Mové tus piezas a estas carpetas (o pedile a Claude que lo haga).')


def effective_status(item, stages, pubs, discards):
    if (discards.get(item['id']) or {}).get('active'):
        return None
    if (pubs.get(item['id']) or {}).get('active'):
        return 'published'
    st = stages.get(item['id']) or {}
    if st.get('active') and st.get('stage') in ('development', 'review', 'ready'):
        return st['stage']
    return item['status']


def load_items():
    import inventario
    return inventario.scan(read_json(STATE / 'postiz-snapshot.json'))


def cmd_probar(a):
    load_config(required=True)
    items = load_items()
    by_status = Counter(i['status'] for i in items)
    by_source = Counter((i.get('source_label') or ('cola' if i['id'].startswith('queue:') else 'Postiz')) for i in items)
    warn = [s.get('path') for s in CFG['content'].get('sources') or [] if not list(ROOT.glob(str(s.get('path') or '.').strip('/') or '.'))]
    if a.json:
        print(json.dumps({'por_estado': by_status, 'por_fuente': by_source, 'fuentes_sin_carpeta': warn,
                          'ejemplos': [{k: i.get(k) for k in ('title', 'status', 'source', 'format')} for i in items[:15]]}, ensure_ascii=False, indent=1))
        return
    print(f'Contenido: {ROOT}\nCola: {PUBLISH}\n')
    print(f'{len(items)} piezas')
    for k, n in by_status.most_common():
        print(f'  {STAGE_LABEL.get(k, k):<16} {n}')
    print('\nPor fuente:')
    for k, n in by_source.most_common():
        print(f'  {k}: {n}')
    if warn:
        print(f"\n⚠ Fuentes que no encuentran ninguna carpeta: {', '.join(map(str, warn))}")
    no_final = [i for i in items if i['id'].startswith('piece:') and not i.get('primary')]
    if no_final:
        print(f'\n{len(no_final)} sin archivo final (quedan En desarrollo), por ejemplo: ' + ', '.join(i['source'] for i in no_final[:5]))
    print('\nEjemplos:')
    for i in items[:12]:
        print(f"  [{STAGE_LABEL.get(i['status'], i['status'])}] {i['title'][:60]}  ·  {i.get('source') or i.get('sidecar') or ''}")


def stage_folders():
    out = {}
    for s in CFG['content'].get('sources') or []:
        path = str(s.get('path') or '')
        if s.get('stage') in STAGE_LABEL and not any(c in path for c in '*?[') and s['stage'] not in out:
            out[s['stage']] = (ROOT / path).resolve()
    return out


def cmd_sincronizar(a):
    load_config(required=True)
    folders = stage_folders()
    if len(folders) < 2:
        die('Tus fuentes no son carpetas por estado; no hay nada que sincronizar (el estado vive en el planner).')
    stages, pubs, discards = (read_json(STATE / n) for n in ('stages.json', 'manual-publications.json', 'discarded.json'))
    moves = []
    for i in load_items():
        src = i.get('source')
        if not src:
            continue
        path = (ROOT / src).resolve()
        if not path.exists() or path.parent not in folders.values():
            continue
        current = next(k for k, v in folders.items() if v == path.parent)
        target = effective_status(i, stages, pubs, discards)
        if i['id'].startswith('queue:'):
            target = 'published' if i['status'] == 'published' else 'ready'
        if target and target != current and target in folders:
            moves.append({'item': i, 'from': path, 'to': folders[target] / path.name, 'stage': target})
    if not moves:
        print('Todo está en la carpeta de su estado.')
        return
    for m in moves:
        print(f"  {rel(m['from'])}  →  {rel(m['to'])}  ({STAGE_LABEL[m['stage']]})")
    if not a.aplicar:
        print(f'\n{len(moves)} movimiento(s). Con --aplicar se mueven y se actualizan el planner y la cola.')
        return
    renamed = {}
    for m in moves:
        if m['to'].exists():
            print(f"  ✗ ya existe {rel(m['to'])}; no se mueve")
            continue
        m['to'].parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(m['from']), str(m['to']))
        renamed[rel(m['from']) or str(m['from'])] = rel(m['to'])
    migrate(renamed)
    print(f'✓ {len(renamed)} pieza(s) movidas; el planner y la cola apuntan a las carpetas nuevas.')


def migrate(renamed):
    """Las claves del planner (piece:<ruta>) y las fichas de la cola siguen a la carpeta movida."""
    if not renamed:
        return
    ids = {'piece:' + old: 'piece:' + new for old, new in renamed.items()}
    for name in ('stages.json', 'discarded.json', 'manual-publications.json'):
        f = STATE / name
        data = read_json(f)
        if not data:
            continue
        changed = False
        for old, new in ids.items():
            if old in data:
                rec = data.pop(old)
                # La carpeta ya representa el estado: el ajuste del planner deja de hacer falta.
                if name == 'stages.json':
                    rec = {**rec, 'active': False, 'cleared_at': 'sincronizar'}
                data[new] = rec
                changed = True
        if changed:
            write_json(f, data)
    ig = read_json(STATE / 'instagram-mode.json')
    if any(k in ig for k in renamed):
        write_json(STATE / 'instagram-mode.json', {renamed.get(k, k): v for k, v in ig.items()})
    draft = read_json(STATE / 'draft.json')
    if draft.get('changes') and any(k in draft['changes'] for k in ids):
        draft['changes'] = {ids.get(k, k): v for k, v in draft['changes'].items()}
        draft['revision'] = int(draft.get('revision') or 0) + 1
        write_json(STATE / 'draft.json', draft)
    for sub in ('inbox', 'agendado'):
        for f in (PUBLISH / sub).glob('*.json'):
            d = read_json(f)
            if d.get('source_run') in renamed:
                old = d['source_run']
                d['source_run'] = renamed[old]
                if d.get('source_final'):
                    d['source_final'] = d['source_final'].replace(str(ROOT / old), str(ROOT / renamed[old]))
                write_json(f, d)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('analizar'); p.add_argument('carpeta', nargs='?'); p.add_argument('--profundidad', type=int, default=3); p.add_argument('--json', action='store_true'); p.set_defaults(fn=cmd_analizar)
    p = sp.add_parser('crear'); p.add_argument('--en'); p.set_defaults(fn=cmd_crear)
    p = sp.add_parser('probar'); p.add_argument('--json', action='store_true'); p.set_defaults(fn=cmd_probar)
    p = sp.add_parser('sincronizar'); p.add_argument('--aplicar', action='store_true'); p.set_defaults(fn=cmd_sincronizar)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
