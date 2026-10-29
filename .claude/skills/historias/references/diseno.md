# Diseño de las historias

Cómo se ve cada historia según su tipo. Sale de cientos de historias publicadas por cuentas reales que venden con
historias, clasificadas por tipo y fórmula, y de las vueltas de corrección sobre semanas de prueba. Cómo se arma en
código (motor, plantilla, render y chequeo) está en [docs/historias.md](../../../../docs/historias.md).

## Las reglas que mandan

0. **Todo centrado. Regla dura.** Un elemento descentrado es inaceptable. Cada caja, cada renglón de texto, cada
   recurso (portada, celular, captura), cada flecha y cada zona de sticker va con su centro en el eje vertical de la
   historia (540 px). Nada alineado a la izquierda ni a la derecha, nada «al costado del gesto». Un conjunto (una fila
   de emojis con sus flechas) va centrado como conjunto, adentro de un contenedor con `data-grupo`. Si la persona está
   corrida en la foto, el texto igual va al centro: arriba, abajo o sobre su ropa, nunca a un costado. El chequeo de
   `python3 motor-historias/render.py … --chequeo` lo mide y lo marca.
1. **Estilo Instagram nativo.** Se usan las tipografías de Instagram y sus estilos reales: el fondo del texto, la
   letra y los colores que vienen por default. Una historia que se aleja de lo que la gente está acostumbrada a ver
   choca. Tiene que parecer hecha en la app:
   - **Letra:** los estilos del editor de historias, nada más. Instagram no publica sus fuentes, así
     que se usan las libres que más se les parecen (en `motor-historias/motor/instagram.css`, comparadas contra
     historias reales): la **serif** de las cajas negras (Newsreader), la **Clásica** (Instrument
     Sans) y la de **máquina** (Courier Prime). Nada de fuentes de marca, display, itálicas
     decorativas ni tipografía inventada.
   - **Fondos de texto:** como el botón «A» del editor. Caja negra con letra blanca (la más usada en las historias del
     método; en el análisis de paneles manda el resaltado blanco con la Clásica en negrita, ver el punto 4),
     caja blanca con letra negra, caja del color del día, caja translúcida, o el resaltado por
     renglón de la Clásica. Texto centrado.
   - **Colores:** los que trae la fila del editor: blanco, negro, azul, verde, amarillo, naranja,
     rojo, magenta, violeta. El color del día es uno de esos y pinta las palabras que importan, como
     cuando se selecciona una palabra en la app.
   - **Recursos de la app:** emojis (no íconos), flechas y círculos hechos con el lápiz, stickers
     (encuesta, caja de preguntas, mención, link, slider), la persona recortada como sticker. Para
     escribir sin caja sobre una foto, overlay negro de opacidad baja (0,3 a 0,5) sobre la foto
     entera y el texto blanco encima.
   - **Afuera:** rótulos con el nombre de la marca, numeración «01 / 03», degradés y bandas oscuras,
     tarjetas con esquina de color, composiciones de carrusel, tipografía de marca, mascotas o
     personajes de marca como sticker, fondos de color sólido.
   - **Estilos con nombre:** Amarillo, Rojo, Verde y Naranja, con su receta en [estilos.md](estilos.md).
     Un estilo por día, alternados, salvo que la marca fije uno solo.
   - **Imagen fija por defecto.** La historia es una imagen fija salvo que el movimiento sea
     indispensable. El movimiento queda como recurso para cuando hace falta: un video adentro
     ([video-con-voz.md](video-con-voz.md)), un recorrido largo que no entra en una imagen.
   - **No es el estilo de los carruseles de la marca:** las historias no copian su diseño.
2. **Se intercalan historias con foto y historias de fondo blanco o negro.** No todas las historias van
   con foto: intercalar fondos lisos, sólo con tipografía, el mensaje y emojis, ayuda a hablar más claro.
   Emojis en lugar de íconos, sin mascotas ni personajes, y el fondo liso sólo blanco o negro.
   - **Con foto:** foto real de la persona o de su vida (ver «La foto»). Es lo que hace que la
     secuencia se vea orgánica y real.
   - **Lisa:** fondo blanco o negro, nada más. Nunca un color sólido: si la historia pide más presencia,
     va una foto de un lugar de la persona con overlay negro. Las cajas y los resaltados, los emojis y
     las flechas de lápiz.
   - **Alternancia:** dentro de un mismo día no van dos del mismo tipo seguidas, y en la semana
     ninguno de los dos baja de un tercio. Las que muestran a la persona, un resultado suyo o un
     lugar propio van con foto. Las de anuncio, lista, regla, dato o pregunta pueden ir lisas.
3. **Cómo se combinan los elementos** (texto, emojis, flechas, capturas), tal como lo hacen las 230 secuencias de
   referencia de cuentas que venden con historias:
   - De 2 a 4 elementos por historia y uno que domina: la foto, la captura o la lista.
   - Una frase manda. En el gancho, el titular va grande (`.titular`, la Clásica en negrita a 88–110 px,
     suelto con sombra o en caja) y lo demás chico: la etiqueta de arriba (`.etiqueta`) o la bajada en
     caja. Tres cajas de serif del mismo tamaño no tienen jerarquía y se leen como un párrafo. En el editor
     del planner, los dos están en **Agregar**.
   - El texto en caja o pastilla que abraza la frase. La serif en cajas para las frases; la Clásica en
     negrita, en etiqueta blanca o del color, para el gancho de curiosidad, los títulos de sección
     («El sistema funciona así:») y las etiquetas de los pasos.
   - Color en 1 a 3 palabras: la pregunta, la palabra del pedido, el número.
   - Emojis como puntero o puntuación (👉 👇 ⤵️ ⁉️ y los números 1️⃣ 2️⃣ 3️⃣ para los pasos), no de adorno.
   - La flecha de lápiz lleva a la historia siguiente (en un gancho que deja algo abierto) o a lo que hay que
     mirar.
   - Las capturas van como tarjeta (`.captura`: esquinas redondeadas y sombra); si importa una parte, se
     marca con un círculo de lápiz o se atenúa el resto.
   - Los recursos que se repiten (chat de WhatsApp, archivo del recurso, recurso tapado, pasos con
     captura, para quién es) tienen su receta en [recursos.md](recursos.md); la historia con video y voz en
     off, en [video-con-voz.md](video-con-voz.md).
4. **Lo que muestra el análisis de paneles** (61 secuencias y 265 historias de cuentas de referencia, con los paneles de
   estadísticas de una cuenta de IA de referencia, con unas 4.000 vistas por historia, y de una cuenta de trading de
   referencia; ver [metodo.md](metodo.md)). Sirve para los ganchos, las estructuras y el diseño.
   - **La letra es la sans del editor, casi siempre en negrita, y nunca la serif.** La base es el resaltado blanco por
     renglón con letra negra (`.resalte` + `.clasica` + `.negrita`), con la palabra que importa en color dentro del
     renglón. Es lo que usaban las historias de la cuenta de IA que trajeron cientos de respuestas. La serif en caja negra
     sale de las historias del método; cada marca elige su base, y si tiene su propia guía de estilo, manda esa guía.
   - **La historia del pedido tiene una forma fija:** el recurso a la vista (la laptop o el celular filmados con el recurso
     abierto, o su miniatura como tarjeta), arriba en uno o dos renglones qué es («Armé una clase explicando el paso a paso
     de cómo hice el video»), abajo «Respondé "PALABRA" y es tuya» y, debajo, 👇👇👇 apuntando a la barra de respuesta (o
     la flecha de lápiz). Se entiende sola: ahí se junta la respuesta.
   - **El resultado, en movimiento.** Si el tema se ve, la historia del medio es el video del resultado con una sola
     línea arriba («Y podés hacer cosas así 👀»). Es un video de contenido, no una animación: no choca con la imagen fija
     por defecto.
   - **Gancho:** selfie o foto de la persona con un gesto, una o dos cajas de 5 a 15 palabras y ➡️➡️➡️ o 👉👉👉 en fila
     cuando lo que sigue está en la próxima.
   - **Listas:** un título en resaltado blanco («Pasarías de:», «Si querés ser un freelancer de alto valor y:») y un ítem
     por renglón, cada uno en su caja del color. Verde sólo si los ítems son beneficios, y nunca sobre fondo blanco
     ([estilos.md](estilos.md)).
   - **Pruebas pegadas como capturas:** el panel de estadísticas de una historia anterior, el chat de alguien, una pila de
     comentarios reales sobre una selfie, la grilla de resultados. Recetas en [recursos.md](recursos.md).
   - **Pausa en negro:** una historia lisa negra con una sola línea corta en color («Solo necesitás 2 cosas:») antes de
     una lista o una regla.
   - El texto ocupa un tercio de la pantalla y la foto o la pantalla se ven. Mediana de 15 a 17 palabras por historia y de
     7 a 11 en el gancho.

## Lo que aprendimos diseñando

Sale de vueltas de corrección sobre semanas reales. Si una marca tiene su propia guía de estilo, manda esa guía.

**La foto**
- Real y de la persona. Una foto floja arrastra la historia aunque el texto esté bien: movida, de
  espaldas, cara chica, desaliñada en penumbra, sin remera, con otra gente o animales adelante.
- El lugar acompaña lo que dice: el escritorio para hablar de trabajo, el lago al atardecer para un
  gancho, la compu con el trabajo en pantalla para un detrás de escena.
- La persona grande y con un gesto que juega con el texto: señala arriba hacia la caja, apunta a
  cámara con «esto es para vos» centrado debajo, el pulgar arriba con «listo para usar» centrado
  arriba. El texto no se corre hacia el gesto: va al centro.
- No siempre en el mismo lugar verticalmente: caja arriba y persona abajo, persona arriba y caja
  abajo, texto repartido arriba y abajo. Siempre centrado en horizontal.
- Nunca cortes a la persona ni le tapes la cara con una caja, una captura o un sticker. En macOS, el
  chequeo del render busca caras tapadas por texto.

**El texto**
- Poco por caja y una idea por historia. Un elemento que domina (la palabra del pedido grande, la
  cifra, los números) y lo demás chico.
- Renglones parejos: cada caja en renglones del mismo largo, o cortada donde corta la frase. La
  escalera largo, corto, largo, corto se ve muy mal y fue la corrección más repetida.
- Frases separadas, cajas separadas: así lo hace la gente en la app y se lee mejor que un bloque.
- El remate de un gancho o de un cierre va en una caja del color con la Clásica en negrita, chica y
  con un emoji al final, debajo de la caja negra ([estilos.md](estilos.md)). La serif enorme en una
  caja ancha queda rara.

**El color**
- **El color dice algo:** verde para lo positivo y los recursos, rojo para los errores, amarillo y
  naranja neutros, y nunca verde sobre fondo blanco ([estilos.md](estilos.md)).
- Un estilo por día de los cuatro, según el tono del día y, entre los que le quedan, el que mejor vaya
  con las fotos de ese día (mirá qué colores dominan en ellas): amarillo con una remera mostaza o un
  atardecer, verde con vegetación o una pantalla, naranja con madera y luz cálida, rojo con un recurso
  o un detalle rojo. No el mismo dos días seguidos. Nunca un color que no esté en la fila.

**La entrega**
- Después de cada vuelta, la semana entera a la vista (la pestaña Historias del planner la muestra
  así), revisada con la lista de abajo antes de mostrarla.
- Los .zip por día, sólo cuando el usuario los pide, al final.

## Por tipo

### 🟢 Venta: gancho, vehículo, resultado, pedido

| Historia | Fondo | Texto | Extra |
|---|---|---|---|
| Gancho | Foto de la persona con un gesto hacia el texto | Caja negra arriba; el remate en caja del color, centrado abajo | Emoji opcional |
| Vehículo | Blanco | Pasos con emojis grandes en fila, unidos con flechas de lápiz; cierre en caja negra | Nada |
| Resultado | Foto con un gesto de festejo | La cifra en caja del color, que cuenta; la frase en caja negra | Mención si es de un cliente |
| Pedido | Foto de un lugar suyo con overlay negro, o la persona señalando | Palanca en texto blanco o caja negra; «Respondé “PALABRA”» con la palabra enorme en el color | Flecha de lápiz o 👇 hacia la barra de respuesta |

### 🔴 Recurso: gancho o pregunta, regla o riesgo, recurso y palabra

| Historia | Fondo | Texto | Extra |
|---|---|---|---|
| Gancho o pregunta | Foto con la persona señalando la pregunta | Pregunta en caja blanca o negra, centrada arriba | «Respondé…» con las opciones como ejemplos, centrado abajo, sobre el cuerpo |
| Regla o riesgo | Blanco o negro | La regla en resaltado del color; la lista con emojis o una grilla de emojis | Círculos de lápiz sobre lo elegido |
| Prueba en movimiento (R5) | El video del resultado | Una línea arriba («Y podés hacer cosas así 👀») | Nada |
| Recurso y palabra | La laptop o el celular filmados con el recurso abierto; si no hay, foto de un lugar suyo con overlay negro | Qué es el recurso en caja arriba; «Respondé “PALABRA”» abajo | Si el fondo no lo muestra, la portada o el recurso en un celular, centrado; 👇👇👇 o flecha de lápiz centrada hacia la barra de respuesta |
| Refuerzo | Foto suya o captura | La prueba arriba; la misma palabra abajo («así no te lo perdés») | El chat o el panel como captura |

### 🟡 Conciencia

| Historia | Fondo | Texto | Extra |
|---|---|---|---|
| Caso | Foto de su espacio, atenuada pareja | Quién es, con el nombre en el color; su frase en caja blanca | El video o la captura del cliente; mención |
| Recorrido o detrás de escena | Blanco o negro | Pasos con 1️⃣ 2️⃣ 3️⃣ o emojis, en resaltado, unidos por flechas de lápiz | Nada |
| Cierre abierto | Foto nítida | Pregunta en caja negra con la palabra en el color | «Respondé…» y 👇 hacia la barra de respuesta |
| Preguntas abiertas | Foto de vida | Invitación corta en caja: «Respondé con tu pregunta» | Flecha de lápiz o 👇 hacia la barra de respuesta |

### ⚪ Libre

Foto o video sin estructura. A lo sumo una línea de texto, en Clásica sin fondo o en caja.

## Revisar la semana

Antes de mostrar, cada historia y la semana entera:

- Todo centrado: cajas, renglones, recursos, flechas y stickers sobre el eje.
- Parece hecha en Instagram: letra del editor, cajas o resaltados, colores de la fila, emojis.
- La cara se ve entera y ninguna caja, captura ni sticker la tapa.
- Renglones parejos, sin palabras sueltas, y el texto se lee (el chequeo del render lo mide).
- Hay un elemento dominante y el resto es poco.
- El gesto apunta al texto o sostiene el recurso.
- Sin stickers interactivos: el pedido va escrito («Respondé…»), así toda la secuencia sale por Postiz.
- En la semana: foto y fondo blanco o negro intercalados, un estilo por día que no se repite en días
  seguidos, la persona en lugares distintos, ninguna foto repetida, ninguna mascota.

## Qué no hacer

- Cualquier elemento descentrado: texto alineado a un costado, una caja corrida hacia un gesto, una
  portada a la izquierda, una flecha o un sticker fuera del eje.
- Fuentes que no son las del editor de Instagram, o rótulos y numeración de marca.
- Degradés o bandas oscuras detrás del texto: se usa una caja, o la foto atenuada pareja.
- Colores fuera de la fila del editor, o un fondo de color sólido.
- Verde sobre fondo blanco, verde en algo que no es positivo ni un recurso, o rojo en algo que no es
  un error.
- Mascotas o personajes de marca como sticker.
- Animar por default: la historia es una imagen fija salvo que el movimiento sea indispensable.
- Íconos de un set en lugar de emojis.
- Tapar la cara o cortar a la persona por el borde.
- Renglones en escalera o una palabra sola en el último renglón.
- Dibujar un sticker de Instagram, o diseñar una historia que lo necesite: el cierre va escrito.
- Poner el mismo recurso en todas las historias de la semana.
