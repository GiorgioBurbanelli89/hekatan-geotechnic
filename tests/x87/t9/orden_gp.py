# -*- coding: utf-8 -*-
"""Busca el orden de los 7 PG de GEO5 frente a los del motor: fe (cabecera del bloque) = sum_q B_q^T sig_q w_q."""
import numpy as np, json, os, sys, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rs_gp import lee
AQUI = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(AQUI, "..", "..", "..", "examples", "geofem_muro_manabi_malla.json"), encoding="utf-8"))
X = np.array(m["X"]); Y = np.array(m["Y"]); ELE = np.array(m["ELE"])
c7, C7, e7, E7 = 0.1012865073235, 0.7974269853531, 0.4701420641051, 0.0597158717898
GP = [(1/3, 1/3), (c7, c7), (C7, c7), (c7, C7), (e7, e7), (E7, e7), (e7, E7)]
GW = [0.225/2] + [0.1259391805448/2]*3 + [0.1323941527885/2]*3
def t6(L1, L2):
    L3 = 1 - L1 - L2
    N = [L1*(2*L1-1), L2*(2*L2-1), L3*(2*L3-1), 4*L1*L2, 4*L2*L3, 4*L3*L1]
    d1 = [4*L1-1, 0, -(4*L3-1), 4*L2, -4*L2, 4*L3-4*L1]; d2 = [0, 4*L2-1, -(4*L3-1), 4*L1, 4*L3-4*L2, -4*L1]
    return np.array(N), np.array(d1), np.array(d2)
def Bw(e):
    nd = ELE[e]; xs, ys = X[nd], Y[nd]; out = []
    for q in range(7):
        N, d1, d2 = t6(*GP[q]); j11, j12, j21, j22 = d1@xs, d1@ys, d2@xs, d2@ys; dJ = j11*j22 - j12*j21
        dNx = (j22*d1 - j12*d2)/dJ; dNy = (-j21*d1 + j11*d2)/dJ
        B = np.zeros((3, 12)); B[0, 0::2] = dNx; B[1, 1::2] = dNy; B[2, 0::2] = dNy; B[2, 1::2] = dNx
        out.append((B, dJ*GW[q], N))
    return out
def fint_e(e, s, perm):    # s: 7x4 (sx sy txy sz) de GEO5; perm[q_motor] = q_geo5
    f = np.zeros(12)
    for q, (B, w, _) in enumerate(Bw(e)):
        sq = s[perm[q]]; f += B.T @ np.array([sq[0], sq[1], sq[2]]) * w
    return f
if __name__ == "__main__":
    d = lee(sys.argv[1])
    perms = []
    for a in itertools.permutations([1, 2, 3]):
        for b_ in itertools.permutations([4, 5, 6]):
            for sw in (0, 1):
                p = [0] + list(a) + list(b_)
                if sw: p = [0] + list(b_) + list(a)
                perms.append(p)
    best = []
    for p in perms:
        err = 0
        for k in range(0, 2661, 97):
            e = k + 23; err += np.abs(fint_e(e, d["sig"][k], p) - d["fe"][k]).max()
        best.append((err, p))
    best.sort(); print(best[:4])
