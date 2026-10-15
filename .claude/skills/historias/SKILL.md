---
name: historias
description: Arma semanas de historias de Instagram con el motor, aplica las propuestas de la pestaña Historias («Confirmo la propuesta de historias…») y corrige historias según el feedback del planner.
---

# Historias

Todo lo de la pestaña está en [docs/historias.md](../../../docs/historias.md): carpetas, `semana.json`, motor, editor, feedback y publicación. Corré los comandos desde la carpeta del planner (en Windows, `python`).

## Armar una semana

1. Preguntá lo que falte para decidir: la semana, la cuenta (si hay varias en `channels.instagram`), los temas de cada día, si hay un recurso u oferta para pedir (palabra clave, DM), y si quiere usar sus fotos.
2. Proponé el plan en texto antes de escribir archivos: por día, el tipo (`venta`, `recurso`, `conciencia` o `libre`), el tema y el texto de cada historia, de 3 a 5 por día. Esperá su OK.
3. Creá `<historias.carpeta>/<nombre>/` con `semana.json` y `fuente/`. Copiá `motor-historias/motor/` a `fuente/motor/` y partí de `motor-historias/plantilla.html` para cada historia (`fuente/AAAA-MM-DD_N_tipo.html`). Las fotos van a `fuente/assets/fotos/`: copias de las del usuario, nunca movidas.
4. Renderizá con `python3 motor-historias/render.py <semana>/fuente/*.html --salida <semana>/historias --chequeo` y corregí lo que marque el chequeo. Si falta Playwright: `pip install playwright pillow numpy` y `python3 -m playwright install chromium`, con su OK.
5. Mirá cada PNG antes de darlo por bueno. Avisale que ya lo ve en la pestaña Historias del planner.

Una historia con sticker interactivo (encuesta, link, mención, caja de preguntas, slider) se marca en `sticker` y su lugar se deja libre en el HTML con `.sticker`: esas historias se suben a mano.

## Una propuesta del planner

El mensaje empieza con «Confirmo la propuesta de historias <id>». Pegarlo **es** la confirmación del usuario para exactamente esa propuesta.

1. `python3 engine/historias.py aplicar <id>` muestra qué va a hacer con cada historia, sin tocar nada.
2. `python3 engine/historias.py aplicar <id> --ejecutar` agenda, mueve, reemplaza o quita cada una por `engine/cola.py`. Las de una secuencia salen cada 2 minutos desde su hora, en orden.
3. Contá el resultado tal cual: qué quedó agendado, cuándo y en qué cuenta, cualquier error, y **la lista de las que van a mano** con su hora y su sticker.

Si una historia falla, el resto sigue y la propuesta queda `parcial` con el motivo en `resultados`. Resolvé la causa y corré a mano los pasos de esa historia con `engine/cola.py` (skill [publicar](../publicar/SKILL.md)). Una fecha pasada no se agenda.

## Feedback de historias

Llega como un mensaje del planner con las notas del día. Seguí las reglas que trae el mensaje:

- **Detalles de una historia** (texto, color, tamaño, posición): corregí su HTML de `fuente/` y volvé a renderizar esa historia.
- **Feedback general de la secuencia** (cambiar el tema, rehacer varias): primero mostrá la secuencia propuesta en texto y esperá su OK.
- Si `semana.json` marca la historia con `editado`, la tocó en el editor del planner: partí de su HTML actual, no de una versión anterior.
- Si cambia el texto, actualizá `texto` en `semana.json`.
- Si la historia ya está en Postiz, no la agendes ni la quites: el planner la marca «Imagen nueva» y se reemplaza con la próxima propuesta de Programar.
