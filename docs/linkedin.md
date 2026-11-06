# LinkedIn

La sección **LinkedIn** junta lo que se publica en tu perfil y la búsqueda activa de quien necesita lo que vendés. Tiene cinco pestañas: Prospectos, Videos, Posts, Métricas y Referencias. Nada se envía a nadie desde el planner: invitar, comentar y mandar mensajes lo hacés vos desde tu cuenta, con los textos que copiás de acá.

Todo vive en `<publicar>/linkedin/` (se cambia con `linkedin.carpeta` en `planner.config.json`):

```
linkedin/
  prospectos.json       lo que arma la búsqueda (engine/linkedin/prospectos.py)
  busquedas.json        qué buscar: copiá el ejemplo de la skill linkedin-prospectos
  contactos.json        los contactos para video a medida (engine/linkedin/videos.py contactos agregar)
  estado.json           lo que decidís en el planner: cada prospecto y cada video
  borradores/<id>.json  un post por archivo
  imagenes/<id>.png     la imagen de cada post (imagenes/src/<id>.html es su cuerpo)
  feedback/<id>/        tus notas y audios sobre cada post
  referencias.json      el research de lo viral en tu nicho
  busquedas/<fecha>/    lo bajado en cada búsqueda, para no pagar dos veces
  logs/gastos.ndjson    lo gastado en APIs pagas
```

## Prospectos

Personas y empresas que hoy buscan quién les haga lo que vendés. Arriba, la señal: **Piden IA** (posteos de gente que pide ayuda con contenido o marketing con IA), **Piden agencia**, **Contratan** (empresas que publicaron que buscan a alguien para sus redes) y **Avisos laborales**. Después, el estado (Nuevos, Para contactar, Contactados, Respondieron, Agendaron, Descartados) y los filtros de categoría y país.

La ficha de cada uno dice por qué califica, lo que pidió (el posteo entero o sus avisos), su Instagram (cuántos días lleva sin publicar, si la búsqueda lo encontró) y los textos del primer contacto, cada uno con su botón de copiar. Con el teclado: ↑↓ para moverte, **A** lo pasa a «Para contactar» y **X** lo descarta.

La búsqueda corre a pedido: pedile a Claude Code «buscá prospectos en LinkedIn» (skill `linkedin-prospectos`) o corré `python3 engine/linkedin/prospectos.py`. Usa fuentes públicas y nunca tu cuenta. Las claves (`APIFY_API_TOKEN`, `GEMINI_API_KEY` y, opcionales, `SERPAPI_KEY` y `SCRAPECREATORS_API_KEY`) y lo que sale cada una están en la skill.

## Videos

Un video corto a medida para cada contacto: sobre su marca y su negocio, con tu avatar y tu voz. Entran los prospectos que pasás a «Para contactar» y los contactos que sumes con `engine/linkedin/videos.py contactos agregar`.

Arriba, el recorrido: **Elegir › Generando › Revisar › Enviar › Enviados**. Cada contacto está en un solo paso y la pantalla muestra sólo lo de ese paso:

- **Elegir:** marcás a quién le hacés un video (con el costo a la vista si cargaste `linkedin.video.costo_usd`) y tocás «Generar». **E** elige y **X** descarta.
- **Generando:** lo pedido queda en la cola; se actualiza solo con el paso en que está (guion, voz, avatar, armado). Para que arranque, copiás el pedido y lo pegás en Claude Code (skill `video-a-medida`): el planner no arranca a Claude Code por su cuenta.
- **Revisar:** el video y, al lado, Aprobar (**A**), Pedir cambios (tu nota es el OK para rehacerlo) y el guion.
- **Enviar:** invitarlo sin nota, el mensaje para copiar cuando acepta y el video para descargar. «Marcar como enviado» lo pasa a Enviados.
- **Enviados:** lo que mandaste, con su seguimiento (Respondió, Agendó una llamada).

Lo que ya tiene video o está en curso no se vuelve a pedir.

## Posts

Los posts de tu perfil, cada uno como se ve en LinkedIn (con el corte del «…ver más» a los 210 caracteres) y con su imagen. Los escribe la skill `linkedin-posts`: pedile a Claude Code «armá los posts de LinkedIn de la semana». Estados: Por revisar, Para programar, Programados, Publicados y Descartados.

- **Editar:** el texto se guarda solo; si cambió en disco mientras lo editabas, no se pisa.
- **Feedback:** una nota escrita (Enter) o un audio por post, para corregir el texto o la imagen. «Mandar a Claude» copia un pedido con todas las notas pendientes y tus ediciones a mano: Claude Code las aplica y lo que enseñan pasa a la guía de la skill.
- **Aprobar** no agenda. En «Para programar» elegís día y hora: propone el primer día hábil con lugar y una hora con 2 horas de distancia de lo demás de LinkedIn (`linkedin.separacion_horas`). **Programar** es tu OK para esa publicación: `engine/linkedin/agendar.py` la pasa por la cola como cualquier pieza (`cola.py listo` con el texto del post y `agendar`), así queda el intento registrado y no se duplica. Después la ves también en Semana.
- **Publicados:** `python3 engine/linkedin/posts.py estado` pasa a Publicados lo que Postiz ya publicó, con su link, y `posts.py metricas` mide reacciones y comentarios a las 72 horas.

Arriba de cada post, tu perfil: `linkedin.cuenta` en la config (`nombre`, `titular`, `avatar` y `pagina`, la página de tu empresa que nombra el post) o `cuenta.json` en la carpeta.

## Métricas

Semana por semana: prospectos detectados y de nivel A, cuántos pasaron a cada paso (para contactar, contactados, respondieron, agendaron), posts aprobados y publicados, y sus reacciones y comentarios. Abajo, los prospectos por rubro. Impresiones y visitas al perfil sólo las ves vos en LinkedIn.

## Referencias

El research de lo viral en tu nicho: cada post con su autor, de qué va el gancho (con otras palabras), reacciones, comentarios, formato, largo y fecha, para copiar la forma y el tono. Lo arma la skill `linkedin-posts` en `referencias.json` (formato en la skill).

## Revisar cambios

Con la sección LinkedIn abierta, el botón de arriba cuenta lo de LinkedIn: contactos en «Para contactar» sin video, videos en la cola o con cambios pedidos, posts aprobados sin programar y notas sin mandar. «Preparar pedido» manda los contactos a la cola y copia el mensaje para Claude Code.

## Config

```json
"linkedin": {
  "carpeta": "linkedin",
  "cuenta": { "nombre": "Tu nombre", "titular": "Qué hacés", "avatar": "fotos/yo.jpg", "pagina": "Tu empresa" },
  "separacion_horas": 2,
  "video": { "avatar": "heygen", "voz": "elevenlabs", "costo_usd": 3 },
  "lamina": { "css": "marca/linkedin.css", "logo": "marca/logo-blanco.png" }
}
```

Todo es opcional. Para programar hace falta una cuenta de LinkedIn conectada en Postiz (`python3 engine/conectar.py`).

## API

`GET linkedin` · `POST linkedin/prospecto` (`id`, `estado`, `nota`) · `POST linkedin/video/pedir` (`ids`) · `POST linkedin/video/feedback` (`id`, `texto`) · `POST linkedin/video/aprobar` (`id`, `aprobado`) · `POST linkedin/video/progreso` (`id`, `estado`, `paso`, `archivo`, `guion`, `mensaje`…) · `POST linkedin/borrador` (`id`, `texto`, `editado`) · `POST linkedin/borrador/estado` (`id`, `estado`: `borrador`, `aprobado` o `descartado`) · `POST linkedin/borrador/feedback` (`id`, `text` o `audio` en base64 con `mime`) · `POST linkedin/borrador/feedback/remove` · `POST linkedin/borrador/feedback/copiar` · `POST linkedin/borrador/programar` (`id`, `cuando`: `AAAA-MM-DDTHH:MM`).
