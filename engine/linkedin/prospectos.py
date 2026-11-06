#!/usr/bin/env python3
"""Busca personas y empresas que hoy buscan quién les haga lo que vendés, y las deja en LinkedIn → Prospectos.

Dos señales:
- **Posteos de LinkedIn** (la principal): alguien pide que le recomienden una agencia o un freelancer, pide ayuda con IA, o
  una empresa publica que contrata a alguien para sus redes. HarvestAPI en Apify los busca por palabra clave desde su propia
  infraestructura, sin tu cuenta ni tus cookies (APIFY_API_TOKEN, unos US$0,002 por posteo), y Gemini separa al que pide del
  que ofrece (GEMINI_API_KEY, centavos).
- **Avisos laborales**: muestran la necesidad y el presupuesto. Google Jobs por SerpApi (SERPAPI_KEY, el plan gratis da 250
  búsquedas por mes), Computrabajo y la API pública de GetOnBoard.
Opcional, con SCRAPECREATORS_API_KEY: la ficha de la empresa en LinkedIn (rubro, tamaño, web) y su Instagram (cuántos días
lleva sin publicar), y los textos del primer contacto que escribe Gemini para que los copies.

No contacta a nadie, no usa sesiones ni tu cuenta. Lee qué buscar de <linkedin>/busquedas.json (si no está, copiá
.claude/skills/linkedin-prospectos/busquedas.example.json y completá `oferta` y `firma`). Escribe:
- prospectos.json, que lee el planner (se fusiona con la corrida anterior: un prospecto no se pierde);
- busquedas/<AAAAMMDD>/ con lo bajado crudo y lo ya clasificado, para no pagar dos veces;
- logs/gastos.ndjson con lo que se gastó.

Uso:
    python3 engine/linkedin/prospectos.py                 # últimos 7 días
    python3 engine/linkedin/prospectos.py --dias 30       # la primera vez, o después de una pausa
    python3 engine/linkedin/prospectos.py --sin-avisos    # sólo los posteos de LinkedIn
    python3 engine/linkedin/prospectos.py --solo-ia       # sólo los posteos que piden ayuda con IA (posteos_ia)
    python3 engine/linkedin/prospectos.py --sin-fichas --sin-textos   # sin ScrapeCreators ni textos de contacto
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import ESTADO, LI, PROSPECTOS, REPO, clave, gasto, read_json, write_json  # noqa: E402

EJEMPLO = REPO / '.claude/skills/linkedin-prospectos/busquedas.example.json'
SC = 'https://api.scrapecreators.com'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
PAUSA = 1.5
APIFY_POSTEOS = 'harvestapi~linkedin-post-search'
USD_POSTEO, USD_CREDITO = 0.002, 0.00188
PAISES = {'ar': 'Argentina', 'bo': 'Bolivia', 'br': 'Brasil', 'cl': 'Chile', 'co': 'Colombia', 'cr': 'Costa Rica', 'cu': 'Cuba',
          'do': 'República Dominicana', 'ec': 'Ecuador', 'es': 'España', 'gt': 'Guatemala', 'hn': 'Honduras', 'mx': 'México',
          'ni': 'Nicaragua', 'pa': 'Panamá', 'pe': 'Perú', 'pr': 'Puerto Rico', 'py': 'Paraguay', 'sv': 'El Salvador',
          'us': 'Estados Unidos', 'uy': 'Uruguay', 've': 'Venezuela'}
LATAM = {'ar', 'bo', 'br', 'cl', 'co', 'cr', 'cu', 'do', 'ec', 'gt', 'hn', 'mx', 'ni', 'pa', 'pe', 'pr', 'py', 'sv', 'uy', 've'}
VOSEO = {'ar', 'uy', 'py'}

# Lo que no es marketing aunque diga «busco agencia».
NO_ES_MARKETING = re.compile(r'contab|colocaci|viaje|turismo corporativo|headhunt|selecci[oó]n de personal|reclutamiento|'
                             r'investigaci[oó]n de mercado|material(es)? pop|\bpop\b|impresi[oó]n|teambuilding|team building|'
                             r'outdoor|abogad|inmobiliari|log[ií]stic|seguridad|limpieza|traducci', re.I)
CLASIFICAR = """Clasificá posteos de LinkedIn para encontrar clientes de este servicio: {oferta}

Para cada posteo devolvé:
- tipo:
  - "pide_ia": el autor (o su empresa) le pide a alguien de afuera (agencia, freelancer, consultor, herramienta o curso) que lo ayude con contenido con IA, marketing con IA, automatización de contenido o automatización de marketing. También cuando pide una agencia y aclara que tiene que trabajar con IA o automatización. No cuenta quien vende eso, ni quien busca empleado para su equipo, ni quien opina o enseña.
  - "pide_servicio": el autor (o su empresa) busca o pide que le recomienden una agencia, freelancer, persona o herramienta externa para su marketing digital, contenido, redes sociales, video, diseño para redes, publicidad digital, pauta o automatización de marketing. NO cuenta si lo que busca es otra cosa aunque diga «agencia»: viajes, contabilidad, selección de personal o headhunting, colocación, investigación de mercados, impresión o material POP, eventos, inmobiliaria, abogados.
  - "contrata": una empresa que NO es agencia ni consultora publica que busca contratar a alguien para sus propias redes, contenido, video o marketing (community manager, social media, editor, creador de contenido).
  - "ofrece": vende servicios, busca clientes, socios o alianzas, busca trabajo, o es una agencia, consultora, headhunter o empresa de selección que busca gente (para sí o para un cliente).
  - "otro": opinión, noticia, consejo, pasantías o prácticas, puestos que no son de marketing o contenido, y cualquier otra cosa.
- quien: nombre de la empresa que necesita el servicio, si se sabe; si no, vacío.
- pais: país de esa empresa en código ISO de dos letras si se deduce del texto o del titular del autor; vacío si no se sabe.
- que_pide: en una frase corta en castellano, qué necesita (vacío si no es pide_ia, pide_servicio ni contrata).
- rubro: rubro de la empresa en dos o tres palabras, si se deduce.

Posteos (JSON):
"""
TEXTOS = """Escribí los textos del primer contacto con cada prospecto, de parte de {firma}. Lo que ofrece: {oferta}

Reglas:
- Hablale como habla esa persona: voseo si es de Argentina, Uruguay o Paraguay; tuteo en el resto. Frases cortas, sin jerga, sin emojis, sin signos de exclamación seguidos.
- Mencioná lo que pidió o publicó con sus palabras, para que se note que lo leíste, pero no analices su negocio.
- Nunca prometas ventas, alcance, seguidores ni viralidad. Nunca pongas links. Nunca menciones precios.
- La oferta concreta: {muestra}
- comentario: sólo si pidió que le recomienden una agencia o persona (señal pide_ia o pide_servicio). Público y útil: dos o tres cosas concretas que conviene pedirle a quien elija para lo que pidió. Sin vender nada, y al final «te escribo por privado». Máximo 450 caracteres. Vacío en las otras señales.
- nota: nota de la invitación a conectar, máximo 190 caracteres.
- mensaje: mensaje privado después de que acepta, máximo 600 caracteres. Si la señal es contrata o busqueda_laboral, plantealo como alternativa o complemento a la persona que está buscando, sin desmerecer el puesto. Si hay conteo de Instagram, podés usar esos números con tacto (sólo en privado).
- email_asunto: máximo 60 caracteres, sin mayúsculas sostenidas.
- email: máximo 900 caracteres, firmado «{firma}», y al final «Si no te interesa, respondé no y no te escribo más.»

Prospectos (JSON):
"""

# El puesto tiene que ser de contenido o marketing, no de relaciones con la comunidad ni pasantías.
PUESTO_SI = re.compile(r'community|social media|redes|contenid|content|marketing|editor.{0,4}de video|video editor|'
                       r'audiovisual|filmmaker|reels|creativ|dise[nñ]ador.{0,3} gr[aá]fic|graphic designer|'
                       r'(?<!tele)comunicaci[oó]n|copywriter|brand|marca', re.I)
PUESTO_NO = re.compile(r'relaciones comunitarias|gesti[oó]n social|trabajador.? social|asistente social|social worker|'
                       r'seguridad social|comunitari|pasant|pr[aá]ctica|practicante|trainee|intern\b|internship|ejecutiv.{0,3} de ventas|'
                       r'vendedor|moderador|modelo profesional|influencer|voluntari|\bremote\b', re.I)
# Quien vende lo mismo que vos, o pone gente en otras empresas, no es un cliente.
RUBRO_NO = re.compile(r'advertis|marketing|publicidad|staffing|recruit|selecci[oó]n|recursos humanos|human resources|outsourc|'
                      r'public relations|relaciones p[uú]blicas|government|administraci[oó]n p[uú]blica|broadcast|media production|'
                      r'producci[oó]n de medios|publishing|editorial|design services|servicios de dise|graphic design|dise[nñ]o gr[aá]fico|'
                      r'animation|executive search|armed forces|public policy|online audio and video|medios en l[ií]nea', re.I)
NOMBRE_NO = re.compile(r'\b(agencia|agency|media|marketing|estudio creativo|staffing|recruit\w*|talent\w*|'
                       r'consultora de rrhh|rrhh|recursos humanos|selecci[oó]n|headhunt\w*|outsourc\w*|freelanc\w*|'
                       r'municipalidad|ministerio|gobierno|consultora|manpower\w*|adecco|randstad|konecta|hays|michael page|'
                       r'job\w*|empleos?|hiring|apex america|atento|selection|team-?work|staff\w*|'
                       r'rh|ads|traffic|comunicaciones|llc|inc|ltd)\b', re.I)
# La que busca para un cliente es una agencia o una consultora, aunque el nombre no lo diga.
PARA_CLIENTE = re.compile(r'somos una agencia|nuestra agencia|agencia de (marketing|publicidad|comunicaci)|para (un |nuestro |importante )?cliente|'
                          r'nuestros clientes|cartera de clientes|consultora de (rrhh|recursos humanos|selecci)', re.I)
CONFIDENCIAL = re.compile(r'confidencial|importante empresa|empresa del sector|reconocida empresa|empresa l[ií]der|'
                          r'^(empresa|e-commerce|compa[nñ][ií]a|importante|reconocida|prestigiosa|l[ií]der)\b', re.I)


# ---------------------------------------------------------------- configuración


def busquedas() -> dict:
    """Qué buscar: <linkedin>/busquedas.json, o el ejemplo de la skill si todavía no lo copiaste."""
    propio = LI / 'busquedas.json'
    cfg = read_json(propio) or read_json(EJEMPLO)
    if not cfg:
        sys.exit(f'Falta {propio}: copiá {EJEMPLO} y completá oferta y firma.')
    cfg['_origen'] = str(propio if propio.exists() else EJEMPLO)
    return cfg


def rubro_si(cfg: dict):
    r = cfg.get('rubros_preferidos') or ''
    return re.compile(r, re.I) if r else None


# ---------------------------------------------------------------- utilidades


def tamano_max(t: str | None) -> int | None:
    """El tope del rango, desde «51-200 employees», «10,001+ employees» o «De 51 a 200 empleados»."""
    nums = [int(n.replace('.', '').replace(',', '')) for n in re.findall(r'\d[\d.,]*\d|\d', t or '')]
    return max(nums) if nums else None


def tamano_puntos(t: str | None) -> int | None:
    """Puntos por tamaño. None si no se sabe."""
    alto = tamano_max(t)
    if alto is None:
        return None
    return 0 if alto <= 10 else 1 if alto <= 50 else 3 if alto <= 500 else 2 if alto <= 1000 else 1 if alto <= 5000 else 0


def clave_empresa(nombre: str) -> str:
    t = unicodedata.normalize('NFKD', nombre or '').encode('ascii', 'ignore').decode().lower()
    t = re.sub(r'\b(s\.?a\.?s?|s\.?r\.?l|spa|ltda|inc|llc)\b\.?', ' ', t)
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:110]


def limpio(t: str) -> str:
    return html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t or ''))).strip()


def pedir(url: str, params: dict | None = None, headers: dict | None = None, cuerpo: dict | None = None, espera: int = 30, intentos: int = 3):
    """GET (o POST con `cuerpo`) con reintentos ante 429. Devuelve (status, texto) o (None, '')."""
    if params:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    data = json.dumps(cuerpo).encode() if cuerpo is not None else None
    hdr = {'User-Agent': UA, 'Accept-Language': 'es-AR,es;q=0.9', **({'Content-Type': 'application/json'} if data else {}), **(headers or {})}
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=hdr), timeout=espera) as r:
                return r.status, r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 429 and i + 1 < intentos:
                time.sleep(20)
                continue
            return e.code, e.read().decode('utf-8', 'replace')
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(3 * (i + 1))
    return None, ''


def pedir_json(*a, **k):
    status, texto = pedir(*a, **k)
    try:
        return status, json.loads(texto) if texto else None
    except ValueError:
        return status, None


def hace_a_fecha(texto: str, hoy: dt.date) -> str | None:
    m = re.search(r'(?:hace\s+)?(\d+)\s+(minuto|hora|d[ií]a|mes|semana|day|hour|week|month)', texto, re.I)
    if re.search(r'\bayer\b', texto, re.I):
        return (hoy - dt.timedelta(days=1)).isoformat()
    if not m:
        return None
    n, u = int(m.group(1)), m.group(2).lower()
    dias = 0 if u.startswith(('minuto', 'hora', 'hour')) else n if u.startswith('d') else n * 7 if u.startswith(('semana', 'week')) else n * 30
    return (hoy - dt.timedelta(days=dias)).isoformat()


# ---------------------------------------------------------------- avisos laborales


def google_empleos(pais: str, busqueda: str, hoy: dt.date, dias: int) -> tuple[list[dict], int]:
    key = clave('SERPAPI_KEY')
    if not key:
        return [], 0
    status, d = pedir_json('https://serpapi.com/search.json', {'engine': 'google_jobs', 'q': busqueda, 'location': PAISES.get(pais, pais),
                                                                'hl': 'es', 'gl': pais, 'api_key': key})
    if status != 200 or not isinstance(d, dict):
        return [], 1
    avisos = []
    for j in d.get('jobs_results', []):
        ext = j.get('detected_extensions') or {}
        fecha = hace_a_fecha(ext.get('posted_at') or '', hoy)
        if fecha and fecha < (hoy - dt.timedelta(days=dias)).isoformat():
            continue
        opciones = j.get('apply_options') or []
        li = next((o['link'] for o in opciones if 'linkedin.com/jobs' in (o.get('link') or '')), None)
        avisos.append({'fuente': 'google', 'via': j.get('via') or '', 'puesto': j.get('title') or '', 'empresa': j.get('company_name') or '',
                       'empresa_linkedin': None, 'lugar': j.get('location') or '', 'pais': pais, 'fecha': fecha,
                       'link': li or (opciones[0]['link'] if opciones else j.get('share_link')), 'busqueda': busqueda,
                       'logo': j.get('thumbnail'), 'descripcion': (j.get('description') or '')[:700]})
    return avisos, 1


def computrabajo(pais: str, slug: str, hoy: dt.date) -> list[dict]:
    status, texto = pedir(f'https://{pais}.computrabajo.com/trabajo-de-{slug}')
    time.sleep(PAUSA)
    if status != 200:
        return []
    avisos = []
    for a in re.findall(r'<article.*?</article>', texto, re.S):
        t = re.search(r'class="js-o-link[^"]*"\s+href="([^"#]+)[^"]*"[^>]*>(.*?)</a>', a, re.S)
        e = re.search(r'<p class="dFlex vm_fx fs16 fc_base mt5">(.*?)</p>', a, re.S)
        lo = re.search(r'<p class="fs16 fc_base mt5">\s*<span class="mr10">(.*?)</span>', a, re.S)
        f = re.search(r'<p class="fs13 fc_aux mt15">(.*?)</p>', a, re.S)
        if not t:
            continue
        # Computrabajo pega la calificación de la empresa delante del nombre («4,2 Empresa»).
        empresa = re.sub(r'^\d[,.]\d\s+', '', limpio(re.sub(r'<span class="ml5.*', '', e.group(1), flags=re.S))) if e else ''
        empresa = re.sub(r'[^\w\s.,&()\-–®°]+$', '', empresa).strip()
        avisos.append({'fuente': 'computrabajo', 'puesto': limpio(t.group(2)), 'empresa': empresa, 'empresa_linkedin': None,
                       'lugar': limpio(lo.group(1)) if lo else '', 'pais': pais,
                       'fecha': hace_a_fecha(limpio(f.group(1)), hoy) if f else None,
                       'link': f'https://{pais}.computrabajo.com{t.group(1)}', 'busqueda': slug.replace('-', ' ')})
    return avisos


def getonbrd(busqueda: str, desde: dt.date, paises: list[str]) -> list[dict]:
    status, d = pedir_json('https://www.getonbrd.com/api/v0/search/jobs', {'query': busqueda, 'per_page': 50, 'expand': '["company"]'})
    time.sleep(PAUSA)
    if status != 200 or not isinstance(d, dict):
        return []
    por_nombre = {v.lower(): k for k, v in PAISES.items()}
    avisos = []
    for j in d.get('data', []):
        a = j.get('attributes') or {}
        pais = next((por_nombre[p.lower()] for p in a.get('countries') or [] if por_nombre.get(p.lower()) in paises), None)
        fecha = dt.datetime.fromtimestamp(a.get('published_at') or 0, dt.timezone.utc).date()
        if not pais or fecha < desde:
            continue
        co = ((a.get('company') or {}).get('data') or {}).get('attributes') or {}
        avisos.append({'fuente': 'getonbrd', 'puesto': a.get('title') or '', 'empresa': co.get('name') or '',
                       'empresa_linkedin': None, 'lugar': ', '.join(a.get('countries') or []), 'pais': pais,
                       'fecha': fecha.isoformat(), 'link': (j.get('links') or {}).get('public_url'), 'busqueda': busqueda,
                       'web': co.get('web')})
    return avisos


# ---------------------------------------------------------------- posteos de LinkedIn


def linkedin_posteos(run_dir: Path, dias: int, consultas: list[str]) -> list[dict]:
    """Posteos por palabra clave con HarvestAPI (Apify), sin tu cuenta. Lo bajado hoy no se vuelve a pedir."""
    token = clave('APIFY_API_TOKEN')
    if not token:
        print('!! sin APIFY_API_TOKEN: no hay posteos', file=sys.stderr)
        return []
    limite = '24h' if dias <= 1 else 'week' if dias <= 7 else 'month' if dias <= 31 else '3months'
    crudos = run_dir / 'posteos-crudos.json'
    items = read_json(crudos, []) if crudos.exists() else []
    hechas = {(it.get('query') or {}).get('search') for it in items}
    faltan = [q for q in consultas if q not in hechas]
    # De a 5: con muchas juntas la llamada se corta antes de terminar.
    for n in range(0, len(faltan), 5):
        tanda = faltan[n:n + 5]
        status, nuevos = pedir_json(f'https://api.apify.com/v2/acts/{APIFY_POSTEOS}/run-sync-get-dataset-items', {'token': token, 'timeout': 280},
                                    cuerpo={'searchQueries': tanda, 'maxPosts': 25, 'postedLimit': limite, 'sortBy': 'date'}, espera=300, intentos=1)
        if not isinstance(nuevos, list) or not nuevos:
            print(f'!! Apify no devolvió posteos para {len(tanda)} búsquedas ({status})', file=sys.stderr)
            continue
        items += nuevos
        crudos.write_text(json.dumps(items, ensure_ascii=False))
        gasto('apify', 'harvestapi/linkedin-post-search', len(nuevos), 'posteo', len(nuevos) * USD_POSTEO, f'{len(tanda)} búsquedas de posteos ({limite})')
    return items


def gemini(modelo: str, prompt: str, esquema: dict, temperatura: float, etapa: str, detalle: str):
    key = clave('GEMINI_API_KEY')
    if not key:
        return None
    cuerpo = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
              'generationConfig': {'responseMimeType': 'application/json', 'responseSchema': esquema, 'temperature': temperatura}}
    status, d = pedir_json(f'https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent', {'key': key}, cuerpo=cuerpo, espera=240, intentos=2)
    if status != 200 or not isinstance(d, dict):
        print(f'!! Gemini respondió {status}', file=sys.stderr)
        return None
    uso = d.get('usageMetadata') or {}
    gasto('gemini', f'{modelo}', uso.get('promptTokenCount', 0) + uso.get('candidatesTokenCount', 0) + uso.get('thoughtsTokenCount', 0), 'token', 0, f'{etapa}: {detalle}')
    try:
        return json.loads(d['candidates'][0]['content']['parts'][0]['text'])
    except (KeyError, IndexError, ValueError):
        return None


def clasificar(posts: list[dict], cfg: dict, modelo: str) -> dict[str, dict]:
    """Separa al que pide del que ofrece, de a 60 posteos. Devuelve {id: clasificación}."""
    salida = {}
    esquema = {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'required': ['i', 'tipo', 'quien', 'pais', 'que_pide', 'rubro'], 'properties': {
        'i': {'type': 'INTEGER'}, 'tipo': {'type': 'STRING', 'enum': ['pide_ia', 'pide_servicio', 'contrata', 'ofrece', 'otro']},
        'quien': {'type': 'STRING'}, 'pais': {'type': 'STRING'}, 'que_pide': {'type': 'STRING'}, 'rubro': {'type': 'STRING'}}}}
    for n in range(0, len(posts), 60):
        tanda = posts[n:n + 60]
        datos = [{'i': i, 'autor': (p.get('author') or {}).get('name'), 'titular': ((p.get('author') or {}).get('info') or '')[:120],
                  'texto': (p.get('content') or '')[:900]} for i, p in enumerate(tanda)]
        filas = gemini(modelo, CLASIFICAR.format(oferta=cfg.get('oferta') or 'un servicio de contenido y marketing') + json.dumps(datos, ensure_ascii=False),
                       esquema, 0, 'clasificar', f'{len(tanda)} posteos')
        for f in filas or []:
            if isinstance(f.get('i'), int) and 0 <= f['i'] < len(tanda):
                salida[str(tanda[f['i']].get('id'))] = f
    return salida


def prospecto_de_posteo(item: dict, c: dict, hoy: dt.date, cercanos: set[str]) -> dict:
    a = item.get('author') or {}
    fecha = ((item.get('postedAt') or {}).get('date') or '')[:10] or None
    ia = c['tipo'] == 'pide_ia'
    pide = ia or c['tipo'] == 'pide_servicio'
    pais = (c.get('pais') or '').lower()
    dias = (hoy - dt.date.fromisoformat(fecha)).days if fecha else 30
    puntaje = (12 if ia else 10 if pide else 6) + (1 if dias <= 3 else 0) + (1 if pais in cercanos else 0)
    por_que = ['pide ayuda con contenido o marketing con IA' if ia else 'pide una agencia o alguien de afuera para su marketing' if pide else 'publicó que contrata a alguien para sus redes',
               f'publicado hace {dias} días' if dias else 'publicado hoy']
    eng = item.get('engagement') or {}
    if (eng.get('comments') or 0) >= 20:
        por_que.append(f"ya tiene {eng['comments']} comentarios: llegar rápido")
    url_autor = re.sub(r'\?.*$', '', a.get('linkedinUrl') or '')
    return {'id': 'post-' + re.sub(r'[^a-z0-9-]+', '-', str(item.get('id')).lower())[:100], 'senal': c['tipo'], 'empresa': c.get('quien') or a.get('name') or '',
            'pais': pais, 'rubro': c.get('rubro') or None, 'que_pide': c.get('que_pide') or '',
            'autor': {'nombre': a.get('name'), 'titular': a.get('info'), 'url': url_autor,
                      'foto': (a.get('avatar') or {}).get('url') if isinstance(a.get('avatar'), dict) else a.get('avatar'),
                      'tipo': a.get('type')},
            'post': {'texto': (item.get('content') or '')[:3000], 'url': item.get('linkedinUrl'), 'fecha': fecha,
                     'reacciones': eng.get('likes'), 'comentarios': eng.get('comments')},
            'avisos': [], 'puntaje': puntaje, 'por_que': por_que, 'nivel': 'A' if puntaje >= 9 else 'B'}


def textos_de_contacto(prospectos: list[dict], cfg: dict, modelo: str) -> dict[str, dict]:
    """Comentario, nota, mensaje y mail para cada prospecto, de a 15. Devuelve {id: textos}."""
    salida = {}
    esquema = {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'required': ['id', 'nota', 'mensaje', 'email_asunto', 'email'], 'properties': {
        k: {'type': 'STRING'} for k in ('id', 'comentario', 'nota', 'mensaje', 'email_asunto', 'email')}}}
    prompt = TEXTOS.format(firma=cfg.get('firma') or 'quien vende el servicio', oferta=cfg.get('oferta') or 'un servicio de contenido y marketing',
                           muestra=cfg.get('muestra') or 'una muestra gratis hecha con su marca, que se le muestra en una llamada corta.')
    for n in range(0, len(prospectos), 15):
        tanda = prospectos[n:n + 15]
        datos = [{'id': p['id'], 'senal': p.get('senal'), 'empresa': p.get('empresa'), 'pais': p.get('pais'), 'rubro': p.get('rubro'),
                  'que_pide': p.get('que_pide') or '; '.join(v.get('puesto') or '' for v in p.get('avisos', [])[:3]),
                  'autor': (p.get('autor') or {}).get('nombre'), 'titular': ((p.get('autor') or {}).get('titular') or '')[:120],
                  'posteo': ((p.get('post') or {}).get('texto') or '')[:700],
                  'conteo_instagram': {k: (p.get('conteo') or {}).get(k) for k in ('dias_sin_publicar', 'posts_90', 'hueco_mas_largo')} if p.get('conteo') else None}
                 for p in tanda]
        filas = gemini(modelo, prompt + json.dumps(datos, ensure_ascii=False), esquema, 0.4, 'textos', f'{len(tanda)} prospectos')
        ids = {p['id'] for p in tanda}
        for f in filas or []:
            if f.get('id') in ids:
                salida[f.pop('id')] = {k: (v or '').strip() for k, v in f.items()}
    return salida


# ---------------------------------------------------------------- fichas (ScrapeCreators)


class Creditos:
    def __init__(self):
        self.usados, self.key = 0, clave('SCRAPECREATORS_API_KEY')

    def api(self, path: str, params: dict) -> dict:
        if not self.key:
            return {}
        status, d = pedir_json(SC + path, params, headers={'x-api-key': self.key}, espera=60)
        if not isinstance(d, dict):
            return {}
        self.usados += int(d['credits_charged']) if 'credits_charged' in d else int(status == 200)
        return d if status == 200 else {}

    def anotar(self, detalle: str):
        if self.usados:
            gasto('scrapecreators', 'credito', self.usados, 'credito', self.usados * USD_CREDITO, detalle)


def ficha_linkedin(cr: Creditos, url: str | None, nombre: str) -> dict:
    """Ficha de la página de la empresa. Sin URL, prueba el nombre como la arma LinkedIn; un 404 no cobra."""
    k = clave_empresa(nombre)
    probar = [url] if url else [f'https://www.linkedin.com/company/{k}', f'https://www.linkedin.com/company/{k.replace("-", "")}']
    if not url:
        for r in cr.api('/v1/google/search', {'query': f'{nombre} linkedin company'}).get('results') or []:
            m = re.match(r'https://[a-z]+\.linkedin\.com/company/([^/?#]+)', r.get('url') or '')
            if m:
                probar.append(f'https://www.linkedin.com/company/{m.group(1)}')
                break
    for u in probar:
        d = cr.api('/v1/linkedin/company', {'url': u})
        if d.get('name'):
            break
    else:
        return {}
    # Una página con otro nombre es otra empresa.
    if not url and clave_empresa(d.get('name'))[:6] != k[:6]:
        return {}
    return {'nombre': d.get('name'), 'rubro': d.get('industry'), 'tamano': d.get('size'), 'web': d.get('website'),
            'seguidores_linkedin': d.get('followers'), 'logo': d.get('logo'), 'linkedin': d.get('url') or u}


def instagram_de_la_web(web: str) -> str | None:
    if not web:
        return None
    status, texto = pedir(web if web.startswith('http') else 'https://' + web, espera=10, intentos=1)
    if status != 200:
        return None
    for h in re.findall(r'instagram\.com/([A-Za-z0-9_.]{2,30})', texto):
        if h.lower() not in {'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'instagram'}:
            return h.strip('.')
    return None


def ig_coincide(nombre: str, handle: str) -> bool:
    """El usuario tiene que contener la primera palabra propia del nombre: con cualquier palabra pasaban cuentas ajenas."""
    partes = [t for t in clave_empresa(nombre).split('-') if len(t) >= 4 and t not in {'grupo', 'group', 'empresa', 'importadora', 'industrias'}]
    return bool(partes) and partes[0] in handle.lower().replace('.', '').replace('_', '')


def instagram_por_google(cr: Creditos, nombre: str) -> str | None:
    for r in cr.api('/v1/google/search', {'query': f'{nombre} instagram'}).get('results') or []:
        m = re.match(r'https://(?:www\.)?instagram\.com/([A-Za-z0-9_.]{2,30})/?(?:\?|$)', r.get('url') or '')
        if m and m.group(1).lower() not in {'p', 'reel', 'explore', 'accounts'} and ig_coincide(nombre, m.group(1)):
            return m.group(1)
    return None


def conteo_instagram(cr: Creditos, handle: str, hoy: dt.date) -> dict:
    """Con los últimos 12 posts que se ven: días desde el último y el hueco más largo en 90 días."""
    u = (cr.api('/v1/instagram/profile', {'handle': handle}).get('data') or {}).get('user') or {}
    if not u:
        return {}
    ts = sorted((e.get('node') or {}).get('taken_at_timestamp') or 0 for e in ((u.get('edge_owner_to_timeline_media') or {}).get('edges') or []))
    fechas = [dt.datetime.fromtimestamp(t, dt.timezone.utc).date() for t in ts if t]
    base = {'instagram': handle, 'seguidores_instagram': (u.get('edge_followed_by') or {}).get('count'), 'privada': bool(u.get('is_private'))}
    if not fechas:
        return {**base, 'ultimo_post': None}
    return {**base, **huecos(fechas, hoy)}


def huecos(fechas: list[dt.date], hoy: dt.date) -> dict:
    """El hueco se mide dentro de los 90 días: si el último posteo anterior es más viejo, el tramo arranca en el día 90."""
    fechas = sorted(fechas)
    en90 = [f for f in fechas if (hoy - f).days <= 90]
    inicio = hoy - dt.timedelta(days=90)
    antes = [f for f in fechas if f < inicio]
    tramo = sorted(set(([inicio] if antes or not en90 else []) + en90 + [hoy]))
    hs = [((b - a).days, a) for a, b in zip(tramo, tramo[1:])]
    hueco, desde = max(hs) if hs else (0, None)
    return {'ultimo_post': fechas[-1].isoformat(), 'dias_sin_publicar': (hoy - fechas[-1]).days,
            'posts_90': len(en90), 'posts_90_es_minimo': len(en90) == len(fechas) == 12,
            'hueco_mas_largo': hueco, 'hueco_desde': desde.isoformat() if desde else None}


# ---------------------------------------------------------------- armado


def puntuar(p: dict, preferidos) -> tuple[int, list[str]]:
    puntos, por_que = 3, ['busca a alguien para su contenido']
    tam = tamano_puntos(p.get('tamano'))
    puntos += 1 if tam is None else tam
    if tam is not None:
        por_que.append(re.sub(r'\s*(employees|empleados)', '', p['tamano']).replace('De ', '').replace(' a ', '-') + ' empleados')
    if preferidos and preferidos.search(p.get('rubro') or ''):
        puntos += 2
        por_que.append(f"un rubro donde ya tenés casos ({p['rubro']})")
    if len(p['avisos']) > 1:
        puntos += 1
        por_que.append(f"{len(p['avisos'])} búsquedas abiertas")
    c = p.get('conteo') or {}
    if c.get('dias_sin_publicar') is not None and c['dias_sin_publicar'] > 21:
        puntos += 2
        por_que.append(f"{c['dias_sin_publicar']} días sin publicar en Instagram")
    elif c.get('hueco_mas_largo', 0) > 21:
        puntos += 1
        por_que.append(f"un hueco de {c['hueco_mas_largo']} días en Instagram")
    return puntos, por_que


def descartar(p: dict) -> str | None:
    if len(re.sub(r'\W', '', p['empresa'] or '')) < 3 or CONFIDENCIAL.search(p['empresa']):
        return 'empresa confidencial'
    if NOMBRE_NO.search(p['empresa']):
        return 'agencia, RRHH u organismo público'
    if RUBRO_NO.search(p.get('rubro') or ''):
        return f"rubro {p['rubro']}"
    if (tamano_max(p.get('tamano')) or 99) <= 10:
        return 'menos de 11 empleados'
    if p.get('avisos') and all(PUESTO_NO.search(v.get('puesto') or '') for v in p['avisos']):
        return 'ningún puesto es de contenido'
    if any(PARA_CLIENTE.search(v.get('descripcion') or '') for v in p.get('avisos', [])):
        return 'busca para un cliente (agencia o consultora)'
    return None


def fusionar(anterior: dict, de_posteos: dict, empresas: dict, evaluados: set, decididos: dict, hoy: dt.date, preferidos) -> tuple[list, list]:
    """Lo de esta corrida más lo de antes: lo que no volvió a aparecer se queda 30 días, o para siempre si ya decidiste algo;
    lo que se evaluó en esta corrida y no pasó el filtro se va, salvo que ya lo hayas movido."""
    anterior = dict(anterior)
    prospectos, descartes = [], []
    for p in de_posteos.values():
        viejo = anterior.pop(p['id'], {})
        p['detectado'] = viejo.get('detectado') or hoy.isoformat()
        p['nuevo'] = not viejo or viejo.get('detectado') == hoy.isoformat()
        p['ultima_vez'] = hoy.isoformat()
        p['textos'] = viejo.get('textos')
        prospectos.append(p)
    for e in empresas.values():
        motivo = descartar(e)
        if motivo:
            descartes.append({'empresa': e['empresa'], 'motivo': motivo, 'puestos': [v['puesto'] for v in e['avisos']]})
            continue
        viejo = anterior.pop(e['id'], {})
        links = {v['link'] for v in viejo.get('avisos', [])}
        e['avisos'] += [v for v in viejo.get('avisos', []) if v['link'] not in {w['link'] for w in e['avisos']}]
        e['senal'] = 'busqueda_laboral'
        e['puntaje'], e['por_que'] = puntuar(e, preferidos)
        e['nivel'] = 'A' if e['puntaje'] >= 9 else 'B' if e['puntaje'] >= 6 else 'C'
        e['detectado'] = viejo.get('detectado') or hoy.isoformat()
        e['nuevo'] = not viejo or any(v['link'] not in links for v in e['avisos'])
        e['ultima_vez'] = hoy.isoformat()
        e['textos'] = viejo.get('textos')
        prospectos.append(e)
    prospectos += [{**p, 'nuevo': False} for p in anterior.values()
                   if p['id'] in decididos or (p['id'] not in evaluados
                                               and (hoy - dt.date.fromisoformat(p.get('ultima_vez') or hoy.isoformat())).days <= 30)]
    prospectos.sort(key=lambda p: (-p['puntaje'], p['empresa']))
    return prospectos, descartes


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--dias', type=int, default=7, help='antigüedad máxima de posteos y avisos')
    ap.add_argument('--paises', help='países de los avisos laborales, por ejemplo ar,cl (por defecto, los de busquedas.json)')
    ap.add_argument('--max-fichas', type=int, default=80, help='tope de empresas a completar con ScrapeCreators')
    ap.add_argument('--sin-fichas', action='store_true')
    ap.add_argument('--sin-avisos', action='store_true', help='sólo los posteos de LinkedIn')
    ap.add_argument('--sin-posteos', action='store_true', help='sólo los avisos laborales')
    ap.add_argument('--mismos-posteos', action='store_true', help='reusa los posteos ya bajados hoy (no gasta en Apify)')
    ap.add_argument('--solo-ia', action='store_true', help='sólo los posteos que piden ayuda con IA (posteos_ia)')
    ap.add_argument('--sin-textos', action='store_true', help='no escribe los textos de contacto')
    a = ap.parse_args()

    cfg = busquedas()
    hoy = dt.date.today()
    desde = hoy - dt.timedelta(days=a.dias)
    run_dir = LI / 'busquedas' / f'{hoy:%Y%m%d}'
    run_dir.mkdir(parents=True, exist_ok=True)
    paises = [x for x in (a.paises.split(',') if a.paises else cfg.get('paises') or ['ar', 'cl']) if x in PAISES]
    permitidos = {x.lower() for x in cfg.get('paises_posteos') or LATAM}
    cercanos = set(paises)
    preferidos = rubro_si(cfg)
    modelo_c, modelo_t = cfg.get('modelo_clasificar') or 'gemini-3.5-flash-lite', cfg.get('modelo_textos') or 'gemini-3.8-flash'

    avisos, serp = [], 0
    if not a.sin_avisos:
        for pais in paises:
            for b in cfg.get('google_jobs') or []:
                nuevos, n = google_empleos(pais, b, hoy, a.dias)
                avisos += nuevos
                serp += n
            for s in cfg.get('computrabajo') or []:
                avisos += computrabajo(pais, s, hoy)
        for b in cfg.get('getonbrd') or []:
            avisos += getonbrd(b, desde, paises)
    avisos = [x for x in avisos if PUESTO_SI.search(x['puesto']) and not PUESTO_NO.search(x['puesto'])
              and (not x['fecha'] or x['fecha'][:10] >= desde.isoformat())]
    vistos, unicos = set(), []
    for x in avisos:
        k = x['link'] or (x['empresa'], x['puesto'])
        if k not in vistos:
            vistos.add(k)
            unicos.append(x)
    write_json(run_dir / 'avisos.json', unicos)

    empresas: dict[str, dict] = {}
    for x in unicos:
        k = clave_empresa(x['empresa'])
        if not k:
            continue
        e = empresas.setdefault(k, {'id': k, 'empresa': x['empresa'], 'pais': x['pais'], 'linkedin': x['empresa_linkedin'], 'web': x.get('web'), 'avisos': []})
        e['web'] = e['web'] or x.get('web')
        e['logo'] = e.get('logo') or x.get('logo')
        e['avisos'].append({k2: x.get(k2) for k2 in ('fuente', 'via', 'puesto', 'lugar', 'fecha', 'link', 'descripcion')})

    previos = {p['id']: p for p in read_json(PROSPECTOS).get('prospectos', [])}
    cache = run_dir / 'fichas.json'
    previos.update(read_json(cache))
    for e in empresas.values():
        viejo = previos.get(e['id'])
        if viejo and viejo.get('fichado'):
            e.update({k: viejo[k] for k in ('rubro', 'tamano', 'web', 'seguidores_linkedin', 'logo', 'linkedin', 'conteo', 'fichado', 'ig_buscado') if viejo.get(k)})
    cr = Creditos()
    candidatas = [e for e in empresas.values() if not descartar(e) and (not e.get('fichado') or not (e.get('conteo') or e.get('ig_buscado')))]
    candidatas.sort(key=lambda e: (-len(e['avisos']), e['empresa']))

    def guardar(e: dict):
        e['fichado'] = e.get('fichado') or hoy.isoformat()
        guardadas = read_json(cache)
        guardadas[e['id']] = {k: e.get(k) for k in ('rubro', 'tamano', 'web', 'seguidores_linkedin', 'logo', 'linkedin', 'conteo', 'fichado', 'ig_buscado')}
        write_json(cache, guardadas)

    for e in candidatas[: (0 if a.sin_fichas or not cr.key else a.max_fichas)]:
        if not e.get('fichado'):
            e.update({k: v for k, v in ficha_linkedin(cr, e['linkedin'], e['empresa']).items() if v and k != 'nombre'})
        if descartar(e):
            e['ig_buscado'] = hoy.isoformat()  # descartada por la ficha: no se le busca Instagram, y no se vuelve a pagar
            guardar(e)
            continue
        if not e.get('conteo'):
            h = instagram_de_la_web(e.get('web')) or instagram_por_google(cr, e['empresa'])
            if h:
                e['conteo'] = conteo_instagram(cr, h, hoy)
            e['ig_buscado'] = hoy.isoformat()
        guardar(e)
    cr.anotar(f'fichas de LinkedIn e Instagram de {len(candidatas)} empresas')

    crudos = []
    if not a.sin_posteos:
        crudos = read_json(run_dir / 'posteos-crudos.json', []) if a.mismos_posteos else \
            linkedin_posteos(run_dir, a.dias, cfg.get('posteos_ia') if a.solo_ia else (cfg.get('posteos') or []) + (cfg.get('posteos_ia') or []))
    vistos_p, posteos_unicos = set(), []
    for it in crudos:
        if it.get('id') and it['id'] not in vistos_p and (it.get('content') or '').strip():
            vistos_p.add(it['id'])
            posteos_unicos.append(it)
    cache_c = run_dir / 'clasificados.json'
    clasif = read_json(cache_c)
    clasif.update(clasificar([it for it in posteos_unicos if str(it['id']) not in clasif], cfg, modelo_t if a.solo_ia else modelo_c))
    write_json(cache_c, clasif)
    de_posteos, tipos = {}, {}
    for it in posteos_unicos:
        c = clasif.get(str(it['id'])) or {'tipo': 'otro'}
        tipos[c['tipo']] = tipos.get(c['tipo'], 0) + 1
        pais = (c.get('pais') or '').lower()
        if c['tipo'] not in ('pide_ia', 'pide_servicio', 'contrata') or (pais and pais not in permitidos) or NO_ES_MARKETING.search(c.get('que_pide') or ''):
            continue
        p = prospecto_de_posteo(it, c, hoy, cercanos)
        if p['senal'] == 'contrata' and (descartar({'empresa': p['empresa'], 'avisos': []}) or not PUESTO_SI.search(p['que_pide']) or PUESTO_NO.search(p['que_pide'])):
            continue
        de_posteos[p['id']] = p

    anterior = {p['id']: p for p in read_json(PROSPECTOS).get('prospectos', [])}
    decididos = read_json(ESTADO).get('prospectos', {})
    evaluados = set(empresas) | {'post-' + str(it['id']) for it in posteos_unicos}
    prospectos, descartes = fusionar(anterior, de_posteos, empresas, evaluados, decididos, hoy, preferidos)
    if not a.sin_textos:
        descartados = {k for k, v in decididos.items() if (v or {}).get('estado') == 'descartado'}
        nuevos_t = textos_de_contacto([p for p in prospectos if not p.get('textos') and p['id'] not in descartados], cfg, modelo_t)
        for p in prospectos:
            p['textos'] = p.get('textos') or nuevos_t.get(p['id'])

    write_json(PROSPECTOS, {'actualizado': dt.datetime.now().isoformat(timespec='minutes'), 'ventana_dias': a.dias, 'paises': paises,
                            'creditos': cr.usados, 'busquedas_google': serp, 'avisos_leidos': len(unicos), 'posteos_leidos': len(posteos_unicos),
                            'posteos_por_tipo': tipos, 'prospectos': prospectos, 'descartes': descartes})
    print(f'{len(posteos_unicos)} posteos ({tipos}) · {len(de_posteos)} de posteos · {len(unicos)} avisos · {len(prospectos)} prospectos · '
          f'{len(descartes)} descartes · {serp} búsquedas de Google Jobs · {cr.usados} créditos · {PROSPECTOS}')


if __name__ == '__main__':
    main()
