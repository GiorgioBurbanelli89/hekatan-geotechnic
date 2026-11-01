# -*- coding: utf-8 -*-
"""Primera iteración (peldaño SRF, n.º de iteración) en que el |gi| de GEO5 y el del motor nativo se separan más de tol relativo.
   Solo cuenta el primer intento (Current time 1.0) de cada peldaño de GEO5: sus «Load step Relaxation» no existen en el nativo.
   python primera_dif.py <dir> [tol=1e-3]"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
d = sys.argv[1]; tol = float(sys.argv[2]) if len(sys.argv) > 2 else 1e-3
import importlib.util
txt = open(os.path.join(d, "Log_File.txt"), errors="ignore").read()
G = []
for blk in txt.split("===== REDUCTION STEP =====")[1:]:
    blk = blk.split("Load step Relaxation")[0]
    G.append([tuple(float(x) for x in m.groups()) for m in re.finditer(r"Iteration process:\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", blk)])
N, cur = [], []
for l in open(os.path.join(d, "nat.log"), errors="ignore"):
    m = re.search(r"SRF=(\S+) it=\s*(\d+) eta=(\S+) DNorm=(\S+) OBFNorm=(\S+) ENorm=(\S+) \|gi\|=(\S+)", l)
    if m: cur.append((float(m.group(1)), int(m.group(2)), float(m.group(3)), float(m.group(4)), float(m.group(5)), float(m.group(6)), float(m.group(7)))); continue
    if "SRM rs" in l: N.append(cur); cur = []
tot = 0
for k, (g, n) in enumerate(zip(G, N)):
    for i, (a, b) in enumerate(zip(g, n)):
        tot += 1
        r = abs(a[5] - b[6]) / max(abs(a[5]), 1e-12)
        if r > tol and max(a[5], b[6]) > 1e-10:
            print("%s: primera diferencia en el peldaño %d (SRF %.4f), iteración %d: GEO5 eta %.4f |gi| %.4e  ·  nativo eta %.4f |gi| %.4e  (tras %d iteraciones iguales)"
                  % (os.path.basename(d), k, b[0], i + 1, a[1], a[5], b[2], b[6], tot - 1))
            sys.exit(0)
    if len(g) != len(n): print("%s: peldaño %d (SRF %.4f): mismo |gi| pero n.º de iteraciones distinto %d vs %d (tras %d iguales)" % (os.path.basename(d), k, n[0][0] if n else 0, len(g), len(n), tot)); sys.exit(0)
print("%s: %d iteraciones IGUALES (|gi| a %.0e relativo) en %d peldaños" % (os.path.basename(d), tot, tol, min(len(G), len(N))))
