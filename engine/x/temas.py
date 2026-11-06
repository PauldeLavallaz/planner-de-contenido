#!/usr/bin/env python3
"""temas.py — El tema de cada bookmark, para filtrarlos en el planner y escribir por tema.

Los temas son tuyos: <x>/temas.json → `temas` ([{id, nombre, desc}]). La primera vez se copian de la plantilla de la
skill x-borradores; editalos o pedile a Claude Code que los arme mirando tus bookmarks. La clasificación la hace Claude
Code leyendo cada tweet (sin otra API): `pendientes` le da los que faltan y `asignar` guarda lo que decidió. Queda aparte
del índice, así reconstruirlo no la pierde.

Uso:
  temas.py lista                         tus temas
  temas.py pendientes [--max 100]        los bookmarks más nuevos sin tema, en JSON (id, autor, texto)
  temas.py asignar < asignados.json      guarda {"<id del tweet>": "<id del tema>", …} (también con --archivo)
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import INDICE, X, escribir, leer, temas  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('accion', choices=['lista', 'pendientes', 'asignar'])
    ap.add_argument('--max', type=int, default=100)
    ap.add_argument('--archivo')
    a = ap.parse_args()
    t = temas()
    if a.accion == 'lista':
        print(json.dumps(t['temas'], ensure_ascii=False, indent=1))
        return
    if a.accion == 'pendientes':
        items = (leer(INDICE, {}) or {}).get('items') or []
        sin = [b for b in items if b.get('id') not in t['asignados']][:a.max]
        print(json.dumps({'temas': [{'id': x['id'], 'nombre': x.get('nombre'), 'desc': x.get('desc', '')} for x in t['temas']],
                          'bookmarks': [{'id': b['id'], 'autor': (b.get('autor') or {}).get('handle'),
                                         'texto': ((b.get('articulo') or {}).get('titulo') or b.get('texto') or '')[:600]} for b in sin]},
                         ensure_ascii=False, indent=1))
        return
    datos = json.loads(Path(a.archivo).read_text(encoding='utf-8') if a.archivo else sys.stdin.read())
    validos = {x['id'] for x in t['temas']}
    malos = sorted({v for v in datos.values() if v not in validos})
    if malos:
        sys.exit(f"Temas que no están en la lista: {', '.join(malos)}. Sumalos a <x>/temas.json o usá uno existente.")
    t['asignados'].update({str(k): v for k, v in datos.items()})
    escribir(X / 'temas.json', t)
    print(json.dumps({'asignados': len(datos), 'total': len(t['asignados'])}))


if __name__ == '__main__':
    main()
