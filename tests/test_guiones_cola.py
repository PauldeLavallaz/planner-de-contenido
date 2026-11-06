"""La cola y el inventario usan la versión del final aprobada en la pestaña Guiones, y `youtube.frenado` saca YouTube de lo
que se agenda. Contra un Postiz simulado: no toca ninguna cuenta real.

    python3 -m unittest discover -s tests -p "test_guiones_cola.py" -v
"""
import json, os, shutil, subprocess, sys, tempfile, time, unittest
from datetime import datetime, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ENGINE = REPO / 'engine'
FAKE = Path(__file__).resolve().parent / 'fake_postiz.py'


class GuionesCola(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-guiones-cola-'))
        self.content = self.tmp / 'contenido'
        self.content.mkdir()
        bin_dir = self.tmp / 'bin'
        bin_dir.mkdir()
        if os.name == 'nt':
            (bin_dir / 'postiz.cmd').write_text(f'@"{sys.executable}" "{FAKE}" %*\n')
        else:
            (bin_dir / 'postiz').write_text(f'#!/bin/sh\nexec "{sys.executable}" "{FAKE}" "$@"\n')
            (bin_dir / 'postiz').chmod(0o755)
        self.config = self.tmp / 'planner.config.json'
        example = json.loads((REPO / 'planner.config.example.json').read_text())
        example['content']['root'] = str(self.content)
        self.config.write_text(json.dumps(example))
        self.env = {**os.environ, 'PLANNER_CONFIG': str(self.config), 'FAKE_POSTIZ_DB': str(self.tmp / 'postiz.json'),
                    'PATH': str(bin_dir) + os.pathsep + os.environ.get('PATH', '')}
        self.env.pop('POSTIZ_API_KEY', None)
        self.run_py('conectar.py')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_py(self, script, *args, ok=True):
        cp = subprocess.run([sys.executable, str(ENGINE / script), *args], capture_output=True, text=True, env=self.env, encoding='utf-8')
        if ok and cp.returncode:
            self.fail(f'{script} {args} → {cp.returncode}\n{cp.stdout}\n{cp.stderr}')
        return cp

    def primary(self, pid):
        inv = json.loads(self.run_py('inventario.py').stdout)
        return Path(next(i for i in inv['items'] if i['id'] == pid)['primary']['path']).name

    def test_version_aprobada_en_guiones(self):
        folder = self.content / '3-listo/reel-versiones'
        folder.mkdir(parents=True)
        ahora = time.time()
        for name, hace in (('final.mp4', 300), ('final_gancho_b.mp4', 200), ('final_liviano.mp4', 10), ('final_gancho_b_postiz.mp4', 10)):
            (folder / name).write_bytes(os.urandom(2048))
            os.utime(folder / name, (ahora - hace, ahora - hace))
        # Sin aprobación, la versión más nueva; las copias técnicas no cuentan aunque sean más nuevas.
        self.assertEqual(self.primary('piece:3-listo/reel-versiones'), 'final_gancho_b.mp4')
        # Aprobada en Guiones una anterior, sale ésa.
        estado = self.content / 'publicar/.planner/guiones-estado.json'
        estado.parent.mkdir(parents=True, exist_ok=True)
        ms = (folder / 'final.mp4').stat().st_mtime_ns / 1e6
        aprobado = {'estado': 'aprobado', 'at': datetime.now().isoformat(), 'video': '3-listo/reel-versiones/final.mp4', 'video_modified': ms}
        estado.write_text(json.dumps({'3-listo/reel-versiones': aprobado}))
        self.assertEqual(self.primary('piece:3-listo/reel-versiones'), 'final.mp4')
        # Pausada en Guiones, o con el archivo cambiado después de aprobarlo, la aprobación no vale.
        estado.write_text(json.dumps({'3-listo/reel-versiones': {**aprobado, 'pausado': {'at': 'x'}}}))
        self.assertEqual(self.primary('piece:3-listo/reel-versiones'), 'final_gancho_b.mp4')
        estado.write_text(json.dumps({'3-listo/reel-versiones': {**aprobado, 'video_modified': ms - 5000}}))
        self.assertEqual(self.primary('piece:3-listo/reel-versiones'), 'final_gancho_b.mp4')
        # Una ruta que se va de la carpeta de la pieza no es su final.
        estado.write_text(json.dumps({'3-listo/reel-versiones': {**aprobado, 'video': '3-listo/otra/final.mp4'}}))
        self.assertEqual(self.primary('piece:3-listo/reel-versiones'), 'final_gancho_b.mp4')
        # listo copia a la cola la aprobada.
        estado.write_text(json.dumps({'3-listo/reel-versiones': aprobado}))
        self.run_py('cola.py', 'listo', str(folder), '--redes', 'instagram')
        meta = json.loads((self.content / 'publicar/inbox/reel-versiones.json').read_text())
        self.assertEqual(Path(meta['source_final']).name, 'final.mp4')

    def test_youtube_frenado(self):
        cfg = json.loads(self.config.read_text())
        cfg['youtube']['frenado'] = 'Hasta revisar la cuenta.'
        self.config.write_text(json.dumps(cfg))
        for name in ('reel-frenado', 'solo-youtube'):
            (self.content / name).mkdir()
            (self.content / name / 'final.mp4').write_bytes(os.urandom(4096))
        day = (datetime.now() + timedelta(days=3)).date().isoformat()
        self.run_py('cola.py', 'listo', str(self.content / 'reel-frenado'), '--redes', 'instagram,youtube')
        out = self.run_py('cola.py', 'agendar', 'reel-frenado', '--fecha', day, '--hora', '18:30').stdout
        self.assertIn('sale sin YouTube', out)
        db = json.loads((self.tmp / 'postiz.json').read_text())
        self.assertEqual([p['integration']['identifier'] for p in db['posts']], ['instagram-standalone'])
        meta = json.loads(next((self.content / 'publicar/agendado').glob('*reel-frenado.json')).read_text())
        self.assertEqual((meta['redes'], meta['youtube_frenado']['motivo']), (['instagram'], 'Hasta revisar la cuenta.'))
        # Una pieza que sólo sale en YouTube no se agenda.
        self.run_py('cola.py', 'listo', str(self.content / 'solo-youtube'), '--redes', 'youtube')
        fail = self.run_py('cola.py', 'agendar', 'solo-youtube', '--fecha', day, '--hora', '20:30', ok=False)
        self.assertNotEqual(fail.returncode, 0)
        self.assertIn('YouTube está frenado', fail.stdout + fail.stderr)


if __name__ == '__main__':
    unittest.main()
