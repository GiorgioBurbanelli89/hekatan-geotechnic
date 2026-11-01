# -*- coding: utf-8 -*-
"""Genera la trayectoria de deformación del caso 2 (suelo 1 del Demo04: E 21000, nu 0.3, phi 22.7, c 9; kPa)."""
import json, sys
P = {"E": 21000.0, "nu": 0.3, "phi": 22.7, "c": 9.0, "paso": []}
P["paso"] += [[-3e-4, -3e-4, 0.0]] * 5          # A: confinamiento isótropo (elástico)
P["paso"] += [[0.0, 0.0, 6e-4]] * 14            # B: corte creciente hasta plastificar (cono)
P["paso"] += [[0.0, 0.0, -1e-3]] * 8            # C: descarga y corte inverso (replastifica)
P["paso"] += [[4e-4, 4e-4, 0.0]] * 8            # D: expansión volumétrica hasta el ápice (corte en tracción)
P["paso"] += [[-6e-4, -6e-4, 0.0]] * 4          # E: vuelve a comprimir desde el ápice
json.dump(P, open(sys.argv[1] if len(sys.argv) > 1 else "trayectoria_dp.json", "w"))
print(len(P["paso"]), "pasos")
