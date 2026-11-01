# -*- coding: utf-8 -*-
"""Tabla final: GEO5 (juez) · Geotechnic · OpenSees, con la diferencia respecto a GEO5. Lee los .json de cada caso; los FS de interfaz salen de los registros."""
import json, os
d = lambda f: json.load(open(f))
g5c = d("geo5_columna.json"); tsc = d("ts_columna.json"); osc = d("os_columna.json")
g5p, tsp, osp = d("geo5_dp.json"), d("ts_dp.json"), d("os_dp.json")
uy5 = g5c["uy_cima"][0]
L = ["# Validación de Hekatan Geotechnic · GEO5 (juez) · Geotechnic · OpenSees — 1-nov-2026", "",
     "Origen del dato de GEO5:  [INT] leído por la INTERFAZ gráfica (sesiones anteriores);  [SOL] el SOLVER REAL de GEO5 (FRGeoFEM_2024.exe) sin ventana, mismo ejecutable que usa la interfaz;",
     "[NAT] las funciones NATIVAS del ejecutable ejecutadas (réplica validada a 1e-13).  Diferencias = valor − GEO5.", "",
     "## Caso 1 · columna elástica por gravedad (2×10 m, E 20000, ν 0.3, γ 18; deformación plana)", "",
     "| motor | elemento | uy cima (m) | dif. con GEO5 (m) |", "|---|---|---|---|",
     "| **GEO5 [SOL]** | T6 (40 elem) | %.8f | — |" % uy5,
     "| Geotechnic | T6 (40 elem) | %.8f | %+.2e |" % (tsc["uy_cima"], tsc["uy_cima"] - uy5)]
for t in ("quad", "bbarQuad", "SSPquad", "tri31"):
    L.append("| OpenSees | %s (20/40 elem) | %.8f | %+.2e |" % (t, osc[t]["uy_cima"], osc[t]["uy_cima"] - uy5))
L += ["| exacto | — | %.8f | %+.2e |" % (tsc["uy_cima_exacto"], tsc["uy_cima_exacto"] - uy5), "",
      "(El −1.4e-9 de todas las filas es el redondeo a 8 cifras que imprime GEO5: todos coinciden con la solución exacta −0.0334285714 m.)", "",
      "## Caso 2 · un punto de Gauss, Drucker-Prager «extension» (39 pasos; kPa)", "",
      "| fase | GEO5 [NAT] | Geotechnic: máx. dif. | OpenSees: máx. dif. |", "|---|---|---|---|"]
fase = lambda n: "A confinamiento" if n <= 5 else "B corte (cono)" if n <= 19 else "C corte inverso" if n <= 27 else "D expansión al ápice" if n <= 35 else "E recompresión"
for f in ("A confinamiento", "B corte (cono)", "C corte inverso", "D expansión al ápice", "E recompresión"):
    de = max(abs(b["sig"][i] - a["sig"][i]) for a, b in zip(g5p, tsp) if fase(a["paso"]) == f for i in (0, 1, 3))
    do = max(abs(c["sig"][i] - a["sig"][i]) for a, c in zip(g5p, osp) if fase(a["paso"]) == f for i in (0, 1, 3))
    L.append("| %s | referencia | %.4f | %.4f |" % (f, de, do))
L += ["", "OpenSees = GEO5 a ≤ 3e-6 kPa mientras el estado está en el cono; **se separa al llegar al ápice / corte en tracción** (no vuelve al vértice; causa dentro de OpenSees sin diagnosticar).", "",
      "## Caso 3 · talud con agua (30°, φ 28, c 7, γ 18.5, γsat 20.5, SRM por c-φ) — factor de seguridad", "",
      "| | GEO5 [INT] | Geotechnic (447 T6, malla propia) | dif. | OpenSees SSPquad dx 0.5 (tol 1e-6) | dif. | OpenSees dx 0.25 (tol 1e-3) | dif. |", "|---|---|---|---|---|---|---|---|",
      "| sin agua | 1.9800 | 1.9299 | −0.0501 | 1.5330 | −0.4470 | 1.5040 | −0.4760 |",
      "| con GWT | 1.7600 | 1.7149 | −0.0451 | 1.3750 | −0.3850 | — | — |",
      "| cociente GWT/sin | 0.8889 | 0.8886 | −0.0003 | 0.8969 | +0.0080 | — | — |", "",
      "OpenSees baja al refinar (dx 0.5 con tolerancia floja da 1.592; dx 0.25 da 1.504): su FS de malla fina es ≈ 1.50. El **efecto del agua** (−11 %) lo reproducen los tres. La diferencia absoluta con GEO5 (≈ −24 %) NO es el material (mismo cono, probado en el caso 2) sino el **elemento** (SSPquad contra T6) y la **definición del FS** (OpenSees: el paso donde Newton ya no cierra; GEO5: el escalón de la escalera 0.9 donde se agotan las relajaciones).", "",
      "## Caso 4 · Demo04 (talud, DP, 3 etapas, malla de GEO5) — FS", "",
      "| | etapa 1 | etapa 2 | etapa 3 |", "|---|---|---|---|", "| GEO5 [INT] | 1.6935 | 1.4810 | 1.6935 |", "| Geotechnic (malla GEO5) | 1.6935 | 1.4810 | 1.6935 |", "| dif. | 0.0000 | 0.0000 | 0.0000 |", "| OpenSees | no corrido (necesita T6; no se usó un elemento distinto en la malla de GEO5) | | |", "",
      "## Caso 5 · un T6 con c bajo (experimento b) — ¿converge?", "",
      "| c (kPa) | GEO5 [SOL] | Geotechnic |", "|---|---|---|"]
t1 = {x["c"]: x for x in d("ts_1elem.json")} if os.path.exists("ts_1elem.json") else {}
for c in ("0", "0.001", "0.01", "0.1", "1", "5", "20"):
    f = "geo5_1elem_q0_c%s.json" % c
    g = ("converge" if d(f)["convergio"] else "NO converge") if os.path.exists(f) else ("NO converge (q=0, 0 mm)" if c == "0" else "—")
    tt = t1.get(float(c)); tg = ("converge" if tt["conv"] else "NO converge") if tt else "—"
    L.append("| %s | %s | %s |" % (c, g, tg))
L += ["", "Elástico (c = 20): u(nudo 3) = (−2.299281e-4, −2.263908e-4) m en GEO5 [SOL] y (−2.2993e-4, −2.2639e-4) m en Geotechnic: igual a 4 cifras.", "",
      "## Caso 6 · muro de Manabí (Mohr-Coulomb) — [INT] GEO5 contra Geotechnic", "",
      "| magnitud | GEO5 [INT] | Geotechnic | dif. |", "|---|---|---|---|", "| d_z máx (mm) | 27.1000 | 27.1241 | +0.0241 |", "| coronación (mm) | 20.5000 | 20.4500 | −0.0500 |", "| FS (SRM) | 1.3600 | 1.4737 (WASM; TS da 2.15) | +0.1137 |",
      "| OpenSees | no aplica: no tiene Mohr-Coulomb de hexágono (solo cono DP) | | |", "",
      "## Experimento (a) · dinámico del muro, a(t) = 0 (solver real de GEO5, 1.4 s)", "",
      "| variante | máx|ux| (m) | máx|uy| (m) |", "|---|---|---|", "| original | 7.592e-03 | 1.246e-04 |", "| a = 0 y campo libre = 0 | 0.000e+00 | 0.000e+00 |", "| a = 0, campo libre original | 7.438e-03 | 5.167e-03 |", ""]
open("TABLA_TRES_COLUMNAS.md", "w", encoding="utf-8").write("\n".join(L)); print("\n".join(L[:40]))
