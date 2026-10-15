# Historias

La pestaña **Historias** del planner muestra la semana en horizontal: un día por fila, sus historias una al lado de la otra y, fijo a la derecha, el recurso u oferta de ese día. Desde ahí:

- elegís por día si sale **por Postiz**, **a mano** o **no se publica**, a qué hora y desde qué cuenta de Instagram;
- reordenás historias arrastrándolas, las pasás a otro día, movés la secuencia entera con ⋮⋮ o tocando el día (también a otra semana);
- cargás las **respuestas** y las vistas de cada día: las respuestas son la métrica principal;
- abrís una historia para verla grande, **editarla** (editor tipo Canva) o dejarle **feedback** escrito o grabado;
- tocás **Programar** y el planner arma el mensaje que pegás en Claude Code para agendarlas en Postiz.

Nada sale a Postiz sin que pegues esa confirmación en el chat.

## Dónde viven

Cada semana es una carpeta adentro de `historias/` en tu carpeta de contenido (se cambia con `historias.carpeta` en `planner.config.json`):

```
<contenido>/historias/
  semana-2026-10-19/            una carpeta por semana (el nombre es libre)
    semana.json                 el plan de la semana (ver abajo)
    fuente/                     un HTML por historia: 2026-10-19_1_venta.html
      motor/                    copia de motor-historias/motor (estilos, fuentes y script)
      assets/fotos/             fotos de fondo
      assets/subidas/           imágenes que subís desde el editor
    historias/                  las imágenes renderizadas (PNG) y su chequeo (.chequeo.json)
    feedback/                   las notas que dejás desde el planner
    tmp/ediciones/              el respaldo de cada edición hecha en el planner
```

Una semana puede empezar cualquier día: el planner muestra, en cada semana de calendario, los días que caen en ella. Si dos carpetas de la misma cuenta tocan la misma semana, manda la más reciente.

## semana.json

```json
{
  "semana": "2026-10-19",
  "cuenta": "mimarca",
  "dias": [
    {
      "fecha": "2026-10-19",
      "tipo": "venta",
      "formula": "V1",
      "tema": "Tres errores que frenan tus ventas",
      "recurso": "guia",
      "cierre": "encuesta",
      "historias": [
        { "imagen": "historias/2026-10-19_1_venta.png", "texto": "Tres errores que frenan tus ventas." },
        { "imagen": "historias/2026-10-19_2_venta.png", "texto": "¿Querés la guía?", "sticker": "encuesta: Sí / Más adelante" }
      ]
    },
    { "fecha": "2026-10-20", "tipo": "libre", "historias": [] }
  ],
  "recursos": [
    { "id": "guia", "tipo": "recurso", "nombre": "Guía: tres arreglos", "palabra": "GUIA", "dm": "¡Hola! Te paso la guía…", "estado": "listo" }
  ]
}
```

| Campo | Qué es |
|---|---|
| `semana` | Lunes de la semana. |
| `cuenta` | Usuario de Instagram (como figura en `channels.instagram` o sus `alternativas` de la config). Sin él, la cuenta principal. |
| `dias[].tipo` | `venta`, `recurso`, `conciencia` o `libre` (pinta el color de la fila). |
| `dias[].formula`, `tema` | Etiquetas que se ven en la fila. |
| `dias[].recurso` | `id` del recurso u oferta de ese día. |
| `dias[].cierre` | Si no hay recurso: `encuesta`, `slider`, `caja` o `ninguno`. |
| `historias[].imagen` | El PNG, relativo a la carpeta de la semana. Su HTML es `fuente/<mismo nombre>.html`. |
| `historias[].sticker` | El sticker de Instagram que lleva (encuesta, link, mención, caja de preguntas, slider). Esas historias **van a mano**: Instagram no deja publicarlas por la API. Si dice «(opcional)», sale igual por Postiz. |
| `recursos[]` | `nombre`, `palabra` (palabra clave para comentar) o `entrega`, `dm` (mensaje para copiar), `url`, `preview` o `archivo` (para verlo), `estado: "listo"`. |

El planner escribe en `semana.json` sólo cuando editás una historia: marca `editado`, corrige `texto` (guarda el anterior en `texto_original`), el `fondo` y el `sticker`.

## Armar las historias (el motor)

Cada historia es un HTML de 1080×1920 hecho con el motor de `motor-historias/`:

1. Copiá `motor-historias/motor/` a `<semana>/fuente/motor/`.
2. Copiá `motor-historias/plantilla.html` a `<semana>/fuente/AAAA-MM-DD_N_tipo.html` y escribí la historia: foto de fondo o fondo liso, texto en caja o resaltado, emojis, flechas y el lugar del sticker. Los estilos están comentados en la plantilla.
3. Renderizá:

   ```bash
   python3 motor-historias/render.py <semana>/fuente/*.html --salida <semana>/historias --chequeo
   ```

   Deja el PNG de cada una y un chequeo: texto en la zona que tapa Instagram (250 px arriba, 270 abajo), poco contraste, renglones disparejos, algo fuera del eje y stickers pisados.

Necesita Python con `pip install playwright pillow numpy` y `python3 -m playwright install chromium`. En macOS, el chequeo también busca caras tapadas por texto (Vision): el planner compila `motor-historias/caras.swift` solo la primera vez si está `swiftc`.

Claude Code puede armar la semana entera: pedile «armá la semana de historias» (skill [historias](../.claude/skills/historias/SKILL.md)).

## El editor

**Editar** en la vista grande abre la historia en un editor del estilo de Canva:

- tocás un texto, emoji o imagen y lo movés, cambiás su tamaño o lo girás, con imán al centro y a las zonas seguras;
- arriba, la barra cambia según lo elegido: letra, tamaño, color, fondo del texto (caja o resaltado) y espaciado;
- doble clic corrige el texto ahí mismo; lo que marcás toma color o resaltado desde la misma barra;
- a la izquierda: agregar texto, emojis, flechas y la zona segura del sticker; imágenes (subidas, arrastradas o pegadas con Cmd+V, o de tu carpeta de fotos); fondo (foto o color liso); capas; y el chequeo del render.

**Guardar y renderizar** escribe el HTML, vuelve a sacar el PNG con el motor y muestra el chequeo. La versión anterior queda en `tmp/ediciones/`. Si la historia ya estaba en Postiz, el planner la marca «Imagen nueva» y se reemplaza con la próxima propuesta de **Programar**.

**Tus fotos:** poné en `planner.config.json` la carpeta donde tenés tus fotos (`historias.fotos`). El editor las lista por subcarpeta y las copia a la semana al usarlas. Sin esa carpeta, las subís desde el editor.

## Feedback

En la vista grande, **Feedback** abre al costado las notas de esa historia: detalles (un texto, un color, un tamaño) que Claude Code corrige directo. El **Feedback** de la fila del día es para la secuencia entera: cambiar el tema o rehacer varias historias; ahí Claude Code primero te muestra la secuencia nueva y espera tu OK. Las notas, escritas o grabadas, quedan en `<semana>/feedback/`. **Copiar para Claude Code** arma el mensaje con todas las notas pendientes del día.

## Programar

1. Elegí **Postiz** en los días que querés agendar y la hora de la primera historia; las siguientes salen cada 2 minutos, en orden.
2. **Programar** muestra qué va a Postiz y qué va a mano; **Preparar confirmación** guarda la propuesta en `<publicar>/.planner/proposal-historias-<id>.json` y te da el mensaje.
3. Pegalo en Claude Code. Corre `python3 engine/historias.py aplicar <id> --ejecutar`: agenda, mueve, reemplaza o quita cada historia por `engine/cola.py`, y te lista las que van a mano con su hora.

El orden, el día, la hora y la cuenta de cada secuencia son un borrador del planner (`<publicar>/.planner/historias-draft.json`); no tocan la carpeta de la semana. Una secuencia corrida a otra semana sigue guardada en el borrador de la suya, pero se ve, se edita y se programa en la semana a la que fue.

Las respuestas y vistas que cargás quedan en `<publicar>/.planner/historias-metricas.json`.
