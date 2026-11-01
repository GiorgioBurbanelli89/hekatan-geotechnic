# -*- coding: utf-8 -*-
"""Tanda 14: incremento de u en el paso K tras cada iteración, GEO5 (cap14) frente al motor (it_k{K}_i.bin), nudo a nudo; peores nudos de la it 1."""
import sys, os, glob, numpy as np
AQ = os.path.dirname(os.path.abspath(__file__)); d = os.path.abspath(sys.argv[1]); K = int(sys.argv[2]) if len(sys.argv) > 2 else 3
os.environ["T11_INPUT"] = os.path.join(d, "Input.txt"); sys.path.insert(0, os.path.join(AQ, "..", "t11")); import mapa
fs = sorted(glob.glob(os.path.join(d, "cap", "*.npz"))); U = []; prev = None
for f in fs:
    z = np.load(f); u = mapa.a_json(z["v"][0])
    if prev is None or np.abs(u - prev).max() > 0: U.append(u); prev = u
X, Y = mapa.X, mapa.Y
for i in range(1, len(U)):
    fn = os.path.join(AQ, "it_k%d_%d.bin" % (K, i))
    if not os.path.exists(fn): break
    g = U[i] - U[0]; m = np.fromfile(fn, "<f8"); dd = m - g
    (U[i] - U[i - 1]).astype("<f8").tofile(os.path.join(AQ, "g5_k%d_du%d.bin" % (K, i)))
    print("it %d |du G5| %.6e rel dif %.3e max %.3e" % (i, np.linalg.norm(g), np.linalg.norm(dd) / np.linalg.norm(g), np.abs(dd).max()))
    if i == int(os.environ.get("T14_IT", "1")):
        o = np.argsort(np.abs(dd))[::-1][:12]
        for j in o: print("   gdl %d nudo %d (%s) x %.3f y %.3f  G5 %.6e mot %.6e dif %.3e" % (j, j // 2, "xy"[j % 2], X[j // 2], Y[j // 2], g[j], m[j], dd[j]))
