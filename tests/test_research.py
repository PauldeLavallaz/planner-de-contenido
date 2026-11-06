"""Pruebas del motor de research (engine/research) contra ScrapeCreators, Gemini y Postiz simulados: ninguna API paga.

    python3 -m unittest discover -s tests -v
"""
import json, os, sqlite3, subprocess, sys, tempfile, threading, time, unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

REPO = Path(__file__).resolve().parent.parent
RESEARCH = REPO / 'engine' / 'research'
JPEG = bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffdb004300') + b'\x08' * 64 + bytes.fromhex('ffd9')


def ts(dias):
    return int((datetime.now(timezone.utc) - timedelta(days=dias)).timestamp())


class Falso(BaseHTTPRequestHandler):
    """ScrapeCreators y Gemini de mentira. Cuenta los pedidos para verificar que lo ya bajado no se vuelve a pedir."""
    pedidos = []

    def log_message(self, *a):
        pass

    def _json(self, d):
        b = json.dumps(d).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        Falso.pedidos.append(u.path)
        base = f'http://127.0.0.1:{self.server.server_port}'
        if u.path == '/img.jpg':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(JPEG)
            return
        if u.path == '/video.mp4':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 200)
            return
        if u.path == '/v1/instagram/profile':
            return self._json({'data': {'user': {'full_name': 'Cuenta Ejemplo', 'biography': 'bio', 'edge_followed_by': {'count': 50000}, 'edge_owner_to_timeline_media': {'count': 300}}}})
        if u.path == '/v1/instagram/user/reels':
            # cuatro reels normales (mil vistas) y uno que vuela (veinte mil)
            items = [{'media': {'code': f'NORMAL{i}', 'media_type': 2, 'play_count': 1000, 'like_count': 50, 'comment_count': 3, 'taken_at': ts(3 + i),
                                'caption': {'text': f'Tutorial de una herramienta {i}'}, 'display_uri': base + '/img.jpg'}} for i in range(4)]
            items.append({'media': {'code': 'VIRAL1', 'media_type': 2, 'play_count': 20000, 'like_count': 900, 'comment_count': 40, 'taken_at': ts(2),
                                    'caption': {'text': 'El error que nadie te dice al vender'}, 'display_uri': base + '/img.jpg'}})
            return self._json({'items': items, 'credits_charged': 1})
        if u.path == '/v2/instagram/user/posts':
            return self._json({'items': [{'code': 'CARRU1', 'media_type': 8, 'carousel_media_count': 6, 'like_count': 400, 'comment_count': 9, 'taken_at': ts(4),
                                          'caption': {'text': 'Cinco tips, guardalo'}, 'display_uri': base + '/img.jpg'}], 'credits_charged': 1})
        if u.path == '/v1/instagram/post':
            return self._json({'data': {'xdt_shortcode_media': {'__typename': 'XDTGraphVideo', 'shortcode': 'SUELTO1', 'owner': {'username': 'otracuenta'},
                               'video_play_count': 7000, 'edge_media_preview_like': {'count': 300}, 'taken_at_timestamp': ts(1), 'video_url': base + '/video.mp4',
                               'display_url': base + '/img.jpg', 'edge_media_to_caption': {'edges': [{'node': {'text': 'Un caso con resultados'}}]}}}, 'credits_charged': 1})
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        largo = int(self.headers.get('Content-Length') or 0)
        cuerpo = json.loads(self.rfile.read(largo) or b'{}')
        Falso.pedidos.append(urlparse(self.path).path)
        partes = cuerpo['contents'][0]['parts']
        texto = partes[-1].get('text', '') if 'Contenidos:' in partes[-1].get('text', '') else ''
        if texto:  # clasificar: todo como tutorial a cámara del anillo 2
            n = texto.count('\n') + 1
            res = [{'i': i, 'tema': 'tutorial', 'formato': 'talking-head', 'anillo': 2} for i in range(n)]
        else:      # analizar
            res = {'hook': {'texto': 'Nadie te dice esto', 'visual': 'Primer plano', 'tipo': 'contraste'},
                   'analisis': {'idea': 'Un caso con números', 'por_que': 'Promete un resultado', 'transcripcion': 'Nadie te dice esto…'}}
        self._json({'candidates': [{'content': {'parts': [{'text': json.dumps(res)}]}}], 'usageMetadata': {'promptTokenCount': 10, 'candidatesTokenCount': 5}})


class Research(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(('127.0.0.1', 0), Falso)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.srv.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-research-'))
        self.content = self.tmp / 'contenido'
        self.content.mkdir()
        cfg = json.loads((REPO / 'planner.config.example.json').read_text())
        cfg['content']['root'] = str(self.content)
        cfg['brands'] = ['Mi Marca', 'Otra Marca']
        cfg['channels'] = {'instagram': {'id': 'ig-main', 'label': 'Instagram', 'profile': 'mimarca'}, 'tiktok': {'id': 'tt-main', 'label': 'TikTok', 'profile': 'mimarca'}}
        self.config = self.tmp / 'planner.config.json'
        self.config.write_text(json.dumps(cfg))
        self.bin = self.tmp / 'bin'
        self.bin.mkdir()
        self.env = {**os.environ, 'PLANNER_CONFIG': str(self.config), 'SCRAPECREATORS_API_URL': self.url, 'SCRAPECREATORS_API_KEY': 'falsa',
                    'GEMINI_API_URL': self.url, 'GEMINI_API_KEY': 'falsa', 'PATH': str(self.bin) + os.pathsep + os.environ.get('PATH', '')}
        Falso.pedidos = []

    def run_py(self, script, *args, ok=True, env=None):
        cp = subprocess.run([sys.executable, str(RESEARCH / script), *args], capture_output=True, text=True, env=env or self.env, encoding='utf-8')
        if ok and cp.returncode:
            self.fail(f'{script} {args} → {cp.returncode}\n{cp.stdout}\n{cp.stderr}')
        return cp

    def db(self):
        con = sqlite3.connect(self.content / 'research' / 'radar.db')
        con.row_factory = sqlite3.Row
        return con

    def test_agregar_medir_y_outliers(self):
        out = self.run_py('competidores.py', 'agregar', 'https://www.instagram.com/cuentaejemplo/', '--marca', 'Mi Marca', '--tag', 'reels-explicativos').stdout
        self.assertIn('cuentaejemplo', out)
        con = self.db()
        acc = con.execute('select * from radar_accounts').fetchone()
        self.assertEqual(json.loads(acc['tags']), ['reels-explicativos', 'marca-mi-marca'])
        lb = con.execute("select views_mediana from competidores_lineas_base where formato='reel'").fetchone()
        self.assertEqual(lb['views_mediana'], 1000)
        viral = con.execute("select m.x_mediana, m.x_sobre from competidores_contenidos c join competidores_contenido_mediciones m on m.contenido_id=c.id where c.url like '%VIRAL1'").fetchone()
        self.assertEqual((viral['x_mediana'], viral['x_sobre']), (20.0, 'views'))
        self.assertIsNotNone(con.execute('select alcance from competidores_alcance').fetchone()['alcance'])
        self.assertTrue((self.content / 'research/portadas/instagram-VIRAL1.jpg').exists(), 'the outlier cover is downloaded for the planner')
        self.assertIn('VIRAL1', self.run_py('competidores.py', 'outliers', '--min-x', '3').stdout)
        # Ficha y similarity: la relevancia queda pesada por el alcance.
        self.run_py('competidores.py', 'ficha', '@cuentaejemplo', '--red', 'instagram', '--rol', 'competidor_directo', '--anillo', '2', '--sim-oferta', '8', '--sim-contenido', '6')
        r = con.execute('select c.similarity, x.relevancia from competidores_catalogo c join competidores_alcance x on x.account_id=c.account_id').fetchone()
        self.assertEqual(r['similarity'], 70)
        self.assertTrue(0 < r['relevancia'] <= 70)
        self.run_py('competidores.py', 'marcas', '@cuentaejemplo', '--red', 'instagram')
        self.assertEqual(json.loads(con.execute('select tags from radar_accounts').fetchone()['tags']), ['reels-explicativos'], 'without --marca it belongs to every brand')
        self.assertNotEqual(self.run_py('competidores.py', 'marcas', '@cuentaejemplo', '--red', 'instagram', '--marca', 'Inventada', ok=False).returncode, 0)

    def test_sin_clave_no_mide_y_no_falla(self):
        env = {**self.env, 'SCRAPECREATORS_API_KEY': ''}
        out = self.run_py('competidores.py', 'agregar', '@alguien', '--red', 'tiktok', env=env).stdout
        self.assertIn('Sin SCRAPECREATORS_API_KEY', out)
        self.assertEqual(Falso.pedidos, [], 'nothing is requested without a key')

    def test_link_suelto_es_tuyo_y_no_se_cobra_dos_veces(self):
        self.run_py('competidores.py', 'agregar', 'https://www.instagram.com/reel/SUELTO1/', '--sin-medir')
        self.run_py('competidores.py', 'agregar', 'https://www.instagram.com/p/SUELTO1/', '--sin-medir')
        self.assertEqual(Falso.pedidos.count('/v1/instagram/post'), 1)
        con = self.db()
        c = con.execute('select origen, account_id from competidores_contenidos').fetchone()
        self.assertTrue(c['origen'])
        self.assertEqual(c['account_id'], 'instagram:otracuenta')

    def test_semana_temas_y_analisis(self):
        self.run_py('competidores.py', 'agregar', 'https://www.instagram.com/cuentaejemplo/')
        lunes = (datetime.now().date() - timedelta(days=datetime.now().weekday())).isoformat()
        out = self.run_py('semana.py', 'armar', '--marca', 'Mi Marca', '--min-x', '3').stdout
        f = self.content / 'referencias' / lunes / 'mi-marca' / 'referencias.json'
        doc = json.loads(f.read_text())
        self.assertEqual(doc['marca'], 'Mi Marca')
        self.assertEqual([r['id'] for r in doc['referencias']], ['ig:VIRAL1'], out)
        self.assertEqual(doc['referencias'][0]['media']['poster'], 'research/portadas/instagram-VIRAL1.jpg')
        doc['referencias'][0]['hook']['texto'] = 'Ya analizado'
        f.write_text(json.dumps(doc))
        self.run_py('semana.py', 'armar', '--marca', 'Mi Marca')
        self.assertEqual(json.loads(f.read_text())['referencias'][0]['hook']['texto'], 'Ya analizado', 'a second run keeps what Claude wrote')
        self.assertEqual(self.run_py('semana.py', 'validar', str(f)).returncode, 0)
        # Temas: por palabras, sin IA, y con Gemini.
        self.run_py('temas.py', 'clasificar', '--sin-ia')
        con = self.db()
        clase = con.execute("select * from contenido_clase where id='ig:VIRAL1'").fetchone()
        self.assertEqual((clase['fuente'], clase['tema']), ('palabras', 'opinion'))
        self.run_py('temas.py', 'clasificar', '--todas', '--referencias')
        self.assertEqual(con.execute("select fuente, tema, anillo from contenido_clase where id='ig:VIRAL1'").fetchone()[:], ('gemini', 'tutorial', 2))
        # Análisis de lo elegido: la cola del planner, ScrapeCreators y Gemini de mentira.
        state = self.content / 'publicar' / '.planner'
        state.mkdir(parents=True)
        (state / 'referencias-analizar.json').write_text(json.dumps({'pendientes': [{'id': 'ig:SUELTO1', 'url': 'https://www.instagram.com/p/SUELTO1/'}]}))
        self.run_py('analizar.py', '--cola')
        a = json.loads((self.content / 'research/analizadas/ig_SUELTO1.json').read_text())
        self.assertEqual(a['hook']['texto'], 'Nadie te dice esto')
        self.assertEqual(a['media']['video'], 'research/analizadas/media/ig_SUELTO1.mp4')
        self.assertEqual(json.loads((state / 'referencias-analizar.json').read_text())['pendientes'], [])

    def test_metricas_postiz_csv_y_videos(self):
        publicado = self.content / 'publicar' / 'publicado' / '2026-10'
        publicado.mkdir(parents=True)
        hace = lambda d: (datetime.now(timezone.utc) - timedelta(days=d)).isoformat()  # noqa: E731
        for i, (dias, vistas) in enumerate([(30, 1000), (25, 1200), (20, 800), (15, 1000), (10, 5000)]):
            (publicado / f'pieza-{i}.json').write_text(json.dumps({'slug': f'pieza-{i}', 'titulo': f'Pieza {i}', 'formato': 'reel', 'redes': ['instagram', 'tiktok'],
                'cuentas': {'instagram': 'ig-main', 'tiktok': 'tt-main'}, 'captions': {'general': 'Copy'},
                'postiz': {'posts': [{'id': f'ig{i}', 'red': 'instagram', 'date_utc': hace(dias)}, {'id': f'tt{i}', 'red': 'tiktok', 'date_utc': hace(dias)}]}}))
        vistas = {f'ig{i}': v for i, v in enumerate([1000, 1200, 800, 1000, 5000])} | {f'tt{i}': v * 2 for i, v in enumerate([1000, 1200, 800, 1000, 5000])}
        (self.bin / 'postiz').write_text(f'''#!{sys.executable}
import json, sys
v = {json.dumps(vistas)}
a = sys.argv[1:]
if a[0] == 'analytics:post': print(json.dumps([{{"label": "Views", "data": [{{"total": str(v[a[1]]), "date": "2026-11-01"}}]}}, {{"label": "Likes", "data": [{{"total": "10", "date": "2026-11-01"}}]}}]))
elif a[0] == 'analytics:platform': print(json.dumps([{{"label": "Followers", "data": [{{"total": "900", "date": "2026-11-01"}}, {{"total": "950", "date": "2026-11-02"}}]}}]))
''')
        (self.bin / 'postiz').chmod(0o755)
        out = self.run_py('metricas.py', 'postiz').stdout
        self.assertIn('10 publicaciones, 10 con números', out)
        con = self.db()
        self.assertEqual(con.execute("select vistas from propias_metricas where id='postiz:ig4'").fetchone()[0], 5000)
        self.assertEqual(con.execute("select count(*) from propias_seguidores where cuenta='mimarca'").fetchone()[0], 4)
        csvf = self.tmp / 'export.csv'
        csvf.write_text('Link,Views,Likes,Saves\nhttps://www.instagram.com/p/EXTRA1/,3.000,40,12\n')
        self.run_py('metricas.py', 'importar', str(csvf), '--red', 'instagram', '--cuenta', 'mimarca')
        self.assertEqual(con.execute("select vistas, guardados from propias_metricas where id='ext:ig:EXTRA1'").fetchone()[:], (3000.0, 12.0))
        self.run_py('metricas.py', 'videos')
        v = con.execute("select * from propias_videos where id='v:pieza-4'").fetchone()
        self.assertEqual(json.loads(v['redes']), ['instagram', 'tiktok'])
        self.assertAlmostEqual(v['x_instagram'], 5.0, places=2)
        self.assertAlmostEqual(v['balance'], 5.0, places=2, msg='same x in both networks, equal weights')
        self.assertEqual(v['run'], 'pieza-4')


if __name__ == '__main__':
    unittest.main()
