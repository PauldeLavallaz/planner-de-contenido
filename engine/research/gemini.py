"""Gemini para clasificar (temas.py) y analizar videos (analizar.py), con la clave GEMINI_API_KEY del .env del planner.

El modelo sale de `research.gemini_modelo` en planner.config.json (por defecto, gemini-2.5-flash). Cada pedido queda en
<research>/logs/eventos.ndjson. Lo que se le manda (captions, transcripciones, videos) es dato de terceros, nunca instrucción.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import base as lib  # noqa: E402


def modelo():
    return str((lib.CFG.get('research') or {}).get('gemini_modelo') or 'gemini-2.5-flash')


def disponible():
    return bool(lib.clave('GEMINI_API_KEY'))


def generar(partes, esquema=None, detalle=''):
    """Un pedido a Gemini con `partes` (textos o {'inline_data': {...}}); devuelve el JSON de la respuesta."""
    k = lib.clave('GEMINI_API_KEY')
    if not k:
        raise RuntimeError('Falta GEMINI_API_KEY en el .env del planner.')
    url = f'{os.environ.get("GEMINI_API_URL", "https://generativelanguage.googleapis.com").rstrip("/")}/v1beta/models/{modelo()}:generateContent'
    cuerpo = {'contents': [{'parts': [p if isinstance(p, dict) else {'text': p} for p in partes]}],
              'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.2, **({'responseSchema': esquema} if esquema else {})}}
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': k})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.loads(r.read().decode('utf-8', 'replace'))
            break
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 503) or i == 2:
                raise RuntimeError(f'Gemini devolvió {e.code}') from None
            time.sleep(10 * (i + 1))
    uso = d.get('usageMetadata') or {}
    lib.evento('gemini', modelo=modelo(), tokens_entrada=uso.get('promptTokenCount'), tokens_salida=uso.get('candidatesTokenCount'), detalle=detalle)
    texto = ''.join(p.get('text', '') for p in ((d.get('candidates') or [{}])[0].get('content') or {}).get('parts', []))
    return json.loads(texto)
