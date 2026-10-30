---
name: publicar
description: Ejecuta en Postiz lo que el usuario confirma desde el planner (propuestas «Confirmo la propuesta…») y pedidos directos de agendar, mover, pausar o ver la semana.
---

# Publicar

Motor: `engine/cola.py` (correlo desde la carpeta del planner; en Windows con `python`). Detalle de redes en [docs/redes.md](../../../docs/redes.md).

## Una propuesta del planner

El mensaje empieza con «Confirmo la propuesta <id>» y trae la ruta del archivo. Pegarlo **es** la confirmación del usuario para exactamente esos cambios.

1. **Plan:** `python3 engine/cola.py aplicar <id>`. Muestra qué va a pasar con cada pieza y qué no se toca (descartadas, sin archivo final, no aprobadas, creadas directo en Postiz).
2. **Avisos antes de ejecutar**, en una línea cada uno y sólo si aplican:
   - reels con Instagram: si salen en el feed o en Trial, y con qué colaboradores;
   - piezas sin texto (`captions.general` vacío): pedí el texto o confirmá que sale sólo con el título;
   - piezas omitidas y por qué.
   Si no hay nada dudoso, seguí sin volver a preguntar.
3. **Ejecutar:** `python3 engine/cola.py aplicar <id> --ejecutar`. Para probar sin publicar: `--ejecutar --borrador` (quedan como borradores en Postiz).
4. **Verificar:** `python3 engine/cola.py semana` y contá el resultado: qué quedó programado, cuándo y dónde, y cualquier error tal cual.
5. **Feedback de contenido** (campo `feedback` de la propuesta): no lo aplica el motor. Seguí las reglas del mensaje: tomá cada nota (estado `en_curso`), transcribí los audios, corregí según las instrucciones del proyecto de contenido y marcá `aplicado`. Si una pieza tiene feedback y también fecha en la propuesta, primero se corrige y se agenda la versión nueva cuando el usuario la apruebe. Una nota `tipo: "copy"` trae el texto nuevo completo en `copy`: va textual a `captions.general` de la ficha (y a los textos por red que repetían el anterior) y al archivo de texto de la pieza, sin otra versión ni export; si la pieza ya está en Postiz, `cola.py mover <slug>` a la misma fecha y hora la recrea con ese texto. Si sólo cambió el copy, la pieza se agenda igual con el texto nuevo.

Si `aplicar` falla en una pieza, el resto sigue y la propuesta queda `partial` con el motivo en `results`. Resolvé la causa (ver Errores) y corré los pasos de esa pieza a mano con los comandos de abajo.

## «Publicar ahora» desde el planner

El mensaje empieza con «Publicá ahora esta pieza del planner» y trae el título, la ficha o el archivo y las cuentas. Pegarlo **es** la aprobación del usuario para publicar esa pieza ya, en esas cuentas.

1. Si no está en la cola (no trae ficha de `publicar/`): `python3 engine/cola.py listo <carpeta> --redes …` con las redes del mensaje (y `--cuenta red=usuario` si nombra otra cuenta).
2. Si no está agendada: `python3 engine/cola.py agendar <slug> --fecha <hoy> --hora <dentro de 5 minutos> --redes …`. Si ya estaba agendada, no la dupliques: seguí con el paso 3.
3. `python3 engine/cola.py ahora <slug> [--redes …]` la manda ya.
4. En unos minutos, `python3 engine/cola.py reconciliar` y pasale al usuario el link de cada red (o el error tal cual).

## Pedidos directos

Cada uno requiere que el usuario lo pida para esa pieza.

```bash
python3 engine/cola.py listo <carpeta-o-archivo> [--redes instagram,tiktok] [--cuenta instagram=usuario] [--portada 2.5] [--trial] [--sin-colab]
python3 engine/cola.py agendar <slug> --fecha 2026-10-20 --hora 18:30 [--redes …] [--cuenta red=usuario] [--colab a,b] [--draft]
python3 engine/cola.py agendar <slug>                 # próximo horario libre de la grilla (slots)
python3 engine/cola.py mover <slug> --fecha … --hora …
python3 engine/cola.py quitar <slug>                  # sale de Postiz, vuelve a inbox/ sin fecha
python3 engine/cola.py separar <slug> [--redes instagram]  # Instagram (con YouTube y LinkedIn) pasa a otra tarjeta, para otro horario
python3 engine/cola.py pausar <slug> [--motivo …]     # sale de Postiz y queda retenida
python3 engine/cola.py reanudar <slug>
python3 engine/cola.py reemplazar <slug> <archivo>    # otra versión del video (sólo sin fecha: si está agendada, quitar → reemplazar → agendar)
python3 engine/cola.py ahora <slug> [--redes …]       # publica ya lo que estaba programado
python3 engine/cola.py modo-ig <slug> feed|trial
python3 engine/cola.py cronograma [--dias 7]          # propone repartir inbox/ en los horarios libres; --apply agenda (con OK)
python3 engine/cola.py semana                          # grilla de los próximos días
python3 engine/cola.py publicado                       # concilia con Postiz y archiva lo que salió
python3 engine/cola.py capacidades                     # qué formato admite cada cuenta
```

- `listo` copia el final a `publicar/inbox/` con su ficha (`<slug>.json`). Toma título y texto de `pieza.json`, `publish_kit.md` o `caption.txt` de la pieza. Una carpeta con varias imágenes y sin video entra como carrusel.
- El texto se puede ajustar por red en la ficha: `captions.general`, y si hace falta `captions.instagram`, `captions.linkedin`, `captions.youtube_description`, `captions.youtube_title`, `captions.tiktok_title`.
- Antes de agendar un reel con Instagram, decí si sale en el feed o en Trial.
- Postiz no permite reprogramar: `mover` borra y recrea los posts que todavía no salieron. Si una red ya publicó, no se toca.

## Errores

- `POSTIZ_AUTH_REQUIRED`: `postiz auth:login` (o revisar `POSTIZ_API_KEY` en `.env`).
- `POSTIZ_RESPONSE_UNCERTAIN`: no reenviar. `python3 engine/cola.py reconciliar` y mirar en Postiz si el post existe.
- `POSTIZ_RATE_LIMITED`: Postiz limita cuántos posts se crean por hora. Esperar y avisar; no reintentar en loop.
- «Postiz pide X. Cargalo en channels.<red>.settings»: la red necesita un dato fijo (por ejemplo el tablero de Pinterest). Pedíselo al usuario y cargalo en `planner.config.json`.
- «La cuenta … ya no está»: el usuario desconectó o reconectó una red en Postiz. `python3 engine/conectar.py`.
- Una pieza que no aparece en el planner: skill organizar-carpetas.
