# -*- coding: utf-8 -*-
"""Tanda 14: Δε por iteración en el PG vigilado con el u de GEO5 (cap14.py, aviso cód 0 que cambia u) frente al Δε del motor (pg_k*.json).
Uso: python de_g5.py <carpeta_cap> [E=520] [Q=2] [K=3]"""
import sys, os, glob, json, numpy as np
AQ = os.path.dirname(os.path.abspath(__file__)); d = os.path.abspath(sys.argv[1])
os.environ["T11_INPUT"] = os.path.join(d, "Input.txt"); sys.path.insert(0, os.path.join(AQ, "..", "t11")); sys.path.insert(0, os.path.join(AQ, "..", "t9"))
import mapa
exec(open(os.path.join(AQ, "..", "t9", "orden_gp.py"), encoding="utf-8").read().split('if __name__')[0])
E = int(sys.argv[2]) if len(sys.argv) > 2 else 520; Q = int(sys.argv[3]) if len(sys.argv) > 3 else 2; K = int(sys.argv[4]) if len(sys.argv) > 4 else 3
fs = sorted(glob.glob(os.path.join(d, "cap", "*.npz"))); U = []; prev = None
for f in fs:
    z = np.load(f); u = mapa.a_json(z["v"][0])
    if prev is None or np.abs(u - prev).max() > 0: U.append((int(z["ev"]), u)); prev = u
B, w, _ = Bw(E)[Q]; nd = ELE[E]; dof = np.ravel([[2 * n, 2 * n + 1] for n in nd])
L = json.load(open(os.path.join(AQ, "pg_k%d_e%d_q%d.json" % (K, E, Q))))
for i in range(1, len(U)):
    du = U[i][1] - U[i - 1][1]; e3 = B @ du[dof]; deG = np.array([e3[0], e3[1], 0, e3[2]])
    deM = np.array(L[i - 1]["de"]) if i - 1 < len(L) else np.full(4, np.nan)
    print("it %d ev %d  Δε G5 %s\n           mot %s  rel %.3e" % (i, U[i][0], deG, deM, np.linalg.norm(deG - deM) / np.linalg.norm(deG)))
