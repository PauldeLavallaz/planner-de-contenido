#!/usr/bin/env python3
"""agendar.py — Agenda los tweets aprobados que ya tienen horario en Twitter → Semana.

Se corre sólo cuando el usuario pega el pedido que copia «Copiar pedido para Claude Code»: ese mensaje es su OK para esa
tanda. Sin ids toma todos los aprobados con horario.

- Un post o un hilo va por Postiz, con la cuenta de X conectada (channels.x). Un hilo sale como hilo.
- Un comentario sobre el post de otro (`sobre`) se publica citándolo, nunca con una captura. Postiz no cita en X, así que
  va por Typefully (TYPEFULLY_API_KEY en el .env) con `quote_post_url`. Sin esa clave no se agenda: queda el link que
  abre el compositor de X con el texto y el post citado, para publicarlo a mano.

Como el motor de la cola: cada envío se anota en el borrador (`envio`) ANTES de mandarlo. Si la respuesta no llega o es
dudosa, el envío queda `incierto` y no se repite solo: `reconciliar` lo busca en Postiz; si no está, se puede volver a
agendar. Así un tweet no sale dos veces.

Uso:  agendar.py [<id> …] [--prueba] [--borrador]   --prueba muestra lo que mandaría sin tocar nada;
                                                     --borrador lo deja como borrador en Postiz
      agendar.py reconciliar [<id> …]                busca en Postiz los envíos inciertos
      agendar.py liberar <id>                        después de verificar a mano que un envío incierto no salió
      agendar.py --guardar-clave < clave             prueba la clave de Typefully y la guarda en el .env (corrélo vos)
"""
import hashlib, json, sys, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from comun import BORR, STATE, ahora, borradores, canal, clave, cuenta, escribir, guardar_en_env, ruta  # noqa: E402
sys.path.insert(0, str(HERE.parent))
from common import PUBLISH, file_lock, now_local, to_utc, tz  # noqa: E402
import cola  # noqa: E402  (las llamadas a Postiz, con sus errores y su manejo de lo incierto)
from postiz_errors import PostizError  # noqa: E402

TYPEFULLY = 'https://api.typefully.com/v2'
SIN_ENVIO = {'POSTIZ_NOT_AVAILABLE', 'POSTIZ_AUTH_REQUIRED', 'POSTIZ_REQUEST_REJECTED', 'POSTIZ_PERMISSION_DENIED', 'POSTIZ_CREDITS_EXHAUSTED', 'POSTIZ_RATE_LIMITED'}


def url_citada(b):
    tid = str(b.get('sobre') or '')
    return next((f['url'] for f in b.get('fuentes') or [] if str(f.get('id')) == tid and f.get('url')), f'https://x.com/i/status/{tid}')


def link_a_mano(b):
    return 'https://x.com/intent/post?' + urlencode({'text': b['partes'][0]['texto'], 'url': url_citada(b)})


def typefully(ruta_api, key, cuerpo=None):
    pedido = urllib.request.Request(TYPEFULLY + ruta_api, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                    headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'planner-de-contenido'})
    with urllib.request.urlopen(pedido, timeout=45) as r:
        return json.load(r)


def social_set(key):
    handle = (cuenta()['handle'] or '').lower()
    for s in typefully('/social-sets?limit=50', key).get('results', []):
        if str(s.get('username', '')).lower() == handle:
            return s['id']
    raise RuntimeError(f'@{handle} no está conectada en Typefully')


def guardar_clave():
    key = sys.stdin.read().strip()
    if not key:
        sys.exit('No llegó ninguna clave: copiala y volvé a correr el comando.')
    social_set(key)
    guardar_en_env({'TYPEFULLY_API_KEY': key})
    print(f"ok: clave guardada y @{cuenta()['handle']} conectada en Typefully")


def problemas(b, cuando):
    if cuando <= now_local():
        return f"el horario {b['fecha']} ya pasó; elegile otro en la semana"
    if any('http' in p.get('texto', '') for p in b['partes']):
        return 'tiene un link en el texto; sacalo antes de agendar (lo de otro se cita)'
    if any(not p.get('texto', '').strip() for p in b['partes']):
        return 'tiene una parte vacía'
    env = b.get('envio') or {}
    if env.get('estado') == 'incierto':
        return 'hay un envío anterior sin confirmar: corré «agendar.py reconciliar» antes de volver a mandarlo'
    return None


def anotar(f, b, **envio):
    b['envio'] = {**(b.get('envio') or {}), **envio}
    escribir(f, b)


def marcar_agendado(f, b, para, via, datos):
    b.update({'estado': 'agendado', 'agendado_para': para, via: datos})
    b['historial'] = (b.get('historial') or []) + [{'at': ahora(), 'accion': 'agendado', 'fecha': b['fecha'], 'via': via}]
    b['envio'] = {**(b.get('envio') or {}), 'estado': 'agendado', 'confirmado_at': ahora()}
    escribir(f, b)


def por_typefully(f, b, cuando, prueba):
    para = to_utc(cuando)
    posts = [{'text': p['texto']} for p in b['partes']]
    posts[0]['quote_post_url'] = url_citada(b)
    cuerpo = {'platforms': {'x': {'enabled': True, 'posts': posts}}, 'publish_at': para}
    if prueba:
        return {'id': f.stem, 'typefully': cuerpo}
    if any(p.get('media') for p in b['partes']):
        return {'id': f.stem, 'a_mano': link_a_mano(b), 'motivo': 'una cita con imagen propia no se sube desde acá'}
    key = clave('TYPEFULLY_API_KEY')
    if not key:
        return {'id': f.stem, 'a_mano': link_a_mano(b), 'motivo': 'falta TYPEFULLY_API_KEY para citar'}
    ss = social_set(key)
    digest = hashlib.sha256(json.dumps(cuerpo, sort_keys=True).encode()).hexdigest()
    anotar(f, b, via='typefully', estado='incierto', intento_at=ahora(), request_digest=digest, para=para)
    try:
        r = typefully(f'/social-sets/{ss}/drafts', key, cuerpo)
    except urllib.error.HTTPError as e:
        # Typefully contestó que no: no se creó nada y se puede volver a intentar.
        anotar(f, b, estado='rechazado', error=f'Typefully respondió {e.code}')
        raise RuntimeError(f'{f.stem}: Typefully respondió {e.code}: {e.read()[:300].decode(errors="replace")}')
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        anotar(f, b, error=f'sin respuesta de Typefully: {e}')
        raise RuntimeError(f'{f.stem}: sin respuesta de Typefully; revisá tus borradores ahí antes de reintentar (después, «agendar.py liberar {f.stem}»)')
    if r.get('status') != 'scheduled':
        anotar(f, b, estado='agendado_a_medias', error=f"Typefully lo dejó en «{r.get('status')}»", typefully_draft=r.get('id'))
        raise RuntimeError(f"{f.stem}: Typefully lo dejó en «{r.get('status')}», no agendado (borrador {r.get('id')})")
    marcar_agendado(f, b, para, 'typefully', {'draft': r.get('id'), 'social_set': ss, 'url': r.get('private_url')})
    return {'id': f.stem, 'fecha': b['fecha'], 'typefully': r.get('id')}


def por_postiz(f, b, cuando, prueba, borrador):
    ch = canal()
    if not ch:
        raise RuntimeError('no hay una cuenta de X conectada en Postiz: conectala y corré «python3 engine/conectar.py»')
    valores = []
    for i, p in enumerate(b['partes']):
        media = []
        for m in p.get('media') or []:
            archivo = ruta(m if isinstance(m, str) else m.get('path'))
            if prueba:
                media.append({'id': f'x-{f.stem[:20]}-{i}', 'path': str(archivo)})
                continue
            up = cola.postiz('upload', str(archivo))
            if not up or not up.get('path'):
                raise RuntimeError(f'Postiz no devolvió la ruta de {archivo.name}')
            media.append({'id': up.get('id') or f'x-{f.stem[:20]}-{i}', 'path': up['path']})
        valores.append({'content': p['texto'], 'image': media})
    settings = {'__type': ch.get('type') or 'x', 'who_can_reply_post': 'everyone', **(ch.get('settings') or {})}
    cuerpo = {'type': 'draft' if borrador else 'schedule', 'date': to_utc(cuando), 'shortLink': False, 'tags': [],
              'posts': [{'integration': {'id': ch['id']}, 'value': valores, 'settings': settings}]}
    if prueba:
        return {'id': f.stem, 'postiz': cuerpo}
    digest = hashlib.sha256(json.dumps(cuerpo, sort_keys=True).encode()).hexdigest()
    anotar(f, b, via='postiz', estado='incierto', intento_at=ahora(), request_digest=digest, para=cuerpo['date'], integracion=ch['id'])
    tmp = PUBLISH / '.tmp'
    tmp.mkdir(parents=True, exist_ok=True)
    pedido = tmp / f'x-{f.stem}-{digest[:12]}.json'
    pedido.write_text(json.dumps(cuerpo, ensure_ascii=False), encoding='utf-8')
    try:
        ids = [x['id'] for x in cola.created_ids(cola.postiz('posts:create', '--json', str(pedido))) if x.get('id') and x.get('integration') in (None, ch['id'])]
    except PostizError as e:
        # Lo que Postiz rechazó antes de crear se puede reintentar; lo dudoso queda incierto hasta reconciliar.
        anotar(f, b, estado='no_enviado' if e.code in SIN_ENVIO else 'incierto', error=e.code)
        raise
    if not ids:
        anotar(f, b, error='Postiz respondió sin ID')
        raise RuntimeError(f'{f.stem}: Postiz respondió sin ID; corré «agendar.py reconciliar» antes de reintentar')
    marcar_agendado(f, b, cuerpo['date'], 'postiz', {'ids': ids, 'integracion': ch['id']})
    return {'id': f.stem, 'fecha': b['fecha'], 'postiz': ids}


def agendar(ids, prueba, borrador):
    hechos, a_mano, errores = [], [], []
    for f, b in borradores():
        if (ids and f.stem not in ids) or b.get('estado') != 'aprobado' or not b.get('fecha'):
            continue
        cuando = datetime.fromisoformat(b['fecha']).replace(tzinfo=tz())
        if not prueba and (motivo := problemas(b, cuando)):
            errores.append(f'{f.stem}: {motivo}')
            continue
        try:
            r = por_typefully(f, b, cuando, prueba) if b.get('tipo') == 'sobre' else por_postiz(f, b, cuando, prueba, borrador)
        except RuntimeError as e:
            errores.append(f'{f.stem}: {e}')
            continue
        (a_mano if r.get('a_mano') else hechos).append(r)
    if prueba:
        print(json.dumps(hechos + a_mano, ensure_ascii=False, indent=1))
    else:
        print(json.dumps({'agendados': hechos, 'a_mano': a_mano, 'errores': errores}, ensure_ascii=False, indent=1))
    if errores:
        sys.exit(1)


def reconciliar(ids):
    """Busca en Postiz los envíos inciertos: si aparece el post (misma cuenta, misma hora y mismo comienzo), queda agendado."""
    vistos = []
    for f, b in borradores():
        env = b.get('envio') or {}
        if (ids and f.stem not in ids) or env.get('estado') != 'incierto':
            continue
        if env.get('via') != 'postiz':
            vistos.append({'id': f.stem, 'resultado': 'revisá tus borradores en Typefully; si no está, «agendar.py liberar ' + f.stem + '»'})
            continue
        para = datetime.fromisoformat(env['para'].replace('Z', '+00:00')).astimezone(tz())
        inicio = b['partes'][0]['texto'].strip()[:40]
        hallados = [p for p in cola.postiz_posts(para - timedelta(hours=2), para + timedelta(hours=2))
                    if p.get('integration_id') == env.get('integracion') and (p.get('content') or '').strip()[:40] == inicio
                    and abs((p['when'] - para).total_seconds()) < 120]
        if hallados:
            marcar_agendado(f, b, env['para'], 'postiz', {'ids': [p['id'] for p in hallados], 'integracion': env.get('integracion'), 'reconciliado': True})
            vistos.append({'id': f.stem, 'resultado': 'estaba en Postiz: queda agendado', 'postiz': [p['id'] for p in hallados]})
        else:
            anotar(f, b, estado='no_llego', reconciliado_at=ahora())
            vistos.append({'id': f.stem, 'resultado': 'no está en Postiz: se puede volver a agendar'})
    print(json.dumps(vistos, ensure_ascii=False, indent=1))


def liberar(bid):
    f = BORR / f'{bid}.json'
    b = json.loads(f.read_text(encoding='utf-8'))
    if (b.get('envio') or {}).get('estado') != 'incierto':
        sys.exit(f'{bid} no tiene un envío incierto')
    anotar(f, b, estado='liberado', liberado_at=ahora())
    print(f'liberado {bid}: se puede volver a agendar')


def main():
    a = sys.argv[1:]
    if '--guardar-clave' in a:
        return guardar_clave()
    with file_lock(STATE / 'x-agendar.lock'):
        if a[:1] == ['reconciliar']:
            return reconciliar([x for x in a[1:] if not x.startswith('--')])
        if a[:1] == ['liberar'] and len(a) > 1:
            return liberar(a[1])
        agendar([x for x in a if not x.startswith('--')], '--prueba' in a, '--borrador' in a)


if __name__ == '__main__':
    main()
