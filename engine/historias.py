#!/usr/bin/env python3
"""Aplica en Postiz una propuesta de la pestaña Historias del planner y publica las historias de cada día en cadena.

  python3 engine/historias.py aplicar <id>              muestra lo que haría, sin tocar nada
  python3 engine/historias.py aplicar <id> --ejecutar   encola, agenda, mueve, reemplaza o quita cada historia
  python3 engine/historias.py cadena [--dry-run]        publica la siguiente historia de hoy si ya salió la anterior

La propuesta la arma el planner (Historias → Programar → Preparar confirmación) en
<publicar>/.planner/proposal-historias-<id>.json. Las historias de una secuencia tienen su hora cada 2 minutos desde la
hora del día, en orden. Todas salen por Postiz: ninguna va a mano (si una propuesta vieja trae «a_mano», se lista).
Una historia con video de fondo o voz en off se publica como su MP4. Las que tienen feedback sin corregir
(«espera_feedback») no se agendan: se programan cuando el usuario apruebe la versión corregida. Las de una secuencia
que el usuario descartó en el planner («descartar») salen de Postiz con `cola.py pausar`, así nadie las vuelve a
agendar; una ya publicada o en pausa no se toca. Todo pasa por engine/cola.py.

En cadena: programar varias historias con dos minutos de distancia no garantiza el orden, porque Postiz las publica con
demoras de segundos a minutos (una puede salir después de la siguiente, o quedar en error). Por eso sólo la primera de
cada día y cuenta queda programada; las siguientes van a Postiz como borrador a su hora, y `cadena` (que el planner
corre cada minuto mientras está abierto) publica cada una con `cola.py ahora` recién cuando Postiz confirma publicada la
anterior y ya llegó su hora. Si una queda en error, la reintenta hasta dos veces, cada una 4 minutos después del intento
que falló (reintentar enseguida no le da tiempo a Instagram); si sigue fallando, frena las que siguen para no
desordenar la secuencia y avisa con el archivo para subirla a mano. Cada aviso (error, demora de más de 10 minutos,
atraso) queda en
<publicar>/.planner/historias-cadena.json y se ve arriba de la pestaña Historias. Con `historias.cadena: false` en
planner.config.json, todas se programan a su hora, como antes.
"""
import argparse, datetime as dt, json, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CFG, ROOT, STATE, die, file_lock, kebab, now_local

COLA = [sys.executable, str(Path(__file__).resolve().parent / 'cola.py')]
ESPACIO_MIN = 2
AVISOS = STATE / 'historias-cadena.json'
ATRASO_AVISO = dt.timedelta(minutes=10)
REINTENTOS = 2
ESPERA_REINTENTO = dt.timedelta(minutes=4)


def en_cadena():
    return (CFG.get('historias') or {}).get('cadena', True) is not False


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
    ahora = now_local()
    hoy, ya = ahora.date().isoformat(), ahora.strftime('%H:%M')
    manuales, esperan, resultados, ok_total = [], [], [], True
    # La primera historia de cada día y cuenta queda programada; las siguientes, borrador hasta que salga la anterior.
    primeras = {}
    for a in prop['acciones']:
        if a['accion'] not in {'a_mano', 'quitar', 'descartar', 'nada', 'ya_publicada', 'espera_feedback'}:
            k = (a['fecha'], a.get('cuenta_id') or a.get('cuenta'))
            primeras[k] = min(primeras.get(k, a['orden']), a['orden'])
    for a in prop['acciones']:
        # Una secuencia corrida desde otra semana trae su propia carpeta de semana.
        run = a.get('run') or prop['run']
        # Una historia con video y voz en off se publica como su MP4; el planner la sigue por su PNG.
        img = ROOT / (a.get('video') or a['imagen'])
        etiqueta = f"{a['fecha']} · historia {a['orden']} ({Path(a['imagen']).name})"
        cuenta_val = a.get('cuenta_id') or a.get('cuenta')
        cuenta = ['--cuenta', f'instagram={cuenta_val}'] if cuenta_val else []
        hora = hora_de(a['hora'], a['orden']) if a.get('hora') else None
        if a['accion'] == 'a_mano':
            manuales.append(f"{etiqueta} · subila a las {hora or '—'}" + (f" en @{a['cuenta']}" if a.get('cuenta') else '') + f" · sticker: {a.get('sticker')}")
            continue
        if a['accion'] in {'nada', 'ya_publicada'}:
            continue
        if a['accion'] == 'espera_feedback':
            esperan.append(f"{etiqueta} · tiene feedback sin corregir: se agenda cuando apruebes la versión nueva")
            resultados.append({**a, 'resultado': 'espera_feedback'})
            continue
        # También una de hoy cuya hora ya pasó: no se agenda en el pasado.
        pasada = a['fecha'] < hoy or (a['fecha'] == hoy and hora is not None and hora <= ya)
        if pasada and a['accion'] in {'agendar', 'mover', 'reemplazar'}:
            print(f'✗ {etiqueta}: la fecha ya pasó; no se agenda.')
            resultados.append({**a, 'resultado': 'fecha_pasada'})
            ok_total = False
            continue
        cadena = ['--draft'] if en_cadena() and a['orden'] > primeras.get((a['fecha'], cuenta_val), a['orden']) else []
        print(f"→ {a['accion']} {etiqueta}" + (f" · @{a['cuenta']}" if a.get('cuenta') else '') + (' · en cadena' if cadena else ''))
        if a['accion'] == 'agendar':
            slug = slug_de(run, a['imagen'])
            ok, out = correr(COLA + ['listo', str(img), '--formato', 'story', '--redes', 'instagram', '--slug', slug,
                                     '--titulo', f"Historia {a['fecha']} · {a['orden']}"] + cuenta, ejecutar)
            if ok:
                ok, out = correr(COLA + ['agendar', slug, '--fecha', a['fecha'], '--hora', hora] + cadena + cuenta, ejecutar)
        elif a['accion'] == 'mover':
            # Una historia que se quitó de Postiz volvió a la bandeja: no hay nada que mover, se agenda.
            en_bandeja = '/inbox/' in '/' + str(a['cola'].get('sidecar') or '').replace('\\', '/')
            ok, out = correr(COLA + ['agendar' if en_bandeja else 'mover', a['cola']['slug'], '--fecha', a['fecha'], '--hora', hora] + cadena + cuenta, ejecutar)
        elif a['accion'] == 'reemplazar':
            # La historia cambió en el editor del planner: se quita, se reemplaza el archivo y se vuelve a agendar.
            slug = a['cola']['slug']
            previo = ''
            if a['cola'].get('sidecar'):
                try:
                    previo = json.loads((ROOT / a['cola']['sidecar']).read_text(encoding='utf-8')).get('source_final') or ''
                except (OSError, ValueError):
                    previo = ''
            ok, out = correr(COLA + ['quitar', slug], ejecutar)
            if ok and previo and Path(previo).suffix.lower() != img.suffix.lower():
                # Pasó de imagen a video (le pusieron video o voz en off) o al revés: la cola no cambia el tipo de
                # archivo de una pieza, así que entra de nuevo con otro slug y la misma hora.
                slug = f"{slug}-{'video' if img.suffix.lower() == '.mp4' else 'imagen'}"
                ok, out = correr(COLA + ['listo', str(img), '--formato', 'story', '--redes', 'instagram', '--slug', slug,
                                         '--titulo', f"Historia {a['fecha']} · {a['orden']}"] + cuenta, ejecutar)
            elif ok:
                ok, out = correr(COLA + ['reemplazar', slug, str(img), '--motivo', 'historia editada en el planner'], ejecutar)
            if ok:
                ok, out = correr(COLA + ['agendar', slug, '--fecha', a['fecha'], '--hora', hora] + cadena + cuenta, ejecutar)
        elif a['accion'] == 'quitar':
            ok, out = correr(COLA + ['quitar', a['cola']['slug']], ejecutar)
        elif a['accion'] == 'descartar':
            # Secuencia descartada en el planner: sale de Postiz y queda en pausa (nadie la vuelve a agendar).
            slug = a['cola']['slug']
            ya = estado_en_cola(slug)
            if ya:
                print(f'  · {slug}: {ya}; no se toca.')
                resultados.append({**a, 'resultado': ya})
                continue
            ok, out = correr(COLA + ['pausar', slug, '--motivo', 'descartada en el planner'], ejecutar)
        else:
            ok, out = False, f"acción desconocida {a['accion']}"
        resultados.append({**a, 'hora_programada': hora, 'resultado': 'ok' if ok else 'error', 'salida': out})
        ok_total = ok_total and ok
    if manuales:
        print('\nA mano (una propuesta vieja: hoy todas salen por Postiz), en su lugar de la secuencia:')
        for m in manuales:
            print('  ·', m)
    if esperan:
        print('\nEsperan el feedback (no se agendan todavía):')
        for m in esperan:
            print('  ·', m)
    if ejecutar:
        prop.update(status='aplicada' if ok_total else 'parcial', applied_at=now_local().isoformat(timespec='seconds'), resultados=resultados, a_mano=manuales, esperan_feedback=esperan)
        tmp = path.with_suffix('.tmp')
        tmp.write_text(json.dumps(prop, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(path)
        print(f"\nPropuesta {pid}: {prop['status']}.")
    else:
        print('\nCorrida en seco: no se tocó la cola ni Postiz. Para aplicarla: --ejecutar')
    return 0 if ok_total else 2


def estado_en_cola(slug):
    """Si una historia ya no se puede pausar: «ya publicada» (archivada en publicado/ o marcada así) o «ya en pausa»."""
    from common import AGENDADO, INBOX, PUBLICADO
    fichas = [f for d in (INBOX, AGENDADO) for f in d.glob('*.json')] + (list(PUBLICADO.glob('*/*.json')) if PUBLICADO.is_dir() else [])
    for f in fichas:
        try:
            m = json.loads(f.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        if not isinstance(m, dict) or m.get('slug') != slug:
            continue
        if f.parent.parent == PUBLICADO or m.get('publicado_at') or m.get('estado') in {'publicado', 'publicada'}:
            return 'ya publicada'
        if m.get('pausa'):
            return 'ya en pausa'
    return None


# ---------------------------------------------------------------- en cadena
LISTO = {'publicado'}


def utc(s):
    return dt.datetime.fromisoformat(str(s).replace('Z', '+00:00'))


def post_ig(meta):
    return next((p for p in meta.get('postiz', {}).get('posts', []) if p.get('red') == 'instagram' and p.get('estado') != 'cancelado'), None)


def cadenas(q, ahora):
    """Historias agendadas para el día de `ahora`, agrupadas por cuenta y ordenadas por su hora."""
    hoy = ahora.date().isoformat()
    grupos = {}
    for media, meta in q.agendado_pieces():
        slot = meta.get('slot') or {}
        if q.format_for(meta) != 'story' or slot.get('fecha') != hoy or not slot.get('utc'):
            continue
        post = post_ig(meta)
        if post:
            grupos.setdefault(post.get('integration_id') or '?', []).append((media, meta))
    return [sorted(g, key=lambda x: x[1]['slot']['utc']) for g in grupos.values()]


def pendiente(cadena, ahora):
    """Hay algo que mirar: ya llegó la hora de la primera y no está todo publicado."""
    return utc(cadena[0][1]['slot']['utc']) - dt.timedelta(minutes=1) <= ahora and any(m.get('estado') not in LISTO for _, m in cadena)


def avisado(aid):
    try:
        return any(x.get('id') == aid for x in json.loads(AVISOS.read_text(encoding='utf-8')).get('avisos') or [])
    except (OSError, ValueError, AttributeError):
        return False


def avisar(aid, titulo, texto, dry):
    """Guarda un aviso (uno por id) en <publicar>/.planner/historias-cadena.json: la pestaña Historias lo muestra."""
    print(f'aviso · {titulo}: {texto}')
    if dry:
        return
    with file_lock(STATE / '.historias-cadena.lock'):
        try:
            data = json.loads(AVISOS.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            data = {}
        avisos = data.get('avisos') or []
        if any(x.get('id') == aid for x in avisos):
            return
        avisos.append({'id': aid, 'at': now_local().isoformat(timespec='seconds'), 'titulo': titulo, 'texto': texto})
        data['avisos'] = avisos[-50:]
        STATE.mkdir(parents=True, exist_ok=True)
        tmp = AVISOS.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        tmp.replace(AVISOS)


def publicar_ya(slug, dry):
    print(f'→ ahora {slug}')
    if dry:
        return True
    cp = subprocess.run(COLA + ['ahora', slug, '--redes', 'instagram'], capture_output=True, text=True, timeout=300)
    out = ((cp.stdout or '') + (cp.stderr or '')).strip()
    if out:
        print('    ' + out[-800:].replace('\n', '\n    '))
    return cp.returncode == 0


def avanzar(q, cadena, ahora, dry):
    total, dia = len(cadena), cadena[0][1]['slot']['fecha']
    nombre = lambda i, meta: f"historia {i} de {total} ({meta['slot']['hora']})"
    for i, (media, meta) in enumerate(cadena, 1):
        post, slug = post_ig(meta), meta['slug']
        estado, nominal, base = post.get('estado'), utc(meta['slot']['utc']), f"cadena-{meta['slug']}"
        if estado in LISTO:
            continue
        if estado == 'fallido':
            if avisado(f'{base}-frenada'):
                # Ya se frenó y el aviso trae el archivo para subirla a mano: reintentarla después la duplicaría.
                return
            intentos = meta.get('cadena_reintentos', 0)
            if intentos < REINTENTOS:
                # Cada reintento, 4 minutos después del intento que falló: reintentar enseguida no le da tiempo a Instagram.
                fallo = utc(post['attempted_at']) if post.get('type') == 'now' and post.get('attempted_at') else nominal
                espera = fallo + ESPERA_REINTENTO - ahora
                cuando = f'en {int(-(-espera.total_seconds() // 60))} min' if espera > dt.timedelta(0) else 'ahora'
                avisar(f'{base}-error-{intentos}', f'Historia con error · {dia} · {i}',
                       f"Postiz marcó error en la {nombre(i, meta)}: «{post.get('error') or 'sin detalle'}». La reintento {cuando}; las que siguen esperan a que salga.", dry)
                if espera > dt.timedelta(0):
                    return
                if not dry:
                    with q.queue_lock():
                        m = q.load_meta(media)
                        m['cadena_reintentos'] = intentos + 1
                        q.save_meta(media, m)
                publicar_ya(slug, dry)
            else:
                siguen = ('Frené la que sigue' if total - i == 1 else f'Frené las {total - i} que siguen') + ' para no desordenar la secuencia. ' if total > i else ''
                archivo = media.relative_to(ROOT).as_posix() if media.is_relative_to(ROOT) else str(media)
                avisar(f'{base}-frenada', f'Historias frenadas · {dia}',
                       f"La {nombre(i, meta)} volvió a fallar en Postiz después de {REINTENTOS} reintentos. {siguen}Revisala en Postiz y pedile a Claude Code que la resuelva, o subila a mano desde la app: el archivo está en {archivo}.", dry)
            return
        if estado == 'en_revision':  # borrador de la cadena: sale cuando la anterior está publicada y llegó su hora
            if ahora < nominal:
                return
            if publicar_ya(slug, dry):
                atraso = ahora - nominal
                if atraso > ATRASO_AVISO:
                    avisar(f'{base}-tarde', f'Historia atrasada · {dia} · {i}',
                           f"La {nombre(i, meta)} sale recién ahora, {int(atraso.total_seconds() // 60)} min tarde (la anterior se demoró o la compu estaba dormida). El orden se respeta.", dry)
            else:
                avisar(f'{base}-no-salio', f'Historia sin publicar · {dia} · {i}',
                       f"No pude mandar la {nombre(i, meta)} a Postiz. Las que siguen esperan.", dry)
            return
        # Programada, en curso o sin confirmar: se espera; si pasa de diez minutos, avisa una vez.
        desde = nominal
        if post.get('type') == 'now' and post.get('attempted_at'):
            desde = max(nominal, dt.datetime.fromisoformat(post['attempted_at']))
        if ahora - desde > ATRASO_AVISO:
            avisar(f"{base}-demora-{post.get('id')}", f'Postiz demora una historia · {dia} · {i}',
                   f"Postiz lleva {int((ahora - desde).total_seconds() // 60)} min sin publicar la {nombre(i, meta)} (estado: {post.get('provider_state') or estado}). Las que siguen esperan a que salga.", dry)
        return


def reconciliar(q, cadena):
    """Lee Postiz una vez y actualiza los sidecars de la cadena; devuelve la cadena releída."""
    fechas = [utc(m['slot']['utc']) for _, m in cadena]
    remote = q.postiz_posts(min(fechas) - dt.timedelta(hours=2), max(dt.datetime.now(dt.timezone.utc), max(fechas)) + dt.timedelta(hours=2))
    out = []
    with q.queue_lock():
        for media, _ in cadena:
            meta = q.load_meta(media)
            q.reconcile_piece(meta, remote)
            q.save_meta(media, meta)
            out.append((media, meta))
    return out


def cadena(dry, ahora=None):
    if not en_cadena():
        return 0
    import cola as q
    ahora = ahora or now_local()
    listas = [c for c in cadenas(q, ahora) if pendiente(c, ahora)]
    if not listas:  # sin historias pendientes de hoy no consulta Postiz
        return 0
    with file_lock(STATE / '.historias-cadena.run.lock'):
        for c in listas:
            try:
                c = reconciliar(q, c)
            except Exception as e:  # sin lectura de Postiz no se decide nada; el próximo minuto vuelve a probar
                print(f'no pude leer Postiz: {type(e).__name__}: {e}', file=sys.stderr)
                continue
            avanzar(q, c, ahora, dry)
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('aplicar')
    p.add_argument('id')
    p.add_argument('--ejecutar', action='store_true')
    p = sp.add_parser('cadena', help='publica la siguiente historia de hoy si ya salió la anterior')
    p.add_argument('--dry-run', action='store_true', help='muestra qué haría, sin publicar ni guardar avisos')
    p.add_argument('--ahora', help=argparse.SUPPRESS)  # AAAA-MM-DDTHH:MM, para las pruebas
    a = ap.parse_args()
    if a.cmd == 'aplicar':
        sys.exit(aplicar(a.id, a.ejecutar))
    ahora = None
    if a.ahora:
        from common import tz
        ahora = dt.datetime.fromisoformat(a.ahora).replace(tzinfo=tz())
    sys.exit(cadena(a.dry_run, ahora))


if __name__ == '__main__':
    main()
