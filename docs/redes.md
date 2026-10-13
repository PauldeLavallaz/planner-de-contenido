# Redes

Las redes son las que tengas conectadas en Postiz. `python3 engine/conectar.py` las lee y las agrupa: varias cuentas de la misma red (dos Instagram, un LinkedIn personal y una página) quedan como **principal** y **alternativas**. En el detalle de cada pieza elegís desde cuál sale.

Cada red en `planner.config.json → channels.<red>` acepta:

| Campo | Para qué |
|---|---|
| `id`, `type`, `label`, `profile` | Los escribe `conectar.py`. No los edites a mano. |
| `alternativas` | Las otras cuentas de esa red. |
| `marca` | Nombre corto que se muestra en el selector de cuenta. |
| `enabled: false` | Deja la cuenta fuera del planner sin desconectarla de Postiz. |
| `colab_default` | (Instagram) colaboradores que se proponen al publicar desde esa cuenta. |
| `settings` | Ajustes fijos que pide la red (por ejemplo `{"board": "…"}` en Pinterest). |
| `mode` | (TikTok) `direct` o `inbox`. |
| `privacy` | (YouTube) `public`, `unlisted` o `private`. |
| `made_with_ai` | (TikTok) marca el video como hecho con IA. |

## Por red

**Instagram.** Reels, carruseles (hasta 10, se pueden mezclar fotos y videos), imágenes e historias. Por defecto los reels van al feed; el selector *Feed / Trial* del detalle los manda como reel de prueba (lo ven primero quienes no te siguen). Un reel de prueba no admite colaboradores. Los colaboradores reciben una invitación que aceptan desde su app; las opciones se cargan en `instagram.collaborator_options`. La portada de un reel es su primer cuadro: con `--portada <segundos>` (o `## Portada` en el `publish_kit.md`) el cuadro elegido pasa a ser el primero de la copia que se sube (necesita ffmpeg).

**TikTok.** Con `mode: "direct"` publica directo. Con `mode: "inbox"`, el video llega como borrador a la app de TikTok y lo terminás desde el teléfono: sólo se conserva el título, el resto de los ajustes se ignora, y el borrador vence a las 24 horas. En inbox el envío sale 15 minutos antes del horario (`tiktok_inbox_lead_minutes`). Carruseles de fotos, hasta 35.

**YouTube.** Sólo video. Título desde `captions.youtube_title` (o el título de la pieza, hasta 100 caracteres), descripción desde `captions.youtube_description` o el texto general. `youtube.tags` agrega etiquetas a todo; la portada elegida se sube como miniatura.

**LinkedIn.** Video, imagen y carrusel (se publica como documento de imágenes). Texto desde `captions.linkedin` o `## LinkedIn` en el `publish_kit.md`.

**Facebook, X, Threads, Bluesky, Mastodon.** Video, imagen y carruseles (X y Bluesky hasta 4 imágenes).

**Pinterest y otras.** Si la red pide un dato obligatorio, `conectar.py --verificar` lo avisa y el motor no envía nada hasta que lo cargues en `channels.<red>.settings`.

## Textos

El texto general va a todas las redes. Para cambiarlo en una sola, agregá en la ficha de la cola (`publicar/inbox/<slug>.json → captions`) una clave con el nombre de la red: `instagram`, `tiktok`, `linkedin`, `x`… Si cada red tiene un límite de caracteres, el motor lo controla antes de enviar.

`captions.block_links: true` hace que el motor frene textos con links (Instagram y TikTok no los vuelven clickeables).

## Límites de Postiz

Postiz limita cuántos posts se crean por hora. Una pieza en tres redes son unas cinco llamadas (subida del archivo y un post por red). Si aparece `POSTIZ_RATE_LIMITED`, hay que esperar.
