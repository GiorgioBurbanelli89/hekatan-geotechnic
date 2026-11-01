# -*- coding: utf-8 -*-
"""Tabla GEO5 | Geotechnic | Abaqus (misma malla) desde resultados/*.json → resultados/tabla.md y tabla.json.
Juicio de Abaqus contra GEO5: 🟢 ≤ 2 %, 🟡 ≤ 5 %, 🔴 > 5 %."""
import glob, json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
filas = []
for p in sorted(glob.glob(os.path.join(AQUI, "resultados", "*.json"))):
    if p.endswith("tabla.json"): continue
    f = json.load(open(p, encoding="utf-8"))
    g, h, a = f.get("FS_GEO5"), f.get("FS_geotechnic"), f.get("FS_abaqus")
    d = None if not (g and a) else 100 * (a - g) / g
    j = "—" if d is None else ("🟢" if abs(d) <= 2 else "🟡" if abs(d) <= 5 else "🔴")
    filas.append(dict(caso=f["caso"], modelo=f["material"]["modelo"], malla=f["malla"], FS_GEO5=g, FS_geotechnic=h,
                      FS_abaqus=a, dif_abaqus_geo5_pct=None if d is None else round(d, 2), juicio=j, s0=f["s0"], fin=f["fin"]))
L = ["| caso | material | malla común | GEO5 | Geotechnic | Abaqus | Abaqus−GEO5 | juicio |", "|---|---|---|---|---|---|---|---|"]
for r in filas:
    L.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (
        r["caso"], r["modelo"].upper(), r["malla"], r["FS_GEO5"], r["FS_geotechnic"], r["FS_abaqus"],
        "—" if r["dif_abaqus_geo5_pct"] is None else "%+.2f %%" % r["dif_abaqus_geo5_pct"], r["juicio"]))
open(os.path.join(AQUI, "resultados", "tabla.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
json.dump(filas, open(os.path.join(AQUI, "resultados", "tabla.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("\n".join(L))
