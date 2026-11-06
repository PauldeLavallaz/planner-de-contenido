# Cómo funciona

```
tus carpetas ──► planner (navegador) ──► propuesta ──► Claude Code ──► Postiz ──► redes
                  lee, no modifica        un mensaje      engine/cola.py    publica
```

## La barra lateral

A la izquierda, de arriba abajo (se pliega a sólo íconos con el botón de arriba; plegada, cada ícono dice su nombre al pasar el mouse; en una ventana angosta arranca plegada):

- la **marca**, si tenés más de una en `brands`: vale para todas las secciones. Cada marca muestra cuántas cuentas tiene y sus redes; una cuenta con `marca` en `channels` es de esa marca y una sin marca, de todas;
- **Buscar** (o ⌘K / Ctrl+K, desde cualquier lado): ir a una sección, cambiar de marca o de tema, consultar Postiz o abrir una pieza escribiendo parte de su título;
- las **secciones**: Semana e Historias; después Guiones, Tablero y Publicadas;
- abajo de todo, el **formato** (Reels, Trial y Carruseles, que se prenden y se apagan), el interruptor **Collabs** y las **cuentas** conectadas, cada una con su casilla (siempre queda una prendida);
- al pie, el **tema oscuro**, que queda guardado en el navegador.

Con una marca elegida y **Collabs** prendido, lo que tiene fecha y sale al feed de Instagram con collab de una cuenta prendida de esa marca también se ve en ella, con la marca «Collab», para ver su horario. No ocupa sus horarios ni entra en *Por agendar*.

Lo agendado se ve en la cuenta por la que sale; lo que todavía no tiene fecha se ve con cualquier cuenta prendida en sus redes, porque la cuenta se elige al agendar. Trial es cómo sale un reel a Instagram: con sólo «Reels» prendido, un reel en Trial igual se ve en el TikTok o el YouTube por el que sale. Historias usa las cuentas de Instagram prendidas (en esa sección la barra lista sólo ésas). Todo lo elegido se guarda en el navegador. El buscador aparece donde filtra una lista: Tablero y Publicadas.

## Las vistas

- **Semana.** El calendario. A la izquierda, *Por agendar*: lo Listo sin fecha y lo que falta revisar (con un botón para aprobar). Arrastrás una pieza a un día y toma el primer horario libre; tocando la hora la cambiás. Los horarios salen de `slots` (en la config de ejemplo, 11:00, 13:00, 15:00, 17:00, 19:00 y 21:00) y cada día se corren todos para un mismo lado 15 o 30 minutos, así no sale siempre a la misma hora; el mismo día da siempre los mismos, en el planner y en `cola.py agendar --slot`. Con `suggested_times` en la config, los botones de hora muestran ésos tal cual y `--slot` no corre nada. *Distribuir* reparte las piezas listas en tus horarios, separando temas parecidos e intercalando carruseles. La semana que mirás queda en la dirección (`#semana=<lunes>`), así un refresh vuelve a ella.
- **Tablero.** Columnas por estado, tipo Trello: En desarrollo, Por revisar, Listo, En Postiz, Pausadas y Descartadas, lado a lado y cada una con su scroll. Cada tarjeta tiene la portada chica, el título, la fecha y las redes; en desarrollo muestra hasta dónde llegó la pieza (guion, audio, corte; en un carrusel, texto y láminas). Arrastrar entre las tres primeras cambia el estado; soltar en Listo es aprobar. Descartar oculta la pieza sin borrar nada.
- **Publicadas.** Todo tu contenido en dos grupos que se pliegan: arriba lo agendado en Postiz, de lo más próximo a lo más lejano, y abajo lo publicado por mes.

## El detalle de una pieza

Al tocar una portada se abre el video (o las láminas; si todavía no hay ninguno, el audio y el guion); debajo, el ícono de carpeta lo abre en el Finder (en Windows, el Explorador) con el archivo seleccionado. Al costado, en este orden:

- **Feedback**, siempre arriba: una nota escrita (Enter guarda) o un audio, que se guarda en `feedback/` dentro de la pieza. *Copiar para Claude Code* arma un mensaje con la ubicación y las notas. Debajo, la fila **Versión**: el video que se publica, *Buscar versión nueva*, *Traer la última versión* y *Volver a la anterior* (tocar otro video debajo del reproductor lo elige).
- **Cuándo:** día y hora. Los horarios ocupados son los de otras piezas que salen por la misma cuenta. **Publicar ahora** copia una orden para pegar en Claude Code, que la publica ya con la skill `publicar` (pegarla es tu aprobación; si estaba agendada, no la duplica).
- **Dónde:** una fila por red, con su cuenta (un desplegable si conectaste más de una) y un interruptor. Instagram encendido suma **Formato** (feed o Trial) y **Collab**. En un reel de la cola que sale por Instagram y por otra red, **Otro horario para Instagram** pasa Instagram (con YouTube y LinkedIn) a una tarjeta propia sin fecha, para agendarla aparte (`cola.py separar`); si la original ya estaba en Postiz, sacarle esas redes va en *Revisar cambios*.
- **Estado:** el tacho para descartar y En desarrollo, Por revisar, Listo o Publicado (para marcar algo que subiste a mano).
- **Copy:** el texto que se publica, plegado a dos renglones. *Ver todo y editar* lo abre. Editarlo no toca tus archivos ni Postiz: queda como una nota de feedback con el texto nuevo, y Claude Code lo aplica cuando le pegás ese feedback (si la pieza ya estaba en Postiz, la recrea con el texto nuevo en la misma fecha).

*Guardar* suma los cambios a tu borrador. Si la hora ya pasó, se guarda igual y el pie lo avisa: la propuesta no sale hasta que la corrijas.

## Del planner a Postiz

1. Cada cambio se guarda al instante en un borrador (`publicar/.planner/draft.json`). No cambia nada afuera.
2. *Revisar cambios* lista lo que vas a mandar: agenda y feedback de contenido (también el copy editado). Lo que traba el envío va primero y el pie dice por qué: una hora vencida, un archivo que cambió desde que lo editaste o una pieza que ya no está.
3. *Preparar confirmación* congela la propuesta (`proposal-<id>.json`) y te da un mensaje.
4. Pegás el mensaje en Claude Code. Corre `engine/cola.py aplicar <id>`: pone en la cola lo que falte, agenda, mueve, pausa o quita en Postiz, y anota el resultado.
5. El planner relee Postiz al abrirlo (si la última consulta tiene más de 30 minutos) y con el botón de Postiz arriba a la derecha.

Todo mensaje que copia el planner para Claude Code (la propuesta, el feedback, *Publicar ahora*) empieza con una línea como `[Agenda] Cambio de horario de «Mi reel»` o `[Feedback] Cambiar el copy de «Mi reel»`. Si abre una conversación nueva, el hook `.claude/hooks/titulo_desde_planner.py` la usa de título, así la lista de conversaciones dice qué se hizo en cada una en vez de un id; pegado en una conversación que ya existe, no la renombra. El id de la propuesta sigue en el cuerpo del mensaje.

### Si algo está mal armado

Una ficha de la cola o una pieza con datos que el inventario no entiende no vacía el calendario: se saltea y arriba aparece un aviso con el archivo y el error, para corregirlo. Si el inventario entero no se puede armar (por ejemplo, justo después de tocar la config), el planner muestra la última versión que cargó bien (`publicar/.planner/inventario-ok.json`) con un aviso de desde cuándo es y por qué falló; mientras tanto se puede mirar, pero no aprobar, mover ni proponer.

## Estados

| Estado | Qué significa |
|---|---|
| En desarrollo | Sin final o todavía en producción. No ocupa el calendario. |
| Por revisar | Tiene final; falta que lo apruebes. |
| Listo | Aprobado: se puede agendar. Ponerle fecha a algo con final también lo aprueba. |
| En Postiz | Programado. |
| Pausada | Salió de Postiz sin perderse; vuelve a Listo o se agenda de nuevo. |
| Publicada | Postiz confirmó que salió, o la marcaste vos. |
| Por confirmar | Postiz devolvió algo raro (un error o un borrador): revisalo. |

## Seguridad

- El servidor escucha sólo en `127.0.0.1`: nadie de tu red lo ve.
- Sólo sirve archivos de tu carpeta de contenido, nunca ocultos (`.env`, `.git`).
- La API del planner no tiene ningún endpoint que publique: eso sólo lo hace Claude Code con tu confirmación.
