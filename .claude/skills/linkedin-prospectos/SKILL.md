---
name: linkedin-prospectos
description: Buscá personas y empresas que hoy buscan quién les haga lo que vende el usuario (marketing, contenido, redes, automatización con IA): posteos de LinkedIn de quien pide una agencia o contrata, y avisos laborales. Deja todo en la pestaña LinkedIn → Prospectos del planner, con por qué califica cada uno y los textos del primer contacto para copiar. Corre sólo a pedido y no contacta a nadie.
---

# LinkedIn: quién busca lo que vendés

La búsqueda arma `prospectos.json` en `<publicar>/linkedin/` y el planner lo muestra en **LinkedIn → Prospectos**, con la ficha de cada uno. El usuario decide: «Para contactar», «Contactado», «Respondió», «Agendó» o «Descartado». Lo que pasa a «Para contactar» entra también a **Videos**, por si quiere mandarle un video a medida (skill [video-a-medida](../video-a-medida/SKILL.md)).

## Señales

1. **Pide IA** (`pide_ia`, nivel A, la primera en el planner): un posteo donde alguien pide ayuda de afuera con contenido con IA, marketing con IA o automatización.
2. **Pide agencia** (`pide_servicio`, nivel A): pide que le recomienden una agencia o busca quién le maneje las redes, el contenido o la pauta.
3. **Contrata** (`contrata`, nivel B): una empresa que no es agencia publica en su feed que busca community manager, creador de contenido o editor.
4. **Aviso laboral** (`busqueda_laboral`): avisos de Google Jobs, Computrabajo y GetOnBoard, con ficha de la empresa y su Instagram.

## Invariantes

- **Nunca con la cuenta del usuario.** Ni su sesión de LinkedIn ni un navegador logueado: sólo fuentes públicas y proveedores que leen desde su propia infraestructura. LinkedIn castiga a las cuentas que automatizan.
- **No contacta ni manda nada.** Los textos de contacto de cada ficha son para que el usuario los copie si quiere. Nada de invitaciones, comentarios, mensajes ni mails automáticos.
- **Nunca en público el problema de nadie.** El conteo de Instagram (cuántos días lleva sin publicar) es para el mensaje privado.
- **A pedido, nunca sola.** No la programes para que corra todos los días sin que el usuario lo pida.
- **Gasto a la vista:** antes de la primera corrida, decí qué claves tiene y cuánto sale (abajo). Una corrida diaria cuesta centavos; la de 30 días, alrededor de medio dólar.

## Antes de la primera corrida

1. Copiá `.claude/skills/linkedin-prospectos/busquedas.example.json` a `<publicar>/linkedin/busquedas.json` y completá con el usuario `oferta` (qué vende), `muestra` (el primer paso que ofrece, sin precio) y `firma`. `paises` son los de los avisos laborales y los que suman un punto; `paises_posteos`, de dónde se aceptan posteos; `rubros_preferidos` (una expresión regular), los rubros donde ya tiene casos.
2. Las claves van en el `.env` del planner o en el entorno:
   - `APIFY_API_TOKEN`: posteos de LinkedIn con HarvestAPI, unos US$0,002 por posteo. Sin ella no hay posteos.
   - `GEMINI_API_KEY`: separa al que pide del que ofrece y escribe los textos de contacto. Centavos por corrida.
   - `SERPAPI_KEY` (opcional): Google Jobs. El plan gratis da 250 búsquedas por mes: cada corrida usa una por búsqueda y por país.
   - `SCRAPECREATORS_API_KEY` (opcional): la ficha de la empresa en LinkedIn y su Instagram, unos 2 créditos (US$0,004) por empresa nueva; las fichas quedan guardadas.
   Computrabajo y GetOnBoard no piden clave.

## Corrida

```bash
python3 engine/linkedin/prospectos.py --dias 30     # la primera, o después de una pausa
python3 engine/linkedin/prospectos.py --dias 2      # lo nuevo desde la última vez
python3 engine/linkedin/prospectos.py --sin-avisos  # sólo posteos
python3 engine/linkedin/prospectos.py --solo-ia     # sólo los posteos que piden ayuda con IA, con el modelo mejor
python3 engine/linkedin/prospectos.py --mismos-posteos --sin-avisos  # reclasificar lo bajado hoy sin volver a pagar
```

1. **Posteos:** HarvestAPI busca las frases de `posteos` (y `posteos_ia`) con la sintaxis de la barra de LinkedIn, 25 por búsqueda, ordenados por fecha. Como mucho 5 operadores `OR`/`AND` por búsqueda: con más, LinkedIn devuelve vacío y no avisa. Gemini clasifica cada uno; lo que no es marketing (viajes, contabilidad, selección de personal…) y lo de países fuera de `paises_posteos` se descarta.
2. **Avisos:** Google Jobs, Computrabajo y GetOnBoard, con las palabras de `google_jobs`, `computrabajo` y `getonbrd`. Se quedan los puestos de contenido, redes, marketing o video; afuera relaciones comunitarias, pasantías y ventas.
3. **Filtro de la empresa:** afuera agencias, consultoras de RRHH, organismos públicos, medios, las que buscan «para un cliente», las confidenciales y las de menos de 11 empleados. Lo que queda afuera se ve en el planner, con el motivo.
4. **Ficha y conteo** (con ScrapeCreators): rubro, tamaño y web de la empresa; su Instagram, los días desde el último posteo y el hueco más largo en 90 días.
5. **Puntaje y nivel:** un posteo que pide IA arranca en 12, uno que pide agencia en 10 y uno que contrata en 6, más 1 si es de los últimos 3 días y 1 si es de tus `paises`. Un aviso: busca contenido (3) + tamaño (hasta 3) + rubro preferido (2) + más de una búsqueda (1) + más de 21 días sin publicar (2). A desde 9, B desde 6.
6. **Textos de contacto:** comentario público (sólo si pidió que le recomienden a alguien), nota de la invitación, mensaje privado y mail, con la `oferta`, la `muestra` y la `firma`.
7. **Lista:** se fusiona con la anterior. Lo que se evaluó y no pasó el filtro sale, salvo que el usuario ya lo haya movido; lo que no volvió a aparecer queda 30 días.

Lo bajado queda en `busquedas/<AAAAMMDD>/` (crudos, clasificados y fichas, para no pagar dos veces) y lo gastado en `logs/gastos.ndjson`.

## Ajustes

- Las frases están en `busquedas.json`. Sumá o sacá según lo que el usuario descarte: un descarte con motivo es una señal para el filtro, no sólo para esa empresa.
- Antes de tocar el puntaje, mirá los descartados en `estado.json → prospectos` y los que pasó a «Para contactar».
- Leé la lista antes de creerle: la clasifica un modelo, y puede entrar un pedido que no es exactamente lo que vende el usuario.
