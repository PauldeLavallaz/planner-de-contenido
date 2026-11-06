"""Pruebas del motor de LinkedIn contra un Postiz simulado y datos inventados: no toca ninguna cuenta ni API paga.

    python3 -m unittest discover -s tests -v
"""
import importlib.util, json, os, shutil, struct, subprocess, sys, tempfile, unittest, zlib
from datetime import date, datetime, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LI = REPO / 'engine/linkedin'
FAKE = Path(__file__).resolve().parent / 'fake_postiz.py'


def png(path, w=8, h=10):
    """Un PNG chico y válido, para que la cola lo acepte como imagen."""
    raw = b''.join(b'\x00' + b'\x80\x80\x80' * w for _ in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-linkedin-'))
        self.content = self.tmp / 'contenido'
        self.li = self.content / 'publicar/linkedin'
        (self.li / 'borradores').mkdir(parents=True)
        bin_dir = self.tmp / 'bin'
        bin_dir.mkdir()
        # El Postiz de mentira de las pruebas, con una cuenta de LinkedIn sumada.
        fake = self.tmp / 'fake_postiz.py'
        fake.write_text(FAKE.read_text().replace("INTEGRATIONS = [", "INTEGRATIONS = [\n    {'id': 'li-main', 'name': 'Mi LinkedIn', 'identifier': 'linkedin', 'disabled': False, 'profile': 'yo'},", 1))
        if os.name == 'nt':
            (bin_dir / 'postiz.cmd').write_text(f'@"{sys.executable}" "{fake}" %*\n')
        else:
            (bin_dir / 'postiz').write_text(f'#!/bin/sh\nexec "{sys.executable}" "{fake}" "$@"\n')
            (bin_dir / 'postiz').chmod(0o755)
        self.config = self.tmp / 'planner.config.json'
        self.config.write_text(json.dumps({'timezone': 'America/Argentina/Buenos_Aires', 'content': {'root': str(self.content)}, 'publish_root': 'publicar',
                                           'channels': {'linkedin': {'id': 'li-main', 'type': 'linkedin', 'label': 'LinkedIn'}}, 'default_networks': ['linkedin']}))
        self.env = {**os.environ, 'PLANNER_CONFIG': str(self.config), 'FAKE_POSTIZ_DB': str(self.tmp / 'postiz.json'),
                    'PATH': str(bin_dir) + os.pathsep + os.environ.get('PATH', '')}
        for k in ('OPENAI_API_KEY', 'SCRAPECREATORS_API_KEY', 'APIFY_API_TOKEN', 'GEMINI_API_KEY', 'SERPAPI_KEY'):
            self.env.pop(k, None)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_py(self, script, *args, ok=True):
        cp = subprocess.run([sys.executable, str(LI / script), *args], capture_output=True, text=True, env=self.env, encoding='utf-8')
        if ok and cp.returncode:
            self.fail(f'{script} {args} → {cp.returncode}\n{cp.stdout}\n{cp.stderr}')
        return cp

    def borrador(self, bid, **extra):
        f = self.li / 'borradores' / f'{bid}.json'
        f.write_text(json.dumps({'creado': '2026-11-01T22:00:00Z', 'texto': 'Armé un sistema y esto pasó.\n\nSegundo párrafo.', 'estado': 'aprobado', **extra}))
        return f


class Agendar(Base):
    def test_programa_por_la_cola_sin_duplicar_y_con_separacion(self):
        png(self.li / 'imagenes/p1.png')
        f = self.borrador('p1', imagen='publicar/linkedin/imagenes/p1.png')
        dia = (date.today() + timedelta(days=3)).isoformat()
        prueba = self.run_py('agendar.py', 'p1', '--cuando', f'{dia}T09:00', '--prueba')
        self.assertIn('cola.py listo', prueba.stdout)
        self.assertEqual(json.loads(f.read_text())['estado'], 'aprobado', '--prueba does not touch anything')

        self.run_py('agendar.py', 'p1', '--cuando', f'{dia}T09:00')
        b = json.loads(f.read_text())
        self.assertEqual((b['estado'], b['programado'], b['cola_slug']), ('agendado', f'{dia}T09:00', 'linkedin-p1'))
        self.assertEqual(len(b['postiz']['ids']), 1)
        sidecar = next((self.content / 'publicar/agendado').glob('*linkedin-p1.json'))
        meta = json.loads(sidecar.read_text())
        self.assertEqual(meta['captions']['linkedin'], b['texto'])
        self.assertEqual(meta['redes'], ['linkedin'])
        db = json.loads((self.tmp / 'postiz.json').read_text())
        self.assertEqual([p['content'] for p in db['posts']], [b['texto']], 'the post goes out with its text, once')
        self.assertEqual(db['posts'][0]['settings']['__type'], 'linkedin')

        otra = self.run_py('agendar.py', 'p1', '--cuando', f'{dia}T11:00', ok=False)
        self.assertNotEqual(otra.returncode, 0)
        self.assertIn('Ya está en Postiz', otra.stderr)

        png(self.li / 'imagenes/p2.png', 9, 9)
        self.borrador('p2', imagen='publicar/linkedin/imagenes/p2.png', texto='Otro post')
        choca = self.run_py('agendar.py', 'p2', '--cuando', f'{dia}T10:00', ok=False)
        self.assertIn('dejá 2 horas', choca.stderr)
        self.run_py('agendar.py', 'p2', '--cuando', f'{dia}T12:00')
        self.assertEqual(len(json.loads((self.tmp / 'postiz.json').read_text())['posts']), 2)

    def test_lo_que_falta_frena_antes_de_postiz(self):
        f = self.borrador('p3', estado='borrador')
        dia = (date.today() + timedelta(days=3)).isoformat()
        self.assertIn('Primero aprobalo', self.run_py('agendar.py', 'p3', '--cuando', f'{dia}T09:00', ok=False).stderr)
        f.write_text(json.dumps({**json.loads(f.read_text()), 'estado': 'aprobado'}))
        self.assertIn('imagen', self.run_py('agendar.py', 'p3', '--cuando', f'{dia}T09:00', ok=False).stderr)
        self.assertIn('ya pasó', self.run_py('agendar.py', 'p3', '--cuando', '2020-01-01T09:00', ok=False).stderr)
        self.assertFalse((self.tmp / 'postiz.json').exists(), 'nothing reached Postiz')


class Videos(Base):
    def test_contactos_y_recorrido_del_video(self):
        nuevos = self.tmp / 'nuevos.json'
        nuevos.write_text(json.dumps({'contactos': [{'id': 'ana-ejemplo', 'empresa': 'Empresa Ejemplo', 'autor': {'nombre': 'Ana Ejemplo'}}, {'id': 'Malo!', 'empresa': 'X'}]}))
        out = self.run_py('videos.py', 'contactos', 'agregar', str(nuevos))
        self.assertIn('1 contactos sumados', out.stdout)
        self.assertIn('Malo!', out.stderr)
        self.assertEqual([c['id'] for c in json.loads((self.li / 'contactos.json').read_text())['contactos']], ['ana-ejemplo'])

        (self.li / 'estado.json').write_text(json.dumps({'videos': {'ana-ejemplo': {'estado': 'pedido', 'pedido_at': '2026-11-01T10:00:00Z'}}}))
        cola = json.loads(self.run_py('videos.py', 'pendientes').stdout)
        self.assertEqual((cola[0]['id'], cola[0]['tipo'], cola[0]['contacto']['empresa']), ('ana-ejemplo', 'pedido', 'Empresa Ejemplo'))

        self.run_py('videos.py', 'paso', 'ana-ejemplo', 'voz')
        self.assertEqual(json.loads((self.li / 'estado.json').read_text())['videos']['ana-ejemplo']['paso'], 'voz')
        afuera = self.tmp / 'afuera.mp4'
        afuera.write_bytes(b'0' * 100)
        self.assertNotEqual(self.run_py('videos.py', 'listo', 'ana-ejemplo', str(afuera), ok=False).returncode, 0)
        video = self.content / 'videos/ana/final.mp4'
        video.parent.mkdir(parents=True)
        video.write_bytes(b'0' * 100)
        guion = self.tmp / 'guion.txt'
        guion.write_text('Hola Ana')
        self.run_py('videos.py', 'listo', 'ana-ejemplo', str(video), '--guion', str(guion), '--duracion', '41.6')
        v = json.loads((self.li / 'estado.json').read_text())['videos']['ana-ejemplo']
        self.assertEqual((v['estado'], v['archivo'], v['guion'], v['duracion_s']), ('listo', 'videos/ana/final.mp4', 'Hola Ana', 42))
        self.run_py('videos.py', 'error', 'ana-ejemplo', 'se cortó la voz')
        self.assertEqual(json.loads((self.li / 'estado.json').read_text())['videos']['ana-ejemplo']['estado'], 'error')
        self.assertNotEqual(self.run_py('videos.py', 'paso', 'no-existe', 'voz', ok=False).returncode, 0)


class Posts(Base):
    def test_feedback_aprender_y_publicado(self):
        self.borrador('p1', estado='borrador', texto='Texto mío', editado_por='usuario', editado='2026-11-02T10:00:00Z',
                      historial=[{'accion': 'texto', 'antes': 'Texto de Claude'}])
        nota = self.li / 'feedback/p1/20261102-100000-abcd-planner.json'
        nota.parent.mkdir(parents=True)
        nota.write_text(json.dumps({'borrador': 'p1', 'text': 'la imagen más clara', 'estado': 'enviado'}))
        out = self.run_py('posts.py', 'pendientes').stdout
        self.assertIn('1 notas, 1 ediciones a mano', out)
        self.assertIn('la imagen más clara', out)
        self.assertIn('-Texto de Claude', out)
        self.assertIn('+Texto mío', out)
        self.run_py('posts.py', 'aplicada', 'p1', nota.name, '--cambio', 'aclaré el fondo')
        self.assertEqual(json.loads(nota.read_text())['estado'], 'aplicado')
        self.assertNotEqual(self.run_py('posts.py', 'aplicada', 'p1', '../../x.json', ok=False).returncode, 0)
        self.run_py('posts.py', 'aprendido', 'p1')
        self.assertIn('No hay nada pendiente', self.run_py('posts.py', 'pendientes').stdout)

        # Lo que Postiz ya publicó pasa a «publicado», con su link.
        f = self.borrador('p2', estado='agendado', cola_slug='linkedin-p2', fecha='2026-11-03')
        pub = self.content / 'publicar/publicado/2026-11'
        pub.mkdir(parents=True)
        (pub / '2026-11-03_0900_linkedin-p2.json').write_text(json.dumps({'slug': 'linkedin-p2', 'estado': 'publicado', 'publicado_at': '2026-11-03T09:00:00-03:00',
                                                                         'postiz': {'posts': [{'red': 'linkedin', 'estado': 'publicado', 'native_url': 'https://www.linkedin.com/feed/update/urn:li:share:1'}]}}))
        self.run_py('posts.py', 'estado', '--sin-reconciliar')
        b = json.loads(f.read_text())
        self.assertEqual((b['estado'], b['publicado'], b['url']), ('publicado', '2026-11-03', 'https://www.linkedin.com/feed/update/urn:li:share:1'))
        self.assertIn('SCRAPECREATORS_API_KEY', self.run_py('posts.py', 'metricas', ok=False).stderr, 'no key, no paid call')


def cargar_prospectos(config):
    """prospectos.py como módulo, para probar sus funciones sin red. `comun` es el de engine/linkedin aunque otra prueba haya
    cargado otro módulo con ese nombre."""
    os.environ['PLANNER_CONFIG'] = str(config)
    otro = sys.modules.pop('comun', None)
    try:
        spec = importlib.util.spec_from_file_location('prospectos_prueba', LI / 'prospectos.py')
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    finally:
        sys.modules.pop('comun', None)
        if otro is not None:
            sys.modules['comun'] = otro
    return mod


class Prospectos(Base):
    def test_puntaje_filtros_y_fusion(self):
        viejo = os.environ.get('PLANNER_CONFIG')
        try:
            m = cargar_prospectos(self.config)
        finally:
            if viejo is None:
                os.environ.pop('PLANNER_CONFIG', None)
            else:
                os.environ['PLANNER_CONFIG'] = viejo
        hoy = date(2026, 11, 5)
        self.assertEqual(m.tamano_puntos('51-200 employees'), 3)
        self.assertEqual(m.tamano_puntos('De 2 a 10 empleados'), 0)
        self.assertIsNone(m.tamano_puntos(None))
        self.assertEqual(m.descartar({'empresa': 'Agencia Creativa Ejemplo', 'avisos': []}), 'agencia, RRHH u organismo público')
        self.assertEqual(m.descartar({'empresa': 'Importante empresa del sector', 'avisos': []}), 'empresa confidencial')
        self.assertIsNone(m.descartar({'empresa': 'Panadería Ejemplo', 'tamano': '51-200', 'avisos': [{'puesto': 'Community Manager'}]}))
        h = m.huecos([hoy - timedelta(days=d) for d in (40, 5)], hoy)
        self.assertEqual((h['dias_sin_publicar'], h['posts_90'], h['hueco_mas_largo']), (5, 2, 35))
        h = m.huecos([hoy - timedelta(days=d) for d in (120, 5)], hoy)
        self.assertEqual((h['posts_90'], h['hueco_mas_largo']), (1, 85), 'with an older post, the gap starts at day 90')

        item = {'id': 123, 'content': 'Busco agencia que use IA', 'author': {'name': 'Ana Ejemplo', 'linkedinUrl': 'https://www.linkedin.com/in/ana?x=1'},
                'postedAt': {'date': '2026-11-04T10:00:00Z'}, 'engagement': {'likes': 3, 'comments': 25}}
        p = m.prospecto_de_posteo(item, {'tipo': 'pide_ia', 'pais': 'AR', 'quien': 'Empresa Ejemplo', 'que_pide': 'contenido con IA'}, hoy, {'ar'})
        self.assertEqual((p['id'], p['puntaje'], p['nivel'], p['autor']['url']), ('post-123', 14, 'A', 'https://www.linkedin.com/in/ana'))
        self.assertIn('ya tiene 25 comentarios: llegar rápido', p['por_que'])

        preferidos = m.rubro_si({'rubros_preferidos': 'panader'})
        e = {'id': 'panaderia-ejemplo', 'empresa': 'Panadería Ejemplo', 'rubro': 'Panadería', 'tamano': '51-200', 'avisos': [{'puesto': 'CM', 'link': 'l1'}, {'puesto': 'Editor', 'link': 'l2'}],
             'conteo': {'dias_sin_publicar': 30}}
        puntos, por_que = m.puntuar(dict(e), preferidos)
        self.assertEqual(puntos, 3 + 3 + 2 + 1 + 2)
        anterior = {'decidido': {'id': 'decidido', 'empresa': 'Decidido', 'puntaje': 5, 'ultima_vez': '2026-01-01'},
                    'viejo': {'id': 'viejo', 'empresa': 'Viejo', 'puntaje': 5, 'ultima_vez': '2026-09-01'},
                    'reciente': {'id': 'reciente', 'empresa': 'Reciente', 'puntaje': 5, 'ultima_vez': '2026-11-01'},
                    'evaluado': {'id': 'evaluado', 'empresa': 'Evaluado', 'puntaje': 5, 'ultima_vez': '2026-11-04'}}
        lista, descartes = m.fusionar(anterior, {p['id']: p}, {'panaderia-ejemplo': e, 'agencia-x': {'id': 'agencia-x', 'empresa': 'Agencia X', 'avisos': []}},
                                      {'evaluado', 'panaderia-ejemplo', 'agencia-x'}, {'decidido': {'estado': 'descartado'}}, hoy, preferidos)
        ids = [x['id'] for x in lista]
        self.assertEqual(ids[0], 'post-123')
        self.assertIn('decidido', ids, 'what you decided on stays')
        self.assertIn('reciente', ids, 'what did not show up stays 30 days')
        self.assertNotIn('viejo', ids)
        self.assertNotIn('evaluado', ids, 'what was evaluated again and did not pass goes away')
        self.assertEqual(descartes[0]['empresa'], 'Agencia X')

    def test_sin_claves_no_gasta_y_deja_la_lista(self):
        (self.li / 'busquedas.json').write_text(json.dumps({'oferta': 'Contenido', 'firma': 'Yo', 'paises': ['ar'], 'posteos': ['"busco agencia"'],
                                                           'google_jobs': [], 'computrabajo': [], 'getonbrd': []}))
        out = self.run_py('prospectos.py', '--sin-textos')
        self.assertIn('0 prospectos', out.stdout)
        self.assertIn('APIFY_API_TOKEN', out.stderr)
        d = json.loads((self.li / 'prospectos.json').read_text())
        self.assertEqual((d['prospectos'], d['paises']), ([], ['ar']))
        self.assertFalse((self.li / 'logs/gastos.ndjson').exists(), 'nothing was paid')


try:
    import playwright  # noqa: F401
    HAY_PLAYWRIGHT = True
except ImportError:
    HAY_PLAYWRIGHT = False


class Lamina(Base):
    @unittest.skipUnless(HAY_PLAYWRIGHT, 'Playwright no está instalado')
    def test_lamina_1080x1350_y_ruta_en_el_borrador(self):
        f = self.borrador('p1', estado='borrador')
        cuerpo = self.tmp / 'cuerpo.html'
        cuerpo.write_text('<h1>Tres cosas que<br>aprendí <em>publicando</em></h1><ol><li><i>01</i><b>Publicar</b><span>seguido</span></li>'
                          '<li class="clave"><i>02</i><b>Medir</b><span class="barra" style="--v:40%"></span></li></ol><div class="pie"><span>Pie</span></div>')
        self.run_py('lamina.py', 'p1', str(cuerpo))
        img = self.li / 'imagenes/p1.png'
        ancho, alto = struct.unpack('>II', img.read_bytes()[16:24])
        self.assertEqual((ancho, alto), (1080, 1350))
        self.assertEqual(json.loads(f.read_text())['imagen'], 'publicar/linkedin/imagenes/p1.png')


if __name__ == '__main__':
    unittest.main()
