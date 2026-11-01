# -*- coding: utf-8 -*-
"""Tabla del caso 1 (columna elástica): exacto · Geotechnic (T6) · OpenSees (4 elementos). GEO5 por interfaz: ver pendiente en la bitácora."""
import json
ts = json.load(open("ts_columna.json")); o = json.load(open("os_columna.json")); ex = ts["uy_cima_exacto"]
L = ["Caso 1 · columna elástica 2x10 m, E 20000 kPa, nu 0.3, gamma 18 kN/m3 (deformación plana, lados sin ux, base fija)",
     "Exacto: uy(cima) = -gamma H^2/(2M) = %.6f m ;  sy(base) = %.1f kPa" % (ex, ts["sy_base_exacto"]), "",
     "%-22s %14s %14s %24s" % ("motor / elemento", "uy cima (m)", "dif. exacto (m)", "dif. sy (kPa)")]
L.append("%-22s %14.6f %14.2e %24s" % ("Geotechnic T6 (7 pt)", ts["uy_cima"], ts["uy_cima"] - ex, "%.2e (en cada pto Gauss)" % ts["dif_sy_max"]))
for t in ("quad", "bbarQuad", "SSPquad", "tri31"):
    r = o[t]; L.append("%-22s %14.6f %14.2e %24s" % ("OpenSees " + t, r["uy_cima"], r["uy_cima"] - ex, "%.2e (media/elemento)" % r["dif_sy_media_elemento"]))
L += ["", "Lectura: el desplazamiento de la cima sale exacto en todos (el campo es cuadrático y lo reproducen los nudos);",
      "las tensiones son exactas en el T6 (campo cuadrático) y por elemento en quad/SSPquad/bbarQuad; tri31 (deformación constante) falla ±gamma*dy/6 = 3 kPa, como debe."]
open("tabla_columna.txt", "w", encoding="utf-8").write("\n".join(L) + "\n"); print("\n".join(L))
