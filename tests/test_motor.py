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
        for n in (1, 2, 3, 4):
            png = run / f'historias/{day}_{n}_venta.png'
            png.write_bytes(os.urandom(600 + n))
            imgs.append(png.relative_to(self.content).as_posix())
        state = self.content / 'publicar/.planner'
        state.mkdir(parents=True, exist_ok=True)
        # La 4 tiene video de fondo con voz en off: se publica su MP4.
        mp4 = run / f'historias/{day}_4_venta.mp4'
        mp4.write_bytes(os.urandom(5000))
        def accion(n, que, sticker=None, video=None):
            return {'orden': n, 'imagen': imgs[n - 1], 'video': video, 'fecha': day, 'hora': '10:00', 'cuenta': 'otramarca', 'cuenta_id': 'ig-alt',
                    'accion': que, 'sticker': sticker, 'a_mano': que == 'a_mano', 'cola': None}
        (state / 'proposal-historias-h1.json').write_text(json.dumps({'id': 'h1', 'status': 'awaiting_chat_confirmation', 'run': 'historias/semana-x',
            'acciones': [accion(1, 'agendar'), accion(2, 'a_mano', 'encuesta: ¿sí o no?'), accion(3, 'agendar'), accion(4, 'agendar', video=mp4.relative_to(self.content).as_posix())]}))
        seco = self.run_py('historias.py', 'aplicar', 'h1').stdout
        self.assertIn('Corrida en seco', seco)
        self.assertEqual(json.loads((state / 'proposal-historias-h1.json').read_text())['status'], 'awaiting_chat_confirmation')
        out = self.run_py('historias.py', 'aplicar', 'h1', '--ejecutar').stdout
        self.assertIn('A mano', out)
        self.assertIn('10:02', out)
        prop = json.loads((state / 'proposal-historias-h1.json').read_text())
        self.assertEqual(prop['status'], 'aplicada')
        self.assertEqual([r['hora_programada'] for r in prop['resultados']], ['10:00', '10:04', '10:06'])
        posts = sorted((p for p in json.loads((self.tmp / 'postiz.json').read_text())['posts']
                        if p['publishDate'].startswith(day) and p['settings'].get('post_type') == 'story'), key=lambda p: p['publishDate'])
        self.assertEqual([p['integration']['id'] for p in posts], ['ig-alt', 'ig-alt', 'ig-alt'])
        sidecar = json.loads(next(p for p in (self.content / 'publicar').rglob('*.json') if '4-venta' in p.name and '.planner' not in p.parts).read_text())
        self.assertTrue(sidecar['source_final'].endswith('_4_venta.mp4'))
        # Una historia con feedback sin corregir no se agenda: queda «espera_feedback».
        (state / 'proposal-historias-h2.json').write_text(json.dumps({'id': 'h2', 'status': 'awaiting_chat_confirmation', 'run': 'historias/semana-x',
            'acciones': [{**accion(1, 'espera_feedback'), 'fecha': self.future(6)[0]}]}))
        out = self.run_py('historias.py', 'aplicar', 'h2', '--ejecutar').stdout
        self.assertIn('Esperan el feedback', out)
        self.assertEqual(json.loads((state / 'proposal-historias-h2.json').read_text())['resultados'][0]['resultado'], 'espera_feedback')
        self.assertNotEqual(self.run_py('historias.py', 'aplicar', 'h1', '--ejecutar', ok=False).returncode, 0)
        # Las historias de la cola no aparecen como piezas en el planner.
        self.assertFalse([i for i in self.inventory()['items'] if 'historia-' in i['id']])

    def test_historias_en_cadena(self):
        # Sólo la primera del día queda programada; las siguientes son borradores que `cadena` publica de a una, cuando
        # Postiz confirma la anterior y llegó su hora.
        self.run_py('conectar.py')
        run = self.content / 'historias/semana-cadena'
        (run / 'historias').mkdir(parents=True)
        day, _ = self.future(8)
        imgs = []
        for n in (1, 2, 3):
            png = run / f'historias/{day}_{n}_recurso.png'
            png.write_bytes(os.urandom(700 + n))
            imgs.append(png.relative_to(self.content).as_posix())
        state = self.content / 'publicar/.planner'
        state.mkdir(parents=True, exist_ok=True)
        acciones = [{'orden': n, 'imagen': imgs[n - 1], 'video': None, 'fecha': day, 'hora': '15:00', 'cuenta': 'mimarca', 'cuenta_id': 'ig-main',
                     'accion': 'agendar', 'sticker': None, 'a_mano': False, 'cola': None} for n in (1, 2, 3)]
        (state / 'proposal-historias-c1.json').write_text(json.dumps({'id': 'c1', 'status': 'awaiting_chat_confirmation', 'run': 'historias/semana-cadena', 'acciones': acciones}))
        self.assertIn('en cadena', self.run_py('historias.py', 'aplicar', 'c1').stdout)
        self.run_py('historias.py', 'aplicar', 'c1', '--ejecutar')
        db = self.tmp / 'postiz.json'
        estados = [p['state'] for p in json.loads(db.read_text())['posts'] if p['publishDate'].startswith(day) and p['settings'].get('post_type') == 'story' and p['integration']['id'] == 'ig-main']
        self.assertEqual(sorted(estados), ['DRAFT', 'DRAFT', 'QUEUE'])
        cadena = lambda hora: self.run_py('historias.py', 'cadena', '--ahora', f'{day}T{hora}').stdout
        self.assertEqual(cadena('14:00'), '')  # antes de la primera no consulta nada
        self.assertNotIn('ahora', cadena('15:01'))  # la primera sigue programada: se espera
        # Postiz publica la primera.
        d = json.loads(db.read_text())
        for p in d['posts']:
            if p['publishDate'].startswith(day) and p['state'] == 'QUEUE' and p['integration']['id'] == 'ig-main' and p['settings'].get('post_type') == 'story':
                p['state'], p['releaseId'] = 'PUBLISHED', '17999999999999999'
        db.write_text(json.dumps(d))
        self.assertNotIn('→ ahora', cadena('15:01'))  # la 2 todavía no llegó a su hora (15:02)
        self.assertIn('→ ahora', cadena('15:03'))  # sale la 2
        sidecars = {json.loads(f.read_text())['slug']: json.loads(f.read_text()) for f in (self.content / 'publicar/agendado').glob('*.json') if 'semana-cadena' in f.name}
        dos = next(m for s, m in sidecars.items() if s.endswith('2-recurso'))
        self.assertTrue(any(p.get('type') == 'now' for p in dos['postiz']['posts']))
        self.assertNotIn('→ ahora', cadena('15:03'))  # la 3 espera su hora
        out = cadena('15:30')  # sale tarde: avisa el atraso
        self.assertIn('→ ahora', out)
        avisos = json.loads((state / 'historias-cadena.json').read_text())['avisos']
        self.assertIn('atrasada', avisos[-1]['titulo'])
        self.assertEqual(cadena('15:31'), '')  # todo publicado: no consulta más
        # Una de hoy cuya hora ya pasó no se agenda en el pasado.
        hoy = datetime.now().date().isoformat()
        (state / 'proposal-historias-c2.json').write_text(json.dumps({'id': 'c2', 'status': 'awaiting_chat_confirmation', 'run': 'historias/semana-cadena',
            'acciones': [{**acciones[0], 'fecha': hoy, 'hora': '00:00'}]}))
        self.run_py('historias.py', 'aplicar', 'c2', '--ejecutar', ok=False)
        self.assertEqual(json.loads((state / 'proposal-historias-c2.json').read_text())['resultados'][0]['resultado'], 'fecha_pasada')

    def historias_agendadas(self, nombre, day, n, hora='15:00'):
        """Arma una semana con `n` historias para `day` y las agenda en cadena desde la cuenta principal."""
        self.run_py('conectar.py')
        run = self.content / 'historias' / nombre
        (run / 'historias').mkdir(parents=True)
        imgs = []
        for k in range(1, n + 1):
            png = run / f'historias/{day}_{k}_venta.png'
            png.write_bytes(os.urandom(800 + k))
            imgs.append(png.relative_to(self.content).as_posix())
        state = self.content / 'publicar/.planner'
        state.mkdir(parents=True, exist_ok=True)
        acciones = [{'orden': k, 'imagen': imgs[k - 1], 'video': None, 'fecha': day, 'hora': hora, 'cuenta': 'mimarca', 'cuenta_id': 'ig-main',
                     'accion': 'agendar', 'sticker': None, 'a_mano': False, 'cola': None} for k in range(1, n + 1)]
        pid = f'{nombre}-1'
        (state / f'proposal-historias-{pid}.json').write_text(json.dumps({'id': pid, 'status': 'awaiting_chat_confirmation', 'run': f'historias/{nombre}', 'acciones': acciones}))
        self.run_py('historias.py', 'aplicar', pid, '--ejecutar')
        fichas = {json.loads(f.read_text())['slug']: f for f in (self.content / 'publicar/agendado').glob('*.json') if nombre in f.name}
        slugs = [next(s for s in fichas if s.endswith(f'{k}-venta')) for k in range(1, n + 1)]
        return state, acciones, slugs, fichas

    def test_historias_descartadas(self):
        # Una secuencia descartada en el planner sale de Postiz y queda en pausa; la segunda vez no se toca.
        day, _ = self.future(10)
        state, acciones, slugs, _ = self.historias_agendadas('semana-descartada', day, 1)
        db = self.tmp / 'postiz.json'
        en_postiz = lambda: [p for p in json.loads(db.read_text())['posts'] if p['publishDate'].startswith(day) and p['settings'].get('post_type') == 'story']
        self.assertEqual(len(en_postiz()), 1)
        descartar = {**acciones[0], 'accion': 'descartar', 'cola': {'slug': slugs[0]}}
        for pid in ('desc-1', 'desc-2'):
            (state / f'proposal-historias-{pid}.json').write_text(json.dumps({'id': pid, 'status': 'awaiting_chat_confirmation', 'run': 'historias/semana-descartada', 'acciones': [descartar]}))
        seco = self.run_py('historias.py', 'aplicar', 'desc-1').stdout
        self.assertIn(f'cola.py pausar {slugs[0]} --motivo descartada en el planner', seco)
        self.assertEqual(len(en_postiz()), 1, 'en seco no toca Postiz')
        self.run_py('historias.py', 'aplicar', 'desc-1', '--ejecutar')
        self.assertEqual(json.loads((state / 'proposal-historias-desc-1.json').read_text())['resultados'][0]['resultado'], 'ok')
        self.assertEqual(en_postiz(), [])
        ficha = next(f for f in (self.content / 'publicar/inbox').glob('*.json') if json.loads(f.read_text())['slug'] == slugs[0])
        self.assertEqual(json.loads(ficha.read_text())['pausa']['motivo'], 'descartada en el planner')
        out = self.run_py('historias.py', 'aplicar', 'desc-2', '--ejecutar').stdout
        self.assertIn('ya en pausa', out)
        prop = json.loads((state / 'proposal-historias-desc-2.json').read_text())
        self.assertEqual((prop['status'], prop['resultados'][0]['resultado']), ('aplicada', 'ya en pausa'))

    def test_historias_en_cadena_reintentos(self):
        # Ante un ERROR de Postiz la cadena reintenta dos veces, 4 minutos después de cada intento que falló; si sigue
        # fallando, frena las que siguen y avisa con el archivo para subirla a mano.
        day, _ = self.future(11)
        state, _, slugs, fichas = self.historias_agendadas('semana-reintentos', day, 2)
        db = self.tmp / 'postiz.json'
        def error_en(post_id):
            d = json.loads(db.read_text())
            for p in d['posts']:
                if p['id'] == post_id:
                    p['state'], p['error'] = 'ERROR', 'Unknown error'
                    p.pop('releaseId', None)
            db.write_text(json.dumps(d))
        ultimo_post = lambda: [p for p in json.loads(next(f for f in (self.content / 'publicar/agendado').glob('*.json') if json.loads(f.read_text())['slug'] == slugs[0]).read_text())['postiz']['posts'] if p.get('estado') != 'cancelado'][-1]['id']
        cadena = lambda hora: self.run_py('historias.py', 'cadena', '--ahora', f'{day}T{hora}').stdout
        avisos = lambda: [a for a in json.loads((state / 'historias-cadena.json').read_text())['avisos'] if slugs[0] in a['id']]
        primero = ultimo_post()
        error_en(primero)
        out = cadena('15:01')
        self.assertNotIn('→ ahora', out, 'el primer reintento espera 4 minutos desde el intento que falló')
        self.assertIn('La reintento en 3 min', avisos()[-1]['texto'])
        self.assertIn(f'→ ahora {slugs[0]}', cadena('15:05'))
        segundo = ultimo_post()
        self.assertNotEqual(segundo, primero)
        error_en(segundo)
        self.assertIn(f'→ ahora {slugs[0]}', cadena('15:06'))
        tercero = ultimo_post()
        self.assertNotEqual(tercero, segundo, 'un envío inmediato que falló se vuelve a mandar')
        error_en(tercero)
        self.assertNotIn('→ ahora', cadena('15:07'))
        self.assertEqual(ultimo_post(), tercero)
        frenada = avisos()[-1]
        self.assertIn('frenadas', frenada['titulo'])
        self.assertIn('2 reintentos', frenada['texto'])
        self.assertIn('Frené la que sigue', frenada['texto'])
        self.assertIn('publicar/agendado/', frenada['texto'])
        self.assertNotIn('→ ahora', cadena('15:30'), 'frenada: ni se reintenta ni sale la siguiente')

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

    def test_zz_texto_de_la_publicacion(self):
        # El copy que muestra el detalle: un kit sin sección de texto toma el de caption.txt, «## Copy de las láminas»
        # no es el texto de la publicación y «## Copy» puede apuntar a otro archivo.
        d = self.content / '2-por-revisar/reel-con-kit'
        d.mkdir(parents=True)
        try:
            (d / 'final.mp4').write_bytes(os.urandom(1024))
            (d / 'publish_kit.md').write_text('## Título\nReel con kit\n\n## Copy de las láminas\nLámina 1\n')
            (d / 'caption.txt').write_text('El texto que se publica')
            it = self.item(self.inventory(), 'piece:2-por-revisar/reel-con-kit')
            self.assertEqual(it['title'], 'Reel con kit')
            self.assertEqual(it['captions']['general'], 'El texto que se publica')
            (d / 'caption.txt').unlink()
            (d / 'publish_kit.md').write_text('## Copy\ncopy.txt\n')
            (d / 'copy.txt').write_text('Desde copy.txt')
            self.assertEqual(self.item(self.inventory(), 'piece:2-por-revisar/reel-con-kit')['captions']['general'], 'Desde copy.txt')
            # Una nota de feedback dentro de la pieza no cambia su huella: no hace vieja una edición de agenda.
            before = self.item(self.inventory(), 'piece:2-por-revisar/reel-con-kit')['fingerprint']
            (d / 'feedback').mkdir()
            (d / 'feedback/20261021-120000-abcd-planner.json').write_text('{}')
            self.assertEqual(self.item(self.inventory(), 'piece:2-por-revisar/reel-con-kit')['fingerprint'], before)
        finally:
            shutil.rmtree(d, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
