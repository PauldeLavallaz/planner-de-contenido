"""El copy de TikTok por Telegram cuando el borrador llega a la bandeja (cuenta de TikTok en modo inbox).

    python3 -m unittest discover -s tests -v
"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPT = r'''
import json, sys
sys.path.insert(0, sys.argv[1])
import cola, avisos
print(json.dumps({"vigentes": [a["id"] for a in cola.sync_avisos()], "pendientes": sorted(a["id"] for _, a in avisos.pendientes())}))
'''


class AvisoCopyTiktok(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='planner-aviso-tk-'))
        content = self.tmp / 'contenido'
        self.agendado = content / 'publicar/agendado'
        self.agendado.mkdir(parents=True)
        (content / 'publicar/inbox').mkdir(parents=True)
        config = json.loads((REPO / 'planner.config.example.json').read_text())
        config['content']['root'] = str(content)
        config['channels'] = {'tiktok': {'id': 'tk', 'label': 'TikTok', 'mode': 'inbox', 'type': 'tiktok'}, 'instagram': {'id': 'ig', 'label': 'Instagram'}}
        config['telegram'] = {'chat_id': '123', 'tiktok_copy': True}
        self.cfg = self.tmp / 'planner.config.json'
        self.cfg.write_text(json.dumps(config))
        self.pieza('reel-a', [{'red': 'tiktok', 'id': 'post-1', 'date_utc': '2030-01-10T21:00:00Z', 'type': 'schedule'}])
        self.pieza('reel-b', [{'red': 'instagram', 'id': 'post-2', 'date_utc': '2030-01-11T21:00:00Z', 'type': 'schedule'}], redes=['instagram'])

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def pieza(self, slug, posts, redes=('tiktok',)):
        (self.agendado / f'{slug}.mp4').write_bytes(b'0' * 64)
        (self.agendado / f'{slug}.json').write_text(json.dumps({'slug': slug, 'titulo': slug.upper(), 'formato': 'reel', 'redes': list(redes),
            'captions': {'general': f'Copy de {slug}'}, 'estado': 'agendado', 'slot': {'fecha': '2030-01-10'}, 'postiz': {'posts': posts}}))

    def sync(self):
        cp = subprocess.run([sys.executable, '-c', SCRIPT, str(REPO / 'engine')], capture_output=True, text=True,
                            env={**os.environ, 'PLANNER_CONFIG': str(self.cfg)}, encoding='utf-8')
        self.assertEqual(cp.returncode, 0, cp.stderr)
        return json.loads(cp.stdout)

    def test_encola_el_copy_y_lo_saca_si_la_pieza_se_mueve(self):
        r = self.sync()
        self.assertEqual(r['vigentes'], ['tiktok-copy-reel-a__post-1'], 'only the TikTok inbox piece')
        av = json.loads((self.tmp / 'contenido/publicar/.planner/avisos/pendientes/tiktok-copy-reel-a__post-1.json').read_text())
        self.assertEqual(av['enviar_utc'], '2030-01-10T21:02:00Z', 'when the draft reaches the inbox, plus the default delay')
        self.assertEqual(av['partes'][1][1], 'Copy de reel-a')
        # Movida: Postiz recrea el post con otro id. El aviso viejo sale y entra el nuevo.
        self.pieza('reel-a', [{'red': 'tiktok', 'id': 'post-9', 'date_utc': '2030-01-12T21:00:00Z', 'type': 'schedule'}])
        self.assertEqual(self.sync()['pendientes'], ['tiktok-copy-reel-a__post-9'])

    def test_apagado_no_encola_nada(self):
        cfg = json.loads(self.cfg.read_text()); cfg['telegram']['tiktok_copy'] = False
        self.cfg.write_text(json.dumps(cfg))
        self.assertEqual(self.sync(), {'vigentes': [], 'pendientes': []})


if __name__ == '__main__':
    unittest.main()
