"""engine/anuncios.py contra un rclone falso: sube lo elegido, no repite lo que ya está y deja la selección limpia.

    python3 -m unittest discover -s tests -v
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
# rclone falso: la «carpeta remota» es un directorio local (FAKE_REMOTE). Entiende lsjson y copyto.
FAKE_RCLONE = r'''
import hashlib, json, os, shutil, sys
from pathlib import Path
d = Path(os.environ['FAKE_REMOTE']); d.mkdir(parents=True, exist_ok=True)
args = [a for a in sys.argv[1:] if not a.startswith('--')]
if args[0] == 'lsjson':
    print(json.dumps([{'Name': f.name, 'ID': 'id-' + f.name, 'Hashes': {'md5': hashlib.md5(f.read_bytes()).hexdigest()}} for f in sorted(d.iterdir())]))
elif args[0] == 'copyto':
    shutil.copy2(args[1], d / args[2].split(':', 1)[1].split('/')[-1])
'''


class Anuncios(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-anuncios-'))
        content = self.tmp / 'contenido'
        (content / 'piezas').mkdir(parents=True)
        self.video = content / 'piezas/reel.mp4'
        self.video.write_bytes(os.urandom(3000))
        self.state = content / 'publicar/.planner'
        self.state.mkdir(parents=True)
        (self.state / 'proposal-p1.json').write_text(json.dumps({'id': 'p1', 'created_at': '2026-11-06T10:00:00Z', 'anuncios': {'videos': [
            {'id': 'queue:reel', 'title': 'Tema: la clave', 'video': 'piezas/reel.mp4'}]}}))
        (self.state / 'anuncios-drive.json').write_text(json.dumps({'revision': 3, 'seleccion': {'queue:reel': {'video': 'piezas/reel.mp4', 'added_at': '2026-11-06T09:00:00Z'}}}))
        bin_dir = self.tmp / 'bin'; bin_dir.mkdir()
        (bin_dir / 'rclone').write_text(f'#!/bin/sh\nexec "{sys.executable}" "{bin_dir / "rclone.py"}" "$@"\n'); (bin_dir / 'rclone').chmod(0o755)
        (bin_dir / 'rclone.py').write_text(FAKE_RCLONE)
        config = json.loads((REPO / 'planner.config.example.json').read_text())
        config['content']['root'] = str(content)
        config['anuncios'] = {'nombre': 'Anuncios', 'remoto': 'drive:Anuncios', 'drive_id': 'carpeta123'}
        (self.tmp / 'planner.config.json').write_text(json.dumps(config))
        self.remote = self.tmp / 'remoto'
        self.env = {**os.environ, 'PLANNER_CONFIG': str(self.tmp / 'planner.config.json'), 'FAKE_REMOTE': str(self.remote),
                    'PATH': str(bin_dir) + os.pathsep + os.environ.get('PATH', '')}

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_py(self, *args):
        return subprocess.run([sys.executable, str(REPO / 'engine/anuncios.py'), *args], capture_output=True, text=True, env=self.env, encoding='utf-8')

    @unittest.skipIf(os.name == 'nt', 'el rclone falso es un script de shell')
    def test_sube_una_vez_y_limpia_la_seleccion(self):
        r = self.run_py('subir', 'p1')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual([f.name for f in self.remote.iterdir()], ['Tema - la clave.mp4'])
        ads = json.loads((self.state / 'anuncios-drive.json').read_text())
        self.assertEqual(ads['seleccion'], {})
        self.assertEqual(ads['subidos']['queue:reel']['url'], 'https://drive.google.com/file/d/id-Tema - la clave.mp4/view')
        prop = json.loads((self.state / 'proposal-p1.json').read_text())
        self.assertEqual(prop['anuncios']['resultado'][0]['estado'], 'subido')
        # Otra vez: ya está, no se duplica.
        r = self.run_py('subir', 'p1')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(len(list(self.remote.iterdir())), 1)
        self.assertIn('ya estaba', r.stdout)

    def test_sin_carpeta_configurada_lo_dice(self):
        cfg = json.loads((self.tmp / 'planner.config.json').read_text()); cfg.pop('anuncios')
        (self.tmp / 'planner.config.json').write_text(json.dumps(cfg))
        r = self.run_py('estado')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('anuncios.remoto', r.stderr)


if __name__ == '__main__':
    unittest.main()
