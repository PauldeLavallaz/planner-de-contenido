# AGENTS.md

Planner local de publicaciones sobre Postiz. El usuario organiza en el navegador; Claude Code ejecuta en Postiz cuando el usuario confirma. Hablale en su idioma, sin jerga técnica salvo que la pida.

## Qué hacer según el pedido

- **Instalar, configurar o «no anda»:** seguí [INSTALAR.md](INSTALAR.md). Para diagnosticar, empezá por `python3 engine/doctor.py`.
- **Organizar o mapear carpetas, «no aparece mi video»:** skill [organizar-carpetas](.claude/skills/organizar-carpetas/SKILL.md).
- **Un mensaje que empieza con «Confirmo la propuesta…», agendar, mover, pausar, «¿qué sale esta semana?»:** skill [publicar](.claude/skills/publicar/SKILL.md).
- **Feedback del planner sobre una pieza:** seguí las reglas que trae el mensaje y las instrucciones del proyecto de contenido del usuario.
- **Historias: armar una semana, «Confirmo la propuesta de historias…» o feedback de historias:** skill [historias](.claude/skills/historias/SKILL.md).

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
| `.env` | `POSTIZ_API_KEY` / `POSTIZ_API_URL` si no usa `postiz auth:login` (no se versiona). |
| `app/` | Servidor Node (Hono) e interfaz. Puerto 4180, sólo en 127.0.0.1. `npm test` corre las pruebas HTTP. |
| `engine/inventario.py` | Lo que lee el planner: piezas de las carpetas, cola y Postiz. Sólo lectura. |
| `engine/cola.py` | La cola de publicación contra Postiz (listo, agendar, mover, quitar, pausar, aplicar…). |
| `engine/conectar.py` | Lee las cuentas de Postiz y las escribe en la config. |
| `engine/carpetas.py` | Analiza, crea, prueba y sincroniza la estructura de carpetas. |
| `engine/piezas.py` | Cómo se reconoce una pieza dentro de una carpeta. |
| `engine/historias.py` | Aplica en Postiz las propuestas de la pestaña Historias (por `engine/cola.py`). |
| `motor-historias/` | El motor de historias: plantilla, estilos, `render.py` (HTML → PNG con chequeo) y `caras.swift`. |
| `<contenido>/historias/` | Una carpeta por semana de historias, con su `semana.json` (ver [docs/historias.md](docs/historias.md)). |
| `<contenido>/publicar/` | Cola: `inbox/` (lista, sin fecha), `agendado/` (en Postiz), `publicado/AAAA-MM/`. `.planner/` guarda el borrador, las propuestas y el estado del tablero. |
| `docs/` | Cómo funciona, carpetas, redes e historias. |

Pruebas: `python3 -m unittest discover -s tests` (motor, con un Postiz simulado) y `cd app && npm test` (servidor). Corrélas si cambiás código.
