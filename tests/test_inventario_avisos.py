"""Una ficha mal armada no vacía el calendario: el inventario la saltea, la avisa y muestra el resto.

    python3 -m unittest discover -s tests -v
"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


class InventarioConAvisos(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-avisos-'))
        content = self.tmp / 'contenido'
        (content / '3-listo/reel-bueno').mkdir(parents=True)
        (content / '3-listo/reel-bueno/final.mp4').write_bytes(os.urandom(2048))
        inbox = content / 'publicar/inbox'
        inbox.mkdir(parents=True)
        # Una ficha de la cola buena y una con `postiz` en un formato que no es el suyo.
        (inbox / 'buena.json').write_text(json.dumps({'slug': 'buena', 'titulo': 'Buena', 'formato': 'reel', 'redes': ['instagram'], 'postiz': {'posts': []}}))
        (inbox / 'rota.json').write_text(json.dumps({'slug': 'rota', 'titulo': 'Rota', 'formato': 'reel', 'postiz': 'no es un objeto'}))
        config = json.loads((REPO / 'planner.config.example.json').read_text())
        config['content']['root'] = str(content)
        cfg = self.tmp / 'planner.config.json'
        cfg.write_text(json.dumps(config))
        self.env = {**os.environ, 'PLANNER_CONFIG': str(cfg)}

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_lo_roto_se_avisa_y_lo_demas_se_ve(self):
        cp = subprocess.run([sys.executable, str(REPO / 'engine/inventario.py')], capture_output=True, text=True, env=self.env, encoding='utf-8')
        self.assertEqual(cp.returncode, 0, cp.stderr)
        inv = json.loads(cp.stdout)
        ids = {i['id'] for i in inv['items']}
        self.assertIn('queue:buena', ids)
        self.assertNotIn('queue:rota', ids)
        self.assertTrue(any(i['source'] == '3-listo/reel-bueno' for i in inv['items']), ids)
        self.assertEqual(len(inv['avisos']), 1, inv['avisos'])
        self.assertTrue(inv['avisos'][0]['origen'].endswith('inbox/rota.json'))
        self.assertTrue(inv['avisos'][0]['oculta'])
        self.assertIn('AttributeError', inv['avisos'][0]['detalle'])


if __name__ == '__main__':
    unittest.main()
