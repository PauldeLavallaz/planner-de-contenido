---
name: guiones
description: Arma el plan de guiones de la semana para la pestaña Guiones del planner (plan.json y una carpeta por pieza) y aplica el feedback que llega con «Feedback desde el planner (pestaña Guiones)».
---

# Guiones

Todo lo de la pestaña está en [docs/guiones.md](../../../docs/guiones.md): carpetas, `plan.json`, estados, editor de producción (look, estilo y título) y feedback. El planner sólo lee esas carpetas; el contenido lo produce el usuario con sus herramientas o con Claude Code siguiendo las instrucciones de su proyecto de contenido.

## Armar la semana

1. Preguntá lo que falte: la semana (el lunes), cuántas piezas y de qué tipo (video o carrusel), los temas, y si usa avatar con looks.
2. Proponé el plan en texto antes de escribir archivos: por pieza, el título, el gancho, el título en pantalla (dos renglones como máximo, separados con ` / `), el formato y el estilo. Esperá su OK.
3. Creá `<guiones.carpeta>/<lunes>/plan.json` con el formato de la guía y una carpeta por pieza (`R01/`, `C01/`…). En cada video, `guion.txt` con el guion. Para que la biblioteca de estilos funcione, cada estilo lleva `id`, `nombre` y `paleta`; reusá los `id` de estilos de semanas anteriores cuando sea el mismo, y leé `<publicar>/.planner/estilos-preferencias.json` para no usar los descartados y preferir los favoritos y lo que eligió para cada formato.
4. Si hay looks en la carpeta de looks, asigná uno por video en `look` (`id` = nombre del archivo sin extensión, `nombre`) que combine con el estilo y varíe entre piezas vecinas.
5. El guion se aprueba antes de gastar en voz, video o música. Después, cada etapa (audio, rough cut, final) se deja en la carpeta de la pieza con los nombres de la guía y se revisa en la pestaña.
6. Avisale que ya lo ve en la pestaña Guiones del planner.

## Feedback del planner

Llega como un mensaje que empieza con «Feedback desde el planner (pestaña Guiones)». Seguí las reglas que trae:

- Antes de tocar nada, abrí el JSON de cada nota: si dice `en_curso` o `aplicado`, no la hagas. Si está libre, poné `en_curso`, `tomado_at` y `tomado_por`.
- Transcribí los audios y mirá el video en los segundos que nombra la nota antes de decidir.
- **Guion o voz:** corregí `guion.txt`; si cambia una frase, regenerá sólo ese tramo del audio con la misma voz.
- **Rough cut o final:** volvé a renderizar como `rough_cut_vN.mp4` (o `final_v2.mp4`), sin pisar la versión anterior.
- **Copy:** es el texto del usuario, textual, en `publish_kit.md` → «## Caption».
- **Estilo, look o título** (las notas que deja el planner al cambiarlos con corte hecho): el `plan.json` ya tiene `estilo`, `look` o `titulo_tipo`; rehacé el corte con eso.
- Si hace falta gastar en una generación paga, avisá antes con qué y cuánto.
- Al terminar, cada nota queda `aplicado`, con `aplicado_at` y una línea de qué cambió en `cambio`. No agendes ni publiques nada.
