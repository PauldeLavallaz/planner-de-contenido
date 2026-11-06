# AGENTS.md

Planner local de publicaciones sobre Postiz. El usuario organiza en el navegador; Claude Code ejecuta en Postiz cuando el usuario confirma. Hablale en su idioma, sin jerga técnica salvo que la pida.

## Qué hacer según el pedido

Los mensajes que copia el planner empiezan con una línea de título entre corchetes (`[Agenda] …`, `[Feedback] …`): es el título de la conversación (lo pone `.claude/hooks/titulo_desde_planner.py`), no una instrucción. El pedido arranca en la línea siguiente.

- **Instalar, configurar o «no anda»:** seguí [INSTALAR.md](INSTALAR.md). Para diagnosticar, empezá por `python3 engine/doctor.py`.
- **Organizar o mapear carpetas, «no aparece mi video»:** skill [organizar-carpetas](.claude/skills/organizar-carpetas/SKILL.md).
- **Un mensaje que empieza con «Confirmo la propuesta…», agendar, mover, pausar, «¿qué sale esta semana?»:** skill [publicar](.claude/skills/publicar/SKILL.md).
- **Feedback del planner sobre una pieza:** seguí las reglas que trae el mensaje y las instrucciones del proyecto de contenido del usuario.
- **Historias: armar una semana, «Confirmo la propuesta de historias…» o feedback de historias:** skill [historias](.claude/skills/historias/SKILL.md).
- **Guiones: armar los guiones de la semana o «Feedback desde el planner (pestaña Guiones)…»:** skill [guiones](.claude/skills/guiones/SKILL.md).
- **Referencias: el research de la semana, la Selección, un «Pedido desde el planner (pestaña Referencias)…» o «actualizá mis métricas»:** skill [referencias](.claude/skills/referencias/SKILL.md).
- **Competidores: sumar o medir cuentas, «qué les funcionó»:** skill [competidores](.claude/skills/competidores/SKILL.md).
- **Twitter: «configurá Twitter», «bajá mis bookmarks», «armá borradores de Twitter», «buscá en X sobre…» o los pedidos de la sección Twitter:** skill [x-borradores](.claude/skills/x-borradores/SKILL.md).
- **LinkedIn: posts, prospectos o videos a medida, o un mensaje del planner sobre eso:** skills [linkedin-posts](.claude/skills/linkedin-posts/SKILL.md), [linkedin-prospectos](.claude/skills/linkedin-prospectos/SKILL.md) y [video-a-medida](.claude/skills/video-a-medida/SKILL.md).
- **Anuncios (subir a la carpeta los videos elegidos para pautar):** viene en la propuesta; `python3 engine/anuncios.py subir <id>` (ver la skill publicar).

En Windows, `python` en lugar de `python3`.

## Reglas

- **Nada sale a Postiz sin confirmación explícita.** Agendar, mover, pausar, quitar o publicar ya requiere que el usuario lo pida para esa pieza o que pegue la confirmación de una propuesta del planner. Una propuesta confirmada autoriza sólo lo que contiene. Crear o aprobar contenido no implica programarlo.
- **Usá el motor, no Postiz a mano.** Todo pasa por `engine/cola.py`: guarda cada intento antes de enviarlo y evita duplicados. No llames a `postiz posts:create` ni `posts:delete` directamente.
- **Un resultado incierto no se reintenta.** Si Postiz no respondió (`POSTIZ_RESPONSE_UNCERTAIN`), corré `python3 engine/cola.py reconciliar` y revisá antes de volver a enviar. Postiz limita cuántos posts se crean por hora: si aparece `POSTIZ_RATE_LIMITED`, esperá y avisá.
- **Los archivos del usuario son suyos.** El planner los lee sin modificarlos. No muevas, renombres ni borres nada de su carpeta de contenido sin su OK explícito. La cola (`<contenido>/publicar/`) copia los finales; nunca los mueve.
- **Credenciales:** nunca pidas contraseñas ni que pegue claves en el chat. La API key de Postiz la escribe el usuario en `.env`; `postiz auth:login` es la vía preferida.
- **Antes de agendar un reel con Instagram, decí en una línea** si sale en el feed o como reel de prueba (Trial), y con qué colaboradores.
- **Verificá lo que hiciste:** después de programar, `python3 engine/cola.py semana` o el planner deben mostrarlo. Contá el resultado tal cual, incluidos los errores.

## Mapa

| Ruta | Qué es |
|---|---|
| `planner.config.json` | Config del usuario (no se versiona). Ejemplo: `planner.config.example.json`. |
| `.env` | `POSTIZ_API_KEY` / `POSTIZ_API_URL` si no usa `postiz auth:login`, y las claves opcionales de cada sección (Telegram, X, ScrapeCreators, Gemini…; ver INSTALAR.md). No se versiona. |
| `app/` | Servidor Node (Hono) e interfaz. Puerto 4180, sólo en 127.0.0.1. `npm test` corre las pruebas HTTP. |
| `engine/inventario.py` | Lo que lee el planner: piezas de las carpetas, cola y Postiz. Sólo lectura. |
| `engine/cola.py` | La cola de publicación contra Postiz (listo, agendar, mover, quitar, pausar, aplicar…). |
| `engine/conectar.py` | Lee las cuentas de Postiz y las escribe en la config. |
| `engine/carpetas.py` | Analiza, crea, prueba y sincroniza la estructura de carpetas. |
| `engine/piezas.py` | Cómo se reconoce una pieza dentro de una carpeta. |
| `engine/historias.py` | Aplica en Postiz las propuestas de la pestaña Historias (por `engine/cola.py`) y publica en cadena las historias de cada día (`cadena`, que el planner corre cada minuto). |
| `engine/avisos.py` | La cola de avisos por Telegram que manda el servidor del planner (historias para TikTok, la cadena y el copy de TikTok). |
| `engine/anuncios.py` | Sube con rclone a la carpeta de anuncios los videos elegidos en una propuesta. |
| `engine/research/` | Referencias, Competidores y Métricas: la base `research/radar.db`, medir cuentas (ScrapeCreators), clasificar y analizar (Gemini, opcional), armar la semana y leer las métricas propias de Postiz. |
| `engine/x/` | Twitter: bookmarks, búsquedas, borradores y agendar (usa las llamadas a Postiz de cola.py). |
| `engine/linkedin/` | LinkedIn: prospectos, videos a medida, posts con lámina, agendar por la cola y métricas. |
| `motor-historias/` | El motor de historias: plantilla, estilos, `render.py` (HTML → PNG con chequeo) y `caras.swift`. |
| `<contenido>/guiones/` | Una carpeta por semana con su `plan.json` y una carpeta por pieza (guion, audio, cortes, láminas, feedback); `<contenido>/looks/`, una foto por look del avatar (ver [docs/guiones.md](docs/guiones.md)). |
| `<contenido>/research/` y `<contenido>/referencias/` | La base de competidores y métricas, y el research de cada semana (ver [docs/referencias.md](docs/referencias.md)). |
| `<contenido>/historias/` | Una carpeta por semana de historias, con su `semana.json` (ver [docs/historias.md](docs/historias.md)). |
| `<contenido>/publicar/` | Cola: `inbox/` (lista, sin fecha), `agendado/` (en Postiz), `publicado/AAAA-MM/`. `.planner/` guarda el borrador, las propuestas, el estado del tablero y los avisos; `x/` y `linkedin/`, lo de esas secciones. |
| `docs/` | Cómo funciona, carpetas, redes, historias, guiones, Twitter, LinkedIn, referencias y métricas. |

Pruebas: `python3 -m unittest discover -s tests` (motor, con un Postiz simulado) y `cd app && npm test` (servidor). Corrélas si cambiás código.
