# -*- coding: utf-8 -*-
"""Tanda 13: GEO5 (fase de peso propio 160244_Log_File: 10 pasos de 0.1 + SRM Log_File_geo5_real) frente al log del motor (correr13.ts),
paso a paso e iteración a iteración (η, |gi|). Uso: python cmp13.py log13_wasm_115.txt [n_lineas_detalle]"""
import re, sys, os
AQUI = os.path.dirname(os.path.abspath(__file__))
FM = os.path.join(AQUI, "..", "..", "..", "..", "ingenieria-inversa", "hekatan-geo5-bridge", "geofem_capture", "files_muro")
def g5(fn, tag):
    out, cur = [], None
    for l in open(fn, encoding="mbcs", errors="replace"):
        if "LOAD STEP" in l or "REDUCTION STEP" in l: cur = None
        m = re.match(r"Iteration process:\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", l)
        if m and float(m.group(6)) > 0:
            if cur is None: cur = []; out.append((tag, cur))
            cur.append((float(m.group(2)), float(m.group(3)), float(m.group(6))))
    return out
GC = g5(os.path.join(FM, "160244_Log_File.txt"), "carga"); GS = g5(os.path.join(AQUI, "..", "t12", "Log_File_geo5_real.txt"), "SRM")
M, prev = [], None
for l in open(sys.argv[1], encoding="utf-8", errors="replace"):
    m = re.match(r"\s+RS=(\d+) SRF=(\S+) it=\s*(\d+) eta=(\S+) DNorm=(\S+) .*\|gi\|=(\S+)", l)
    if m:
        key = (m.group(1), m.group(2))
        if key != prev: M.append((float(m.group(2)), [])); prev = key
        M[-1][1].append((float(m.group(4)), float(m.group(5)), float(m.group(6))))
MC = [x for x in M if x[0] == 1.0]; MS = [x for x in M if x[0] > 1.0]
nc = len(MC); G = GC + [("-", [])] * (nc - len(GC)) + GS; M = MC + MS   # GEO5 solo trae el log de los 4 primeros pasos de carga
print("paso | GEO5 tipo | SRF motor | it GEO5/motor | 1.ª it distinta (η G5/mot, |gi| G5/mot)")
for k in range(max(len(G), len(M))):
    tg, a = G[k] if k < len(G) else ("-", []); srf, b = M[k] if k < len(M) else (0, [])
    first = "-"
    for i in range(min(len(a), len(b))):
        if abs(a[i][0] - b[i][0]) > 1e-3 or abs(b[i][2] / a[i][2] - 1) > 2e-3:
            first = "it %d: η %.4f/%.4f |gi| %.4g/%.4g" % (i + 1, a[i][0], b[i][0], a[i][2], b[i][2]); break
    if first == "-" and len(a) != len(b): first = "n.º de it"
    print("%3d | %-5s | %.4f | %2d/%2d | %s" % (k + 1, tg, srf, len(a), len(b), first if first != "-" else "IGUAL"))
