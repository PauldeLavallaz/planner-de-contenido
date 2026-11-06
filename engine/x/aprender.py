#!/usr/bin/env python3
"""aprender.py — Junta tus correcciones de los tweets para que tu voz aprenda de cada una.

Dos fuentes:
  - lo que cambiaste a mano en el planner: el texto actual contra `texto_original` (lo que escribió Claude Code);
  - tus notas escritas o grabadas (<x>/feedback/<id>/). Los audios se transcriben con la API de OpenAI (whisper-1,
    unos US$0,006 por minuto) si hay OPENAI_API_KEY en el .env; si no, se listan para transcribirlos de otra forma.

Uso:
  aprender.py pendientes                                  todo lo que falta aplicar o aprender
  aprender.py aprendido <id> [<id> …]                     marca como aprendidas las ediciones a mano de esos tweets
  aprender.py aplicada <id> <archivo> --cambio "qué"      marca una nota como aplicada (el planner muestra el cambio)
  aprender.py marcados [--texto-entero]                   los posts «Me interesa» sin borrador, con lo que querés decir
                                                          de cada uno; --texto-entero baja artículos y tweets largos
                                                          completos (X_BEARER_TOKEN, US$0,005 por post)
"""
import difflib, json, re, subprocess, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import BORR, BUSQ, FB, INDICE, X, ahora, borradores, clave, escribir, leer, notas, ruta, voz  # noqa: E402


def transcribir(nf, nota):
    audio, key = ruta(nota['audio']), clave('OPENAI_API_KEY')
    if not key or not audio.exists():
        return None
    p = subprocess.run(['curl', '-s', 'https://api.openai.com/v1/audio/transcriptions', '-H', f'Authorization: Bearer {key}',
                        '-F', f'file=@{audio}', '-F', 'model=whisper-1'], capture_output=True, text=True, timeout=180)
    try:
        texto = json.loads(p.stdout).get('text')
    except ValueError:
        texto = None
    if texto:
        nota['transcript'] = texto.strip()
        escribir(nf, nota)
    return nota.get('transcript')


def lo_que_dice(nf, nota):
    if nota.get('audio') and not nota.get('transcript'):
        transcribir(nf, nota)
    dice = ' / '.join(x for x in (nota.get('text'), nota.get('transcript') and f"(audio) {nota['transcript']}") if x)
    return dice or f"(audio sin transcribir: {nota.get('audio')})"


def pendientes():
    salida, n_ed, n_notas = [], 0, 0
    for f, b in borradores():
        bid, actual = f.stem, [p.get('texto', '') for p in b['partes']]
        bloque = []
        orig = b.get('texto_original') if b.get('editado_por') == 'usuario' else None
        if orig and orig != actual and (not b.get('aprendido_en') or b['aprendido_en'] < (b.get('editado') or '')):
            n_ed += 1
            bloque.append('Lo cambiaste a mano (lo que escribió Claude Code → lo que dejaste):')
            for i in range(max(len(orig), len(actual))):
                antes = (orig[i] if i < len(orig) else '').split('\n')
                despues = (actual[i] if i < len(actual) else '').split('\n')
                diff = [l for l in difflib.unified_diff(antes, despues, lineterm='', n=0) if not l.startswith(('---', '+++', '@@'))]
                if diff:
                    bloque += [f'  parte {i + 1}:'] + [f'    {l}' for l in diff]
        for nf, nota in notas(bid):
            if nota.get('estado') == 'aplicado':
                continue
            n_notas += 1
            bloque.append(f"Nota {nf.name} [{nota.get('estado')}]: {lo_que_dice(nf, nota)}")
        if bloque:
            salida.append(f"## {bid} · {b.get('tipo')} · {b.get('estado', 'borrador')}\nTexto actual:\n" + '\n---\n'.join(actual) + '\n\n' + '\n'.join(bloque))
    guia = voz()
    print(f'# Correcciones pendientes: {n_ed} ediciones a mano, {n_notas} notas\n\n'
          f'Para cada una: aplicá la nota al tweet (si ya está agendado, no lo toques y avisá), sacá la regla general de manera de '
          f'escribir y sumala a {guia} en «Correcciones», con la fecha y lo que dijiste o cambiaste (si contradice una regla '
          f'anterior, reemplazala), y marcá con `aprender.py aprendido <id>` y `aprender.py aplicada <id> <archivo> --cambio "…"`.\n')
    print('\n\n'.join(salida) if salida else 'No hay nada pendiente.')


def aprendido(ids):
    for bid in ids:
        f = BORR / f'{bid}.json'
        b = leer(f)
        if not isinstance(b, dict):
            print(f'!! no existe {bid}', file=sys.stderr)
            continue
        b['aprendido_en'] = ahora()
        escribir(f, b)
        print(f'aprendido {bid}')


def aplicada(bid, archivo, cambio):
    if not re.fullmatch(r'[\w.-]+-planner\.json', archivo):
        sys.exit('archivo de nota inválido')
    nf = FB / bid / archivo
    nota = leer(nf)
    if not isinstance(nota, dict):
        sys.exit(f'no existe la nota {bid}/{archivo}')
    nota.update(estado='aplicado', aplicado_at=ahora(), cambio=cambio)
    escribir(nf, nota)
    print(f'aplicada {bid}/{archivo}')


def textos_enteros(posts):
    """Artículos y tweets largos, enteros por la API: hay que leerlos antes de opinar."""
    cortado = lambda b: len((b.get('texto') or '').rstrip()) >= 270
    ids = [i for i, b in posts.items() if (b.get('articulo') and not b['articulo'].get('url') and not b['articulo'].get('texto')) or (not b.get('articulo') and cortado(b))][:100]
    tok = clave('X_BEARER_TOKEN')
    if not ids or not tok:
        return {}
    url = 'https://api.x.com/2/tweets?' + urllib.parse.urlencode({'ids': ','.join(ids), 'tweet.fields': 'article,note_tweet'})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + tok}), timeout=45) as r:
            datos = json.load(r).get('data') or []
    except urllib.error.URLError as e:
        print(f'!! no se pudo traer el texto entero: {e}', file=sys.stderr)
        return {}
    print(f'(texto entero de {len(datos)} posts: unos US${len(datos) * 0.005:.3f})\n')
    return {t['id']: (t.get('article') or {}).get('plain_text') or (t.get('note_tweet') or {}).get('text') or t.get('text') for t in datos}


def marcados(texto_entero=False):
    marcas = (leer(X / 'estado.json', {}) or {}).get('bookmarks') or {}
    indice = {str(b.get('id')): b for b in (leer(INDICE, {}) or {}).get('items') or []}
    for f in BUSQ.glob('*.json') if BUSQ.exists() else []:  # lo marcado también puede venir de una búsqueda
        for b in (leer(f, {}) or {}).get('items') or []:
            indice.setdefault(str(b.get('id')), b)
    usados = {str(s.get('id')) for _, b in borradores() for s in b.get('fuentes') or []}
    ids = [i for i, m in marcas.items() if m.get('estado') == 'interesa' and i not in usados]
    enteros = textos_enteros({i: indice[i] for i in ids if i in indice}) if texto_entero else {}
    print(f'# Posts marcados «Me interesa» sin borrador: {len(ids)}\n')
    for i in ids:
        b = indice.get(i)
        if not b:
            print(f'## {i}\n!! ya no está en el índice ni en las búsquedas\n')
            continue
        art = b.get('articulo')
        print(f"## {i} · @{(b.get('autor') or {}).get('handle')} · {b.get('url')}")
        if art and art.get('url'):
            print(f"Link a {art.get('sitio')}: {art.get('titulo')} · {art['url']}\n{art.get('resumen') or ''}")
        elif art:
            print(f"Artículo: {art.get('titulo')}\n{enteros.get(i) or art.get('texto') or art.get('resumen') or ''}")
        else:
            print(enteros.get(i) or b.get('texto'))
        if b.get('cita'):
            print(f"Cita a @{(b['cita'].get('autor') or {}).get('handle')}: {b['cita'].get('texto')}")
        for nf, nota in notas(i):
            if nota.get('estado') != 'aplicado':
                print(f'Lo que querés decir ({nf.name}): {lo_que_dice(nf, nota)}')
        print()


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['pendientes']:
        pendientes()
    elif a[:1] == ['marcados']:
        marcados('--texto-entero' in a)
    elif a[:1] == ['aprendido'] and len(a) > 1:
        aprendido(a[1:])
    elif a[:1] == ['aplicada'] and len(a) >= 3:
        aplicada(a[1], a[2], a[a.index('--cambio') + 1] if '--cambio' in a else '')
    else:
        sys.exit(__doc__)
