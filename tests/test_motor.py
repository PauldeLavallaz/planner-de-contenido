"""Pruebas del motor contra un Postiz simulado: no toca ninguna cuenta real.

    python3 -m unittest discover -s tests -v
"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from datetime import datetime, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ENGINE = REPO / 'engine'
FAKE = Path(__file__).resolve().parent / 'fake_postiz.py'


class Motor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix='planner-test-'))
        cls.content = cls.tmp / 'contenido'
        bin_dir = cls.tmp / 'bin'
        bin_dir.mkdir()
        if os.name == 'nt':
            (bin_dir / 'postiz.cmd').write_text(f'@"{sys.executable}" "{FAKE}" %*\n')
        else:
            (bin_dir / 'postiz').write_text(f'#!/bin/sh\nexec "{sys.executable}" "{FAKE}" "$@"\n')
            (bin_dir / 'postiz').chmod(0o755)
        cls.config = cls.tmp / 'planner.config.json'
        example = json.loads((REPO / 'planner.config.example.json').read_text())
        example['content']['root'] = str(cls.content)
        example['timezone'] = 'America/Argentina/Buenos_Aires'
        cls.config.write_text(json.dumps(example))
        cls.env = {**os.environ, 'PLANNER_CONFIG': str(cls.config), 'FAKE_POSTIZ_DB': str(cls.tmp / 'postiz.json'),
                   'PATH': str(bin_dir) + os.pathsep + os.environ.get('PATH', '')}
        cls.env.pop('POSTIZ_API_KEY', None)
        # Contenido: estructura estándar con cuatro piezas.
        for d in ('1-en-desarrollo/idea-sin-video', '2-por-revisar/reel-revision', '3-listo/reel-listo/slides_no', '3-listo/carrusel-tips/slides'):
            (cls.content / d).mkdir(parents=True)
        (cls.content / '2-por-revisar/reel-revision/final.mp4').write_bytes(os.urandom(4096))
        (cls.content / '3-listo/reel-listo/final.mp4').write_bytes(os.urandom(8192))
        (cls.content / '3-listo/reel-listo/caption.txt').write_text('Tres errores al publicar en Instagram')
        (cls.content / '3-listo/reel-listo/pieza.json').write_text(json.dumps({'titulo': 'Tres errores al publicar'}))
        for n in (1, 2, 3):
            (cls.content / f'3-listo/carrusel-tips/slides/{n:02d}.png').write_bytes(os.urandom(512 + n))
        (cls.content / '3-listo/carrusel-tips/publish_kit.md').write_text('## Caption\n```\nCinco tips para tu carrusel\n```\n')
        (cls.content / '3-listo/suelto.mp4').write_bytes(os.urandom(2048))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def run_py(self, script, *args, ok=True):
        cp = subprocess.run([sys.executable, str(ENGINE / script), *args], capture_output=True, text=True, env=self.env, encoding='utf-8')
        if ok and cp.returncode:
            self.fail(f'{script} {args} → {cp.returncode}\n{cp.stdout}\n{cp.stderr}')
        return cp

    def inventory(self):
        return json.loads(self.run_py('inventario.py').stdout)

    def item(self, inv, pid):
        return next(i for i in inv['items'] if i['id'] == pid)

    def future(self, days=3, hour='18:30'):
        return (datetime.now() + timedelta(days=days)).date().isoformat(), hour

    def test_flujo_completo(self):
        # 1. Conectar: todas las cuentas del Postiz simulado, alternativas por red y ajuste obligatorio de Pinterest.
        out = self.run_py('conectar.py', '--verificar').stdout
        self.assertIn('Pinterest', out)
        self.assertIn('board', out)
        cfg = json.loads(self.config.read_text())
        self.assertEqual(cfg['channels']['instagram']['id'], 'ig-main')
        self.assertEqual(cfg['channels']['instagram']['alternativas'][0]['id'], 'ig-alt')
        self.assertEqual(cfg['channels']['tiktok']['mode'], 'direct')
        self.run_py('conectar.py', '--principal', 'instagram=otramarca', '--tiktok', 'inbox')
        cfg = json.loads(self.config.read_text())
        self.assertEqual(cfg['channels']['instagram']['id'], 'ig-alt')
        self.run_py('conectar.py', '--principal', 'instagram=mimarca', '--tiktok', 'direct')
        cfg = json.loads(self.config.read_text())
        cfg['default_networks'] = ['instagram', 'tiktok', 'youtube']
        cfg['instagram']['default_collaborators'] = ['amiga.cuenta']
        self.config.write_text(json.dumps(cfg))

        # 2. Inventario: estados por carpeta, carrusel por láminas, archivo suelto y pieza sin final.
        inv = self.inventory()
        self.assertEqual(self.item(inv, 'piece:1-en-desarrollo/idea-sin-video')['status'], 'development')
        self.assertEqual(self.item(inv, 'piece:2-por-revisar/reel-revision')['status'], 'review')
        listo = self.item(inv, 'piece:3-listo/reel-listo')
        self.assertEqual((listo['status'], listo['title'], listo['captions']['general']), ('ready', 'Tres errores al publicar', 'Tres errores al publicar en Instagram'))
        car = self.item(inv, 'piece:3-listo/carrusel-tips')
        self.assertEqual((car['format'], len(car['media'])), ('carousel', 3))
        self.assertEqual(self.item(inv, 'piece:3-listo/suelto.mp4')['format'], 'reel')
        self.assertEqual([n['id'] for n in inv['config']['networks']][:3], ['instagram', 'tiktok', 'youtube'])

        # 3. listo → inbox, la pieza pasa a ser de la cola y deja de figurar como carpeta suelta.
        self.run_py('cola.py', 'listo', str(self.content / '3-listo/reel-listo'))
        inv = self.inventory()
        q = self.item(inv, 'queue:reel-listo')
        self.assertEqual((q['status'], q['source'], q['collaborators']), ('ready', '3-listo/reel-listo', ['amiga.cuenta']))
        self.assertFalse(any(i['id'] == 'piece:3-listo/reel-listo' for i in inv['items']))
        dup = self.run_py('cola.py', 'listo', str(self.content / '3-listo/reel-listo'), '--slug', 'otra', ok=False)
        self.assertNotEqual(dup.returncode, 0)

        # 4. agendar con otra cuenta de Instagram → posts en Postiz, carpeta agendado/, estado En Postiz.
        day, hour = self.future()
        self.run_py('cola.py', 'agendar', 'reel-listo', '--fecha', day, '--hora', hour, '--cuenta', 'instagram=otramarca')
        db = json.loads((self.tmp / 'postiz.json').read_text())
        self.assertEqual(len(db['posts']), 3)
        ig = next(p for p in db['posts'] if p['integration']['identifier'] == 'instagram-standalone')
        self.assertEqual(ig['integration']['id'], 'ig-alt')
        self.assertEqual(ig['settings']['collaborators'], [{'label': 'amiga.cuenta'}])
        tt = next(p for p in db['posts'] if p['integration']['identifier'] == 'tiktok-business')
        self.assertEqual(tt['settings']['content_posting_method'], 'DIRECT_POST')
        self.run_py('inventario.py', '--refresh')
        q = self.item(self.inventory(), 'queue:reel-listo')
        self.assertEqual(q['status'], 'scheduled')
        self.assertEqual(q['scheduled'], f'{day}T{hour}')

        # 5. mover, pausar (sale de Postiz), reanudar, volver a agendar y quitar.
        day2, _ = self.future(5)
        self.run_py('cola.py', 'mover', 'reel-listo', '--fecha', day2, '--hora', '12:30')
        db = json.loads((self.tmp / 'postiz.json').read_text())
        self.assertTrue(all(p['publishDate'].startswith(day2) for p in db['posts']))
        self.run_py('cola.py', 'pausar', 'reel-listo', '--motivo', 'prueba')
        self.assertEqual(json.loads((self.tmp / 'postiz.json').read_text())['posts'], [])
        self.run_py('inventario.py', '--refresh')
        self.assertEqual(self.item(self.inventory(), 'queue:reel-listo')['status'], 'paused')
        self.run_py('cola.py', 'reanudar', 'reel-listo')
        self.assertEqual(self.item(self.inventory(), 'queue:reel-listo')['status'], 'ready')
        self.run_py('cola.py', 'agendar', 'reel-listo', '--fecha', day, '--hora', '21:30', '--redes', 'instagram')
        self.assertEqual(len(json.loads((self.tmp / 'postiz.json').read_text())['posts']), 1)
        self.run_py('cola.py', 'quitar', 'reel-listo')
        self.assertEqual(json.loads((self.tmp / 'postiz.json').read_text())['posts'], [])

        # 6. Feed o Trial desde la ficha; un Trial no lleva collab.
        self.run_py('cola.py', 'modo-ig', 'reel-listo', 'trial')
        self.run_py('cola.py', 'agendar', 'reel-listo', '--fecha', day, '--hora', '21:30')
        ig = next(p for p in json.loads((self.tmp / 'postiz.json').read_text())['posts'] if p['integration']['identifier'] == 'instagram-standalone')
        self.assertTrue(ig['settings']['is_trial_reel'])
        self.assertNotIn('collaborators', ig['settings'])

        # 7. Postiz lo publica → publicado archiva y deja historial en la carpeta de la pieza.
        db = json.loads((self.tmp / 'postiz.json').read_text())
        for p in db['posts']:
            p['state'] = 'PUBLISHED'
            p['releaseURL'] = {'instagram-standalone': 'https://www.instagram.com/reel/AbCdEf123/', 'tiktok-business': 'https://www.tiktok.com/@mimarca/video/7300000000000000001', 'youtube': 'https://www.youtube.com/watch?v=abcdefghijk'}[p['integration']['identifier']]
        (self.tmp / 'postiz.json').write_text(json.dumps(db))
        out = self.run_py('cola.py', 'publicado').stdout
        self.assertIn('publicado', out)
        self.assertTrue(list((self.content / 'publicar/publicado').glob('*/*reel-listo.json')))
        self.assertTrue((self.content / '3-listo/reel-listo/publicacion.json').is_file())
        self.run_py('inventario.py', '--refresh')
        self.assertEqual(self.item(self.inventory(), 'queue:reel-listo')['status'], 'published')

        # 8. Carrusel: tres láminas, un solo post por red.
        self.run_py('cola.py', 'listo', str(self.content / '3-listo/carrusel-tips'), '--redes', 'instagram')
        meta = json.loads((self.content / 'publicar/inbox/carrusel-tips.json').read_text())
        self.assertEqual((meta['formato'], len(meta['media_files']), meta['captions']['general']), ('carousel', 3, 'Cinco tips para tu carrusel'))

        # 9. Una red que pide un ajuste obligatorio frena antes de subir nada, con el lugar donde cargarlo.
        self.run_py('cola.py', 'listo', str(self.content / '3-listo/suelto.mp4'), '--redes', 'pinterest')
        fail = self.run_py('cola.py', 'agendar', 'suelto', '--fecha', day, '--hora', '09:00', ok=False)
        self.assertIn('channels.pinterest.settings', fail.stderr)

    def test_aplicar_propuesta(self):
        self.run_py('conectar.py')
        folder = self.content / '3-listo/reel-propuesta'
        folder.mkdir(parents=True)
        (folder / 'final.mp4').write_bytes(os.urandom(3000))
        state = self.content / 'publicar/.planner'
        state.mkdir(parents=True, exist_ok=True)
        day, _ = self.future(4)
        pid = 'piece:3-listo/reel-propuesta'
        (state / 'draft.json').write_text(json.dumps({'revision': 1, 'changes': {pid: {'when': f'{day}T10:15'}}}))
        (state / 'proposal-test1.json').write_text(json.dumps({'id': 'test1', 'status': 'awaiting_chat_confirmation', 'changes': [
            {'id': pid, 'title': 'Reel propuesta', 'source': '3-listo/reel-propuesta', 'requested': f'{day}T10:15', 'requested_action': 'schedule',
             'requested_networks': ['instagram', 'x'], 'requested_accounts': {'instagram': 'ig-alt'}, 'requested_collaborators': [], 'missing_final': False},
            {'id': 'piece:1-en-desarrollo/idea-sin-video', 'title': 'Idea', 'source': '1-en-desarrollo/idea-sin-video', 'requested': f'{day}T12:00',
             'requested_action': 'schedule', 'missing_final': True}]}))
        plan = self.run_py('cola.py', 'aplicar', 'test1').stdout
        self.assertIn('instagram @otramarca', plan)
        self.assertIn('reserva', plan)
        self.assertFalse((self.content / 'publicar/inbox/reel-propuesta.json').exists())
        self.run_py('cola.py', 'aplicar', 'test1', '--ejecutar')
        prop = json.loads((state / 'proposal-test1.json').read_text())
        self.assertEqual(prop['status'], 'applied')
        self.assertEqual([r['resultado'] for r in prop['results']], ['aplicado', 'omitido'])
        self.assertEqual(json.loads((state / 'draft.json').read_text())['changes'], {})
        posts = [p for p in json.loads((self.tmp / 'postiz.json').read_text())['posts'] if p['publishDate'].startswith(day)]
        self.assertEqual(sorted(p['integration']['id'] for p in posts), ['ig-alt', 'x-main'])
        self.assertNotEqual(self.run_py('cola.py', 'aplicar', 'test1', '--ejecutar', ok=False).returncode, 0)
        self.run_py('cola.py', 'quitar', 'reel-propuesta')

    def test_historias(self):
        # Propuesta de la pestaña Historias: tres historias en orden desde la cuenta alternativa; la de la encuesta va a mano.
        self.run_py('conectar.py')
        run = self.content / 'historias/semana-x'
        (run / 'historias').mkdir(parents=True)
        day, _ = self.future(5)
        imgs = []
        for n in (1, 2, 3):
            png = run / f'historias/{day}_{n}_venta.png'
            png.write_bytes(os.urandom(600 + n))
            imgs.append(png.relative_to(self.content).as_posix())
        state = self.content / 'publicar/.planner'
        state.mkdir(parents=True, exist_ok=True)
        def accion(n, que, sticker=None):
            return {'orden': n, 'imagen': imgs[n - 1], 'fecha': day, 'hora': '10:00', 'cuenta': 'otramarca', 'cuenta_id': 'ig-alt',
                    'accion': que, 'sticker': sticker, 'a_mano': que == 'a_mano', 'cola': None}
        (state / 'proposal-historias-h1.json').write_text(json.dumps({'id': 'h1', 'status': 'awaiting_chat_confirmation', 'run': 'historias/semana-x',
            'acciones': [accion(1, 'agendar'), accion(2, 'a_mano', 'encuesta: ¿sí o no?'), accion(3, 'agendar')]}))
        seco = self.run_py('historias.py', 'aplicar', 'h1').stdout
        self.assertIn('Corrida en seco', seco)
        self.assertEqual(json.loads((state / 'proposal-historias-h1.json').read_text())['status'], 'awaiting_chat_confirmation')
        out = self.run_py('historias.py', 'aplicar', 'h1', '--ejecutar').stdout
        self.assertIn('A mano', out)
        self.assertIn('10:02', out)
        prop = json.loads((state / 'proposal-historias-h1.json').read_text())
        self.assertEqual(prop['status'], 'aplicada')
        self.assertEqual([r['hora_programada'] for r in prop['resultados']], ['10:00', '10:04'])
        posts = sorted((p for p in json.loads((self.tmp / 'postiz.json').read_text())['posts']
                        if p['publishDate'].startswith(day) and p['settings'].get('post_type') == 'story'), key=lambda p: p['publishDate'])
        self.assertEqual([p['integration']['id'] for p in posts], ['ig-alt', 'ig-alt'])
        self.assertNotEqual(self.run_py('historias.py', 'aplicar', 'h1', '--ejecutar', ok=False).returncode, 0)
        # Las historias de la cola no aparecen como piezas en el planner.
        self.assertFalse([i for i in self.inventory()['items'] if 'historia-' in i['id']])

    def test_sincronizar_carpetas(self):
        state = self.content / 'publicar/.planner'
        state.mkdir(parents=True, exist_ok=True)
        pid = 'piece:2-por-revisar/reel-revision'
        (state / 'stages.json').write_text(json.dumps({pid: {'active': True, 'stage': 'ready', 'from': 'review'}}))
        (state / 'draft.json').write_text(json.dumps({'revision': 3, 'changes': {pid: {'when': None, 'note': 'x'}}}))
        plan = self.run_py('carpetas.py', 'sincronizar').stdout
        self.assertIn('3-listo/reel-revision', plan)
        self.assertTrue((self.content / '2-por-revisar/reel-revision').is_dir())
        self.run_py('carpetas.py', 'sincronizar', '--aplicar')
        self.assertTrue((self.content / '3-listo/reel-revision/final.mp4').is_file())
        draft = json.loads((state / 'draft.json').read_text())
        self.assertIn('piece:3-listo/reel-revision', draft['changes'])
        self.assertEqual(draft['revision'], 4)
        self.assertFalse(json.loads((state / 'stages.json').read_text())['piece:3-listo/reel-revision']['active'])
        self.assertIn('Todo está', self.run_py('carpetas.py', 'sincronizar').stdout)

    def test_analizar_y_probar(self):
        out = self.run_py('carpetas.py', 'analizar').stdout
        self.assertIn('3-listo', out)
        self.assertIn('◆', out)
        self.assertIn('piezas', self.run_py('carpetas.py', 'probar').stdout)


if __name__ == '__main__':
    unittest.main()
