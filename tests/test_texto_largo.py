"""El chequeo avisa un gancho largo (más de 20 palabras en la primera historia del día) o una historia de más de 47."""
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MOTOR = REPO / 'motor-historias'


def cargar_render():
    spec = importlib.util.spec_from_file_location('render_historias', MOTOR / 'render.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def playwright_ok():
    try:
        import playwright  # noqa: F401
        return True
    except ImportError:
        return False


class AvisosDeTexto(unittest.TestCase):
    def setUp(self):
        self.r = cargar_render()

    def test_gancho_largo(self):
        self.assertTrue(self.r.avisos_de_texto('2026-10-19_1_venta', 21))
        self.assertFalse(self.r.avisos_de_texto('2026-10-19_1_venta', 20))
        self.assertTrue(self.r.avisos_de_texto('historia1_semana', 25))

    def test_historia_larga(self):
        self.assertFalse(self.r.avisos_de_texto('2026-10-19_2_venta', 40))
        self.assertTrue(self.r.avisos_de_texto('2026-10-19_2_venta', 48))
        # el día 21 no es la primera historia: sólo cuenta el tope general
        self.assertFalse(self.r.avisos_de_texto('2026-10-21_3_venta', 30))


@unittest.skipUnless(playwright_ok(), 'necesita playwright')
class ChequeoCuentaPalabras(unittest.TestCase):
    def test_render_avisa_el_gancho_largo(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            fuente = tmp / 'fuente'
            shutil.copytree(MOTOR / 'motor', fuente / 'motor')
            frase = ' '.join(['palabra'] * 25)
            html = fuente / '2026-10-19_1_venta.html'
            html.write_text('<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="motor/historia.css">'
                            '<link rel="stylesheet" href="motor/instagram.css"></head><body><main class="historia lisa negra">'
                            f'<div class="bloque" style="top: 700px"><p class="caja blanca serif parejo" style="font-size: 44px">{frase}</p></div>'
                            '<div data-sin-chequeo class="bloque" style="top: 1200px"><p class="caja">' + ' '.join(['chat'] * 30) + '</p></div>'
                            '</main><script src="motor/historia.js"></script></body></html>')
            r = subprocess.run([sys.executable, str(MOTOR / 'render.py'), str(html), '--salida', str(tmp / 'h'), '--chequeo'],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            problemas = json.loads((tmp / 'h' / '2026-10-19_1_venta.chequeo.json').read_text())['problemas']
            self.assertTrue(any('el gancho tiene 25 palabras' in p for p in problemas), problemas)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
