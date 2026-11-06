# Twitter

La sección **Twitter** es donde revisás lo que se escribe para tu cuenta de X y lo agendás. Guardás en X lo que te interesa; Claude Code, con la skill [x-borradores](../.claude/skills/x-borradores/SKILL.md), lo convierte en borradores con tu voz; vos los editás, los aprobás y les elegís horario. Nada se publica sin que pegues el pedido en Claude Code.

## Para empezar

Pedile a Claude Code «configurá Twitter en el planner». Te guía para:

1. crear tu app en [developer.x.com](https://developer.x.com) (el plan de pago por uso alcanza) y escribir sus claves en el `.env` del planner: `X_OAUTH2_CLIENT_ID` (y `X_OAUTH2_CLIENT_SECRET` si la app lo tiene) para leer tus bookmarks, y `X_BEARER_TOKEN` para buscar;
2. autorizar una vez la lectura de tus bookmarks (`python3 engine/x/oauth.py autorizar`). El permiso es de sólo lectura: no puede publicar, dar me gusta, seguir ni mandar mensajes;
3. conectar tu cuenta de X en Postiz para agendar desde acá (`python3 engine/conectar.py` la suma a la config). Opcional: una clave de [Typefully](https://typefully.com) (`TYPEFULLY_API_KEY`) para agendar citas, porque Postiz no cita en X;
4. armar tu guía de voz (`voz.md`), que es lo que más mejora los borradores.

Sin nada de esto, la sección muestra estos pasos.

## Las pestañas

- **Semana.** Los días con tus horarios (`x.horarios` en la config; por defecto 10:00, 14:00 y 19:00). A la izquierda, *Para agendar*: lo aprobado sin horario. Arrastrás un tweet a un horario, entre horarios o de vuelta a la bandeja; *Distribuir* llena los próximos horarios libres en orden de aprobación. *Copiar pedido para Claude Code* arma el mensaje con lo que tiene horario: pegarlo es tu OK para agendar esa tanda.
- **Borradores.** A la izquierda, la lista por estado (Por revisar, Aprobados, Agendados, Publicados, Descartados) y por origen (*Desde cero* o *Sobre un post*); a la derecha, el tweet como sale en X: tu foto y tu nombre, el hilo unido por una línea, la cita adentro si comenta el post de otro y el contador de caracteres como lo cuenta X. El texto se edita ahí mismo y se guarda solo; *Convertir en hilo* le suma partes. *Aprobar* (A) lo pasa a la semana y *Descartar* (X) lo saca; ↑ y ↓ recorren la lista. Abajo, tus notas: escritas (Enter guarda) o grabadas. *Mandar feedback a Claude Code* copia tus notas y lo que cambiaste a mano: Claude Code corrige los tweets y pasa cada corrección de manera de escribir a tu guía de voz.
- **Bookmarks.** Lo que guardaste en X, uno por línea y en el orden en que lo guardaste, como se ve en X: foto, texto, imágenes y video, el post que cita y las métricas. *Me interesa* o *No me interesa*; con *Me interesa* podés dejar qué querés decir de eso. *Copiar pedido para Claude Code* le pasa lo marcado: redacta un tweet por cada uno y los deja en Borradores, sin agendar. Si tenés temas, se filtran por tema (varios a la vez).
- **Búsquedas.** Lo que Claude Code trae cuando le pedís «buscá en X sobre…», con el mismo formato y las mismas marcas que Bookmarks. Arriba elegís qué búsqueda ver.
- **Cuentas.** Tu base de cuentas (`cuentas.json`, con su tipo y por qué está) más las que guardás seguido, con cuántos bookmarks les hiciste, sus me gusta típicos y el último. La ficha muestra lo que les guardaste y pregunta si querés tomar su tono: Claude Code usa esas respuestas para tu voz.

## Dónde queda cada cosa

En la carpeta de X de la cola: `<publicar>/x` (se cambia con `x.carpeta` en `planner.config.json`).

| Archivo | Qué es | Quién lo escribe |
|---|---|---|
| `cuenta.json` | Tu nombre, usuario y foto | `engine/x/bookmarks.py` (si falta, la config o la cuenta de Postiz) |
| `bajadas/` | Cada bajada de bookmarks, tal como vino | `bookmarks.py` |
| `bookmarks.json` | El índice que lee la sección | `engine/x/indice.py` |
| `temas.json` | Tus temas y el tema de cada bookmark | `engine/x/temas.py` |
| `busquedas/<id>.json` | Cada búsqueda | `engine/x/buscar.py` |
| `borradores/<id>.json` | Cada tweet | Claude Code; el planner escribe texto, estado y horario |
| `feedback/<id>/` | Tus notas, con sus audios | El planner; `engine/x/aprender.py` las marca aplicadas |
| `estado.json` | *Me interesa*, *No me interesa* y qué cuentas son tu tono | El planner |
| `cuentas.json` | Tu base de cuentas | Claude Code, con tu OK |
| `voz.md` | Tu guía de voz | Claude Code, con vos |

Un borrador lleva `tipo` (`post`, `hilo` o `sobre`), `partes` (el texto de cada tweet y su media), `fuentes` (los posts de los que sale), `sobre` (el id del post que cita) y su `estado`. El formato completo está en la skill.

## Agendar

`python3 engine/x/agendar.py <ids>` agenda lo aprobado con horario: los posts y los hilos por Postiz, con la cuenta de X conectada; las citas por Typefully, o quedan como un link que abre el compositor de X con el texto y el post citado, para publicarlas a mano. Como la cola de piezas, cada envío se anota antes de mandarlo: si Postiz no responde, el tweet queda `incierto` y no se reenvía solo (`agendar.py reconciliar` lo busca en Postiz). Un horario vencido, un link en el texto o una parte vacía frenan ese tweet.

## Costos

La API de X cobra por uso: bajar bookmarks, unos US$0,001 por post (una bajada de 3 páginas, unos US$0,15; `bookmarks.py` no repite una bajada del mismo día salvo con `--forzar`); una búsqueda, US$0,005 por post (25 posts, US$0,125). Completar usuario, imágenes y citas no cuesta: usa el embed público de X, sin ninguna sesión. Transcribir tus notas de audio con OpenAI (`OPENAI_API_KEY`), unos US$0,006 por minuto. Typefully tiene un plan gratis con un tope de posts por mes.

## API

`GET x`, `POST x/borrador` (`id`, `partes`, `editado`), `POST x/borrador/estado` (`id`, `estado`: `borrador`, `aprobado` o `descartado`), `POST x/borrador/fecha` (`id`, `fecha` o `null`), `POST x/feedback` (`id` de un borrador o de un tweet, `text` o `audio` en base64 con `mime`), `POST x/feedback/remove`, `POST x/feedback/copiar`, `POST x/pedido`, `POST x/bookmark` (`id`, `estado`: `interesa`, `descartado` o `null`) y `POST x/cuenta` (`handle`, `voz`). Ninguna publica ni agenda.
