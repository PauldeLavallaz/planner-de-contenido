#!/usr/bin/env python3
"""Hook UserPromptSubmit: título legible para las conversaciones que nacen de un mensaje del planner.

Sin esto, una conversación abierta pegando una propuesta queda con un título como «Publicar historias
20261105022225-2ade50»: la app le pide el título a un modelo con la instrucción de conservar los identificadores tal
cual, así que ni una primera línea clara alcanza y hay que fijarlo.

Cada botón del planner copia un mensaje cuya primera línea es «[Etiqueta] qué se está haciendo». Si es el primer
mensaje de la conversación, esa línea pasa a ser el título. Pegado en una conversación que ya existe no la renombra.

La espera es porque el título del hook y el automático valen lo mismo para la app: gana el último, y el automático
llega a lo sumo 2 s después de abrir la conversación. Sólo espera un mensaje del planner que abre conversación; los
demás pasan de largo. Si algo falla, no frena el mensaje: queda el título automático.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

ETIQUETAS = ("Feedback", "Planificación", "Agenda", "Producción", "Anuncios")
LINEA = re.compile(r"^\[(?:%s)\] \S.{2,}$" % "|".join(ETIQUETAS))
ESPERA_S = 3.0


def titulo_de(prompt: str) -> str | None:
    lineas = prompt.strip().splitlines()
    primera = lineas[0].strip() if lineas else ""
    return primera if LINEA.match(primera) else None


def abre_conversacion(transcript: str | None) -> bool:
    if not transcript or not os.path.exists(transcript):
        return True
    with open(transcript, encoding="utf-8", errors="replace") as f:
        for linea in f:
            try:
                if json.loads(linea).get("type") == "user":
                    return False
            except ValueError:
                continue
    return True


def main() -> None:
    entrada = json.load(sys.stdin)
    titulo = titulo_de(entrada.get("prompt") or "")
    if not titulo or not abre_conversacion(entrada.get("transcript_path")):
        return
    time.sleep(float(os.environ.get("TITULO_PLANNER_ESPERA", ESPERA_S)))
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "sessionTitle": titulo}}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # un hook de título nunca frena el mensaje
        print(f"titulo_desde_planner: {e}", file=sys.stderr)
    sys.exit(0)
