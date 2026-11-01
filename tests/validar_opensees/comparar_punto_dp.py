# -*- coding: utf-8 -*-
"""Tabla del caso 2: GEO5 (réplica de sus funciones nativas) · Geotechnic · OpenSees, por paso, a 4 decimales (kPa); diferencia respecto a GEO5."""
import json, sys
g5, ts, osx = (json.load(open(f)) for f in ("geo5_dp.json", "ts_dp.json", "os_dp.json"))
fase = lambda n: "A confin." if n <= 5 else "B corte" if n <= 19 else "C inversa" if n <= 27 else "D expans." if n <= 35 else "E recomp."
L = []; mx = {"ts": 0.0, "os": 0.0}; mxp = {"ts": 0.0, "os": 0.0}
L.append("Paso Fase      comp   GEO5        Geotechnic  dif.GEO5    OpenSees    dif.GEO5")
for a, b, c in zip(g5, ts, osx):
    for i, nom in ((0, "sxx"), (1, "syy"), (3, "txy")):
        va, vb, vc = a["sig"][i], b["sig"][i], c["sig"][i]
        L.append("%4d %-10s %s %11.4f %11.4f %11.4f %11.4f %11.4f" % (a["paso"], fase(a["paso"]), nom, va, vb, vb - va, vc, vc - va))
        mx["ts"] = max(mx["ts"], abs(vb - va)); mx["os"] = max(mx["os"], abs(vc - va))
    mxp["ts"] = max(mxp["ts"], abs(b["sig"][2] - a["sig"][2]))
tot = "\nMáx |dif| (kPa): Geotechnic %.6f · OpenSees %.6f   (σzz de Geotechnic: máx dif %.2e; OpenSees no entrega σzz con tri31 en plano)" % (mx["ts"], mx["os"], mxp["ts"])
open("tabla_punto_dp.txt", "w", encoding="utf-8").write("\n".join(L) + tot + "\n")
print("\n".join(L[:8])); print("..."); print("\n".join(L[-6:])); print(tot)
# dónde se separa OpenSees: por fase
for f in ("A confin.", "B corte", "C inversa", "D expans.", "E recomp."):
    d = max(abs(c["sig"][i] - a["sig"][i]) for a, c in zip(g5, osx) if fase(a["paso"]) == f for i in (0, 1, 3))
    e = max(abs(b["sig"][i] - a["sig"][i]) for a, b in zip(g5, ts) if fase(a["paso"]) == f for i in (0, 1, 3))
    print("%-10s  máx dif Geotechnic %.2e   OpenSees %.2e" % (f, e, d))
