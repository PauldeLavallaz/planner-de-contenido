"""Avisos por Telegram que encola el motor: el álbum de historias para TikTok y los de la cadena. No manda nada: eso lo
hace el servidor del planner (app/src/avisos.ts, con su propia prueba).

    python3 -m unittest discover -s tests -v
"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from datetime import date, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


class AvisosTelegram(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-avisos-'))
        self.content = self.tmp / 'contenido'
        hist = self.content / 'historias/semana/historias'
        hist.mkdir(parents=True)
        for n in (1, 2, 3):
            (hist / f'h{n}.png').write_bytes(os.urandom(64))
        (hist / 'h3.mp4').write_bytes(os.urandom(64))
        self.pend = self.content / 'publicar/.planner/avisos/pendientes'

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def correr(self, codigo, telegram):
        cfg = json.loads((REPO / 'planner.config.example.json').read_text())
        cfg['content']['root'] = str(self.content)
        cfg['telegram'] = telegram
        (self.tmp / 'planner.config.json').write_text(json.dumps(cfg))
        cp = subprocess.run([sys.executable, '-c', 'import sys; sys.path.insert(0, sys.argv[1]); ' + codigo, str(REPO / 'engine')],
                            capture_output=True, text=True, env={**os.environ, 'PLANNER_CONFIG': str(self.tmp / 'planner.config.json')})
        self.assertEqual(cp.returncode, 0, cp.stderr)
        return cp.stdout

    def propuesta(self, dias):
        acciones = []
        for d in dias:
            for n in (1, 2, 3):
                acciones.append({'accion': d.get('accion', 'agendar'), 'fecha': d['fecha'], 'orden': n, 'cuenta': 'micuenta',
                                 'imagen': f'historias/semana/historias/h{n}.png', 'video': 'historias/semana/historias/h3.mp4' if n == 3 else None})
        return {'id': 'p1', 'alcance': 'todo_lo_pendiente', 'desde': date.today().isoformat(), 'acciones': acciones,
                'dias': [{'fecha': d['fecha'], 'cuenta': 'micuenta', 'publicar': d.get('publicar', 'postiz'), 'hora': '14:00'} for d in dias]}

    def test_un_album_por_dia_que_sale_por_postiz(self):
        manana, pasado = (date.today() + timedelta(days=1)).isoformat(), (date.today() + timedelta(days=2)).isoformat()
        prop = self.propuesta([{'fecha': manana}, {'fecha': pasado, 'publicar': 'no', 'accion': 'nada'}])
        # Un aviso viejo de un día que ya no va por Postiz se saca.
        self.pend.mkdir(parents=True)
        (self.pend / f'historias-tiktok-micuenta-{pasado}.json').write_text(json.dumps({'id': 'x', 'slot': pasado + 'T14:00:00-03:00'}))
        out = self.correr(f'import historias, json; historias.avisos_tiktok(json.loads({json.dumps(json.dumps(prop))}), True)', {'chat_id': '1', 'historias_tiktok': True})
        self.assertIn('3 historias a las 14:00', out)
        self.assertFalse((self.pend / f'historias-tiktok-micuenta-{pasado}.json').exists())
        av = json.loads((self.pend / f'historias-tiktok-micuenta-{manana}.json').read_text())
        self.assertEqual(av['partes'][1][3]['archivos'], ['historias/semana/historias/h1.png', 'historias/semana/historias/h2.png', 'historias/semana/historias/h3.mp4'])
        self.assertIn('La 3 es un video', av['partes'][0][1])
        self.assertTrue(av['enviar_utc'].endswith('Z'))
        # Aplicarla de nuevo lo rehace; si ya empezó a salir, no lo toca.
        av['mensajes_enviados'] = [{'parte': 'aviso'}]
        (self.pend / f'historias-tiktok-micuenta-{manana}.json').write_text(json.dumps(av))
        out = self.correr(f'import historias, json; historias.avisos_tiktok(json.loads({json.dumps(json.dumps(prop))}), True)', {'chat_id': '1', 'historias_tiktok': True})
        self.assertIn('está saliendo, no lo toco', out)

    def test_apagado_no_encola(self):
        prop = self.propuesta([{'fecha': (date.today() + timedelta(days=1)).isoformat()}])
        self.correr(f'import historias, json; historias.avisos_tiktok(json.loads({json.dumps(json.dumps(prop))}), True)', {'chat_id': '1'})
        out = self.correr(f'import historias, json; historias.avisos_tiktok(json.loads({json.dumps(json.dumps(prop))}), True)', {'historias_tiktok': True})
        self.assertIn('falta telegram.chat_id', out)
        self.assertFalse(self.pend.exists() and any(self.pend.iterdir()))

    def test_los_avisos_de_la_cadena_tambien_van_por_telegram(self):
        archivo = self.content / 'historias/semana/historias/h1.png'
        self.correr(f'import historias; historias.avisar("cadena-x-frenada", "Historias frenadas", "Volvió a fallar", False, archivo={str(archivo)!r}); '
                    'historias.avisar("cadena-x-frenada", "Historias frenadas", "Otra vez", False)', {'chat_id': '1'})
        av = json.loads((self.pend / 'cadena-x-frenada.json').read_text())
        self.assertEqual(av['partes'][0][3], {'archivo': 'historias/semana/historias/h1.png'})
        self.assertIn('Volvió a fallar', av['partes'][0][1], 'one per id: the second one does not replace it')
        self.correr('import historias; historias.avisar("cadena-y", "T", "Sin Telegram", False)', {'chat_id': '1', 'avisos_cadena': False})
        self.assertFalse((self.pend / 'cadena-y.json').exists())


if __name__ == '__main__':
    unittest.main()
