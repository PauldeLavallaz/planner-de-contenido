# Guiones

La pestaña **Guiones** es donde revisás el contenido de la semana mientras se produce, antes de que pase a la cola de publicación: el guion, el audio, el rough cut, el final y los carruseles. Desde ahí:

- escuchás el audio, mirás el rough cut o el final ahí mismo en la tarjeta, y leés el guion;
- **aprobás** lo que está bien (el audio, el corte, el final o el borrador del carrusel). Una aprobación vale para lo que revisaste: si el archivo cambia después, la pieza vuelve a «por revisar»;
- dejás **feedback** escrito (Enter) o grabado con el micrófono, en cada pieza;
- editás el **copy** del post;
- elegís, en el **editor de producción**, el look del avatar, el estilo del B-roll y el tipo de título;
- pausás una pieza que va más adelante o descartás la que no va (se pueden recuperar);
- filtrás por estado (guion y audio, rough cut, final, con feedback, aprobado, pausado, descartado) y, con el formato de la barra lateral, reels o carruseles;
- elegís la semana en un calendario (se abre tocando el título): tocar un día abre su semana, la casilla de cada semana la suma a las que se ven, y están «Hoy» y «Todas las semanas». Cada semana con guiones dice cuántas piezas tiene, y lo elegido queda al recargar;
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
      final.mp4                 el final
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

## Editor de producción

Cada video tiene tres botones: **Avatar**, **B-roll** y **Título**. Cada uno abre el mismo editor en su pestaña, y el editor queda abierto después de elegir.

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

El botón junta las notas sin corregir de las semanas que estás viendo y las marca como enviadas. El mensaje dice, por pieza, la carpeta, el guion, el audio o el corte que revisaste y cada nota (los audios se transcriben antes de actuar), con las reglas para aplicarlas: corregir el guion o el corte sin pisar la versión anterior (`rough_cut_v2.mp4`), el copy textual en `publish_kit.md`, avisar antes de gastar en generaciones pagas y no agendar nada. Al terminar, cada nota queda `aplicado` con una línea de qué cambió.

## Estado y archivos del planner

En `<publicar>/.planner/`: `guiones-estado.json` (aprobaciones, pausas y descartes), `guiones-estilos.json` y `guiones-produccion.json` (lo elegido en el planner, por pieza), `estilos-preferencias.json` (el catálogo de estilos) y `cache/` (cuadros de estilos y de looks, se regeneran solos).

## API

`GET guiones?week=&perfil=`, `POST guiones/estado` (`run`, `estado`: `aprobado` o `por_escuchar`), `POST guiones/descartar` (`run`, `accion`: `descartar`, `recuperar`, `pausar` o `reanudar`), `POST guiones/feedback` (`run`, `text` o `copy`, o `audio` en base64 con `mime`), `POST guiones/feedback/remove`, `POST guiones/copiar` (`perfil`, `week`), `POST guiones/portada` (`run`, `id`), `GET guiones/estilos`, `GET guiones/estilos/cuadro?f=`, `POST guiones/estilo` (`plan`, `run`, `estilo`, `deshacer`), `POST guiones/estilos/preferencia`, `POST guiones/estilos/portada`, `GET guiones/produccion`, `GET guiones/looks/img?id=` y `POST guiones/produccion` (`plan`, `run`, `campo`: `look` o `titulo_tipo`, `valor`; `null` vuelve a lo del plan). `perfil` es la subcarpeta del plan (vacío si el plan está en la carpeta de la semana).
