# Los cuatro estilos

Amarillo, Rojo, Verde y Naranja. Los cuatro son el estilo nativo de Instagram de [diseno.md](diseno.md) con un color de
la fila y sus combinaciones. Cada día de la semana usa uno; se alternan y no se repite el mismo en días seguidos. Son
opciones, no una obligación: una marca puede fijar uno solo (ver «Una marca puede fijar su paleta», al final).

## El color dice algo

Cada color tiene un sentido, y se respeta aunque el estilo del día sea otro:

- **Verde:** algo positivo o un recurso que se da: un resultado, un beneficio, el recurso y su
  palabra («2000 seguidores», «te salva el día», «IDEAS»).
- **Rojo:** errores, problemas, lo que sale mal o cuesta caro («una tarde», «no sale nada»).
- **Amarillo y naranja:** neutros, el énfasis de todo lo demás.
- **Nunca verde sobre fondo blanco.** Un día Verde con historia lisa va sobre fondo negro.

El estilo del día sale del tono del día: un día que regala un recurso o muestra resultados puede ser
Verde; uno que habla de errores, Rojo; el resto, Amarillo o Naranja. Dentro de un día neutro, la
palabra de un resultado positivo puede ir en verde y la de un error en rojo, aunque el estilo sea
otro; una frase que nombra un problema no va en verde aunque el día sea Verde (va en caja blanca o
negra).

En el HTML, la clase del estilo va en `.historia` y fija el color y la letra que va sobre él:
`class="historia estilo-amarillo"` (o `estilo-rojo`, `estilo-verde`, `estilo-naranja`). Fondo blanco:
`class="historia lisa estilo-…"`; negro: `class="historia lisa negra estilo-…"`. Las opciones están comentadas en
`motor-historias/plantilla.html`.

Lo que vale para los cuatro: **todo centrado** (regla dura, ver [diseno.md](diseno.md)); el
**remate** de un gancho o un cierre sobre foto en caja del color con la **Clásica en negrita**, a un
tamaño parecido al de la caja de arriba, abrazando el texto, y **un emoji al final** que acompañe el
gesto o la idea («esto es para vos 🫵», «listo para usar 👍», «Inspírense 💡»): sin el emoji, o con otra letra y
otro tamaño, el remate queda raro. La serif de las cajas para casi todo, la Clásica para pasos y etiquetas, emojis
grandes en lugar de íconos, flechas de lápiz para unir dos cosas o señalar la barra de respuesta, fotos reales o fondo
blanco o negro, overlay negro de opacidad baja cuando el texto va sin caja sobre la foto. Sin mascota ni personajes de
marca, sin fondos de color sólido.

## Amarillo

Color `--ig-amarillo`, letra negra sobre amarillo. Neutro.

- **Sobre foto:** la frase en caja negra con letra blanca arriba; el remate en caja amarilla con la
  Clásica en negrita y un emoji, centrado abajo («esto es para vos 🫵» sobre la campera, con el dedo
  que señala a cámara).
- **Cifra:** en caja amarilla con la Clásica en negrita y letra negra («+5.000»), y la frase
  completa debajo en caja negra con la parte que importa en amarillo.
- **Fondo blanco:** la idea en serif negra con la parte clave en resaltado amarillo; pasos con emojis
  grandes en fila unidos por flechas de lápiz negras; el cierre en caja negra con la parte que importa
  en amarillo.
- **Pedido:** la foto de un lugar suyo (el living) con overlay negro de opacidad baja, el texto blanco
  sin caja, «Respondé» y la palabra enorme en amarillo, y una flecha de lápiz blanca centrada hacia la
  barra de respuesta.

## Rojo

Color `--ig-rojo`, letra blanca sobre rojo. Para días que hablan de errores o de lo que cuesta caro.

- **Sobre foto clara:** la pregunta en caja blanca con letra negra y la palabra clave en rojo, centrada
  arriba (la persona la señala); abajo, centrado, «Respondé…» con las opciones como ejemplos.
- **Fondo blanco:** un emoji grande arriba (⏳), la frase en caja negra con la palabra clave en rojo, la
  cifra enorme en resaltado rojo con letra blanca («4 dólares») y el cierre en caja negra.
- **Pedido con recurso:** la foto de un lugar suyo con overlay negro; la explicación en caja negra
  arriba, el recurso en un celular al centro (la captura real) y «Respondé “PALABRA”» en caja negra con
  la palabra en rojo, «y te lo paso.» y una flecha de lápiz centrada hacia la barra de respuesta.

## Verde

Color `--ig-verde`, letra negra sobre verde. Para días que dan un recurso o muestran resultados. Nunca
sobre fondo blanco.

- **Sobre foto:** la frase en caja negra con la palabra clave en verde y, debajo, el remate en caja
  verde con la Clásica y un emoji, los dos centrados arriba («Y me llegó así, / listo para usar 👍»).
- **Fondo negro:** la regla o la idea en serif blanca con la parte clave en resaltado verde; una
  grilla o una lista de emojis, con círculos de lápiz verdes sobre lo elegido; el cierre en serif
  blanca con las cifras en verde.

## Naranja

Color `--ig-naranja`, letra negra sobre naranja; «naranja y negro». Neutro.

- **Sobre foto:** la frase en caja negra con las palabras clave en naranja y, debajo, el remate en caja
  naranja con la Clásica y un emoji («Inspírense 💡», «que no sabés de qué hablar 😶»). Simple: dos
  cajas y la foto.
- **Fondo negro:** una frase en serif blanca y una lista de temas en resaltados blancos con la
  Clásica, cada uno con su emoji adelante, uno en naranja («Pueden preguntarme sobre: 🎙️ cómo grabo…»).

## Una marca puede fijar su paleta

Si la marca tiene su propia guía de estilo, manda esa guía, también sobre la alternancia. Un ejemplo de cómo una cuenta
fija su paleta: negro, amarillo y blanco todos los días, siempre en **Amarillo** (cajas negras con letra blanca, cajas
blancas con letra negra, fondo negro o blanco, y el amarillo para el énfasis, la cifra, el remate y la palabra del
pedido). No hay alternancia de color entre días: la variedad sale de las fotos, el fondo y la composición. Los otros
colores quedan con un solo uso:

- **Rojo, sólo en las flechas** de lápiz (la que lleva a la historia siguiente, la que señala la barra de respuesta, la
  que une dos pasos). Nunca en texto, cajas ni resaltados.
- **Verde, sólo para resaltar un beneficio:** lo que gana quien mira o el resultado positivo («te ahorrás una tarde»,
  «más de 1.000 videos»), en una palabra o una frase corta, nunca sobre fondo blanco. No es el color del día ni pinta el
  pedido.
- Naranja, guardado: no se usa salvo que la marca lo pida.

Una restricción así se decide una vez y vale para todas las semanas de esa cuenta. Sin restricción, se usan los cuatro
estilos como dice este archivo.
