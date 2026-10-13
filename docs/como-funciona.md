# Cómo funciona

```
tus carpetas ──► planner (navegador) ──► propuesta ──► Claude Code ──► Postiz ──► redes
                  lee, no modifica        un mensaje      engine/cola.py    publica
```

## Las tres vistas

- **Semana.** El calendario. A la izquierda, *Por agendar*: lo Listo sin fecha y lo que falta revisar (con un botón para aprobar). Arrastrás una pieza a un día y toma el primer horario libre; tocando la hora la cambiás. *Distribuir* reparte las piezas listas en tus horarios, separando temas parecidos e intercalando carruseles.
- **Tablero.** Franjas por estado: En desarrollo, Por revisar, Listo, En Postiz, Pausadas y Descartadas. Arrastrar entre las tres primeras cambia el estado; soltar en Listo es aprobar. Descartar oculta la pieza sin borrar nada.
- **Publicadas.** El historial por mes.

## El detalle de una pieza

Al tocar una portada se abre el video (o las láminas) y, al costado:

- **Cuándo:** día y hora.
- **Dónde:** redes, cuenta de cada red (si conectaste más de una), Instagram en feed o Trial, y colaboradores.
- **Versión:** si la carpeta tiene otro video, podés elegir cuál se publica.
- **Estado:** En desarrollo, Por revisar, Listo o Publicado (para marcar algo que subiste a mano).
- **Feedback:** una nota escrita (Enter guarda) o un audio. Se guarda en `feedback/` dentro de la pieza. *Copiar para Claude Code* arma un mensaje con la ubicación y las notas.

## Del planner a Postiz

1. Cada cambio se guarda al instante en un borrador (`publicar/.planner/draft.json`). No cambia nada afuera.
2. *Revisar cambios* lista lo que vas a mandar: agenda y feedback de contenido. Si un archivo cambió desde que lo editaste, te avisa.
3. *Preparar confirmación* congela la propuesta (`proposal-<id>.json`) y te da un mensaje.
4. Pegás el mensaje en Claude Code. Corre `engine/cola.py aplicar <id>`: pone en la cola lo que falte, agenda, mueve, pausa o quita en Postiz, y anota el resultado.
5. El planner relee Postiz al abrirlo (si la última consulta tiene más de 30 minutos) y con el botón de Postiz arriba a la derecha.

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
