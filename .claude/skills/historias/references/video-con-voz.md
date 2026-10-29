# Historia con video y voz en off

Es una historia de video con tres capas: abajo un video real, encima una voz en off que cuenta lo que se ve y arriba el
texto de siempre, en el estilo nativo de Instagram ([diseno.md](diseno.md)). Sirve para mostrar algo: algo que la
persona construyó, cómo funciona su sistema, cómo hace algo, un recurso, una clase o un tramo de un video de YouTube.
Suele rendir muy bien, y es uno de los formatos que se eligen al planificar la semana.

## Cuándo usarlo

- **Recurso:** mostrar el recurso por dentro antes de pedir la palabra: la herramienta funcionando, un tramo de la clase
  de YouTube, la plantilla abierta. Va en el nudo de R1, R2 o R3, y la historia del pedido sigue siendo una imagen con
  «Respondé PALABRA».
- **Conciencia:** cómo funciona el sistema o cómo se hace algo (C2, C3). Mostrar el proceso real y no un resumen.
- No reemplaza al gancho, que sigue siendo una imagen con una frase. Lo habitual es una o dos historias de video por
  secuencia y el resto imágenes. El día sigue llevando de 3 a 5 historias.

## Guion de la voz

- La voz cuenta lo que la imagen muestra en ese momento: una frase por cosa que se ve, en el orden en que aparece.
  Nada de enumerar lo que no está en pantalla.
- Primera persona, como habla la persona. Entre 25 y 50 palabras por historia: de 8 a 15 segundos. Si hace falta más,
  se parte en dos historias de video seguidas.
- **El guion se aprueba antes de grabar o generar el audio.** El texto de la voz se muestra completo y se espera el
  OK; mientras haya correcciones, se devuelve sólo texto. En la propuesta de la semana va como «Voz en off: …» debajo
  del texto de esa historia.
- Ya aprobado, el guion va a `<semana>/voces/<historia>.txt`, con el mismo nombre que la historia
  (`voces/AAAA-MM-DD_N_tipo.txt`): es el que el editor del planner muestra en el teleprompter al grabar.

## La voz

- Es la voz de la persona. Lo más simple es que la grabe ella en el editor del planner, leyendo el guion en el
  teleprompter mientras corre el video: queda en sincro con lo que se ve. También puede ser un audio suyo o su clon de
  voz. Antes de usar una voz que no se grabó leyendo el guion, controlá que diga exactamente lo que dice el guion (una
  transcripción contra el texto alcanza).
- **En historias, más rápida y con más energía que en un reel.** Se habla un poco más rápido, con más emoción y más
  dinámico. Como referencia, unas 4,3 palabras por segundo, contra unas 3,6 de un reel. Si el motor de voz admite
  tags de dirección, uno de apertura como `[enthusiastic, energetic, lively, showing a friend something I built]`; si
  tiene un control de estabilidad, bajalo para que suene más expresiva. Más energía no es actuar: sin risas ni emoción
  impostada. La escucha de la persona decide.

## El video

- **Origen:** la persona filmando la pantalla con el celular en vertical (se ve real y nativo), una grabación de
  pantalla, un clip propio de YouTube o un video del celular. Que cada toma dure un poco más que su frase: el corte va
  sobre el audio.
- **Guía para filmar:** una toma por frase de la voz, en el mismo orden. Si filma el planner, que no mueva nada real:
  arrastrar y cambiar horas en una semana que no se publica y después **Volver al plan**; en el editor, cerrar sin
  guardar.
- **Color:** un video del iPhone llega en HDR (HLG o Dolby Vision 8.4). `motor-historias/fondo_video.py` lo pasa a
  color normal con la conversión de Apple (`avconvert`, la misma que muestran el iPhone y el Mac) y baja un poco las
  luces altas. La conversión con zscale + hable deja la pantalla filmada con el color roto y muy brillosa; fuera de
  macOS, sin `avconvert`, el script la usa igual y lo avisa. Un video que ya es SDR no se toca.
- **Encuadre:** vertical, llena la historia. Horizontal (YouTube), va entero, centrado sobre negro, con lugar arriba y
  abajo para el texto. `fondo_video.py` lo decide solo por la proporción; `--encuadre cubrir` o `--encuadre entero` lo
  fuerza.

## Armado

1. `python3 motor-historias/fondo_video.py VIDEO --fuente <semana>/fuente --id nombre [--desde s] [--hasta s]` pasa el
   video a color normal, 1080×1920 a 30 cuadros, y deja los cuadros JPG en `fuente/assets/videos/<id>/` con su
   `video.json`. En la salida escribe el JSON con `secuencia`, `cuadros`, `fps` y `duracion` para la historia.
2. La voz va a `fuente/assets/audio/` (WAV).
3. El HTML de la historia, desde `motor-historias/plantilla.html`:

   ```html
   <main class="historia estilo-amarillo" data-duracion="11.8">
     <audio class="voz" src="assets/audio/voz.wav" data-inicio="0.25" data-duracion="11.17"></audio>
     <div class="fondo"><img data-secuencia="assets/videos/nombre/%03d.jpg" data-cuadros="394" data-fps="30"
          data-inicio="0" src="assets/videos/nombre/001.jpg"></div>
     <div class="bloque t1"><p class="caja serif">Así armo mi <span class="c">semana de historias</span> <span class="emoji">👇</span></p></div>
   </main>
   ```

   - `data-duracion` = fin de la voz + 0,4 s: **la historia termina con la voz**, sin tramo mudo. Si la voz dura más
     que el video, el último cuadro queda quieto.
   - El texto, arriba, en un renglón o dos parejos, sobre la zona donde el video tiene menos información (la barra del
     navegador, el techo). Una sola caja; el resto lo cuenta la voz.
4. `python3 motor-historias/render.py <semana>/fuente/<historia>.html --salida <semana>/historias --chequeo` saca la
   historia en MP4 sola cuando tiene `img[data-secuencia]` o `<audio class="voz">`: cuadro a cuadro, con la voz
   mezclada desde su segundo de inicio, en BT.709, y el PNG del segundo 1 como imagen fija. El chequeo avisa si la voz
   se corta o si pasa de 60 s (Instagram corta cada historia de video ahí: partila en dos).
5. Antes de entregar, mirá y escuchá el MP4 completo: que la voz diga el guion, que la imagen acompañe cada frase y que
   el texto no tape lo que importa.

Lo mismo se hace desde el editor del planner, con el video de **Fondo** y el cajón **Audio**: ahí se graba la voz
leyendo el guion en el teleprompter, se sube un audio o se elige una toma o una voz de `<semana>/voces/`, se ajusta en
qué segundo empieza y se prueba con el video. Cómo se usa está en
[«El editor» de docs/historias.md](../../../../docs/historias.md#el-editor). Lo que conviene saber al armar a mano o
corregir lo que hizo el editor:

- El video y el audio tal como se subieron quedan en `<semana>/originales/`. Para volver a tomar otro tramo, se parte
  de ahí.
- El planner prepara el video llamando al mismo `motor-historias/fondo_video.py`, con el Python del planner (`PYTHON`
  de su config: `PLANNER_PYTHON` si está definido; si no, `python3`, o `python` en Windows). El resultado es el mismo
  que corriéndolo a mano.
- Las voces para elegir salen de `<semana>/voces/`; la elegida se copia a `fuente/assets/audio/` en WAV. Una toma
  grabada queda como voz desde el segundo 0, sin el silencio del final y con un nivel parejo.
- Si se cambia el guion en el editor, se guarda en el mismo `<semana>/voces/<historia>.txt` y la versión anterior queda
  en `<semana>/tmp/ediciones/`.

## En semana.json y al publicar

- La historia lleva `video` (`historias/<nombre>.mp4`), `formato: "video"` y `voz` (`audio`, `inicio`). `imagen` sigue
  siendo el PNG: el planner la sigue por ahí y muestra la marca «▶ video».
- Al programar, `engine/historias.py` manda a Postiz el MP4 con la voz (si la historia pasó de imagen a video, la agenda
  con otro slug para no chocar con la anterior). `python3 engine/historias.py aplicar <id>` lista el archivo de cada
  historia antes de `--ejecutar`: confirmá que la de video lista su `.mp4`. La primera historia de video que salga por
  Postiz se verifica publicada en Instagram.
