# Guiones

La pestaña **Guiones** es donde revisás el contenido de la semana mientras se produce, antes de que pase a la cola de publicación: el guion, el audio, el rough cut, el final y los carruseles. Desde ahí:

- escuchás el audio, mirás el rough cut o el final ahí mismo en la tarjeta, y leés el guion;
- ves en cada tarjeta qué es la pieza: el título, el tema, el formato, el estilo con su paleta y, si la tiene, la referencia original que toma (con un link al original);
- **aprobás** lo que está bien (el audio, el corte, el final o el borrador del carrusel). Una aprobación vale para lo que revisaste: si el archivo cambia después, la pieza vuelve a «por revisar». Si el final tiene varias versiones, elegís cuál mirar y aprobás ésa (ver «Versiones de un final»);
- dejás **feedback** escrito (Enter) o grabado con el micrófono, en cada pieza, y lo copiás para Claude Code de esa pieza sola o de todas;
- editás el **copy** del post;
- elegís, desde la etiqueta del estilo, el look del avatar, el estilo del B-roll y el tipo de título (el **editor de producción**);
- pausás una pieza que va más adelante o descartás la que no va (se pueden recuperar);
- ves cada pieza en el día en que empezó a producirse: el del nombre de su carpeta si termina en `AAAAMMDD-HHMMSS` o, si no, el día en que se creó la carpeta. El período va arriba (Día, Semana, 15 días, Mes o Todo) y el título abre un calendario que dice cuántas piezas empezaron cada día, con un punto si alguna te toca. Lo elegido queda al recargar;
- filtrás por etapa, con su contador: **Te toca** (lo que espera tu feedback o tu aprobación, de cualquier etapa), Guion, Audio, Por revisar, Aprobado, Publicado, Pausado y Descartado; por **Formato** (el `formato` del plan: «Reel explicativo · Mi marca» y «Reel explicativo» cuentan como el mismo); y con el formato de la barra lateral, reels o carruseles. Lo que aprobás o comentás se queda en su lugar hasta que cambies un filtro o recargues;
- abrís en el Finder la carpeta de una pieza, con su video o su audio seleccionado (el ícono de carpeta al lado del archivo);
- tocás **Copiar feedback para Claude Code** y pegás el mensaje en el chat: trae cada nota con su pieza y cómo aplicarla.

El planner sólo lee tus carpetas. Lo único que escribe es lo que elegís acá: el estado (en `<publicar>/.planner/`), las notas (en `feedback/` de cada pieza) y el estilo, look o título en el `plan.json`.

## Dónde viven

Cada semana es una carpeta con la fecha de su lunes adentro de `guiones/` en tu carpeta de contenido (se cambia con `guiones.carpeta` en `planner.config.json`):

```
<contenido>/guiones/
  2026-10-26/                   una carpeta por semana, con la fecha del lunes
    plan.json                   el plan de la semana (ver abajo)
    R01/                        una carpeta por pieza (el nombre es libre)
      guion.txt                 el guion (en un video mudo, el texto en pantalla)
      audio.mp3                 la voz (también vale voz.mp3, audio.wav, voice/audio_final.mp3…)
      rough_cut.mp4             el corte para revisar (rough_cut_v2.mp4… manda el más nuevo)
      final.mp4                 el final (final_<algo>.mp4 es otra versión del final)
      publish_kit.md            el copy del post, en la sección «## Caption» (o caption.txt)
      feedback/                 las notas que dejás desde el planner
    C01/                        un carrusel
      slides/01.png, 02.png…    las láminas (01.mp4 si una lámina está animada)
      copy.txt                  el texto de las láminas
      portadas/a.png, b.png…    hasta tres portadas para elegir la ganadora (opcional)
<contenido>/looks/              una foto o un video corto por look del avatar (opcional)
```

Si una semana tiene más de un plan (por ejemplo, uno por marca), cada uno va en una subcarpeta con su propio `plan.json`: `guiones/2026-10-26/marca-a/plan.json`. El planner los muestra uno abajo del otro con su título.

## plan.json

```json
{
  "semana": "2026-10-26",
  "titulo": "Semana del 26 de octubre",
  "piezas": [
    {
      "id": "R01",
      "tipo": "reel",
      "titulo": "Una semana de contenido en una tarde",
      "titulo_pantalla": "UNA SEMANA / EN UNA TARDE",
      "hook": "Así armo todo el contenido de la semana en una sola tarde.",
      "carpeta": "R01",
      "formato": { "id": "tutorial", "nombre": "Tutorial" },
      "estilo": {
        "id": "papel", "nombre": "Papel y arcilla",
        "paleta": ["#F0EEE6", "#141413", "#D97757"],
        "titulo": "Condensada en caja arcilla", "ritmo": "Cortes cada 2 o 3 segundos",
        "titulo_css": { "clase": "t-condensada t-caja", "color": "#141413", "acento": "#D97757" }
      },
      "muestras": ["R01/muestra.jpg"],
      "look": { "id": "living-dia", "nombre": "Living de día" }
    },
    { "id": "C01", "tipo": "carrusel", "titulo": "5 herramientas", "carpeta": "C01", "estilo": { "id": "noche", "nombre": "Noche", "paleta": ["#13181E", "#FAF9F5"] } }
  ]
}
```

- `carpeta`: la carpeta de la pieza, relativa al `plan.json` o a tu carpeta de contenido.
- `tipo`: `reel` (cualquier video) o `carrusel`.
- `titulo_pantalla`: el título del gancho; ` / ` separa los dos renglones.
- `estilo`: el mundo visual de la pieza. Con `paleta`, entra a la **biblioteca de estilos**. `titulo_css.clase` dice cómo se dibuja el título en la tarjeta (ver «Tipos de título»).
- `muestras`: imágenes o clips que muestran el estilo (de un video ya hecho en ese estilo o una referencia).
- `look` y `titulo_tipo`: los elige el editor de producción; también los puede escribir quien arma el plan.
- `mudo: true`: un video sin voz se aprueba por el texto de `guion.txt` hasta que haya corte.
- `sin_avatar: true`: la pieza no lleva avatar y no muestra la pestaña Avatar.
- `tema` (opcional): de qué trata, en una línea; va abajo del título.
- `porque` y `referencias` (opcionales): por qué se eligió la pieza y sus fuentes; se ven en la pestaña «Por qué» de la tarjeta.
- `referencia` (opcional): el original que toma la pieza, si lo hay. Se muestra como un bloque que abre el original:

  ```json
  "referencia": { "url": "https://www.instagram.com/p/XXXX/", "cuenta": "@cuenta", "vistas": 234523, "multiplo": 78.7,
                  "tomar": "recrear", "poster": "refs/original.jpg", "hook_original": "La primera frase del original" }
  ```

  Sólo `url` es obligatoria y tiene que ser una dirección web (no una carpeta). `tomar` dice qué toma: `recrear` (lo clona), `idea` (el tema) o `formato`. `poster` es una imagen dentro de tu carpeta de contenido. Sin `referencia`, el planner usa la primera URL de una red social de `referencias`; `"referencia": null` dice que no tiene.

## Versiones de un final

Si un final ya aprobado o agendado necesita otra iteración, la nueva va aparte, con otro nombre que empiece con `final` (`final_gancho_b.mp4`, por ejemplo), sin pisar `final.mp4`. La tarjeta muestra la más nueva y, debajo del video, un desplegable con todas: cada una dice cuánto dura, si es la aprobada y si es la que está agendada en Postiz (con su fecha). Las copias técnicas (`*_liviano.mp4`, `*_web.mp4`, `*_app.mp4`, `*_postiz.mp4`) no cuentan como versiones.

- **Aprobar** aprueba la versión que estás mirando, y la tarjeta se queda en ésa hasta que aparezca una más nueva.
- La nota de feedback guarda sobre qué versión la escribiste, y el mensaje para Claude Code lo dice.
- La cola (`listo`) y la Semana usan la versión aprobada en Guiones, aunque haya otra más nueva. Aprobar otra versión no cambia lo que ya está agendado en Postiz: el planner te avisa, y para cambiarla se reemplaza en la cola (ver la skill `publicar`).

## Editor de producción

La etiqueta del estilo, en la ficha de la tarjeta, abre un menú con lo que se puede cambiar: **Look del avatar**, **Estilo del B-roll** (o del carrusel), **Título en pantalla** y las muestras del estilo, cada uno con lo elegido. Cada opción abre el mismo editor en su pestaña, y el editor queda abierto después de elegir.

- **Avatar:** los looks de la carpeta `looks/` (se cambia con `guiones.looks`), con una foto de cada uno. Un look es una imagen (JPG, PNG o WebP) o un video corto (MP4, MOV o WebM, se muestra un cuadro). Para ponerles nombre, `looks/looks.json`:

  ```json
  { "living-dia.jpg": { "nombre": "Living de día", "combina": "paletas claras", "default": true },
    "viejo.jpg": { "prohibido": true } }
  ```

  Un look `prohibido` no aparece. Elegirlo escribe `look` (`id`, `nombre`, `combina`, `archivo`) en la pieza.
- **B-roll:** la biblioteca de estilos, de más usado a menos usado. Cada estilo se ve con cuadros de un video terminado en ese estilo (los saca el planner con ffmpeg, en segundo plano) o con su muestra. ★ marca favoritos y ⊘ descarta: queda en `<publicar>/.planner/estilos-preferencias.json`, junto con lo que elegiste para cada formato, y quien planifique la semana siguiente lo puede leer. «Ver» abre el estilo en grande y deja elegir qué cuadro lo representa.
- **Título:** cada tipo de título dibujado con el título de la pieza, sobre la muestra del estilo y el look elegido, como queda en el gancho. Elegirlo escribe `titulo_tipo` (`id`, `nombre`, `clase`) en la pieza; «Del estilo» lo saca.

Si la pieza ya tiene rough cut, final o láminas, cambiar el estilo, el look o el título deja una nota para rehacerlo, que viaja con «Copiar feedback». Si volvés a lo que tenía el corte, la nota se va. Si el plan se vuelve a escribir con lo de antes, el planner sigue mostrando lo que elegiste.

### Tipos de título

Los que el planner sabe dibujar: condensada en caja, condensada, negrita en caja, negrita, serif editorial, serif en caja, grotesk resaltado, bricolage y mono. Son clases de `app/public/guiones.css` (`t-condensada`, `t-black`, `t-serif`, `t-grotesk`, `t-bricolage`, `t-mono`, combinables con `t-caja` o `t-resaltado`). Para sumar los tuyos, con una imagen de ejemplo:

```json
"guiones": { "titulos": [ { "id": "mi-visor", "nombre": "Mi visor", "nota": "Tarjeta con esquineros", "imagen": "looks/titulos/visor.png" } ] }
```

## Copiar feedback para Claude Code

El botón de arriba junta las notas sin corregir de todas las fechas y etapas, de los formatos prendidos en la barra (el filtro Formato no lo achica), y las marca como enviadas; el de cada tarjeta copia sólo las de esa pieza. La primera línea del mensaje dice qué se pide («[Feedback] Editar el video «…»», «[Feedback] Corregir 3 piezas de «…»») y, si abre una conversación nueva, queda como su título. El mensaje dice, por pieza, la carpeta, el guion, el audio o el corte que revisaste y cada nota (los audios se transcriben antes de actuar), con las reglas para aplicarlas: corregir el guion o el corte sin pisar la versión anterior (`rough_cut_v2.mp4`), el copy textual en `publish_kit.md`, avisar antes de gastar en generaciones pagas y no agendar nada. Al terminar, cada nota queda `aplicado` con una línea de qué cambió.

## Estado y archivos del planner

En `<publicar>/.planner/`: `guiones-estado.json` (aprobaciones, pausas y descartes), `guiones-estilos.json` y `guiones-produccion.json` (lo elegido en el planner, por pieza), `estilos-preferencias.json` (el catálogo de estilos) y `cache/` (cuadros de estilos y de looks, se regeneran solos).

## API

`GET guiones?week=&perfil=`, `POST guiones/estado` (`run`, `estado`: `aprobado` o `por_escuchar`; `video`: la versión del final que se aprueba), `POST guiones/descartar` (`run`, `accion`: `descartar`, `recuperar`, `pausar` o `reanudar`), `POST guiones/feedback` (`run`, `text` o `copy`, o `audio` en base64 con `mime`; `video`: la versión del final sobre la que es la nota), `POST guiones/feedback/remove`, `POST guiones/copiar` (`perfil`, `week`; `runs` limita el pedido a esas piezas), `POST guiones/portada` (`run`, `id`), `GET guiones/estilos`, `GET guiones/estilos/cuadro?f=`, `POST guiones/estilo` (`plan`, `run`, `estilo`, `deshacer`), `POST guiones/estilos/preferencia`, `POST guiones/estilos/portada`, `GET guiones/produccion`, `GET guiones/looks/img?id=` y `POST guiones/produccion` (`plan`, `run`, `campo`: `look` o `titulo_tipo`, `valor`; `null` vuelve a lo del plan). `perfil` es la subcarpeta del plan (vacío si el plan está en la carpeta de la semana).
