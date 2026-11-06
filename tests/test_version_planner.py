"""La versión sólo para el planner: la tarjeta la muestra y la cola y Postiz siguen con la anterior.

    python3 -m unittest discover -s tests -v
"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


class VersionSoloPlanner(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-version-'))
        self.content = self.tmp / 'contenido'
        pieza = self.content / '3-listo/mi-reel'
        pieza.mkdir(parents=True)
        (pieza / 'final.mp4').write_bytes(os.urandom(4096))
        config = json.loads((REPO / 'planner.config.example.json').read_text())
        config['content']['root'] = str(self.content)
        config['channels'] = {'instagram': {'id': 'ig-prueba', 'label': 'Instagram'}}
        config['default_networks'] = ['instagram']
        cfg = self.tmp / 'planner.config.json'
        cfg.write_text(json.dumps(config))
        self.env = {**os.environ, 'PLANNER_CONFIG': str(cfg)}
        self.env.pop('POSTIZ_API_KEY', None)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_py(self, *args, ok=True):
        cp = subprocess.run([sys.executable, str(REPO / 'engine' / args[0]), *args[1:]], capture_output=True, text=True, env=self.env, encoding='utf-8')
        if ok and cp.returncode:
            self.fail(f'{args} → {cp.returncode}\n{cp.stdout}\n{cp.stderr}')
        return cp

    def item(self):
        inv = json.loads(self.run_py('inventario.py').stdout)
        return next(i for i in inv['items'] if i['id'] == 'queue:mi-reel')

    def test_la_tarjeta_muestra_la_nueva_y_la_cola_sigue_con_la_anterior(self):
        self.run_py('cola.py', 'listo', str(self.content / '3-listo/mi-reel'))
        sidecar = self.content / 'publicar/inbox/mi-reel.json'
        copia = self.content / 'publicar/inbox/mi-reel.mp4'
        antes = copia.read_bytes()
        nueva = self.content / '3-listo/mi-reel/final_gancho_b.mp4'
        nueva.write_bytes(os.urandom(5000))

        self.run_py('cola.py', 'reemplazar', 'mi-reel', str(nueva), '--solo-planner', '--motivo', 'sigo iterando')
        meta = json.loads(sidecar.read_text())
        self.assertEqual(meta['version_planner']['path'], '3-listo/mi-reel/final_gancho_b.mp4')
        self.assertEqual(copia.read_bytes(), antes, 'the queue copy is untouched')
        it = self.item()
        self.assertTrue(it['reedit']['sin_subir'])
        self.assertEqual(it['primary']['path'], '3-listo/mi-reel/final_gancho_b.mp4')
        self.assertEqual(it['reedit']['queued']['path'], 'publicar/inbox/mi-reel.mp4')

        # Subirla de verdad (reemplazar sin --solo-planner) la deja como la de la cola y saca la marca.
        self.run_py('cola.py', 'reemplazar', 'mi-reel', str(nueva))
        self.assertNotIn('version_planner', json.loads(sidecar.read_text()))
        self.assertEqual(copia.read_bytes(), nueva.read_bytes())
        self.assertNotIn('reedit', self.item())


if __name__ == '__main__':
    unittest.main()
