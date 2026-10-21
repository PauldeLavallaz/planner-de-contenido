# Carpetas

El planner lee tus carpetas; no las cambia. Le decís dónde buscar en `planner.config.json`:

```json
"content": {
  "root": "..",
  "sources": [
    { "path": "1-en-desarrollo", "stage": "development", "label": "En desarrollo" },
    { "path": "2-por-revisar",   "stage": "review",      "label": "Por revisar" },
    { "path": "3-listo",         "stage": "ready",       "label": "Listo para publicar" },
    { "path": "4-publicado",     "stage": "published",   "label": "Publicado" }
  ]
}
```

- `root`: tu carpeta de contenido. Relativa a la config (`..` si el planner vive adentro) o una ruta absoluta.
- `sources`: dónde están las piezas. Cada `path` es relativo a `root` y acepta comodines (`Reels/2026-*`, `Clientes/*/Entregas`).
- `stage`: el estado de todo lo que hay en esa fuente. `development`, `review`, `ready`, `published`, `archived`, o `auto` para que salga de cada pieza.

## Qué es una pieza

Dentro de una fuente, **cada subcarpeta es una pieza**, y cada video o imagen suelto también.

```
3-listo/
├── reel-tres-errores/
│   ├── final.mp4          ← el video que se publica
│   ├── caption.txt        ← el texto de la publicación (opcional)
│   └── pieza.json         ← título, estado, marca (opcional)
├── carrusel-cinco-tips/
│   ├── slides/01.png …    ← las láminas, en orden de nombre
│   └── publish_kit.md     ← texto por secciones (opcional)
└── video-suelto.mp4       ← también es una pieza
```

**El final.** Se busca con `content.final_patterns`, en orden: `final*.mp4`, `final*.mov`, `*.mp4`, `*.mov`. Gana el primer patrón que encuentre algo; si hay varios, el más nuevo. Los demás videos de la carpeta quedan como versiones que podés elegir en el detalle.

**Carruseles.** Una pieza sin video y con dos o más imágenes es un carrusel. Las láminas salen de `slides/`, `carrusel/` o `laminas/` (o de la carpeta misma), ordenadas por nombre. Las grillas y hojas de contacto se ignoran. Una sola imagen es una publicación de imagen.

**Portada.** Si la carpeta tiene `portada.jpg`, `cover.png` o similar, se usa como miniatura en el planner.

**Texto.** El primero que exista de `publish_kit.md`, `caption.md`, `caption.txt`, `copy.md`, `copy.txt`. Un archivo plano es el texto entero. Un `publish_kit.md` puede tener secciones (el texto va en `## Caption`, `## Copy` o `## Texto`; si no tiene ninguna, se toma del siguiente archivo de la lista, y `## Copy de las láminas` no cuenta como texto de la publicación):

```markdown
## Título
Tres errores al publicar reels

## Caption
El texto de la publicación.

## LinkedIn
Una versión más larga para LinkedIn.

## Portada
2.5          ← segundo del video que va como portada

## Comentario fijado
Un comentario para fijar a mano cuando salga.
```

**Ficha.** `pieza.json` (o `run.json`, `meta.json`) puede declarar `titulo`, `marca`, `estado`, `redes`, `formato` y `publicado_el`. El estado acepta palabras en castellano o inglés: «en desarrollo», «por revisar», «listo», «aprobado», «publicado», «archivado»…

**Sin final.** Una pieza sin video ni imágenes queda En desarrollo, aunque esté en otra fuente.

## Cómo se decide el estado

1. Si la pieza está en la cola (`publicar/`), manda la cola: Lista, En Postiz, Pausada o Publicada.
2. Si la moviste de columna en el Tablero, manda eso (se guarda en `publicar/.planner/stages.json`).
3. Si la fuente tiene `stage` fijo, ese.
4. Con `stage: "auto"`, el `estado` de su ficha; si no tiene, Por revisar si hay final y En desarrollo si no.

## Dos formas de organizarse

**Carpetas por estado.** Mover una carpeta de `2-por-revisar` a `3-listo` la aprueba. Si en cambio la aprobás desde el planner, `python3 engine/carpetas.py sincronizar --aplicar` mueve las carpetas para que coincidan.

**Tu propia estructura.** Si organizás por mes, cliente o formato, apuntá las fuentes ahí con `stage: "auto"` y manejá el estado desde el Tablero del planner. Ejemplos:

```json
{ "path": "Reels/2026-*",        "stage": "auto", "label": "Reels" },
{ "path": "Clientes/*/Entregas", "stage": "review", "label": "Entregas de clientes", "brand": "Clientes" },
{ "path": "Terminados",          "stage": "ready" },
{ "path": "Subidos",             "stage": "published" }
```

`brand` asigna una marca a todo lo de esa fuente (sirve para filtrar si manejás varias). `content.ignore` lista nombres de subcarpetas que no son piezas.

## La cola

`publicar/` adentro de tu carpeta de contenido (se cambia con `publish_root`):

```
publicar/
├── inbox/        lista para agendar, sin fecha      (copia del final + ficha .json)
├── agendado/     programada en Postiz
├── publicado/    archivada por mes cuando salió
└── .planner/     borrador del planner, propuestas, estados del tablero, notas de feedback de piezas sueltas
```

Los finales se **copian** a la cola; tu carpeta queda intacta. Cada vez que se agenda o publica, se anota un historial en `publicacion.json` dentro de la carpeta de la pieza.
