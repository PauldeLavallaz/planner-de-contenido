"""Historia con video de fondo y voz en off: fondo_video.py deja los cuadros y render.py saca el MP4 con la voz."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MOTOR = REPO / 'motor-historias'


def tiene(cmd):
    return shutil.which(cmd) is not None


def playwright_ok():
    try:
        import playwright  # noqa: F401
        return True
    except ImportError:
        return False


@unittest.skipUnless(tiene('ffmpeg') and tiene('ffprobe') and playwright_ok(), 'necesita ffmpeg, ffprobe y playwright')
class VideoConVoz(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.fuente = self.tmp / 'fuente'
        shutil.copytree(MOTOR / 'motor', self.fuente / 'motor')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_fondo_video_horizontal_va_entero(self):
        video = self.tmp / 'clip.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=2',
                        '-pix_fmt', 'yuv420p', str(video)], check=True)
        r = subprocess.run([sys.executable, str(MOTOR / 'fondo_video.py'), str(video), '--fuente', str(self.fuente), '--id', 'clip'],
                           capture_output=True, text=True, check=True)
        meta = json.loads(r.stdout.strip().splitlines()[-1])
        self.assertEqual(meta['encuadre'], 'entero')
        self.assertEqual(meta['secuencia'], 'assets/videos/clip/%03d.jpg')
        self.assertEqual(meta['cuadros'], 60)
        self.assertTrue((self.fuente / 'assets/videos/clip/001.jpg').is_file())
        self.assertTrue((self.fuente / 'assets/videos/clip/video.json').is_file())

    def test_render_mezcla_la_voz(self):
        audio = self.fuente / 'assets/audio/voz.wav'
        audio.parent.mkdir(parents=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2', str(audio)], check=True)
        html = self.fuente / 'historia.html'
        html.write_text('<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="motor/historia.css">'
                        '<link rel="stylesheet" href="motor/instagram.css"></head><body>'
                        '<main class="historia lisa negra" data-duracion="1.8">'
                        '<audio class="voz" src="assets/audio/voz.wav" data-inicio="0.2"></audio>'
                        '<div class="bloque" style="top: 860px"><p class="caja blanca serif">Hola</p></div>'
                        '</main><script src="motor/historia.js"></script></body></html>')
        salida = self.tmp / 'historias'
        r = subprocess.run([sys.executable, str(MOTOR / 'render.py'), str(html), '--salida', str(salida)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        mp4 = salida / 'historia.mp4'
        self.assertTrue(mp4.is_file(), 'una historia con voz sale en MP4 sin pedir --video')
        self.assertTrue((salida / 'historia.png').is_file())
        streams = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,color_transfer', '-of', 'csv=p=0', str(mp4)],
                                 capture_output=True, text=True).stdout
        self.assertIn('audio', streams)
        self.assertIn('bt709', streams)
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(mp4)],
                                   capture_output=True, text=True).stdout)
        self.assertAlmostEqual(dur, 1.8, delta=0.15)


if __name__ == '__main__':
    unittest.main()
