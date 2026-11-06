---
name: video-a-medida
description: Producí un video corto a medida para un contacto o prospecto de LinkedIn (sobre su marca y su negocio, con el avatar y la voz que configuró el usuario) y dejalo en la pestaña LinkedIn → Videos del planner para revisarlo y mandarlo. También suma contactos a esa pestaña. Aplica cuando el usuario pide procesar la cola de videos del planner o videos para sus prospectos. No contacta a nadie.
---

# Video a medida para un contacto

En **LinkedIn → Videos** el usuario elige a quién le hace un video, lo pide, lo revisa, pide cambios, lo aprueba y lo marca como enviado. El recorrido es Elegir › Generando › Revisar › Enviar › Enviados y se guarda en `<publicar>/linkedin/estado.json → videos`. El planner no arranca a Claude Code por su cuenta: cuando el usuario toca «Generar» o «Preparar pedido», queda en la cola y él pega el pedido acá.

## Invariantes

- **No manda nada.** Ni invitación ni mensaje: el envío lo hace el usuario desde su cuenta, con el video descargado.
- **El clic de «Generar» es el OK de gasto de ese video**, dentro de lo que dice `linkedin.video.costo_usd` en la config (se muestra en el planner). Si un video va a costar más, decilo antes y esperá.
- **Sobre la marca y el negocio del contacto, nunca citando un posteo suyo.** Si un dato sale de un posteo, se usa sin decir que salió de ahí. No inventes cifras ni clientes.
- **Logo y fotos reales** de su web o su página de LinkedIn; nunca un logo generado, ni un producto o un proyecto real inventado.
- **Clientes actuales afuera:** cruzá con los clientes del usuario antes de producir.
- Un render pesado por vez.

## Contactos

Un prospecto de la búsqueda (skill [linkedin-prospectos](../linkedin-prospectos/SKILL.md)) que el usuario pasa a «Para contactar» entra solo a Videos. Para sumar otros (por ejemplo, founders que el usuario encontró por su cuenta), armá un JSON y:

```bash
python3 engine/linkedin/videos.py contactos agregar contactos-nuevos.json
python3 engine/linkedin/videos.py contactos listar
```

Cada contacto: `id` (minúsculas, números y guiones), `empresa` y lo que haya de `autor` (`nombre`, `titular`, `url`, `foto`), `pais`, `rubro`, `nivel` (A, B o C), `por_que` (lista), `ideas` (`[{titulo}]`, qué le mostrarías), `posteos` (`[{texto, fecha, url, reacciones}]`), `web`, `logo` y `textos.mensaje` (el mensaje que acompaña al video). Datos de fuentes públicas y nunca con la cuenta del usuario.

## Desde el planner

1. `python3 engine/linkedin/videos.py pendientes` lista la cola: cada contacto con su tipo (`pedido` o `corrigiendo`), sus datos y las notas sin aplicar.
2. **Video nuevo:** guion → voz → avatar → armado (abajo). Reportá cada paso con `videos.py paso <id> guion|voz|avatar|video`: el planner lo muestra en vivo.
3. **Corrección:** aplicá las notas sobre el video anterior. Guardá el anterior aparte y no rehagas lo que la nota no toca.
4. Al terminar: `videos.py listo <id> <video.mp4> --guion guion.txt [--mensaje mensaje.txt] [--duracion 45]`. El video tiene que estar dentro de la carpeta de contenido o de publicar, ya comprimido para mandar (menos de 15 MB va bien en un mensaje). `--mensaje` reemplaza al mensaje que traía el prospecto. Si algo se frena: `videos.py error <id> "motivo en una frase"`.

## Producción

El usuario elige los proveedores y los deja escritos en `linkedin.video` de la config (por ejemplo `{"avatar": "heygen", "voz": "elevenlabs", "costo_usd": 3}`); las claves van en el `.env`. Antes del primer video, confirmá con él cuáles usa y cuánto sale cada uno.

1. **Guion** de 30 a 60 segundos, sobre la marca y el negocio del contacto, en este orden: su nombre y «esto es lo que [marca] podría publicar»; qué hace el negocio; tres ejemplos aplicados a su marca (una publicación, un carrusel, un video); qué le ofrecés; el primer paso (la `muestra` de la búsqueda) y la despedida. Voseo sólo si el contacto es de Argentina, Uruguay o Paraguay.
2. **Voz** con la voz del usuario (clonada o la que elija).
3. **Avatar** del usuario diciendo el guion, o sólo para el gancho, según lo que haya configurado.
4. **Armado:** la marca del contacto (logo, colores, fotos reales) y los ejemplos en pantalla, con subtítulos. Si los colores de su marca chocan con los del usuario, mandan los de su marca.
5. **Revisión:** mirá cuadros de todo el video y escuchalo entero antes de avisar que está listo.

## Mensaje

Corto, al grano y con una sola pregunta al final, la misma que hace el video. Sin análisis de su negocio, sin links y sin precios. Si no hay uno escrito, armalo con la `oferta` y la `muestra` de la búsqueda y dejalo en `--mensaje`.
