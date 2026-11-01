# -*- coding: utf-8 -*-
"""Tanda 13: peores PG del paso k (pasos13.ts) frente al Restart_Step de GEO5. Uso: python peor_paso.py k"""
import sys, os, numpy as np
AQUI = os.path.dirname(os.path.abspath(__file__)); T9 = os.path.join(AQUI, "..", "t9"); sys.path.insert(0, T9)
exec(open(os.path.join(T9, "orden_gp.py"), encoding="utf-8").read().split('if __name__')[0])
FM = os.path.join(AQUI, "..", "..", "..", "..", "ingenieria-inversa", "hekatan-geo5-bridge", "geofem_capture", "files_muro")
P = np.array([6, 2, 0, 1, 3, 4, 5]); ne = len(ELE); k = int(sys.argv[1])
RS = ["160230", "160235", "160239", "160243", "160246", "160249", "160252", "160255", "160259", "160302"]
def g2m(s): return np.stack([s[..., 0], s[..., 1], s[..., 3], s[..., 2]], -1)
g = lee(os.path.join(FM, RS[k - 1] + "_Restart_Step.bin")); SG = g2m(g["sig"][:, P]); PG = g["epl"][:, P]; FL = g["fl"][:, P]
SO = np.fromfile(os.path.join(AQUI, "p13_k%d_sig.bin" % k), "<f8").reshape(ne, 7, 4)[23:]; PO = np.fromfile(os.path.join(AQUI, "p13_k%d_epl.bin" % k), "<f8").reshape(ne, 7, 4)[23:]
d = np.linalg.norm(SO - SG, axis=-1); o = np.argsort(d.ravel())[::-1][:10]
plG = np.abs(PG[..., :3]).sum(-1) > 1e-14; plO = np.abs(PO).sum(-1) > 1e-14
print("elem pg |Δσ| kPa  σ GEO5 (xx yy zz xy)  σ motor  εp G5/mot  bandera  x y")
for i in o:
    kk, q = divmod(i, 7); e = kk + 23
    print("%4d %d %.3e  %s  %s  %d/%d  %d  %.2f %.2f" % (e, q, d[kk, q], np.round(SG[kk, q], 4), np.round(SO[kk, q], 4), plG[kk, q], plO[kk, q], FL[kk, q], X[ELE[e][:3]].mean(), Y[ELE[e][:3]].mean()))
s = np.where(plG & ~plO); print("plásticos solo en GEO5:", [(int(a) + 23, int(b)) for a, b in zip(*s)])
