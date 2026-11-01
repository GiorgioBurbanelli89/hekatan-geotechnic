# -*- coding: utf-8 -*-
"""Tanda 13: estado de SRF 1 del MOTOR REAL (correr13.ts: s13_<motor>_<bits>_*.bin) frente a GEO5 160304_Restart_Step, por punto de Gauss.
Uso: python cmp_srf1.py wasm_115"""
import sys, os, numpy as np
AQUI = os.path.dirname(os.path.abspath(__file__)); T9 = os.path.join(AQUI, "..", "t9"); sys.path.insert(0, T9)
exec(open(os.path.join(T9, "orden_gp.py"), encoding="utf-8").read().split('if __name__')[0])
FM = os.path.join(AQUI, "..", "..", "..", "..", "ingenieria-inversa", "hekatan-geo5-bridge", "geofem_capture", "files_muro")
P = np.array([6, 2, 0, 1, 3, 4, 5]); pre = sys.argv[1]
ne = len(ELE); ns = ne - 23; nn = len(X); ndof = 2 * nn
g = lee(os.path.join(FM, "160304_Restart_Step.bin"))
sG, eG, pG, fG = g["sig"][:, P], g["eps"][:, P], g["epl"][:, P], g["fl"][:, P]
def g2m(s): return np.stack([s[..., 0], s[..., 1], s[..., 3], s[..., 2]], -1)   # GEO5 (x y xy z) -> motor (x y z xy)
rd = lambda k: np.fromfile(os.path.join(AQUI, "s13_%s_%s.bin" % (pre, k)), "<f8")
SO = rd("sig").reshape(ne, 7, 4)[23:]; PO = rd("epl").reshape(ne, 7, 4)[23:]; EO = rd("eps").reshape(ne, 7, 4)[23:]; u = rd("u")
SG = g2m(sG)
def rel(a, b): return np.linalg.norm(a - b) / np.linalg.norm(b)
print("            | rel ||dif||/||GEO5|| | max|dif| | max|GEO5| | corr")
for nm, a, b in [("sig xx", SO[..., 0], SG[..., 0]), ("sig yy", SO[..., 1], SG[..., 1]), ("sig zz", SO[..., 2], SG[..., 2]), ("sig xy", SO[..., 3], SG[..., 3]),
                 ("eps x", EO[..., 0], eG[..., 0]), ("eps y", EO[..., 1], eG[..., 1]), ("gam xy", EO[..., 3], eG[..., 2]),
                 ("eps_p x", PO[..., 0], pG[..., 0]), ("eps_p y", PO[..., 1], pG[..., 1]), ("gam_p xy", PO[..., 3], pG[..., 2])]:
    print("%-11s | %.4f | %.3e | %.3e | %.5f" % (nm, rel(a, b), np.abs(a - b).max(), np.abs(b).max(), np.corrcoef(a.ravel(), b.ravel())[0, 1]))
plG = np.abs(pG).sum(-1) > 1e-14; plO = np.abs(PO).sum(-1) > 1e-14
print("PG con eps_p != 0: GEO5 %d · motor %d · ambos %d" % (plG.sum(), plO.sum(), (plG & plO).sum()))
print("banderas GEO5:", dict(zip(*np.unique(fG, return_counts=True))))
def fint(S, gorder):
    F = np.zeros(ndof)
    for k in range(ns):
        e = k + 23; s = S[k]
        for q, (B, w, N) in enumerate(Bw(e)):
            v = np.array([s[q, 0], s[q, 1], s[q, 2]]) if gorder else np.array([s[q, 0], s[q, 1], s[q, 3]])
            f = B.T @ v * w; F[2 * ELE[e]] += f[0::2]; F[2 * ELE[e] + 1] += f[1::2]
    return F
fixed = set(m["FIXED"]); lib = np.array([d for d in range(ndof) if d not in fixed])
FG, FO = fint(sG, 1), fint(SO, 0)
print("|F_int suelo| libres: GEO5 %.4f · motor %.4f · |dif| %.4f" % (np.linalg.norm(FG[lib]), np.linalg.norm(FO[lib]), np.linalg.norm((FG - FO)[lib])))
print("max|u| motor %.3f mm (GEO5 160302 ADisp max 61.135 mm)" % (1e3 * np.abs(u).max()))
d = np.linalg.norm(SO - SG, axis=-1); o = np.argsort(d.ravel())[::-1][:8]
print("peores PG (elem, pg, |dif| kPa, |sig GEO5|, eps_p G5/motor, x, y):")
for i in o:
    k, q = divmod(i, 7); e = k + 23
    print("  %4d %d  %.3f  %.3f  %d/%d  %.2f %.2f" % (e, q, d[k, q], np.linalg.norm(SG[k, q]), plG[k, q], plO[k, q], X[ELE[e][:3]].mean(), Y[ELE[e][:3]].mean()))
