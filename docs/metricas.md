# Métricas

La pestaña **Métricas** es el centro de control de tu propio contenido: qué te funcionó, cómo creciste en cada red y qué formato, tema y anillo rinden, en el período que elijas.

## Qué muestra

- **El período**: el título abre un calendario (una semana, un mes, un año, los últimos días o las fechas que quieras) y las flechas lo corren (también ← y →). Todo se compara con el período anterior del mismo largo.
- **Una tarjeta por cuenta** encendida en la barra lateral: seguidores, ganados en el período con su barra por semana o por mes, publicaciones, vistas, mediana por pieza e interacciones. Las cuentas sin serie de seguidores van chicas y abajo.
- **Lo que mejor funcionó**: tus videos ordenados por su rendimiento (abajo).
- **Qué te funciona**: formato, tema y anillo, por rendimiento, total de vistas, vistas ganadas en el período o seguidores, con la grilla de dos ejes que se da vuelta.
- **El mapa de tu contenido**: la misma diana de Referencias con tus piezas.
- **Cómo se definió cada anillo**, si tu taxonomía propia lo trae.
- **De dónde sale cada número**, plegado al pie: la fuente y la última lectura de cada cuenta.

Las tarjetas cuentan toda la cuenta; lo que analiza qué funciona mira la marca de la barra.

## Rendimiento y balance

Cada publicación se compara con lo normal de su cuenta: la mediana de las vistas de sus otras publicaciones de los 45 días antes y después (con al menos 3, y sin las de menos de una semana, que todavía suman). ×1 es lo normal; ×2, el doble.

La misma pieza publicada en varias redes es un solo video, y su **balance** pesa cada red según `balance.redes` de `<research>/taxonomia_propia.json` (por defecto, Instagram y TikTok igual). Un video que salió en una sola red usa esa. Lo publicado hace menos de una semana es provisorio.

## De dónde salen los números

Todo vive en `<contenido>/research/radar.db` y lo arma `engine/research/metricas.py` (skill `referencias`, sección Métricas). Sólo lee: no publica ni cambia nada.

```bash
python3 engine/research/metricas.py actualizar               # todo lo de abajo, en orden
python3 engine/research/metricas.py postiz [--dias 30]       # lo publicado por la cola y sus números, desde Postiz
python3 engine/research/metricas.py importar export.csv --red instagram --cuenta micuenta
python3 engine/research/metricas.py cargar --url <link> --vistas 1200 --likes 80
python3 engine/research/metricas.py seguidores instagram micuenta 2150
python3 engine/research/metricas.py videos                   # agrupa entre redes y calcula el balance
python3 engine/research/temas.py clasificar --propias        # tema, formato y anillo de tus piezas
```

- **Postiz**: cada publicación que salió por la cola del planner (sus fichas en `<publicar>/agendado` y `<publicar>/publicado`) con `postiz analytics:post`, y los seguidores de cada cuenta conectada con `postiz analytics:platform`. Postiz devuelve lo que la red le da: guardados o tiempo de reproducción pueden faltar.
- **CSV**: un archivo exportado de la red o armado a mano. Reconoce encabezados en castellano o en inglés: `url`, `red`, `cuenta`, `fecha`, `titulo`, `texto`, `vistas` (o views, plays, impressions), `alcance`, `likes`, `comentarios`, `compartidos`, `guardados`, `seguidores_nuevos`, `tiempo_promedio_s` y `completo`. Una fila con el link de una publicación que ya está en la base le suma números a ésa.
- **A mano**: una publicación (`cargar`) o el total de seguidores de un día (`seguidores`).
- **Windsor, Composio u otra fuente**: si ya los usás, pueden escribir en las mismas tablas con su nombre en `fuente`; la pestaña los muestra igual.

| Tabla | Qué tiene |
|---|---|
| `propias_publicaciones` | Cada publicación: red, cuenta, marca, link, fecha, título, texto y formato. |
| `propias_metricas` | Cada lectura de sus números, con su fuente: vistas, alcance, likes, comentarios, compartidos, guardados, seguidores nuevos, tiempo promedio. |
| `propias_seguidores` | El total de seguidores (o las altas) de cada cuenta por día. |
| `propias_videos`, `propias_video_pubs`, `propias_video_semanas` | Cada video con sus publicaciones, su rendimiento por red, su balance y lo que ganó cada semana. |

## La taxonomía de tus piezas

Por defecto tus piezas usan la misma taxonomía que las referencias (`<research>/taxonomia.json`). Si querés otra para lo propio, `<research>/taxonomia_propia.json` acepta lo mismo (`temas`, `formatos`, `anillos`) más:

- `balance.redes`: el peso de cada red en el balance de un video, por ejemplo `{ "instagram": 0.6, "tiktok": 0.4 }`.
- `temas[].categoria`: un tema que se cuenta dentro de otro.
- `lineas` y `estilos`: subdivisiones de cada formato y estilos visuales, si las usás.
- `anillos_por_perfil`: por marca (su nombre en minúsculas y con guiones, o `todas`), cómo se define cada anillo para esa audiencia (`anillos: [{ n, corto, quien, senales }]`, `prueba`, `reglas`, `centro`, `origen`).
