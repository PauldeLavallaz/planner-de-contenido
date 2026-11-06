#!/usr/bin/env python3
"""oauth.py — Autorización de sólo lectura para bajar TUS bookmarks de X (OAuth 2.0 con PKCE).

Permisos: tweet.read users.read bookmark.read offline.access. Con este token no se puede publicar, dar me gusta,
seguir, borrar ni mandar mensajes: sólo leer. No usa la sesión de tu navegador: autorizás una vez en x.com y listo.

Antes, en el portal de desarrolladores de X (developer.x.com), una app con OAuth 2.0 de tipo «Native App» o «Web App»
y como Callback URI la misma que X_OAUTH2_REDIRECT_URI (por defecto http://127.0.0.1:8735/callback). En el .env del
planner, escritas por vos: X_OAUTH2_CLIENT_ID y, si la app es «Web App», X_OAUTH2_CLIENT_SECRET.

Uso:
  oauth.py autorizar   imprime el link para autorizar y espera la vuelta (hasta 20 minutos); guarda los tokens en el .env
  oauth.py renovar     usa el refresh token para sacar uno nuevo (lo hace solo bookmarks.py)
  oauth.py estado      dice si hay autorización y hasta cuándo vale el token, sin mostrarlo
"""
import base64, hashlib, http.server, json, secrets, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comun import STATE, clave, guardar_en_env  # noqa: E402

AUTHORIZE = 'https://x.com/i/oauth2/authorize'
TOKEN = 'https://api.x.com/2/oauth2/token'
SCOPES = 'tweet.read users.read bookmark.read offline.access'
REDIRECT = 'http://127.0.0.1:8735/callback'


def b64url(b):
    return base64.urlsafe_b64encode(b).decode().rstrip('=')


def redirect():
    return clave('X_OAUTH2_REDIRECT_URI') or REDIRECT


def client_id():
    cid = clave('X_OAUTH2_CLIENT_ID')
    if not cid:
        sys.exit('Falta X_OAUTH2_CLIENT_ID en el .env del planner (lo saca el usuario del portal de desarrolladores de X).')
    return cid


def pedir_token(datos):
    cid, secreto = client_id(), clave('X_OAUTH2_CLIENT_SECRET')
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    if secreto:
        headers['Authorization'] = 'Basic ' + base64.b64encode(f'{cid}:{secreto}'.encode()).decode()
    req = urllib.request.Request(TOKEN, data=urllib.parse.urlencode({**datos, 'client_id': cid}).encode(), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'X rechazó el pedido de token ({e.code}): {e.read()[:300].decode("utf-8", "replace")}')


def guardar(tok):
    guardar_en_env({'X_OAUTH2_ACCESS_TOKEN': tok['access_token'],
                    'X_OAUTH2_REFRESH_TOKEN': tok.get('refresh_token') or clave('X_OAUTH2_REFRESH_TOKEN') or '',
                    'X_OAUTH2_EXPIRES_AT': str(int(time.time()) + int(tok.get('expires_in', 7200)))})


def autorizar(espera=1200):
    verificador = b64url(secrets.token_bytes(64))
    estado = b64url(secrets.token_bytes(16))
    params = {'response_type': 'code', 'client_id': client_id(), 'redirect_uri': redirect(), 'scope': SCOPES, 'state': estado,
              'code_challenge': b64url(hashlib.sha256(verificador.encode()).digest()), 'code_challenge_method': 'S256'}
    print('Abrí este link, iniciá sesión en X si hace falta y tocá «Autorizar»:\n')
    print(AUTHORIZE + '?' + urllib.parse.urlencode(params), flush=True)
    url = urllib.parse.urlparse(redirect())
    resultado = {}

    class Vuelta(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            q = urllib.parse.urlparse(self.path)
            if q.path != url.path:
                self.send_response(404); self.end_headers(); return
            p = urllib.parse.parse_qs(q.query)
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers()
            if p.get('state', [''])[0] != estado or 'code' not in p:
                resultado['error'] = p.get('error', ['state distinto'])[0]
                self.wfile.write('<h2>No se pudo autorizar. Volvé a Claude Code.</h2>'.encode()); return
            resultado['code'] = p['code'][0]
            self.wfile.write('<h2>Listo. Ya podés cerrar esta pestaña y volver a Claude Code.</h2>'.encode())

    srv = http.server.HTTPServer((url.hostname or '127.0.0.1', url.port or 80), Vuelta)
    srv.timeout = 5
    fin = time.time() + espera
    while time.time() < fin and not resultado:
        srv.handle_request()
    if 'code' not in resultado:
        sys.exit(f"No llegó la autorización: {resultado.get('error', 'se acabó el tiempo')}")
    guardar(pedir_token({'grant_type': 'authorization_code', 'code': resultado['code'], 'redirect_uri': redirect(), 'code_verifier': verificador}))
    print(json.dumps({'ok': True, 'permisos': SCOPES}))


def renovar():
    rt = clave('X_OAUTH2_REFRESH_TOKEN')
    if not rt:
        sys.exit('No hay autorización guardada: corré «python3 engine/x/oauth.py autorizar».')
    guardar(pedir_token({'grant_type': 'refresh_token', 'refresh_token': rt}))


def token():
    """Un access token vigente, renovándolo si está por vencer. Para los otros scripts."""
    if int(clave('X_OAUTH2_EXPIRES_AT') or 0) - 120 < time.time():
        renovar()
    t = clave('X_OAUTH2_ACCESS_TOKEN')
    if not t:
        sys.exit('No hay autorización guardada: corré «python3 engine/x/oauth.py autorizar».')
    return t


def estado():
    vence = int(clave('X_OAUTH2_EXPIRES_AT') or 0)
    print(json.dumps({'cliente': bool(clave('X_OAUTH2_CLIENT_ID')), 'autorizado': bool(clave('X_OAUTH2_REFRESH_TOKEN')),
                      'token_vence': time.strftime('%Y-%m-%d %H:%M', time.localtime(vence)) if vence else None,
                      'busquedas': bool(clave('X_BEARER_TOKEN')), 'typefully': bool(clave('TYPEFULLY_API_KEY')),
                      'transcribir': bool(clave('OPENAI_API_KEY'))}, ensure_ascii=False))


if __name__ == '__main__':
    STATE.mkdir(parents=True, exist_ok=True)
    {'autorizar': autorizar, 'renovar': renovar, 'estado': estado}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
