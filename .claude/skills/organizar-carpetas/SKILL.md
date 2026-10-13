---
name: organizar-carpetas
description: Mapea las carpetas de contenido del usuario al planner (adaptándose a su estructura o creando la estándar) y verifica qué piezas ve en cada estado.
---

# Organizar carpetas

El planner necesita saber dónde están las piezas y en qué estado están. Lo define `content.sources` en `planner.config.json`. Modelo completo en [docs/carpetas.md](../../../docs/carpetas.md).

## Modelo en una línea

Una **fuente** es una carpeta (o un patrón glob) cuyos hijos son piezas: cada subcarpeta es una pieza y cada video o imagen suelto también. El estado sale de la fuente (`stage` fijo), del archivo `pieza.json`/`run.json` de la pieza (`stage: "auto"`), o del planner cuando el usuario mueve la pieza de columna.

## Pasos

1. **Mirar.** `python3 engine/carpetas.py analizar` sobre `content.root` (o `analizar /otra/ruta --profundidad 4`). `◆` marca carpetas cuyos hijos parecen piezas. Si hace falta, abrí un par de piezas para ver qué archivos tienen (nombre del final, láminas, textos).
2. **Entender su lógica.** Preguntale lo que no se deduce: ¿cómo sabe hoy qué está terminado? ¿Separa por estado, por fecha, por cliente, por formato? ¿Dónde pone el texto de cada publicación?
3. **Proponer una opción**, la que le pida menos cambios:
   - **A. Adaptarse.** Sus carpetas ya separan por estado (`Terminados/`, `Para subir/`, `Subidos/`) → una fuente por carpeta con su `stage`. Separa por otra cosa (`Reels/2026-10/*`, `Clientes/*/Entregas`) → fuentes con glob y `stage: "auto"`; el estado lo maneja desde el tablero del planner. Si usa una ficha propia con estado, el motor entiende `estado`/`status` con palabras como «listo», «aprobado», «por revisar», «publicado» (ver `STATUS_WORDS` en `engine/piezas.py`).
   - **B. Estructura estándar.** `python3 engine/carpetas.py crear` crea `1-en-desarrollo`, `2-por-revisar`, `3-listo`, `4-publicado` y las configura. Mover sus piezas ahí es opcional y sólo con su OK: mostrá la lista de qué va a dónde antes de mover.
4. **Ajustar cómo se reconoce el final** si sus nombres son distintos: `content.final_patterns` (por defecto `final*.mp4`, `final*.mov`, `*.mp4`, `*.mov`; gana el primer patrón que encuentre algo y, entre varios, el más nuevo), `content.carousel_patterns` para las láminas, `content.caption_files` para el texto (`caption.txt`, `publish_kit.md`…) y `content.ignore` para subcarpetas que no son piezas (por ejemplo `brutos`, `assets`).
5. **Probar.** `python3 engine/carpetas.py probar`. Mostrale cuántas piezas ve por estado y por fuente, con ejemplos, y preguntá si coincide con lo que espera. Iterá hasta que sí. Después recargá el planner.

## Mantener carpetas y planner alineados

Si eligió carpetas por estado y mueve piezas de columna en el planner, las carpetas no se mueven solas. Cuando lo pida («ordená las carpetas»):

```bash
python3 engine/carpetas.py sincronizar            # muestra qué movería
python3 engine/carpetas.py sincronizar --aplicar  # con su OK: mueve y actualiza el planner y la cola
```

Las piezas que entraron a la cola van a `3-listo` y las publicadas a `4-publicado`.

## Nunca

- Mover, renombrar o borrar archivos sin confirmación explícita.
- Poner `content.root` en la carpeta personal entera o en el disco: elegí la carpeta de contenido.
- Mapear como fuente la carpeta `publicar/` (es la cola) ni la del propio planner.
