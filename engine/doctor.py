#!/usr/bin/env python3
"""Chequea que esté todo lo necesario para correr el planner y dice cómo arreglar lo que falte.

  python3 engine/doctor.py          resumen legible
  python3 engine/doctor.py --json   para que lo lea Claude Code
"""
import json, os, platform, re, shutil, subprocess, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CONFIG_PATH, REPO, load_config, content_root, publish_root

OS = platform.system()  # Darwin, Linux, Windows


def run(cmd, timeout=20):
    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, encoding='utf-8', errors='replace')
        return cp.returncode, (cp.stdout or '') + (cp.stderr or '')
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, str(e)


def install_hint(tool):
    hints = {
        'node': {'Darwin': 'brew install node  (o descargá el instalador LTS de https://nodejs.org)', 'Windows': 'winget install OpenJS.NodeJS.LTS', 'Linux': 'https://nodejs.org (o nvm install 22)'},
        'ffmpeg': {'Darwin': 'brew install ffmpeg', 'Windows': 'winget install Gyan.FFmpeg', 'Linux': 'sudo apt install ffmpeg'},
        'postiz': {'*': 'npm install -g postiz'},
        'python': {'Darwin': 'brew install python', 'Windows': 'winget install Python.Python.3.12', 'Linux': 'sudo apt install python3'},
    }[tool]
    return hints.get(OS) or hints.get('*') or next(iter(hints.values()))


def check():
    out = []

    def add(name, ok, detail, fix=None, required=True):
        out.append({'check': name, 'ok': bool(ok), 'detail': detail, 'fix': None if ok else fix, 'required': required})

    add('Python 3.10+', sys.version_info >= (3, 10), platform.python_version(), install_hint('python'))
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo('America/Argentina/Buenos_Aires')
        add('Zonas horarias', True, 'ok')
    except Exception:
        add('Zonas horarias', False, 'falta la base de zonas horarias', f'{sys.executable} -m pip install tzdata')
    node = shutil.which('node')
    version = run([node, '--version'])[1].strip() if node else ''
    m = re.match(r'v(\d+)\.(\d+)', version)
    add('Node 22.18+', m and (int(m[1]), int(m[2])) >= (22, 18), version or 'no instalado', install_hint('node'))
    add('npm', shutil.which('npm'), shutil.which('npm') or 'no instalado', install_hint('node'))
    add('ffmpeg (portadas y audios)', shutil.which('ffmpeg'), shutil.which('ffmpeg') or 'no instalado', install_hint('ffmpeg'), required=False)
    add('Dependencias de la app', (REPO / 'app/node_modules/hono').is_dir(), 'app/node_modules', 'cd app && npm ci')
    pz = shutil.which('postiz')
    add('CLI de Postiz', pz, pz or 'no instalado', install_hint('postiz'))
    if pz:
        code, text = run([pz, 'auth:status'])
        authed = code == 0 and not re.search(r'not (authenticated|logged)|no credentials|unauthori', text, re.I)
        add('Sesión de Postiz', authed, text.strip().splitlines()[0][:120] if text.strip() else '', 'postiz auth:login   (o POSTIZ_API_KEY=... en el archivo .env del repo)')
    add('planner.config.json', CONFIG_PATH.is_file(), str(CONFIG_PATH), 'cp planner.config.example.json planner.config.json')
    if CONFIG_PATH.is_file():
        try:
            cfg = load_config(required=True)
            root = content_root(cfg)
            add('Carpeta de contenido', root.is_dir(), str(root), 'Revisá content.root en planner.config.json')
            add('Fuentes de piezas', bool(cfg['content'].get('sources')), f"{len(cfg['content'].get('sources') or [])} fuente(s)", 'python3 engine/carpetas.py analizar  → y cargá content.sources')
            add('Cuentas de Postiz', bool(cfg.get('channels')), ', '.join(cfg.get('channels') or {}) or 'ninguna', 'python3 engine/conectar.py')
            pr = publish_root(cfg)
            add('Cola de publicación', True, str(pr), required=False)
        except Exception as e:
            add('planner.config.json válido', False, str(e), 'Corregí el JSON')
    try:
        port = int(os.environ.get('PLANNER_PORT') or 4180)
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=1.5) as r:
            ok = json.loads(r.read()).get('service') == 'publication-planner'
        add('Planner corriendo', ok, f'http://127.0.0.1:{port}', required=False)
    except Exception:
        add('Planner corriendo', False, 'no responde en el puerto 4180',
            'cd app && npm run service:install   (o npm start para dejarlo abierto en una terminal)', required=False)
    return out


if __name__ == '__main__':
    results = check()
    if '--json' in sys.argv:
        print(json.dumps({'os': OS, 'checks': results}, ensure_ascii=False, indent=1))
    else:
        for r in results:
            print(f"{'✓' if r['ok'] else ('✗' if r['required'] else '·')} {r['check']:<28} {r['detail']}")
            if r['fix']:
                print(f"    → {r['fix']}")
    sys.exit(0 if all(r['ok'] or not r['required'] for r in results) else 1)
