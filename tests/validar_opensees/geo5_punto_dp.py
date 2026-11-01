# -*- coding: utf-8 -*-
"""Caso 2 · el MISMO punto con la réplica de GEO5 (geo5_returnmap.dp_return_g5), validada contra las funciones NATIVAS de FRGeoFEM.exe
(Set_MJPMJPP, residuo y jacobiano a 0.0; el retorno a 1e-13; ver EXTRAIDO_GeoFEM_DP_returnmap.md)."""
import sys, json, math, os
import numpy as np
sys.path.insert(0, r"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\Demo04_replica\talud_python_3etapas")
import geo5_returnmap as g
d = json.load(open(sys.argv[1]))
E, nu, phi, c = d["E"], d["nu"], math.radians(d["phi"]), d["c"]
G = E / (2 * (1 + nu)); K = E / (3 * (1 - 2 * nu)); a = K + 4 * G / 3; b = K - 2 * G / 3
De = np.array([[a, b, b, 0], [b, a, b, 0], [b, b, a, 0], [0, 0, 0, G]])
s = math.sin(phi); al = 2 * s / (math.sqrt(3) * (3 + s)); k = 2 * math.sqrt(3) * c * math.cos(phi) / (3 + s)
sig = np.zeros(4); out = []
for i, p in enumerate(d["paso"]):
    sig, _ = g.dp_return_g5(sig, np.array([p[0], p[1], 0.0, p[2]]), al, k, De)
    out.append({"paso": i + 1, "sig": [float(x) for x in sig]})
json.dump(out, open(sys.argv[2], "w")); print("GEO5 (réplica nativa):", len(out), "pasos")
