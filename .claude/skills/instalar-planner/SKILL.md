---
name: instalar-planner
description: Instala y configura el planner de contenido de punta a punta (requisitos, Postiz, carpetas y servicio), o diagnostica por qué no anda.
---

# Instalar el planner

Seguí [INSTALAR.md](../../../INSTALAR.md) en orden, desde el paso que falte. Para saber dónde está parado el usuario:

```bash
python3 engine/doctor.py --json
```

- Cada `check` con `ok: false` y `required: true` es un paso pendiente; `fix` dice cómo resolverlo.
- Si `planner.config.json` no existe, arrancá por el paso 2.
- Si ya hay cuentas y fuentes, saltá a verificar con `python3 engine/carpetas.py probar` y abrir el planner.

Explicá cada paso en una frase antes de hacerlo. Instalar programas, mover archivos y cualquier acción en Postiz requieren el OK del usuario. Al terminar, el planner tiene que abrir en http://127.0.0.1:4180 y mostrar sus piezas.
