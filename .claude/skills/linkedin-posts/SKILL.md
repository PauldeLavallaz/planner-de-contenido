---
name: linkedin-posts
description: Escribí los posts de LinkedIn del usuario para su perfil, cada uno con su imagen, y dejalos en la pestaña LinkedIn → Posts del planner para que los revise, apruebe y programe. También aplica el feedback que deja ahí (escrito o en audio) y arma el research de lo viral de su nicho para la pestaña Referencias. No publica ni agenda.
---

# LinkedIn: los posts del perfil

Un post por día hábil desde el perfil del usuario. Quien lo lee tiene que pensar «esto me pasa a mí» y ver al usuario resolverlo. Todo vive en `<publicar>/linkedin/` (o `linkedin.carpeta` de `planner.config.json`); el planner lo muestra en **LinkedIn → Posts**.

## Invariantes

- **No publica ni agenda.** Aprobar en el planner no agenda. Programar lo hace el usuario en LinkedIn → Posts → «Para programar», con día y hora: ese clic es su OK para esa publicación y llama a `engine/linkedin/agendar.py`, que la pasa por la cola (`cola.py listo` y `agendar`, con el intento guardado antes de enviarlo). Nunca programes por tu cuenta.
- **Sin links en el texto** y sin hashtags. El pedido, si hay, es «el link de mi perfil».
- **Números reales o nada.** Horas, plata, clientes, días: registrados. Nunca inventes una anécdota, una duda ni un error para que suene humano. Un caso de cliente necesita su permiso; sin permiso, sin nombre.
- **Nunca el problema de una empresa en público**, ni de un prospecto: eso va por privado.

## Antes de escribir

1. Leé la [guía](references/guia.md) y la voz del usuario: sus posts anteriores (los `borradores/` con `historial` y `motivo` dicen qué editó o descartó) y lo que él te cuente. Lo que corrigió en un post corrige la guía, no sólo ese post.
2. Si no hay research en `referencias.json`, ofrecé armarlo (ver [Research](#research-de-lo-viral)).
3. Elegí el tema de cada día con el reparto de la semana de la guía. Cada post tiene algo que le pasó al usuario: sin hecho, no hay post. Mirá también qué sale esos días en otras redes (la Semana del planner): un post no puede contradecir otra pieza.

## Escribir

Uno por día hábil de la semana, lunes a viernes, con `fecha` = el día propuesto. Menos y bueno antes que llenar.

`borradores/<AAAAMMDD>-<slug>.json`:

```json
{
  "creado": "2026-11-01T22:00:00Z",
  "fecha": "2026-11-03",
  "tipo_gancho": "bitacora",
  "tema": "Lo que armé esta semana",
  "texto": "…",
  "imagen": null,
  "mencion_pagina": true,
  "por_que": "De dónde sale el dato y qué tiene que revisar el usuario",
  "referencia": { "autor": "Alguien del research", "url": "https://www.linkedin.com/posts/…" },
  "estado": "borrador"
}
```

- `tipo_gancho`: `bitacora`, `novedad_probada`, `recurso`, `historia` o `sentencia_con_caso` (los de la guía).
- `texto`: hasta 3.000 caracteres. Lo que importa entra en los primeros 210, que es lo que se lee antes del «ver más».
- `mencion_pagina`: si el post nombra a la página de la empresa (`linkedin.cuenta.pagina` en la config). `false` para no mostrarlo.
- `referencia`: el post del research que inspira la forma, nunca de la propia marca. `por_que`: de dónde sale cada dato.
- El planner escribe `estado` (`borrador`, `aprobado`, `descartado`), `editado`, `editado_por`, `aprobado` e `historial`. Al programar, `agendar.py` escribe `estado: agendado`, `programado`, `cola_slug` y los IDs de Postiz. `posts.py estado` lo pasa a `publicado` con su `url`, y `posts.py metricas` suma `metricas` (`reacciones`, `comentarios`).

## La imagen

Se hace junto con el borrador, para que el usuario revise el post entero. Es una lámina 1080×1350 en código:

1. El cuerpo en `imagenes/src/<id>.html`: `<h1>` con la palabra clave en `<em>` (cortes con `<br>`), `<ol>` con una fila por `<li>` (`<i>01</i><b>qué</b><span>detalle</span>`, o `<span class="barra" style="--v:53%">` para una cantidad sobre un total; `class="clave"` en la fila más importante; `<s>` para lo negativo) y `<div class="pie"><span>…</span></div>`.
2. `python3 engine/linkedin/lamina.py <id> imagenes/src/<id>.html [--figura recorte.png] [--fondo foto.jpg]` deja `imagenes/<id>.png` y la ruta en el borrador. Avisa si una fila no entra en una línea.
3. Los colores y las fuentes de la marca van en un CSS propio (`linkedin.lamina.css` en la config) y el logo en `linkedin.lamina.logo`. La plantilla neutra es [lamina.css](lamina.css).
4. La lista dice lo útil del post por sí sola: de cuatro a seis filas de una línea, datos del texto y nada inventado. Mirá la imagen antes de darla por buena.

Una figura (una foto recortada del usuario, un personaje o un objeto, PNG con transparencia) es opcional. Si la generás con una API paga, decí antes con qué y cuánto sale.

## Aplicar el feedback

El usuario deja notas escritas o en audio sobre cada post en LinkedIn → Posts, y «Mandar a Claude» copia el pedido. La nota es también el OK para corregir. No cambia lo que se publique: no programes nada.

1. `python3 engine/linkedin/posts.py pendientes` transcribe los audios (OpenAI whisper-1 con `OPENAI_API_KEY`, centavos) y junta las notas y las ediciones a mano.
2. Corregí el post. Texto: en el `texto` del borrador, sumando al `historial` lo anterior con `por: "Claude"`. Imagen: el cuerpo en `imagenes/src/<id>.html` y volvé a correr `lamina.py`. El planner muestra la nueva solo. Un post agendado no se toca: avisá.
3. Lo que enseñe más allá de ese post va a la [guía](references/guia.md) con su cita y fecha.
4. `python3 engine/linkedin/posts.py aplicada <id> <archivo> --cambio "qué cambió"` y, si hubo edición a mano, `posts.py aprendido <id>`.

## Después de publicar

- `python3 engine/linkedin/posts.py estado` reconcilia la cola con Postiz y pasa a «Publicados» lo que ya salió, con su link.
- `python3 engine/linkedin/posts.py metricas` mide reacciones y comentarios a las 72 horas con ScrapeCreators (`SCRAPECREATORS_API_KEY`, un crédito por post), sin la cuenta del usuario. Se ven en LinkedIn → Métricas.

## Research de lo viral

Para la pestaña Referencias: los posts que mejor funcionan en el nicho del usuario, para copiar la forma y el tono, nunca el texto. Buscá cuentas del nicho (las que el usuario nombre, o por búsqueda web), bajá sus últimos posts por fuentes públicas, sin la cuenta del usuario (ScrapeCreators tiene endpoints de perfil y de post de LinkedIn que leen lo que se ve sin login: reacciones y comentarios, sin impresiones) y dejalos en `referencias.json`:

```json
{
  "actualizado": "2026-11-01",
  "fuente": "research/linkedin-nicho-20261101/informe.md",
  "notas": "Sin login se ven pocos posts por perfil y sólo reacciones y comentarios.",
  "posts": [
    { "id": "1", "autor": "Nombre", "seguidores_cuenta": 12000, "idioma": "es", "gancho_parafraseado": "De qué va, con otras palabras",
      "tipo_gancho": "bitacora", "tema": "…", "reacciones": 840, "comentarios": 61, "formato": "texto + imagen", "largo_caracteres": 1200,
      "fecha": "2026-10-20", "url": "https://www.linkedin.com/posts/…" }
  ]
}
```

Los ganchos van contados con otras palabras. Lo que saques del research (qué tipo de post rinde, qué largo, cómo arrancan) va a la guía como indicio, y se corrige con lo que rindan los posts propios contra su propia mediana. Antes de gastar en ScrapeCreators, decí cuántos perfiles y cuánto sale.
