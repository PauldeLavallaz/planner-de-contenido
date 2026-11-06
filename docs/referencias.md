# Referencias

La pestaña **Referencias** es donde se decide qué producir: el research de la semana, lo que les funciona a tus competidores y lo que guardaste vos, en un solo lugar, con su análisis y un puntaje. Lo elegido se pide a Claude Code como guiones, y lo que sigue se trabaja en Guiones.

Todo se ve según la marca de la barra lateral: cada documento de research y cada cuenta de la base pueden ser de una marca; lo que no tiene marca es de todas. Con una sola marca (o con «Todas las marcas»), se ve todo junto.

## Las tres secciones

- **Selección**: lo que te propone Claude para la semana (hasta 20 candidatas, de un top de 50), cada una con su gancho en tu idioma, por qué la eligió, a qué apunta (un producto, una oferta o «alcance») y cómo la haría. Arriba, el foco de la semana y cuántas revisó. Abajo de cada tarjeta, **Hacer** o **Paso**. Las pestañas Seleccionadas, En guiones y En producción siguen cada referencia hasta que es pieza. Lo que pasaste queda plegado, para recuperarlo.
- **Bandeja**: lo que falta decidir, por fechas («Últimos 14 días», un mes o el rango que elijas): el research que entró en esas fechas, los outliers de la base de competidores y lo que pasaste vos, sin repetir el mismo contenido. Por defecto **En foco**: oculta lo de los anillos de afuera, lo de cuentas fuera de nicho y lo de la base que no llega a ×5 su mediana (lo tuyo y lo de la Selección entran siempre). Se ve como lista, grilla de portadas o **Mapa** (la diana de anillos con los temas alrededor, o una grilla de dos ejes a elección). Teclado: ↑↓ moverse, L hacer, X paso, R reel, C carrusel, 1 2 3 qué tomar, N nota, O abre el original, V el video acá.
- **Competidores**: la base, con cada cuenta, su relevancia, seguidores, mediana y tope de 90 días; la ficha (rol, anillo, tema, oferta, qué tomar, similarity) y todos sus contenidos, que también se eligen. Si hay más de una marca, la ficha dice de qué marca es la cuenta y se cambia ahí.

**Hacer** deja la referencia lista para pedir, clonada y en el formato del original; qué tomar (clonarla, sólo el tema o sólo el formato), reel o carrusel y una nota son opcionales, en el detalle. Si no tiene análisis, se encola y se analiza solo en segundo plano (hace falta `SCRAPECREATORS_API_KEY` y `GEMINI_API_KEY`). **Paso** la saca de la Bandeja, con un motivo opcional (el tema, el formato, difícil de hacer, ya está visto).

**Pedir guiones**, en la barra de abajo, congela lo elegido que todavía no se pidió y copia el mensaje para Claude Code: qué referencias, qué tomar de cada una y hasta dónde llegar (sólo el guion, o guion y audio). Pegarlo es el pedido. Desde el planner no se genera ni se gasta nada.

## El puntaje

De 0 a 100, la media geométrica de dos números:

- **Viralidad**: cuánto supera su mediana (×1 a ×100) y sus vistas absolutas (5 mil a 5 millones; un like de carrusel vale 30 vistas), en escala logarítmica.
- **Encaje**: su anillo (75 %: el 1 vale 100 y el 5, 15) y la relevancia de su cuenta (25 %; sin dato, 30).

Así, un viral fuera del nicho o uno del nicho que no anduvo no suben solos.

## Archivos

### El research de una semana

`<contenido>/referencias/<lunes>/referencias.json`, o `<contenido>/referencias/<lunes>/<carpeta>/referencias.json` (por ejemplo, uno por marca). Lo arma `engine/research/semana.py armar` desde la base y lo completa Claude Code (skill `referencias`).

```json
{
  "tipo": "referencias", "semana": "2026-11-09", "marca": "Mi marca", "generado": "2026-11-09T10:00:00Z",
  "titulo": "Referencias de la semana", "lectura": ["Lo que se repite esta semana…"],
  "referencias": [{
    "url": "https://www.instagram.com/reel/…", "red": "instagram", "cuenta": "@cuenta", "seguidores": 40000, "fecha": "2026-11-05",
    "tipo": "reel", "idioma": "es", "titulo": "…", "caption": "…", "origen": "competidores",
    "media": { "poster": "research/portadas/instagram-….jpg", "video": null, "laminas": [] },
    "metricas": { "vistas": 50000, "likes": 2000, "multiplo": 9, "mediana_cuenta": 5500, "base": "views contra la mediana de sus reels" },
    "hook": { "texto": "Lo que se dice en los primeros segundos", "visual": "Lo que se ve", "tipo": "contraste" },
    "formato": { "familia": "A cámara", "detalle": "…" },
    "analisis": { "idea": "…", "por_que": "…", "mecanismo": "…", "copiar": "…", "no_copiar": "…", "transcripcion": "…" },
    "encaje": { "anillo": 2 },
    "recomendacion": { "como": "reel", "tomar": "recrear", "nota": "" }
  }]
}
```

- `marca`: de qué marca es (el nombre de `brands`). Sin `marca`, de todas.
- `origen: "guardados"` (o una referencia de un link que pasaste vos) entra siempre a la Bandeja.
- Las medias (`poster`, `video`, `laminas`) son rutas dentro de la carpeta de contenido; las que no existen o quedan afuera no se muestran.
- La misma publicación con otra forma de URL (`/reel/` o `/p/`, con o sin parámetros) es la misma referencia.

### La Selección

Un `referencias.json` más, en `<contenido>/referencias/<lunes>/seleccion-<AAAAMMDD>/`, con `seleccion` arriba y en cada referencia. Vale la más nueva de la marca.

```json
{
  "tipo": "referencias", "semana": "2026-11-09", "marca": "Mi marca", "generado": "2026-11-09T11:00:00Z",
  "seleccion": { "fecha": "2026-11-09", "foco": "Lo que quiero comunicar esta semana", "pool": { "revisadas": 120, "filtradas": 40 }, "motivos": ["…"] },
  "referencias": [{ "url": "…", "cuenta": "@cuenta", "seleccion": {
    "puesto": 1, "nivel": "candidata", "mensaje": "producto", "razon": "Por qué ésta", "hook_es": "El gancho en tu idioma", "pieza": null,
    "como": { "tomar": "recrear", "reel_o_carrusel": "reel", "formato": "A cámara", "detalle": "…" } } }]
}
```

`nivel`: `candidata` (hasta 20; las que sobran pasan a `top`) o `top`. `tomar`: `recrear` (clonarla), `idea` (sólo el tema) o `formato` (sólo el formato). `pieza`: el id de la pieza de Guiones que salió de ésta, si el plan no la cita. `engine/research/semana.py validar <archivo>` revisa la forma.

### Lo que guarda el planner

En `<publicar>/.planner/`:

- `referencias-estado.json`: cada decisión, por marca y referencia (`<marca>|<id>`, con `todas` para la vista de todas): `decision` (`adaptar` o `descartar`), `como`, `tomar`, `motivo`, `nota` y, una vez pedida, `pedido`.
- `referencias-pedido-<id>.json`: cada pedido congelado, con sus piezas y el mensaje. Claude Code lo marca `aplicado` al terminar.
- `referencias-analizar.json`: la cola de análisis; lo que falla queda en `fallidas` con su motivo.

El análisis de cada referencia elegida queda en `<research>/analizadas/<id>.json` (`hook`, `analisis` y `media` con el video y la portada bajados). El planner lo suma al detalle y al pedido.

Una referencia aparece como usada en Guiones cuando una pieza del plan la cita en `ref_ids`, `referencias`, `fuentes` o `referencia.url`.

### La base de competidores

`<contenido>/research/radar.db` (SQLite; la carpeta se cambia con `research.carpeta`). La arma `engine/research/competidores.py` (skill `competidores`):

| Tabla | Qué tiene |
|---|---|
| `radar_accounts` | Cada cuenta: red, usuario, tipo y tags (`marca-<marca>`, `reels-explicativos`, `propia` para las tuyas, que no son competidores). |
| `competidores_mediciones` | Cada medición: nombre, bio, seguidores y qué formatos publica. |
| `competidores_lineas_base` | La mediana de vistas y likes de cada formato en cada medición. |
| `competidores_contenidos` | Cada reel o carrusel visto (`origen` marca los que pasaste vos). |
| `competidores_contenido_mediciones` | Sus números en cada medición, con `x_mediana` (cuántas veces supera la mediana) y `pautado`. |
| `competidores_catalogo` | La ficha: rol, anillo, tema, oferta, formato principal, qué tomar, similarity. |
| `competidores_alcance` | Alcance (tamaño, vistas típicas, tope y crecimiento, de 0 a 100) y relevancia (similarity pesado por alcance). |
| `contenido_clase` | Tema, formato y anillo de cada contenido, con la clave del planner (`ig:<código>`, `tt:<id>`…), de `engine/research/temas.py`. |

Las portadas que muestra el planner quedan en `<research>/portadas/<red>-<código>.jpg` y lo que devolvió cada consulta paga, en `<research>/raw/`, para no volver a cobrarla.

La taxonomía (temas, formatos y anillos) es `<research>/taxonomia.json`; la primera vez se copia la de ejemplo (`engine/research/taxonomia.ejemplo.json`) para que la adaptes a tu nicho. Los anillos van del comprador (1) hacia afuera (5).

## Claves y costos

En el `.env` del planner (nunca en el chat):

- `SCRAPECREATORS_API_KEY`: medir competidores (unos 3 créditos por cuenta) y bajar referencias sueltas (1 crédito).
- `GEMINI_API_KEY`: clasificar temas y formatos (opcional; sin ella, por palabras) y analizar lo elegido. El modelo se cambia con `research.gemini_modelo` (por defecto `gemini-2.5-flash`).

Cada consulta queda en `<research>/logs/eventos.ndjson` con sus créditos o tokens.
