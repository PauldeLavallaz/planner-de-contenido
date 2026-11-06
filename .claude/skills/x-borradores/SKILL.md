---
name: x-borradores
description: Twitter (X) en el planner. Configura la lectura de tus bookmarks, los baja, busca en X, convierte lo guardado o lo marcado «Me interesa» en borradores de posts, hilos y citas con tu voz, aprende de tus correcciones y agenda lo aprobado cuando pegás el pedido. Aplica a «configurá Twitter», «bajá mis bookmarks», «armá borradores de Twitter», «buscá en X sobre…», los pedidos que copia la sección Twitter y «armá mi base de cuentas de X».
---

# X-BORRADORES: bookmarks → borradores con tu voz → semana

El usuario guarda en X lo que le interesa. Esta skill trae lo nuevo, elige qué da para un post y lo escribe con su voz. Los borradores se ven, se editan, se aprueban y se ubican en la semana en la sección **Twitter** del planner ([docs/twitter.md](../../../docs/twitter.md)). Los scripts están en `engine/x/` (corrélos desde la carpeta del planner; en Windows con `python`).

## Invariantes

- **Cuenta segura:** todo por la API oficial de X con las credenciales del usuario: un token de sólo lectura para sus bookmarks (OAuth 2.0) y el Bearer Token de su app para buscar. Nunca un navegador con su sesión, ni respuestas, me gusta, follows o mensajes automáticos.
- **No publica ni agenda por su cuenta.** Aprobar en el planner lo manda a la semana; el usuario le elige horario y «Copiar pedido para Claude Code» arma el mensaje. Pegarlo es su OK para esa tanda: recién ahí corrés `agendar.py` con esos ids.
- **Lo de otro se cita, nunca con una foto.** Un comentario sobre un post ajeno es `tipo: sobre` y sale citándolo. Postiz no cita en X, así que `agendar.py` lo manda por Typefully (`TYPEFULLY_API_KEY`); sin esa clave deja el link que abre el compositor de X con el texto y el post citado, para publicarlo a mano. Sin «Vía @autor» ni capturas de tweets ajenos.
- **Sin links en el texto.** El post citado va en `sobre`, no en `partes[].texto`; Postiz borra los links en X y `agendar.py` los frena.
- **Credenciales:** las escribe el usuario en el `.env` del planner. Nunca le pidas que pegue una clave en el chat; la de Typefully se guarda con `pbpaste | python3 engine/x/agendar.py --guardar-clave` (o el equivalente en Windows), que corre él.
- **Gasto:** la API de X cobra por uso. Bajar bookmarks, unos US$0,001 por post (una bajada diaria de 3 páginas, unos US$0,15). Una búsqueda, US$0,005 por post (25 posts, US$0,125). Transcribir un audio con OpenAI, unos US$0,006 por minuto. Avisá el costo antes de una corrida grande; los scripts lo imprimen.

## Configurar (la primera vez)

1. **App de X.** En [developer.x.com](https://developer.x.com), el usuario crea un proyecto y una app (el plan de pago por uso alcanza). En la app:
   - *User authentication settings*: OAuth 2.0, tipo «Native App» (o «Web App», que da además un Client Secret), permisos de lectura, y como **Callback URI** `http://127.0.0.1:8735/callback`.
   - Copia el **Client ID** (y el Client Secret si lo hay) y el **Bearer Token**.
2. **`.env` del planner**, escrito por el usuario: `X_OAUTH2_CLIENT_ID=…`, `X_OAUTH2_CLIENT_SECRET=…` (si lo tiene), `X_BEARER_TOKEN=…`. Si usa otra Callback URI, también `X_OAUTH2_REDIRECT_URI=…`.
3. **Autorizar la lectura de sus bookmarks:** `python3 engine/x/oauth.py autorizar`. Imprime un link: el usuario lo abre, autoriza y vuelve. Los tokens quedan en el `.env` y se renuevan solos. `oauth.py estado` dice qué está configurado, sin mostrar nada secreto.
4. **Para agendar:** la cuenta de X conectada en Postiz (`python3 engine/conectar.py` la suma a `channels.x`). Para las citas, opcional, Typefully con su clave.
5. **Horarios** de la semana de Twitter: `x.horarios` en `planner.config.json` (por defecto 10:00, 14:00 y 19:00, en la zona de la config).
6. **Voz:** la primera corrida crea `voz.md` en la carpeta de X desde [references/voz-plantilla.md](references/voz-plantilla.md). Completalo con el usuario: leé sus últimos tweets si te los pasa, preguntale qué cuentas quiere tomar de referencia y armá la guía. Es lo que más mejora los borradores.

## Archivos

Todo en la carpeta de X de la cola (`<publicar>/x`, se cambia con `x.carpeta`):

| Qué | Dónde |
|---|---|
| Bajar bookmarks y armar el índice | `python3 engine/x/bookmarks.py [--horas 168] [--paginas 3]` → `bajadas/` y `bookmarks.json` |
| Rehacer el índice sin bajar nada | `python3 engine/x/indice.py` |
| Temas de los bookmarks | `python3 engine/x/temas.py pendientes` / `asignar` → `temas.json` |
| Buscar en X | `python3 engine/x/buscar.py "<consulta>" --titulo "…"` → `busquedas/<id>.json` |
| Lo que decide el usuario en el planner | `estado.json` (`bookmarks`: `interesa` o `descartado`; `cuentas`: su tono) |
| Borradores | `borradores/<AAAAMMDD>-<slug>.json` |
| Notas de feedback | `feedback/<id>/` (por borrador o por id de tweet marcado) |
| Aprender y lo marcado | `python3 engine/x/aprender.py pendientes` / `marcados` / `aplicada` / `aprendido` |
| Agendar, con el OK pegado | `python3 engine/x/agendar.py <id>… [--prueba]` |
| Base de cuentas | `cuentas.json` |
| Voz | `voz.md` |

## Corrida de borradores

Cuando el usuario pide «armá borradores de Twitter» (o lo programa para todos los días):

1. **Aprender primero** (ver abajo), si hay correcciones pendientes.
2. Bajá lo nuevo: `bookmarks.py` (no repite si ya corrió hoy; es pago). Si hay bookmarks sin tema y el usuario armó temas, `temas.py pendientes`, clasificalos y `temas.py asignar`.
3. Leé el índice: primero lo marcado «Me interesa» sin borrador (`aprender.py marcados`), después los bookmarks sin usar (que no estén en las `fuentes` de ningún borrador ni descartados en `estado.json`). Agrupá por tema, no por autor.
4. Elegí qué da para un post: ¿el usuario puede decir algo propio sobre eso hoy, desde lo que hace? Lo que no lo toca (polémica ajena, noticias sin relación con su tema) queda afuera salvo que lo haya guardado varias veces.
5. Escribí con su `voz.md`. Cada borrador dice qué es en una línea y después qué cambia para él o su audiencia, con un dato real cuando lo hay. Nunca inventes una experiencia: si no lo probó, se dice «lo voy a probar» o se opina sin fingir.
6. **Tipos:** `sobre` para comentar el post de otro (el default para un bookmark: sale como cita, que ya muestra de quién es); `post` para una lectura propia desde cero; `hilo` para un cómo lo hice o un tema con varios bookmarks. En el planner, «Desde cero / Sobre un post» separa los dos mundos.
7. Una cantidad que el usuario pueda revisar (por defecto, no más que sus horarios de un día). Lo flojo no se completa.
8. Cerrá con la lista de lo escrito: lo ve en Twitter → Borradores.

## Buscar en X

Cuando pide «buscá en X sobre…», corré `buscar.py`, siempre: lo que trae queda en **Twitter → Búsquedas**, con el mismo formato que Bookmarks. No lo vuelques sólo en el chat.

1. Armá la consulta con operadores de X y un `--titulo` en palabras del usuario (es lo que ve en el desplegable). Los retweets y las respuestas se excluyen solos; sumá `lang:es` si quiere lo de su idioma.
2. Por defecto trae 25 posts de los últimos 7 días, los más relevantes. `--reciente` los ordena por fecha, `--todo` busca en todo el historial (si su acceso lo permite) y `--max` llega hasta 100.
3. Decile qué trajo y dónde verlo. No escribas borradores hasta que marque lo que le interesa y pegue el pedido. Si X responde 402, es saldo agotado, no un tema sin resultados.

## Reaccionar a lo marcado

En Bookmarks y Búsquedas el usuario marca «Me interesa» o «No me interesa», puede dejar una nota escrita o grabada con lo que quiere decir, y «Copiar pedido para Claude Code» arma el mensaje con los ids. Marcar es elegir el tema: el pedido autoriza a redactar, no a agendar.

Corré `aprender.py marcados` (con `--texto-entero` si hay artículos o tweets largos cortados: los baja enteros por la API, US$0,005 por post). Por cada id del pedido:

1. Leé el post entero, con su cita y su media. Un artículo se lee completo antes de opinar. Si ya está en las `fuentes` de un borrador, no lo dupliques: avisá.
2. **Si hay nota, el tweet dice eso**, con su voz, sin cambiarle la postura. Sin nota, elegí vos el ángulo.
3. Tono: su `voz.md`. En una cita, probá primero la versión de una línea.
4. Escribí un borrador `tipo: sobre` por post, con `sobre`, las `fuentes` copiadas del índice y `estado: borrador`.
5. Marcá cada nota usada con `aprender.py aplicada <id del tweet> <archivo> --cambio "qué se escribió"`. No agendes.

## Aprender de cada corrección

Va **antes** de escribir borradores nuevos y cada vez que el usuario pega «Mandar feedback a Claude Code».

1. `aprender.py pendientes`: trae lo que cambió a mano (texto actual contra `texto_original`) y sus notas escritas o grabadas de cada tweet. Los audios se transcriben con `OPENAI_API_KEY`; si no está, escuchalos de otra forma o pedile que te cuente.
2. **Aplicar cada nota a su tweet.** Si ya está agendado, no se toca y se avisa. Marcá la nota con `aprender.py aplicada <id> <archivo> --cambio "qué cambió"`: el planner muestra ese cambio debajo de la nota.
3. **Sacar la regla general** de cada corrección de manera de escribir (palabras, puntuación, tono, largo, estructura) y sumarla a su `voz.md`, en «Correcciones», con la fecha y lo que dijo o cambió. Si contradice una regla anterior, reemplazala. Si sirve para los borradores abiertos, aplicala ahí también (nunca a uno agendado).
4. `aprender.py aprendido <id> …` para las ediciones a mano ya pasadas a la guía.

Una corrección de un dato puntual se aplica al tweet y no pasa a la guía.

## Agendar (con el pedido pegado)

El mensaje empieza con `[Agenda] Agendar …` y trae los ids. Pegarlo es el OK del usuario para esa tanda.

1. `python3 engine/x/agendar.py <ids> --prueba` muestra lo que se mandaría.
2. `python3 engine/x/agendar.py <ids>`. Posts e hilos van por Postiz con la cuenta de X conectada; las citas, por Typefully (o quedan como link para publicar a mano). Cada envío se anota en el borrador antes de mandarlo.
3. Contá el resultado tal cual: qué quedó agendado y cuándo, qué quedó a mano (con su link) y cualquier error. Un horario vencido o un link en el texto frenan ese tweet: el usuario elige otro horario o lo corrige.
4. Si un envío quedó `incierto` (Postiz no respondió), **no lo reenvíes**: `agendar.py reconciliar` lo busca en Postiz. Si no aparece, queda listo para volver a agendar. Para Typefully, revisá sus borradores ahí y, si no llegó, `agendar.py liberar <id>`.

Mover o sacar un tweet ya agendado se hace en Postiz (o Typefully) con el OK del usuario para ese cambio; después, corregí `estado` y `fecha` del borrador para que el planner lo muestre bien.

## Base de cuentas

`cuentas.json` es la lista de cuentas que el usuario sigue de cerca, con su tipo y por qué está:

```json
{
  "tipos": [{ "id": "voz", "nombre": "Tono" }, { "id": "metodo", "nombre": "Método" }, { "id": "criterio", "nombre": "Criterio" }, { "id": "lanzamiento", "nombre": "Lanzamientos" }],
  "cuentas": [{ "handle": "alguien", "tipo": "metodo", "why": "Muestra el paso a paso de lo que prueba.", "origen": "bookmarks" }]
}
```

Para armarla («armá mi base de cuentas de X»), mirá a quién guarda más en `bookmarks.json`, proponé tipo y motivo, y escribila con su OK. Las que guarda tres veces o más aparecen igual en Cuentas, sin tipo. En la ficha de cada cuenta el usuario dice si quiere tomar su tono (`estado.json → cuentas`): usá las confirmadas como referencia en `voz.md`.

## Formato del borrador

```json
{
  "creado": "2026-11-01T12:00:00Z",
  "tipo": "sobre",
  "tema": "Un modelo nuevo baja el precio por segundo de video",
  "por_que": "Lo guardaste tres veces esta semana y toca lo que hacés.",
  "sobre": "1900000000000000001",
  "fuentes": [{ "id": "1900000000000000001", "autor": { "handle": "alguien", "nombre": "Alguien" }, "texto": "…", "fecha": "…", "metricas": { "likes": 248 }, "media": [], "url": "https://x.com/alguien/status/1900000000000000001" }],
  "partes": [{ "texto": "…", "media": [] }],
  "estado": "borrador"
}
```

- `fuentes` copia el post tal como está en el índice o en la búsqueda: el planner lo muestra y lo marca «En borrador».
- `media` de una parte son rutas de la carpeta de contenido, para imágenes o videos propios. La media de otro no se re-sube ni se fotografía: se cita.
- El planner escribe `estado` (`borrador`, `aprobado`, `descartado`), `editado`, `editado_por`, `texto_original` (lo que escribiste vos, en la primera edición del usuario), `aprobado`, `fecha` (el horario propuesto, `AAAA-MM-DDTHH:MM` en la zona de la config) y `historial`. `aprender.py` pone `aprendido_en`; `agendar.py`, `envio`, `estado: agendado`, `agendado_para` y los ids de Postiz o Typefully.
- Un borrador descartado o editado es señal: antes de escribir los nuevos, leé los últimos `historial` y `motivo` y corregí `voz.md`, no sólo el borrador.
