#!/usr/bin/env python3
"""Aplica en Postiz una propuesta de la pestaña Historias del planner.

  python3 engine/historias.py aplicar <id>              muestra lo que haría, sin tocar nada
  python3 engine/historias.py aplicar <id> --ejecutar   encola, agenda, mueve, reemplaza o quita cada historia

La propuesta la arma el planner (Historias → Programar → Preparar confirmación) en
<publicar>/.planner/proposal-historias-<id>.json. Las historias de una secuencia salen cada 2 minutos desde la
hora del día, en orden. Las que llevan un sticker interactivo (encuesta, link, mención, caja de preguntas) no se
pueden publicar por la API de Instagram: quedan listadas para subirlas a mano. Todo pasa por engine/cola.py.
"""
import argparse, datetime as dt, json, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, STATE, die, kebab, now_local

COLA = [sys.executable, str(Path(__file__).resolve().parent / 'cola.py')]
ESPACIO_MIN = 2


def hora_de(base, orden):
    h, m = map(int, base.split(':'))
    return (dt.datetime(2000, 1, 1, h, m) + dt.timedelta(minutes=(orden - 1) * ESPACIO_MIN)).strftime('%H:%M')


def slug_de(run, imagen):
    return kebab(f'historia-{Path(run).name}-{Path(imagen).stem}')[:90]


def correr(args, ejecutar):
    print('  $ cola.py ' + ' '.join(args[2:]))
    if not ejecutar:
        return True, ''
    cp = subprocess.run(args, capture_output=True, text=True)
    out = ((cp.stdout or '') + (cp.stderr or '')).strip()
    if out:
        print('    ' + out.replace('\n', '\n    '))
    return cp.returncode == 0, out[-800:]


def aplicar(pid, ejecutar):
    path = STATE / f'proposal-historias-{pid}.json'
    if not path.is_file():
        die(f'no existe la propuesta {pid} ({path})')
    prop = json.loads(path.read_text(encoding='utf-8'))
    if prop.get('status') not in {'awaiting_chat_confirmation', 'parcial'}:
        die(f"la propuesta está en estado {prop.get('status')}; no se vuelve a aplicar")
    hoy = now_local().date().isoformat()
    manuales, resultados, ok_total = [], [], True
    for a in prop['acciones']:
        # Una secuencia corrida desde otra semana trae su propia carpeta de semana.
        run = a.get('run') or prop['run']
        img = ROOT / a['imagen']
        etiqueta = f"{a['fecha']} · historia {a['orden']} ({Path(a['imagen']).name})"
        cuenta_val = a.get('cuenta_id') or a.get('cuenta')
        cuenta = ['--cuenta', f'instagram={cuenta_val}'] if cuenta_val else []
        hora = hora_de(a['hora'], a['orden']) if a.get('hora') else None
        if a['accion'] == 'a_mano':
            manuales.append(f"{etiqueta} · subila a las {hora or '—'}" + (f" en @{a['cuenta']}" if a.get('cuenta') else '') + f" · sticker: {a.get('sticker')}")
            continue
        if a['accion'] in {'nada', 'ya_publicada'}:
            continue
        if a['fecha'] < hoy and a['accion'] in {'agendar', 'mover', 'reemplazar'}:
            print(f'✗ {etiqueta}: la fecha ya pasó; no se agenda.')
            resultados.append({**a, 'resultado': 'fecha_pasada'})
            ok_total = False
            continue
        print(f"→ {a['accion']} {etiqueta}" + (f" · @{a['cuenta']}" if a.get('cuenta') else ''))
        if a['accion'] == 'agendar':
            slug = slug_de(run, a['imagen'])
            ok, out = correr(COLA + ['listo', str(img), '--formato', 'story', '--redes', 'instagram', '--slug', slug,
                                     '--titulo', f"Historia {a['fecha']} · {a['orden']}"] + cuenta, ejecutar)
            if ok:
                ok, out = correr(COLA + ['agendar', slug, '--fecha', a['fecha'], '--hora', hora] + cuenta, ejecutar)
        elif a['accion'] == 'mover':
            ok, out = correr(COLA + ['mover', a['cola']['slug'], '--fecha', a['fecha'], '--hora', hora] + cuenta, ejecutar)
        elif a['accion'] == 'reemplazar':
            # La imagen cambió en el editor del planner: se quita, se reemplaza el archivo y se vuelve a agendar.
            slug = a['cola']['slug']
            ok, out = correr(COLA + ['quitar', slug], ejecutar)
            if ok:
                ok, out = correr(COLA + ['reemplazar', slug, str(img), '--motivo', 'historia editada en el planner'], ejecutar)
            if ok:
                ok, out = correr(COLA + ['agendar', slug, '--fecha', a['fecha'], '--hora', hora] + cuenta, ejecutar)
        elif a['accion'] == 'quitar':
            ok, out = correr(COLA + ['quitar', a['cola']['slug']], ejecutar)
        else:
            ok, out = False, f"acción desconocida {a['accion']}"
        resultados.append({**a, 'hora_programada': hora, 'resultado': 'ok' if ok else 'error', 'salida': out})
        ok_total = ok_total and ok
    if manuales:
        print('\nA mano, en su lugar de la secuencia (Instagram no deja publicar esos stickers por la API):')
        for m in manuales:
            print('  ·', m)
    if ejecutar:
        prop.update(status='aplicada' if ok_total else 'parcial', applied_at=now_local().isoformat(timespec='seconds'), resultados=resultados, a_mano=manuales)
        tmp = path.with_suffix('.tmp')
        tmp.write_text(json.dumps(prop, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(path)
        print(f"\nPropuesta {pid}: {prop['status']}.")
    else:
        print('\nCorrida en seco: no se tocó la cola ni Postiz. Para aplicarla: --ejecutar')
    return 0 if ok_total else 2


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('aplicar')
    p.add_argument('id')
    p.add_argument('--ejecutar', action='store_true')
    a = ap.parse_args()
    sys.exit(aplicar(a.id, a.ejecutar))


if __name__ == '__main__':
    main()
