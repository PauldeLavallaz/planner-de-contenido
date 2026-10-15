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
      assets/videos/<id>/       los cuadros de un video de fondo (y su video.json)
      assets/audio/             las voces en off de la semana, en WAV
    voces/                      audios para elegir como voz en off desde el editor (opcional)
    originales/                 los videos y audios tal como los subiste al editor
    historias/                  las imágenes renderizadas (PNG), el MP4 de las que tienen video o voz, y su chequeo
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

   Deja el PNG de cada una y un chequeo: texto en la zona que tapa Instagram (250 px arriba, 270 abajo), poco contraste, renglones disparejos, algo fuera del eje, stickers pisados y texto largo (más de 20 palabras en la primera historia del día o más de 47 en cualquiera).

Necesita Python con `pip install playwright pillow numpy` y `python3 -m playwright install chromium`. En macOS, el chequeo también busca caras tapadas por texto (Vision): el planner compila `motor-historias/caras.swift` solo la primera vez si está `swiftc`.

### Historia con video y voz en off

Un video real de fondo (vos filmando la pantalla con el celular, una grabación o un clip), una voz en off que cuenta lo que se ve y el texto arriba. Sirve para mostrar algo que armaste, cómo funciona tu sistema o un recurso por dentro.

1. Preparás el video: `python3 motor-historias/fondo_video.py VIDEO --fuente <semana>/fuente --id nombre [--desde s] [--hasta s]`. Si viene del iPhone en HDR lo pasa a color normal con la conversión de Apple; un video vertical llena la historia y uno horizontal va entero, centrado. Deja los cuadros en `fuente/assets/videos/<id>/`.
2. La voz en off va a `fuente/assets/audio/` y entra en la historia como `<audio class="voz" src="assets/audio/voz.wav" data-inicio="0.25">`.
3. `render.py` saca esa historia en MP4, cuadro a cuadro y con la voz mezclada, y deja de imagen el cuadro del segundo 1. La historia termina con la voz.

Todo eso se hace también desde el editor (ver abajo). Criterio y guion de la voz: [video-con-voz.md](../.claude/skills/historias/references/video-con-voz.md).

### Recursos listos

`motor-historias/recursos.html` trae bloques para copiar a una historia: el **chat de WhatsApp** (la reacción de alguien), el **archivo del recurso** (la tarjeta de un documento o carpeta) y el **recurso tapado** (una captura borrosa con candado). El chat recrea un chat real, con permiso, o una broma que se nota: nunca una reacción inventada. Más recursos y sus reglas en [recursos.md](../.claude/skills/historias/references/recursos.md).

Claude Code puede armar la semana entera: pedile «armá la semana de historias» (skill [historias](../.claude/skills/historias/SKILL.md)). El método (tipos de día, fórmulas, ganchos, diseño) está en `.claude/skills/historias/references/`.

## El editor

**Editar** en la vista grande, o el ✏️ que aparece sobre cada miniatura de la semana, abre la historia en un editor del estilo de Canva:

- tocás un texto, emoji o imagen y lo arrastrás (se mueve mientras tenés el botón apretado), cambiás su tamaño o lo girás, con imán al centro y a las zonas seguras;
- arriba, la barra cambia según lo elegido: letra, tamaño, color, fondo del texto (caja o resaltado) y espaciado;
- doble clic corrige el texto ahí mismo; lo que marcás toma color o resaltado desde la misma barra;
- **agrupar y desagrupar:** un bloque con varias cajas se elige entero; **Desagrupar** (o Cmd+Shift+G) deja cada pieza suelta en su lugar. Con Shift+clic elegís varias, que se mueven juntas, y **Agrupar** (o Cmd+G) las une;
- **recortar:** en una imagen, **✂️ Recortar** (o doble clic) y arrastrás los bordes como en Canva; adentro del recorte la imagen se encuadra arrastrándola. **🔒 Tapar** la desenfoca con un candado, para mostrar un recurso sin revelarlo;
- a la izquierda:
  - **Agregar:** texto, emojis, flechas, la zona segura del sticker y **Recursos** listos (chat de WhatsApp, archivo del recurso), de `motor-historias/recursos.html`;
  - **Imágenes:** subidas, arrastradas o pegadas con Cmd+V, o de tu carpeta de fotos;
  - **Fondo:** foto, color liso o **video**. El video se sube del teléfono o la compu (MP4, MOV o WebM); el planner lo pasa a color normal (también los del iPhone en HDR) y elegís el tramo, hasta 60 s;
  - **Audio:** la **voz en off**. Subís un audio o elegís uno de `<semana>/voces/`, ajustás en qué segundo empieza y la probás con el video. La historia dura lo que la voz;
  - **Capas** y el **Chequeo**, que va en vivo: un número rojo sobre el botón cuenta lo que está corrido del eje, fuera de la zona segura o es demasiado largo (más de 20 palabras en el gancho o de 47 en cualquier historia), cada aviso con su arreglo. En la barra, **⚠ Centrar** corrige lo elegido. Al guardar, el render mide además el contraste, los renglones disparejos y las caras tapadas.

**Guardar y renderizar** escribe el HTML, vuelve a sacar el PNG con el motor y muestra el chequeo. Con video de fondo o voz en off saca también el MP4, con la voz mezclada: esa historia se publica como video. La versión anterior queda en `tmp/ediciones/`. Para el video y la voz hace falta ffmpeg. Si la historia ya estaba en Postiz, el planner la marca «Imagen nueva» y se reemplaza con la próxima propuesta de **Programar**.

**Tus fotos:** poné en `planner.config.json` la carpeta donde tenés tus fotos (`historias.fotos`). El editor las lista por subcarpeta y las copia a la semana al usarlas. Sin esa carpeta, las subís desde el editor.

## Feedback

En la vista grande, **Feedback** abre al costado las notas de esa historia: detalles (un texto, un color, un tamaño) que Claude Code corrige directo. El **Feedback** de la fila del día es para la secuencia entera: cambiar el tema o rehacer varias historias; ahí Claude Code primero te muestra la secuencia nueva y espera tu OK. Las notas, escritas o grabadas, quedan en `<semana>/feedback/`. **Copiar para Claude Code** arma el mensaje con todas las notas pendientes del día.

## Programar

1. Elegí **Postiz** en los días que querés agendar y la hora de la primera historia; las siguientes salen cada 2 minutos, en orden.
2. **Programar** muestra qué va a Postiz y qué va a mano; **Preparar confirmación** guarda la propuesta en `<publicar>/.planner/proposal-historias-<id>.json` y te da el mensaje.
3. Pegalo en Claude Code. Corre `python3 engine/historias.py aplicar <id> --ejecutar`: agenda, mueve, reemplaza o quita cada historia por `engine/cola.py`, y te lista las que van a mano con su hora.

**Programar** también cuenta el feedback sin corregir de la semana (notas pendientes, o copiadas que nadie tomó) y lo lista debajo de la agenda. El mensaje trae una parte de **Contenido** para que Claude Code lo corrija primero. Una historia con feedback, o todo el día si la nota es de la secuencia, no se agenda en esa pasada: queda «espera_feedback» y se programa cuando apruebes la versión corregida. Si sólo hay feedback, la propuesta sale igual, sin cambios de agenda.

El orden, el día, la hora y la cuenta de cada secuencia son un borrador del planner (`<publicar>/.planner/historias-draft.json`); no tocan la carpeta de la semana. Una secuencia corrida a otra semana sigue guardada en el borrador de la suya, pero se ve, se edita y se programa en la semana a la que fue.

Las respuestas y vistas que cargás quedan en `<publicar>/.planner/historias-metricas.json`.
