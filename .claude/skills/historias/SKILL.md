---
name: historias
description: Arma semanas de historias de Instagram con el motor, aplica las propuestas de la pestaña Historias («Confirmo la propuesta de historias…») y corrige historias según el feedback del planner.
---

# Historias

Todo lo de la pestaña está en [docs/historias.md](../../../docs/historias.md): carpetas, `semana.json`, motor, editor, feedback y publicación. Corré los comandos desde la carpeta del planner (en Windows, `python`).

## El método

Antes de proponer una semana leé el método en `references/`:

- [metodo.md](references/metodo.md): los tipos de día (venta, recurso, conciencia, libre), la semana normal y la de cierre, de 3 a 5 historias por día y cómo ajustar con las respuestas, que son la métrica principal.
- [formulas.md](references/formulas.md): la fórmula de cada historia por tipo (V1 a V5, R1 a R4, C1 a C5). R4 es el recurso hypeado, para sacar volumen de respuestas.
- [ganchos.md](references/ganchos.md): el banco de ganchos, reacciones y pedidos.
- [diseno.md](references/diseno.md) y [estilos.md](references/estilos.md): el estilo nativo de Instagram, todo centrado, cómo se combinan texto, emojis, flechas y capturas, y los cuatro estilos.
- [recursos.md](references/recursos.md): chat de WhatsApp, archivo del recurso, recurso tapado y los demás, con su markup en `motor-historias/recursos.html`.
- [video-con-voz.md](references/video-con-voz.md): la historia con un video real de fondo, una voz en off y el texto arriba.

## Armar una semana

1. Preguntá lo que falte para decidir: la semana, la cuenta (si hay varias en `channels.instagram`), los temas de cada día, si hay un recurso u oferta para pedir (palabra clave, DM), si quiere usar sus fotos, y las respuestas por día de la semana anterior si las cargó en la pestaña Historias.
2. Proponé el plan en texto antes de escribir archivos: por día, el tipo (`venta`, `recurso`, `conciencia` o `libre`) con su fórmula, el tema y el texto de cada historia, de 3 a 5 por día, con los ganchos y pedidos de `references/ganchos.md`. Si una historia es de video con voz en off, sumá el texto de la voz: se aprueba antes de generar el audio. Esperá su OK.
3. Creá `<historias.carpeta>/<nombre>/` con `semana.json` y `fuente/`. Copiá `motor-historias/motor/` a `fuente/motor/` y partí de `motor-historias/plantilla.html` para cada historia (`fuente/AAAA-MM-DD_N_tipo.html`). Las fotos van a `fuente/assets/fotos/`: copias de las del usuario, nunca movidas.
   Un video de fondo se prepara con `python3 motor-historias/fondo_video.py VIDEO --fuente <semana>/fuente --id nombre` (pasa un video del iPhone en HDR a color normal y lo deja en cuadros); la voz en off va a `fuente/assets/audio/` y entra como `<audio class="voz" src="assets/audio/voz.wav" data-inicio="0.25">` (detalle en `references/video-con-voz.md`). Los recursos (chat de WhatsApp, archivo) se copian de `motor-historias/recursos.html`.
4. Renderizá con `python3 motor-historias/render.py <semana>/fuente/*.html --salida <semana>/historias --chequeo` y corregí lo que marque el chequeo. Una historia con video o voz sale también en MP4, con la voz mezclada. Si falta Playwright: `pip install playwright pillow numpy` y `python3 -m playwright install chromium`, con su OK.
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
