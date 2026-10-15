# Recursos visuales

Las piezas que se repiten en las historias que mejor funcionan y cómo se arman con el motor.

Los que traen markup listo están en [motor-historias/recursos.html](../../../../motor-historias/recursos.html): bloques
sueltos, con el estilo adentro y sin imágenes ni scripts, que se copian a la historia y se centran
(`left = (1080 − ancho) / 2`). El editor del planner los ofrece en **Agregar → Recursos** (chat de WhatsApp, archivo)
y, con una captura elegida, el botón **Tapar**.

| Recurso | Para qué | Dónde va | Markup |
|---|---|---|---|
| **Chat de WhatsApp** | La reacción de alguien o una conversación | R4 (la reacción), R3, C1, venta | `data-recurso="chat"` |
| **Archivo del recurso** | Que se vea que el recurso existe, sin abrirlo | R4, R2, R3, el pedido | `data-recurso="archivo"` |
| **Recurso tapado** | La captura del recurso borrosa, con un candado | R4 | `data-recurso="tapado"` o Tapar en el editor |
| **Captura con círculo o subrayado** | Marcar el número o la frase que importa | C1, R3, venta | `.captura` + `svg.lapiz` (círculo de lápiz) |
| **Celular o compu con el recurso** | El recurso por dentro, en su pantalla | recurso, el pedido | una foto real del celular o la compu con el recurso abierto, o una `.captura` alta de la pantalla |
| **Flecha a la siguiente** | Llevar a la próxima historia desde el gancho | gancho de curiosidad | `svg.lapiz` horizontal hacia la derecha |
| **Perfil con foco** | Señalar una destacada o el link del perfil | cierre, «muchos más acá» | captura del perfil + `.atenuado` blanco y la parte nítida encima |
| **Para quién es / no es** | Ordenar la oferta por perfiles | venta, V3 | caja negra con la palabra en color + etiquetas sueltas en `.caja blanca` |
| **Pasos con captura** | El proceso en 2 a 4 pasos | R2, C3, venta | cada paso: etiqueta numerada + `.captura` + caja negra corta |
| **Comparación de valor** | «Esto es Netflix» → «Esta es mi clase» | R4 | dos historias seguidas, cada una con su captura |

## Reglas

- **El chat es real o es una broma que se nota.** Recrea una conversación real (las mismas palabras, con permiso de
  quien escribió) o una escena en broma que se lee como broma. Nunca una reacción de un cliente inventada presentada
  como real: sería un testimonio falso. El nombre del contacto, sólo el de pila o el que la persona aceptó.
- **El recurso tapado tiene que existir.** Se tapa algo que se va a mandar; nada de capturas de relleno.
- **La palanca es real.** El costo, el cupo o la fecha que se muestran son ciertos. La escasez, sólo si es real (ver
  [ganchos.md](ganchos.md)).
- **Todo centrado** como cualquier elemento: el chat y el archivo se centran como bloque; adentro, las burbujas van a
  izquierda y derecha como en la app.
- El chat y el archivo llevan `data-sin-chequeo` (su texto tiene fondo propio y no se mide contra la foto) y `data-caja`
  (se mide que no tapen una cara).

## Chat de WhatsApp

Burbuja blanca a la izquierda: lo que llega. Verde a la derecha: lo que mandó la persona de la cuenta. La hora y los
✓✓ azules al final de cada burbuja. El encabezado lleva el nombre de pila y «en línea». Encima, en caja negra, «Esta
fue su respuesta:» o «Me escribió [nombre]:». Para escribir las reacciones, ver «Reacciones» en
[ganchos.md](ganchos.md).

En el editor del planner, doble clic sobre el chat corrige sus textos, y el chat se mueve como un solo bloque: para
tocar una burbuja suelta, se desagrupa (ver [«El editor» de docs/historias.md](../../../../docs/historias.md#el-editor)).

## Archivo del recurso

La tarjeta blanca de un archivo compartido: el ícono a la izquierda (≡ documento, 📁 carpeta, ▶ video) y el nombre con
«Documento · te llega por DM». Suele ir debajo del pedido o tapando a medias la foto.

## Recurso tapado

Una captura del recurso borrosa, con un candado encima: se ve que existe y no se lee qué es. En el editor, con
**Tapar** sobre la captura ([«El editor»](../../../../docs/historias.md#el-editor)). A mano, `filter: blur(14px)` en la
imagen y el candado como último hijo de la `.captura`, como en el bloque de `recursos.html`.
