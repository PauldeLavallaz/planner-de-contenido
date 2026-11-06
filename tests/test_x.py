"""Pruebas de los scripts de Twitter (engine/x/) contra un Postiz simulado y sin red: no tocan ninguna cuenta real.

    python3 -m unittest discover -s tests -v
"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from datetime import date, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
XENG = REPO / 'engine' / 'x'
FAKE = Path(__file__).resolve().parent / 'fake_postiz.py'
MAÑANA = (date.today() + timedelta(days=2)).isoformat()


class Twitter(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-x-'))
        self.x = self.tmp / 'contenido/publicar/x'
        (self.x / 'borradores').mkdir(parents=True)
        bin_dir = self.tmp / 'bin'
        bin_dir.mkdir()
        if os.name == 'nt':
            (bin_dir / 'postiz.cmd').write_text(f'@"{sys.executable}" "{FAKE}" %*\n')
        else:
            (bin_dir / 'postiz').write_text(f'#!/bin/sh\nexec "{sys.executable}" "{FAKE}" "$@"\n')
            (bin_dir / 'postiz').chmod(0o755)
        cfg = json.loads((REPO / 'planner.config.example.json').read_text())
        cfg['content']['root'] = str(self.tmp / 'contenido')
        cfg['channels'] = {'x': {'id': 'x-main', 'type': 'x', 'label': 'X Mi X', 'profile': 'mimarca', 'name': 'Mi X'}}
        (self.tmp / 'planner.config.json').write_text(json.dumps(cfg))
        self.db = self.tmp / 'postiz.json'
        # Sin claves: nada sale a la red aunque el .env del planner tenga alguna.
        self.env = {**os.environ, 'PLANNER_CONFIG': str(self.tmp / 'planner.config.json'), 'FAKE_POSTIZ_DB': str(self.db),
                    'PATH': str(bin_dir) + os.pathsep + os.environ.get('PATH', ''), 'TYPEFULLY_API_KEY': '', 'OPENAI_API_KEY': '', 'X_BEARER_TOKEN': ''}

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_x(self, script, *args, ok=True, entrada=None):
        cp = subprocess.run([sys.executable, str(XENG / script), *args], capture_output=True, text=True, env=self.env, encoding='utf-8', input=entrada)
        if ok and cp.returncode:
            self.fail(f'{script} {args} → {cp.returncode}\n{cp.stdout}\n{cp.stderr}')
        return cp

    def escribir(self, rel, data):
        p = self.x / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data))
        return p

    def leer(self, rel):
        return json.loads((self.x / rel).read_text())

    def tweet(self, tid, handle='alguien', texto='algo'):
        return {'id': tid, 'autor': {'handle': handle, 'nombre': handle.title()}, 'texto': texto, 'fecha': '2026-10-30T10:00:00Z', 'metricas': {'likes': 5}, 'media': []}

    def test_indice_junta_las_bajadas_en_el_orden_de_guardado(self):
        self.escribir('bajadas/bookmarks-20261101.json', {'orden_ids': ['3', '1', '2'], 'items': [self.tweet('3'), self.tweet('1', texto='corto')]})
        largo = 'x' * 300
        self.escribir('bajadas/bookmarks-20261030.json', {'orden_ids': ['1', '2'], 'items': [self.tweet('1', texto=largo), {**self.tweet('2'), 'autor': {}}],
                                                         'fuera_de_ventana_nuevos': []})
        self.run_x('indice.py', '--completar', '0')
        items = self.leer('bookmarks.json')['items']
        self.assertEqual([b['id'] for b in items], ['3', '1', '2'])
        self.assertEqual(items[2]['url'], 'https://x.com/i/status/2', 'sin usuario, el link genérico')
        # Volver a armarlo conserva lo que una bajada más vieja traía mejor y no pierde lo que ya estaba.
        idx = self.leer('bookmarks.json')
        idx['items'][1]['texto'] = largo
        self.escribir('bookmarks.json', idx)
        (self.x / 'bajadas/bookmarks-20261030.json').unlink()
        self.run_x('indice.py', '--completar', '0')
        items = self.leer('bookmarks.json')['items']
        self.assertEqual(next(b for b in items if b['id'] == '1')['texto'], largo, 'gana el texto más largo')
        self.assertIn('2', [b['id'] for b in items], 'lo que ninguna bajada trae se conserva')

    def test_temas_los_decide_claude_y_se_guardan_aparte(self):
        self.escribir('bookmarks.json', {'items': [self.tweet('1'), self.tweet('2')]})
        p = json.loads(self.run_x('temas.py', 'pendientes').stdout)
        self.assertEqual([b['id'] for b in p['bookmarks']], ['1', '2'])
        self.assertTrue(p['temas'], 'la primera vez, los temas de la plantilla')
        cp = self.run_x('temas.py', 'asignar', ok=False, entrada=json.dumps({'1': 'inventado'}))
        self.assertNotEqual(cp.returncode, 0)
        tema = p['temas'][0]['id']
        self.run_x('temas.py', 'asignar', entrada=json.dumps({'1': tema}))
        self.assertEqual(self.leer('temas.json')['asignados'], {'1': tema})
        self.assertEqual([b['id'] for b in json.loads(self.run_x('temas.py', 'pendientes').stdout)['bookmarks']], ['2'])

    def test_aprender_junta_ediciones_y_notas(self):
        self.escribir('borradores/20261101-uno.json', {'tipo': 'post', 'estado': 'borrador', 'partes': [{'texto': 'lo que dejé'}],
                                                       'texto_original': ['lo que escribió Claude'], 'editado_por': 'usuario', 'editado': '2026-11-01T10:00:00Z'})
        self.escribir('feedback/20261101-uno/20261101-100000-aaaa-planner.json', {'text': 'más corto', 'estado': 'pendiente'})
        out = self.run_x('aprender.py', 'pendientes').stdout
        self.assertIn('1 ediciones a mano, 1 notas', out)
        self.assertIn('-lo que escribió Claude', out)
        self.assertIn('+lo que dejé', out)
        self.assertIn('más corto', out)
        self.assertTrue((self.x / 'voz.md').exists(), 'la guía de voz se arma desde la plantilla')
        self.run_x('aprender.py', 'aplicada', '20261101-uno', '20261101-100000-aaaa-planner.json', '--cambio', 'lo acorté')
        self.run_x('aprender.py', 'aprendido', '20261101-uno')
        self.assertEqual(self.leer('feedback/20261101-uno/20261101-100000-aaaa-planner.json')['cambio'], 'lo acorté')
        self.assertIn('No hay nada pendiente', self.run_x('aprender.py', 'pendientes').stdout)
        self.assertNotEqual(self.run_x('aprender.py', 'aplicada', '20261101-uno', '../x.json', ok=False).returncode, 0)

    def test_marcados_sin_borrador_con_lo_que_quiero_decir(self):
        self.escribir('bookmarks.json', {'items': [self.tweet('1', texto='uno'), self.tweet('2', texto='dos')]})
        self.escribir('busquedas/b.json', {'consulta': 'b', 'items': [self.tweet('3', handle='otra', texto='tres')]})
        self.escribir('estado.json', {'bookmarks': {'1': {'estado': 'interesa'}, '2': {'estado': 'interesa'}, '3': {'estado': 'interesa'}}})
        self.escribir('borradores/20261101-dos.json', {'tipo': 'sobre', 'sobre': '2', 'fuentes': [{'id': '2'}], 'partes': [{'texto': 'ya'}]})
        self.escribir('feedback/3/20261101-100000-bbbb-planner.json', {'text': 'decí que sirve', 'estado': 'pendiente'})
        out = self.run_x('aprender.py', 'marcados').stdout
        self.assertIn('sin borrador: 2', out)
        self.assertIn('## 1 · @alguien', out)
        self.assertIn('## 3 · @otra', out)
        self.assertIn('decí que sirve', out)
        self.assertNotIn('## 2 ·', out)

    def aprobado(self, bid, **extra):
        return self.escribir(f'borradores/{bid}.json', {'tipo': 'post', 'estado': 'aprobado', 'fecha': f'{MAÑANA}T10:00', 'partes': [{'texto': 'Un post'}], **extra})

    def test_agendar_por_postiz_registra_el_envio_y_no_duplica(self):
        self.aprobado('20261101-post')
        self.aprobado('20261101-hilo', tipo='hilo', partes=[{'texto': 'Primera'}, {'texto': 'Segunda'}], fecha=f'{MAÑANA}T14:00')
        prueba = json.loads(self.run_x('agendar.py', '--prueba').stdout)
        hilo = next(p for p in prueba if p['id'] == '20261101-hilo')['postiz']
        self.assertEqual([v['content'] for v in hilo['posts'][0]['value']], ['Primera', 'Segunda'], 'un hilo sale como hilo')
        self.assertEqual(hilo['posts'][0]['integration']['id'], 'x-main')
        self.assertFalse(self.db.exists(), '--prueba no toca Postiz')
        out = json.loads(self.run_x('agendar.py').stdout)
        self.assertEqual(sorted(h['id'] for h in out['agendados']), ['20261101-hilo', '20261101-post'])
        b = self.leer('borradores/20261101-post.json')
        self.assertEqual(b['estado'], 'agendado')
        self.assertEqual(b['envio']['estado'], 'agendado')
        self.assertEqual(b['envio']['via'], 'postiz')
        self.assertTrue(b['postiz']['ids'])
        posts = json.loads(self.db.read_text())['posts']
        self.assertEqual(len(posts), 2)
        self.assertEqual(posts[0]['settings']['__type'], 'x')
        # Correrlo otra vez no manda nada: lo agendado ya no es «aprobado».
        self.run_x('agendar.py')
        self.assertEqual(len(json.loads(self.db.read_text())['posts']), 2)

    def test_agendar_frena_links_horarios_vencidos_y_envios_inciertos(self):
        self.aprobado('20261101-link', partes=[{'texto': 'mirá https://ejemplo.com'}])
        self.aprobado('20261101-viejo', fecha='2020-01-01T10:00')
        self.aprobado('20261101-incierto', envio={'via': 'postiz', 'estado': 'incierto', 'para': f'{MAÑANA}T13:00:00.000Z', 'integracion': 'x-main'})
        cp = self.run_x('agendar.py', ok=False)
        self.assertNotEqual(cp.returncode, 0)
        errores = '\n'.join(json.loads(cp.stdout)['errores'])
        self.assertIn('20261101-link: tiene un link', errores)
        self.assertIn('20261101-viejo: el horario', errores)
        self.assertIn('20261101-incierto: hay un envío anterior sin confirmar', errores)
        self.assertFalse(self.db.exists(), 'nada llegó a Postiz')
        # reconciliar: no está en Postiz, así que se puede volver a agendar.
        r = json.loads(self.run_x('agendar.py', 'reconciliar').stdout)
        self.assertEqual(r[0]['id'], '20261101-incierto')
        self.assertEqual(self.leer('borradores/20261101-incierto.json')['envio']['estado'], 'no_llego')
        out = json.loads(self.run_x('agendar.py', '20261101-incierto').stdout)
        self.assertEqual(out['agendados'][0]['id'], '20261101-incierto')

    def test_reconciliar_encuentra_lo_que_si_llego(self):
        self.aprobado('20261101-llego', partes=[{'texto': 'Esto sí llegó a Postiz'}])
        # El post está en Postiz pero la respuesta se perdió: el borrador quedó incierto.
        self.db.write_text(json.dumps({'posts': [{'id': 'p-ya', 'publishDate': f'{MAÑANA}T13:00:00.000Z', 'state': 'QUEUE', 'content': 'Esto sí llegó a Postiz',
                                                  'settings': {}, 'integration': {'id': 'x-main', 'identifier': 'x', 'name': 'Mi X'}}], 'uploads': 0, 'calls': []}))
        b = self.leer('borradores/20261101-llego.json')
        b['envio'] = {'via': 'postiz', 'estado': 'incierto', 'para': f'{MAÑANA}T13:00:00.000Z', 'integracion': 'x-main'}
        self.escribir('borradores/20261101-llego.json', b)
        r = json.loads(self.run_x('agendar.py', 'reconciliar').stdout)
        self.assertEqual(r[0]['postiz'], ['p-ya'])
        b = self.leer('borradores/20261101-llego.json')
        self.assertEqual((b['estado'], b['envio']['estado']), ('agendado', 'agendado'))

    def test_una_cita_sin_typefully_queda_para_publicar_a_mano(self):
        self.aprobado('20261101-cita', tipo='sobre', sobre='99', fuentes=[{'id': '99', 'url': 'https://x.com/otra/status/99'}], partes=[{'texto': 'Esto sí'}])
        prueba = json.loads(self.run_x('agendar.py', '--prueba').stdout)
        self.assertEqual(prueba[0]['typefully']['platforms']['x']['posts'][0]['quote_post_url'], 'https://x.com/otra/status/99')
        out = json.loads(self.run_x('agendar.py').stdout)
        self.assertEqual(out['agendados'], [])
        self.assertIn('x.com/intent/post', out['a_mano'][0]['a_mano'])
        self.assertIn('otra%2Fstatus%2F99', out['a_mano'][0]['a_mano'])
        self.assertEqual(self.leer('borradores/20261101-cita.json')['estado'], 'aprobado', 'sigue aprobado hasta que se publique')
        self.assertFalse(self.db.exists())


if __name__ == '__main__':
    unittest.main()
