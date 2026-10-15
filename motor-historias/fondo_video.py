"""Prepara un video como fondo de una historia: color normal (SDR BT.709), 1080x1920 a 30 cuadros y sus cuadros JPG.

Para el formato de historia con video y voz en off: un video real de fondo, una voz que cuenta lo que se ve y el texto
arriba. El motor reproduce los cuadros con
<img data-secuencia> y render.py los pasa a MP4 cuadro a cuadro, así que el render sale idéntico siempre.

Color: un video del iPhone llega en HDR (HLG o Dolby Vision 8.4). Se pasa a color normal con la conversión de Apple
(avconvert, la misma que muestran el iPhone y el Mac) y se le bajan un poco las luces altas: la conversión con zscale +
hable deja la pantalla filmada demasiado brillante. Sin avconvert (fuera de macOS) usa zscale y lo avisa. Un video que ya es SDR (una grabación de pantalla, un clip de
YouTube) no se toca de color.

Encuadre: un video vertical llena la historia (se recorta lo que sobra); uno horizontal va entero, centrado sobre negro,
con lugar arriba y abajo para el texto. --encuadre lo fuerza.

Uso:
  python3 fondo_video.py VIDEO --fuente SEMANA/fuente [--id nombre] [--desde 0] [--hasta 12.5] [--encuadre cubrir|entero]

Deja SEMANA/fuente/assets/videos/<id>/001.jpg… y video.json, y escribe en la salida estándar el JSON para la historia:
{"secuencia": "assets/videos/<id>/%03d.jpg", "cuadros": N, "fps": 30, "duracion": s, "poster": "assets/videos/<id>/001.jpg", ...}
Necesita ffmpeg y ffprobe; en Mac usa avconvert (viene con el sistema).
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

W, H, FPS = 1080, 1920, 30
HDR_TRC = {'arib-std-b67', 'smpte2084'}
# Luces altas más suaves después de la conversión de Apple: el blanco de una pantalla filmada pasa de ~232 a ~214.
SUAVE = "curves=all='0/0 0.5/0.47 0.8/0.74 1/0.92',eq=saturation=0.96"


def correr(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        raise SystemExit(f'Falló {Path(cmd[0]).name}: {(r.stderr or r.stdout).strip()[-600:]}')
    return r.stdout


def sondear(video):
    d = json.loads(correr(['ffprobe', '-v', 'error', '-show_entries',
                           'format=duration:stream=index,codec_type,width,height,color_transfer,color_primaries:stream_side_data=rotation,side_data_type,dv_profile',
                           '-of', 'json', str(video)]))
    v = next((s for s in d.get('streams', []) if s.get('codec_type') == 'video'), None)
    if not v:
        raise SystemExit('El archivo no tiene video.')
    rot = next((abs(int(x.get('rotation', 0))) for x in v.get('side_data_list', []) if 'rotation' in x), 0)
    dv = next((x.get('dv_profile') for x in v.get('side_data_list', []) if x.get('side_data_type') == 'DOVI configuration record'), None)
    w, h = v.get('width', 0), v.get('height', 0)
    if rot in (90, 270):
        w, h = h, w
    return {'duracion': float(d.get('format', {}).get('duration') or 0), 'ancho': w, 'alto': h,
            'transfer': v.get('color_transfer'), 'primarias': v.get('color_primaries'), 'dolby_vision': dv,
            'hdr': v.get('color_transfer') in HDR_TRC or dv is not None}


def slug(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:40] or 'video'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video')
    ap.add_argument('--fuente', required=True, help='carpeta fuente/ de la semana')
    ap.add_argument('--id', default=None, help='nombre de la carpeta en assets/videos (default: el del archivo)')
    ap.add_argument('--desde', type=float, default=0.0)
    ap.add_argument('--hasta', type=float, default=None)
    ap.add_argument('--encuadre', choices=['cubrir', 'entero'], default=None)
    ap.add_argument('--calidad', type=int, default=3, help='calidad JPG de los cuadros (2 mejor, 5 más liviano)')
    a = ap.parse_args()
    video, fuente = Path(a.video).resolve(), Path(a.fuente).resolve()
    if not video.is_file():
        raise SystemExit(f'No existe {video}')
    info = sondear(video)
    hasta = min(a.hasta, info['duracion']) if a.hasta else info['duracion']
    if hasta - a.desde < 0.5:
        raise SystemExit('El tramo elegido dura menos de medio segundo.')
    encuadre = a.encuadre or ('cubrir' if info['ancho'] / max(1, info['alto']) <= 0.7 else 'entero')
    vid = slug(a.id or video.stem)
    out = fuente / 'assets' / 'videos' / vid
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    with tempfile.TemporaryDirectory() as tmp:
        base, conversion, filtros = video, 'sin cambios de color (SDR)', []
        if info['hdr']:
            if shutil.which('avconvert'):
                base = Path(tmp) / 'apple_sdr.mov'
                correr(['avconvert', '--source', str(video), '--preset', 'Preset3840x2160', '--output', str(base), '--replace'])
                conversion = 'HDR → SDR BT.709 con avconvert (Apple) + luces altas suavizadas'
                filtros.append(SUAVE)
            else:
                filtros.append('zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,'
                               'zscale=t=bt709:m=bt709:r=tv,format=yuv420p')
                conversion = 'HDR → SDR con zscale + hable (sin avconvert: revisar que no quede brilloso)'
                print('Aviso: sin avconvert; el color puede quedar más brillante que en el celular.', file=sys.stderr)
        if encuadre == 'cubrir':
            escala = f'scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}'
        else:
            escala = f'scale={W}:{H}:force_original_aspect_ratio=decrease:flags=lanczos,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black'
        cadena = [f'fps={FPS}', *filtros, escala, 'format=yuvj420p']
        correr(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{a.desde:.3f}', '-to', f'{hasta:.3f}',
                '-i', str(base), '-an', '-vf', ','.join(cadena), '-q:v', str(a.calidad), str(out / '%03d.jpg')])
    cuadros = len(list(out.glob('[0-9][0-9][0-9].jpg')))
    if not cuadros:
        raise SystemExit('No salió ningún cuadro del video.')
    sha = hashlib.sha256()
    with open(video, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            sha.update(b)
    meta = {'origen': str(video), 'origen_sha256': sha.hexdigest(), 'color_origen': {k: info[k] for k in ('transfer', 'primarias', 'dolby_vision', 'hdr')},
            'conversion': conversion, 'encuadre': encuadre, 'desde': a.desde, 'hasta': round(hasta, 3),
            'secuencia': f'assets/videos/{vid}/%03d.jpg', 'cuadros': cuadros, 'fps': FPS,
            'duracion': round(cuadros / FPS, 3), 'poster': f'assets/videos/{vid}/001.jpg'}
    (out / 'video.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    main()
