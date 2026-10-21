# Instalación guiada (para Claude Code)

Este archivo lo sigue Claude Code cuando alguien pide instalar el planner. Hablale al usuario en su idioma, en frases cortas, sin jerga. Explicá cada paso antes de hacerlo y avanzá solo con lo que no requiere decisión. Pedí confirmación antes de instalar programas, mover archivos o tocar Postiz.

Al terminar cada paso, decí en una línea qué quedó listo y cuál es el siguiente.

## 0. Dónde va el planner

Si todavía no está clonado:

1. Preguntá dónde guarda su contenido (la carpeta con sus videos y carruseles). Si Claude Code ya está abierto ahí, proponé usar esa.
2. Recomendá clonar el planner **adentro** de esa carpeta, así queda todo junto:

   ```bash
   git clone https://github.com/PauldeLavallaz/planner-de-contenido.git
   ```

   Si prefiere otro lugar, clonalo donde diga; después se apunta a su carpeta de contenido con una ruta absoluta.
3. Trabajá desde la carpeta del planner (`cd planner-de-contenido`) en el resto de los pasos.

Si no tiene contenido todavía, igual sirve: en el paso 5 se crea la estructura estándar.

## 1. Requisitos

```bash
python3 engine/doctor.py
```

En Windows el comando es `python` en vez de `python3` (en todo este archivo). El doctor dice qué falta y cómo instalarlo según el sistema. Instalá lo que falte **con el OK del usuario**: Node 22.18+, Python 3.10+, el CLI de Postiz (`npm install -g postiz`) y, si quiere portadas y notas de voz, ffmpeg. Si no hay Homebrew en macOS o winget en Windows, ofrecé el instalador oficial de cada programa.

Después:

```bash
cd app && npm ci && cd ..
```

## 2. Configuración inicial

```bash
cp planner.config.example.json planner.config.json
```

Preguntá y completá en `planner.config.json`:

- **Ciudad o país** → `timezone` (zona IANA: `America/Argentina/Buenos_Aires`, `America/Mexico_City`, `Europe/Madrid`, `America/Bogota`…).
- **Marcas o cuentas** que maneja → `brands` (la primera es la principal). Si es una sola, dejá una.
- **Carpeta de contenido** → `content.root`. Si el planner está adentro de esa carpeta, queda `".."`. Si no, la ruta absoluta.
- **Horarios habituales** de publicación → `slots` (la grilla del día, por ejemplo tres horarios) y `suggested_times` (los botones de hora del planner). Si no sabe, dejá los de ejemplo y decile que se cambian cuando quiera.

## 3. Postiz

Explicá en dos líneas qué es: Postiz es el servicio que publica en las redes. El planner organiza; Postiz ejecuta. Se puede usar en la nube (postiz.com): no tiene plan gratis, sí una prueba de 7 días, y cada plan admite una cantidad de canales (cada cuenta conectada es un canal). También se puede instalar gratis en un servidor propio, pero eso exige crear y hacer aprobar una app de desarrollador en cada red (Meta, TikTok, Google…): para alguien que empieza, la nube es el camino.

1. **Cuenta y redes.** Si no tiene cuenta, que la cree en https://postiz.com. Dentro de Postiz, con el botón para agregar un canal, que conecte cada red que quiera usar (una o varias cuentas por red). Instagram puede conectarse como cuenta profesional; TikTok, YouTube, LinkedIn (perfil o página), Facebook, X, Threads, Bluesky, Pinterest y el resto, cada una con su login. Esto lo hace el usuario en el navegador: vos esperá y preguntá cuando termine.
2. **Conectar el CLI.** Ofrecé las dos opciones:
   - **Login (recomendado):** corré `postiz auth:login`. Muestra un enlace y un código; el usuario lo abre, aprueba y vuelve. Las credenciales quedan en su computadora (`~/.postiz`).
   - **API key:** en la configuración de Postiz (Settings), en la sección de API pública, que copie la clave y la pegue **él mismo** en un archivo `.env` en la carpeta del planner, con la línea `POSTIZ_API_KEY=...`. No le pidas que pegue la clave en el chat. Si usa un Postiz instalado por su cuenta, agregá también `POSTIZ_API_URL=` con la dirección de la API de su instalación. Con una instalación propia, la API key es el camino más simple.

   Verificá con `postiz auth:status`.
3. **Leer sus cuentas.**

   ```bash
   python3 engine/conectar.py --verificar
   ```

   Muestra cada red con su cuenta principal y las alternativas. Preguntá:
   - Si en alguna red tiene más de una cuenta, **cuál sale por defecto**: `--principal instagram=usuario`. Las otras se eligen por pieza en el planner.
   - **TikTok:** ¿publicación directa o borrador en la app? Con borrador (`--tiktok inbox`), el video le llega a la app de TikTok y lo publica desde el teléfono (sirve para elegir música o portada ahí). Con directa (`--tiktok direct`, el default), sale solo.
   - **En qué redes sale cada pieza por defecto** → `default_networks` en la config (después se cambia pieza por pieza).
   - **Instagram:** ¿suele publicar en colaboración con otras cuentas? Cargalas en `instagram.collaborator_options` (`{"label": "Nombre", "handle": "usuario"}`) y, si alguna va siempre, en `instagram.default_collaborators`. ¿Usa reels de prueba (Trial)? El default es feed; `instagram.reels_trial_default: true` lo cambia.
   - Si el verificador avisa que una red **pide un ajuste** (por ejemplo, el tablero de Pinterest), conseguí el valor con el usuario y cargalo en `channels.<red>.settings`. Para listas que trae la red (tableros, playlists), probá `postiz integrations:trigger <id> <método>`; si no sabés el método, preguntale al usuario el valor.

## 4. Carpetas

Seguí la skill [organizar-carpetas](.claude/skills/organizar-carpetas/SKILL.md). En resumen:

1. `python3 engine/carpetas.py analizar` (o `analizar /ruta --profundidad 4`) para ver cómo tiene organizado su contenido.
2. Contale lo que encontraste en un párrafo y proponé **una** de estas opciones, la que le resulte más fácil:
   - **Adaptarse a su estructura**: mapear sus carpetas existentes en `content.sources`, sin mover nada.
   - **Estructura estándar**: `python3 engine/carpetas.py crear` y, con su OK, mover sus piezas a `1-en-desarrollo`, `2-por-revisar`, `3-listo` y `4-publicado`.
3. `python3 engine/carpetas.py probar` y mostrale cuántas piezas ve en cada estado, con ejemplos. Ajustá hasta que diga que está bien.

Nunca muevas, renombres ni borres archivos suyos sin su confirmación explícita.

## 4b. Historias (opcional)

Preguntá si quiere planificar historias de Instagram en el planner. Si sí:

- La carpeta de historias es `historias/` adentro de su contenido (`historias.carpeta` en la config para cambiarla). No hace falta crearla: la primera semana la arma Claude Code.
- Si tiene una carpeta con sus fotos para usar de fondo o de sticker, cargala en `historias.fotos` (ruta absoluta o relativa a su contenido). El planner sólo la lee.
- Para renderizar historias: `pip install playwright pillow numpy` y `python3 -m playwright install chromium`, con su OK.
- Las historias de un día salen en cadena: la primera queda programada en Postiz y el planner publica cada siguiente cuando sale la anterior. Para eso el planner tiene que estar corriendo a esa hora: si va a programar historias, conviene el servicio (`npm run service:install`). Si prefiere programarlas todas a su hora, sin cadena, `"historias": { "cadena": false }` en la config.

Detalle en [docs/historias.md](docs/historias.md).

## 5. Arrancar el planner

```bash
cd app && npm run service:install
```

Lo deja corriendo solo, también después de reiniciar la computadora (macOS: LaunchAgent; Linux: systemd de usuario; Windows: acceso en Inicio). Si prefiere no instalar un servicio: `npm start` con la terminal abierta.

En macOS, si la carpeta del planner o del contenido está en Documentos, Escritorio o iCloud, macOS puede impedir que el servicio la lea en segundo plano (en los logs aparece «Operation not permitted»). Dos salidas: darle a `node` (la ruta que muestra `which node`) acceso en Ajustes → Privacidad y seguridad → Acceso total al disco y correr `npm run service:restart`, o usar `npm start` con la terminal abierta.

Abrí http://127.0.0.1:4180 (si tenés navegador integrado, mostráselo). Confirmá con `npm run service:status`. Si no carga, `python3 engine/doctor.py` y los logs que indica el servicio.

## 6. Primera prueba, sin publicar nada

1. En el planner, que arrastre una pieza lista a un día y toque *Revisar cambios* → *Preparar confirmación* → *Copiar mensaje*, y que lo pegue acá.
2. Corré el plan: `python3 engine/cola.py aplicar <id>`. Explicale qué va a pasar.
3. Ejecutalo como borrador: `python3 engine/cola.py aplicar <id> --ejecutar --borrador`. Crea los posts en Postiz como borradores, que no salen. Pedile que los mire en Postiz.
4. Si está todo bien, quitalos (`python3 engine/cola.py quitar <slug>`) y explicale que la próxima vez, al pegar el mensaje, se programa de verdad.

## 7. Cierre

- Si su carpeta de contenido tiene (o quiere) un `CLAUDE.md`, ofrecé agregar una línea que apunte al planner, para que cualquier sesión de Claude Code sepa usarlo: `Para publicar, seguí planner-de-contenido/.claude/skills/publicar/SKILL.md`. Sólo con su OK.
- Resumile en cinco líneas cómo se usa día a día (ver README) y dónde están las cosas: el planner en http://127.0.0.1:4180, su config en `planner.config.json`, la cola en `<contenido>/publicar/`.
- Recordale que nada se publica sin que pegue la confirmación.
