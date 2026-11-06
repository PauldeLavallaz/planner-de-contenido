#!/usr/bin/env python3
"""Los posts de LinkedIn después de escribirlos: el feedback del planner, lo publicado y sus números.

    python3 engine/linkedin/posts.py pendientes                            notas y ediciones a mano que falta aplicar o aprender
    python3 engine/linkedin/posts.py aplicada <id> <archivo> --cambio "…"   marca una nota como aplicada; el planner muestra qué cambió
    python3 engine/linkedin/posts.py aprendido <id> [<id> …]               marca como aprendidas las ediciones a mano de esos posts
    python3 engine/linkedin/posts.py estado [--sin-reconciliar]            pasa a «publicado» lo que Postiz ya publicó, con su link
    python3 engine/linkedin/posts.py metricas [--horas 72]                 reacciones y comentarios de lo publicado, sin tu cuenta

Dos fuentes de corrección:
  - las notas escritas o grabadas en el planner (feedback/<id>/): los audios se transcriben por la API de OpenAI (whisper-1,
    unos US$0,006 por minuto, con OPENAI_API_KEY) y la transcripción queda en la nota;
  - las ediciones a mano del texto: lo último guardado contra lo que escribió Claude (`historial`).
Las métricas salen de ScrapeCreators (`/v1/linkedin/post`, SCRAPECREATORS_API_KEY, un crédito por post): sólo reacciones y
comentarios, que es lo que se ve sin login. Impresiones y visitas al perfil sólo las ves vos en LinkedIn.
"""
import difflib, json, subprocess, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import BORRADORES, ENGINE, FEEDBACK, IMAGENES, ahora, clave, gasto, read_json, rel, ruta, write_json  # noqa: E402
from common import AGENDADO, INBOX, PUBLICADO  # noqa: E402

GUIA = '.claude/skills/linkedin-posts/references/guia.md'
WHISPER_USD_MIN = 0.006
SC_USD_CREDITO = 0.00188


def transcribir(nota_path, nota):
    audio, key = ruta(nota.get('audio')), clave('OPENAI_API_KEY')
    if not key or not audio or not audio.exists():
        return None
    p = subprocess.run(['curl', '-s', 'https://api.openai.com/v1/audio/transcriptions', '-H', f'Authorization: Bearer {key}',
                        '-F', f'file=@{audio}', '-F', 'model=whisper-1'], capture_output=True, text=True, timeout=180)
    try:
        texto = json.loads(p.stdout).get('text')
    except ValueError:
        texto = None
    if texto:
        nota['transcript'] = texto.strip()
        write_json(nota_path, nota)
        minutos = max((nota.get('audio_seconds') or 30) / 60, 0.1)
        gasto('openai', 'whisper-1', round(minutos, 2), 'minuto', minutos * WHISPER_USD_MIN, f'feedback {nota_path.parent.name}/{nota_path.name}')
    return nota.get('transcript')


def edicion(b):
    """Lo que escribió Claude → lo que dejó el usuario, si editó a mano y todavía no se aprendió."""
    if b.get('editado_por') != 'usuario' or (b.get('aprendido_en') and b['aprendido_en'] >= (b.get('editado') or '')):
        return []
    eds = [h for h in b.get('historial') or [] if h.get('accion') == 'texto' and h.get('antes') and h.get('por') != 'Claude']
    if not eds:
        return []
    return [l for l in difflib.unified_diff(eds[0]['antes'].split('\n'), b['texto'].split('\n'), lineterm='', n=0) if not l.startswith(('---', '+++', '@@'))]


def pendientes():
    salida, n_ed, n_notas = [], 0, 0
    for f in sorted(BORRADORES.glob('*.json')):
        b, bid = read_json(f), f.stem
        bloque, diff = [], edicion(b)
        if diff:
            n_ed += 1
            bloque.append('Edición a mano (lo que escribió Claude → lo que dejó el usuario):')
            bloque += [f'  {l}' for l in diff]
        for nf in sorted((FEEDBACK / bid).glob('*-planner.json')) if (FEEDBACK / bid).exists() else []:
            nota = read_json(nf)
            if nota.get('estado') == 'aplicado':
                continue
            n_notas += 1
            if nota.get('audio') and not nota.get('transcript'):
                transcribir(nf, nota)
            dice = ' / '.join(x for x in (nota.get('text'), nota.get('transcript') and f"(audio) {nota['transcript']}") if x)
            bloque.append(f"Nota {nf.name} [{nota.get('estado')}]: {dice or '(audio sin transcribir: ' + str(nota.get('audio')) + ')'}")
        if bloque:
            cuerpo = IMAGENES / 'src' / f'{bid}.html'
            salida.append(f"## {bid} · {b.get('estado', 'borrador')} · {b.get('fecha')}\nImagen: {b.get('imagen')} (cuerpo: {rel(cuerpo) or cuerpo})\n"
                          f"Texto actual:\n{b.get('texto')}\n\n" + '\n'.join(bloque))
    cab = (f'# Correcciones pendientes: {n_notas} notas, {n_ed} ediciones a mano\n\n'
           f'Para cada una: aplicá la nota al post (el texto, o el cuerpo de la imagen y `lamina.py` para rehacerla; si está agendado no lo '
           f'toques y avisá), sacá la regla general y sumala a {GUIA} con la cita y la fecha (reemplazá la regla vieja si la contradice), y '
           f'marcá con `posts.py aplicada <id> <archivo> --cambio "…"` y `posts.py aprendido <id>`.\n')
    print(cab + ('\n\n'.join(salida) if salida else '\nNo hay nada pendiente.'))


def aplicada(bid, archivo, cambio):
    nf = FEEDBACK / bid / archivo
    if not nf.is_file() or nf.parent.parent != FEEDBACK:
        sys.exit(f'no existe la nota {bid}/{archivo}')
    nota = read_json(nf)
    nota.update(estado='aplicado', aplicado_at=ahora(), cambio=cambio)
    write_json(nf, nota)
    print(f'aplicada {bid}/{archivo}')


def aprendido(ids):
    for bid in ids:
        f = BORRADORES / f'{bid}.json'
        if not f.is_file():
            print(f'!! no existe {bid}', file=sys.stderr)
            continue
        b = read_json(f)
        b['aprendido_en'] = ahora()
        write_json(f, b)
        print(f'aprendido {bid}')


def ficha_en_cola(slug):
    for d in (INBOX, AGENDADO):
        for f in d.glob('*.json') if d.is_dir() else []:
            m = read_json(f)
            if isinstance(m, dict) and m.get('slug') == slug:
                return m
    for f in PUBLICADO.glob('*/*.json') if PUBLICADO.is_dir() else []:
        m = read_json(f)
        if isinstance(m, dict) and m.get('slug') == slug:
            return m
    return None


def estado(reconciliar=True):
    """Lo agendado que Postiz ya publicó pasa a «publicado», con su fecha y su link. Primero reconcilia la cola con Postiz."""
    if reconciliar:
        p = subprocess.run([sys.executable, str(ENGINE / 'cola.py'), 'reconciliar'], capture_output=True, text=True)
        if p.returncode:
            print(f'!! no se pudo reconciliar con Postiz: {(p.stderr or p.stdout).strip()[-200:]}', file=sys.stderr)
    cambios = 0
    for f in sorted(BORRADORES.glob('*.json')):
        b = read_json(f)
        if b.get('estado') != 'agendado' or not b.get('cola_slug'):
            continue
        m = ficha_en_cola(b['cola_slug'])
        if not m or m.get('estado') != 'publicado':
            continue
        post = next((x for x in (m.get('postiz') or {}).get('posts', []) if x.get('red') == 'linkedin' and x.get('estado') == 'publicado'), {})
        b.update(estado='publicado', publicado=(m.get('publicado_at') or post.get('published_at') or b.get('fecha') or '')[:10] or None,
                 url=post.get('native_url') or b.get('url'))
        b['historial'] = (b.get('historial') or []) + [{'at': ahora(), 'accion': 'publicado'}]
        write_json(f, b)
        cambios += 1
        print(f'publicado {f.stem}{" · " + b["url"] if b.get("url") else ""}')
    if not cambios:
        print('Nada nuevo publicado.')


def metricas(horas=72):
    """Reacciones y comentarios de cada post publicado hace más de `horas`, una vez. Sin el link del post no se puede medir."""
    key = clave('SCRAPECREATORS_API_KEY')
    if not key:
        sys.exit('Falta SCRAPECREATORS_API_KEY (en .env o en el entorno).')
    import urllib.parse, urllib.request
    medidos = 0
    for f in sorted(BORRADORES.glob('*.json')):
        b = read_json(f)
        if b.get('estado') != 'publicado' or not b.get('url') or (b.get('metricas') or {}).get('medido_horas', 0) >= horas:
            continue
        try:
            pub = datetime.fromisoformat(str(b.get('publicado'))[:10]).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        edad = (datetime.now(timezone.utc) - pub) / timedelta(hours=1)
        if edad < horas:
            continue
        req = urllib.request.Request('https://api.scrapecreators.com/v1/linkedin/post?' + urllib.parse.urlencode({'url': b['url']}), headers={'x-api-key': key})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.loads(r.read().decode())
        except Exception as e:  # un post que no se puede leer no frena los demás
            print(f'!! {f.stem}: {e}', file=sys.stderr)
            continue
        gasto('scrapecreators', 'linkedin-post', 1, 'credito', SC_USD_CREDITO, f'métricas de {f.stem}')
        b['metricas'] = {'reacciones': d.get('likeCount'), 'comentarios': d.get('commentCount'), 'medido': ahora(), 'medido_horas': round(edad)}
        write_json(f, b)
        medidos += 1
        print(f"{f.stem}: {b['metricas']['reacciones']} reacciones · {b['metricas']['comentarios']} comentarios")
    print(f'{medidos} {"post medido" if medidos == 1 else "posts medidos"}.')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['pendientes']:
        pendientes()
    elif a[:1] == ['aplicada'] and len(a) >= 3:
        aplicada(a[1], a[2], a[a.index('--cambio') + 1] if '--cambio' in a else '')
    elif a[:1] == ['aprendido'] and len(a) > 1:
        aprendido(a[1:])
    elif a[:1] == ['estado']:
        estado(reconciliar='--sin-reconciliar' not in a)
    elif a[:1] == ['metricas']:
        metricas(int(a[a.index('--horas') + 1]) if '--horas' in a else 72)
    else:
        sys.exit(__doc__)
