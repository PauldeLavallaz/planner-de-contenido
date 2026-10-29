# Historias

La pestaña **Historias** del planner muestra la semana en horizontal: un día por fila, sus historias una al lado de la otra y, fijo a la derecha, el recurso u oferta de ese día. Desde ahí:

- elegís por día si sale **por Postiz** o **no se publica**, a qué hora (15:00 si no elegís otra) y desde qué cuenta de Instagram;
- reordenás historias arrastrándolas, las pasás a otro día, movés la secuencia entera con ⋮⋮ o tocando el día (también a otra semana; si el día ya tiene otra secuencia, intercambian), con **Dejar libre** corrés un día para abajo la secuencia de ese día y las que le siguen, y con **Descartar** sacás una secuencia del calendario;
- en los días que ya pasaron ves qué salió y qué no;
- cargás las **respuestas** y las vistas de cada día: las respuestas son la métrica principal;
- abrís una historia para verla grande, **editarla** (editor tipo Canva, donde también grabás la voz en off leyendo el guion) o dejarle **feedback** escrito o grabado;
- tocás **Programar** y el planner arma un solo mensaje con todo lo pendiente, que pegás en Claude Code para agendarlo en Postiz.

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
    voces/                      audios para elegir como voz en off y el guion de cada voz (<historia>.txt) para el teleprompter
    originales/                 los videos y audios tal como los subiste al editor
    historias/                  las imágenes renderizadas (PNG), el MP4 de las que tienen video o voz, y su chequeo
    feedback/                   las notas que dejás desde el planner
    tmp/ediciones/              el respaldo de cada edición hecha en el planner
```

Una semana puede empezar cualquier día: el planner muestra, en cada semana de calendario, los días que caen en ella. Si dos carpetas de la misma cuenta tienen el mismo día, manda la más reciente (una iteración nueva de ese día reemplaza a la anterior). Es por día, no por semana: una carpeta nueva con algunos días no tapa los otros días de una anterior, y la semana muestra los de las dos, cada uno con su carpeta.

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
      "cierre": "palabra",
      "historias": [
        { "imagen": "historias/2026-10-19_1_venta.png", "texto": "Tres errores que frenan tus ventas." },
        { "imagen": "historias/2026-10-19_2_venta.png", "texto": "Respondé \"GUIA\" y te la paso." }
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
| `dias[].cierre` | Cómo cierra el día: `palabra` (Respondé PALABRA), `respuesta` (una pregunta con «Respondé…») o `ninguno`. |
| `historias[].imagen` | El PNG, relativo a la carpeta de la semana. Su HTML es `fuente/<mismo nombre>.html`. |
| `historias[].sticker` | Opcional y viejo: Instagram no deja poner stickers interactivos (encuesta, link, mención, caja de preguntas, slider) por la API, así que las historias se diseñan sin ellos y el cierre va escrito. Si una historia todavía lo tiene anotado, sale igual por Postiz, sin el sticker. |
| `recursos[]` | `nombre`, `palabra` (palabra clave para comentar) o `entrega`, `dm` (mensaje para copiar), `url`, `preview` o `archivo` (para verlo), `estado: "listo"`. |

El planner escribe en `semana.json` sólo cuando editás una historia: marca `editado`, corrige `texto` (guarda el anterior en `texto_original`), el `fondo` y el `sticker`.

## Armar las historias (el motor)

Cada historia es un HTML de 1080×1920 hecho con el motor de `motor-historias/`:

1. Copiá `motor-historias/motor/` a `<semana>/fuente/motor/`.
2. Copiá `motor-historias/plantilla.html` a `<semana>/fuente/AAAA-MM-DD_N_tipo.html` y escribí la historia: foto de fondo o fondo liso, texto en caja o resaltado, emojis y flechas, con el pedido escrito («Respondé…»): sin stickers interactivos, que no salen por Postiz. Los estilos están comentados en la plantilla.
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
  - **Agregar:** el **titular grande** y la **etiqueta** del gancho, texto en caja, resaltado o suelto, emojis, flechas, el lugar para un sticker y **Recursos** listos (chat de WhatsApp, archivo del recurso), de `motor-historias/recursos.html`;
  - **Imágenes:** subidas, arrastradas o pegadas con Cmd+V, o de tu carpeta de fotos;
  - **Fondo:** foto, color liso o **video**. El video se sube del teléfono o la compu (MP4, MOV o WebM); el planner lo pasa a color normal (también los del iPhone en HDR) y elegís el tramo, hasta 60 s;
  - **Audio:** la **voz en off**. La **grabás** ahí mismo leyendo el guion, subís un audio o elegís una toma o una voz de `<semana>/voces/`; ajustás en qué segundo empieza y la probás con el video. La historia dura lo que la voz. Al grabar, el micrófono cuenta 3, 2, 1 y arranca junto con el video de fondo; el guion pasa grande como un **teleprompter**, con una guía de ritmo que lo termina con el video (Espacio termina la toma, Esc la descarta). La toma queda como voz desde el segundo 0, sin el silencio del final y con un nivel parejo; si salió muda, avisa que revises el micrófono (se elige abajo si hay más de uno). El guion se escribe en el mismo panel y se guarda en `<semana>/voces/<historia>.txt`; la versión anterior queda en `tmp/ediciones/`;
  - **Capas** y el **Chequeo**, que va en vivo: un número rojo sobre el botón cuenta lo que está corrido del eje, fuera de la zona segura o es demasiado largo (más de 20 palabras en el gancho o de 47 en cualquier historia), cada aviso con su arreglo. En la barra, **⚠ Centrar** corrige lo elegido. Al guardar, el render mide además el contraste, los renglones disparejos y las caras tapadas.

**Guardar y renderizar** escribe el HTML, vuelve a sacar el PNG con el motor y muestra el chequeo. Con video de fondo o voz en off saca también el MP4, con la voz mezclada: esa historia se publica como video. La versión anterior queda en `tmp/ediciones/`. Para el video y la voz hace falta ffmpeg. Si la historia ya estaba en Postiz, el planner la marca «Imagen nueva» y se reemplaza con la próxima propuesta de **Programar**.

**Tus fotos:** poné en `planner.config.json` la carpeta donde tenés tus fotos (`historias.fotos`). El editor las lista por subcarpeta y las copia a la semana al usarlas. Sin esa carpeta, las subís desde el editor.

## Feedback

En la vista grande, **Feedback** abre al costado las notas de esa historia: detalles (un texto, un color, un tamaño) que Claude Code corrige directo. El **💬 Feedback** de la fila del día, al lado del recurso, es para la secuencia entera: cambiar el tema o rehacer varias historias; ahí Claude Code primero te muestra la secuencia nueva y espera tu OK. Ese panel muestra las historias del día (tocar una la abre) y todas las notas, las generales y las de cada historia, en orden de creación como un chat: la última que grabaste queda al final. Las notas, escritas o grabadas, quedan en `<semana>/feedback/`. **Copiar para Claude Code**, en los dos lugares, arma el mensaje con todas las notas pendientes del día, separadas en generales y detalles.

## Programar

1. Elegí **Postiz** en los días que querés agendar y la hora de la primera historia (15:00 si no la cambiás); las siguientes tienen su hora cada 2 minutos, en orden. Todas salen por Postiz: ninguna va a mano. («A mano» sólo aparece en un día que lo tenía en un borrador viejo.)
2. **Programar** toma **todo lo pendiente** de una vez, no sólo la semana que estás mirando: las secuencias de hoy en adelante de todas las semanas y de todas las cuentas, las descartadas que siguen en la cola y las notas sin corregir de cualquier semana. El número del botón cuenta los días que van a Postiz o salen de Postiz y las notas. El panel lo muestra por semana y por día; un día ya agendado tal cual dice «ya en Postiz así» y no suma. Lo que ya pasó no lleva acción.
3. **Preparar confirmación** guarda una sola propuesta en `<publicar>/.planner/proposal-historias-<id>.json` (con `semanas`, `cuentas` y `desde`, el día desde el que cuenta) y te da un solo mensaje, con la agenda por semana y el feedback de cada día.
4. Pegalo en Claude Code. Corre `python3 engine/historias.py aplicar <id> --ejecutar`: agenda, mueve, reemplaza, quita o pausa cada historia por `engine/cola.py`.

Copiar el mensaje no agenda nada. El feedback sin corregir (notas pendientes, o copiadas que nadie tomó) va listado debajo de la agenda y el mensaje trae una parte de **Contenido** para que Claude Code lo corrija primero. Una historia con feedback, o todo el día si la nota es de la secuencia, no se agenda en esa pasada: queda «espera_feedback» y se programa cuando apruebes la versión corregida. Si sólo hay feedback, la propuesta sale igual, sin cambios de agenda. Las notas de una secuencia descartada esperan a que la recuperes.

El orden, el día, la hora y la cuenta de cada secuencia son un borrador del planner (`<publicar>/.planner/historias-draft.json`); no tocan la carpeta de la semana. Una secuencia corrida a otra semana sigue guardada en el borrador de la suya, pero se ve, se edita y se programa en la semana a la que fue.

Las respuestas y vistas que cargás quedan en `<publicar>/.planner/historias-metricas.json`.

### En cadena

Programar varias historias con dos minutos de distancia no garantiza el orden: Postiz las publica con demoras de segundos a minutos, y una puede salir después de la siguiente o quedar en error. Por eso sólo la primera historia de cada día (y cuenta) queda programada en Postiz; las siguientes quedan ahí como **borrador** a su hora, y el planner, mientras está abierto, corre cada minuto `python3 engine/historias.py cadena`: cuando Postiz confirma publicada la anterior y llegó su hora, publica la siguiente. En la semana, esas historias dicen «En cadena · 15:02».

- Si una sale con error, la reintenta hasta dos veces, cada una 4 minutos después del intento que falló (reintentar enseguida no le da tiempo a Instagram). Si sigue fallando, frena las que siguen para no desordenar la secuencia y avisa con la ruta del archivo, por si la querés subir a mano.
- Si Postiz tarda más de 10 minutos con una, o la compu estaba dormida y una sale tarde, también avisa. Los avisos de las últimas 24 horas se ven arriba de la pestaña Historias y quedan en `<publicar>/.planner/historias-cadena.json`.
- **Hace falta que el planner esté corriendo** a la hora de las historias (el servicio de [INSTALAR.md](../INSTALAR.md) lo deja andando solo). Si estaba cerrado, las que faltan salen en orden apenas se abre. Para correrla a mano: `python3 engine/historias.py cadena` (con `--dry-run` muestra qué haría).
- Con `"historias": { "cadena": false }` en `planner.config.json`, todas se programan a su hora, como antes.

### Cambiar de día, dejar un día libre o descartar

**Cambiar de día:** con el ⋮⋮ de la fila (arrastrándolo a otro día) o tocando el día y eligiendo otra fecha, hasta 4 semanas antes o 12 después. Si el día elegido ya tiene otra secuencia de la cuenta, las dos **intercambian** el día, también entre semanas: pasar la del lunes al martes manda la del martes al lunes. A un día que ya pasó no se mueve nada, y una secuencia de un día pasado no manda la otra a ese día. El aviso trae **Deshacer**.

**Dejar libre**, en cada día con historias de hoy en adelante, corre su secuencia y las que le siguen pegadas un día, salteando el domingo, hasta el primer día vacío (también en las semanas siguientes). Antes de guardar muestra la lista de movidas para confirmar, y el aviso trae **Deshacer**.

**Descartar**, en cada día de hoy en adelante, saca la secuencia del calendario: el día queda libre y la secuencia pasa a **Descartadas**, abajo de la semana, con **Recuperar** (vuelve a su día, con su hora; si ese día ya tiene otra, mové primero esa). Es distinto de **No se publica**, que la deja en su día sin salir (y si estaba en Postiz, al programar vuelve a la bandeja de la cola). Al programar, lo que una descartada tenía en la cola sale de Postiz y queda en pausa (`cola.py pausar`), así nadie la vuelve a agendar; lo ya publicado no se toca.

Nada de eso toca Postiz hasta que programes y confirmes.

### Los días que ya pasaron

La fila queda atenuada y sin los controles de Postiz, con un resumen: «✓ Salieron las 4», «Salieron 2 de 3» o «No salió ninguna». Cada historia dice **✓ Publicada** si la cola o Postiz la registran publicada (la ficha archivada en `publicado/`, el estado publicado o PUBLISHED, o el id de Instagram) o **No salió**. Hoy se marcan las que ya pasaron su hora. Las respuestas y vistas se siguen cargando igual.
