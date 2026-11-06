#!/usr/bin/env python3
"""Avisos por Telegram: la cola que manda el servidor del planner (app/src/avisos.ts).

Hoy encola engine/historias.py:
- `aplicar`, con `telegram.historias_tiktok`: cada día que sale por Postiz llega todo junto, en un álbum, a la hora de la
  primera historia, para subirlas a mano a TikTok (Postiz no publica historias en TikTok: sus integraciones de TikTok
  sólo suben al feed).
- `cadena`: los avisos de la publicación en cadena (un error, una demora, las historias frenadas), además de verse
  arriba de la pestaña Historias. Si hay que subir una historia a mano, va con su archivo. Se apagan con
  `telegram.avisos_cadena: false`.

Cada aviso es un JSON en <publicar>/.planner/avisos/pendientes/<id>.json con `enviar_utc` (desde cuándo sale), `titulo`
y `partes`: cada parte es `[nombre, texto, silencioso, {"archivo": ruta} | {"archivos": [rutas]}]`, con las rutas
relativas a la carpeta de contenido. El servidor del planner revisa la carpeta cada minuto, manda lo vencido con el bot
de `TELEGRAM_BOT_TOKEN` (en .env) al chat de `telegram.chat_id` (en planner.config.json), anota cada parte que salió para
no repetirla si algo falla a mitad, y pasa el aviso a enviados/. Un aviso por id.

  python3 engine/avisos.py estado     lo pendiente y lo último enviado
"""
import argparse, json, sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CFG, STATE, file_lock, tz

DIR = STATE / 'avisos'
PEND, ENVIADOS = DIR / 'pendientes', DIR / 'enviados'


def cfg():
    return CFG.get('telegram') or {}


def configurado():
    """Hay un chat al que mandar (el token lo lee el servidor de .env)."""
    return bool(str(cfg().get('chat_id') or '').strip())


def utc_iso(d):
    return d.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def leer(f):
    try:
        return json.loads(Path(f).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def existe(aid):
    return (PEND / f'{aid}.json').exists() or (ENVIADOS / f'{aid}.json').exists()


def empezado(aid):
    """Ya salió alguna parte: el aviso está saliendo y no se toca."""
    return bool(leer(PEND / f'{aid}.json').get('mensajes_enviados'))


def encolar(av, rehacer=False):
    """Guarda un aviso pendiente. Sin `rehacer`, uno por id: si ya está pendiente o enviado, no hace nada. Con `rehacer`,
    reemplaza el pendiente salvo que ya haya empezado a salir. Devuelve True si quedó escrito."""
    aid = av['id']
    with file_lock(DIR / '.lock'):
        if (existe(aid) and not rehacer) or empezado(aid):
            return False
        PEND.mkdir(parents=True, exist_ok=True)
        f = PEND / f'{aid}.json'
        tmp = f.with_suffix('.tmp')
        tmp.write_text(json.dumps({'tz': str(tz()), **av}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        tmp.replace(f)
    return True


def quitar(aid):
    """Saca un aviso pendiente que todavía no empezó a salir. Devuelve True si lo sacó."""
    with file_lock(DIR / '.lock'):
        f = PEND / f'{aid}.json'
        if not f.exists() or leer(f).get('mensajes_enviados'):
            return False
        f.unlink()
    return True


def pendientes(prefijo=''):
    return [(f, leer(f)) for f in sorted(PEND.glob(f'{prefijo}*.json'))] if PEND.is_dir() else []


def estado():
    ver = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(tz()).strftime('%a %d/%m %H:%M') if s else '—'
    print(f"Telegram: {'chat ' + str(cfg().get('chat_id')) if configurado() else 'sin chat (telegram.chat_id en planner.config.json)'}")
    pend = sorted((av for _, av in pendientes()), key=lambda a: a.get('enviar_utc') or '')
    print(f'Pendientes ({len(pend)}):')
    for a in pend:
        error = (a.get('errores') or [{}])[-1].get('error')
        print(f"  {ver(a.get('enviar_utc'))}  {a.get('titulo') or a.get('id')}" + (f'  · último error: {error}' if error else ''))
    env = sorted((leer(f) for f in ENVIADOS.glob('*.json')), key=lambda a: a.get('enviado_at') or '') if ENVIADOS.is_dir() else []
    print(f'Enviados (últimos {min(5, len(env))} de {len(env)}):')
    for a in env[-5:]:
        print(f"  {ver(a.get('enviado_at'))}  {a.get('titulo') or a.get('id')}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    sp.add_parser('estado', help='lo pendiente y lo último enviado')
    ap.parse_args()
    sys.exit(estado())


if __name__ == '__main__':
    main()
