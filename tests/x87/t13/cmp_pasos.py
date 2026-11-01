# -*- coding: utf-8 -*-
"""Tanda 13: estado tras cada paso de carga (pasos13.ts) frente a los Restart_Step de GEO5 de la fase de peso propio, por punto de Gauss."""
import sys, os, numpy as np
AQUI = os.path.dirname(os.path.abspath(__file__)); T9 = os.path.join(AQUI, "..", "t9"); sys.path.insert(0, T9)
exec(open(os.path.join(T9, "orden_gp.py"), encoding="utf-8").read().split('if __name__')[0])
FM = os.path.join(AQUI, "..", "..", "..", "..", "ingenieria-inversa", "hekatan-geo5-bridge", "geofem_capture", "files_muro")
P = np.array([6, 2, 0, 1, 3, 4, 5]); ne = len(ELE)
RS = ["160230", "160235", "160239", "160243", "160246", "160249", "160252", "160255", "160259", "160302"]
def g2m(s): return np.stack([s[..., 0], s[..., 1], s[..., 3], s[..., 2]], -1)
def rel(a, b): return np.linalg.norm(a - b) / np.linalg.norm(b)
print("paso | Restart | rel σ | max|Δσ| kPa | rel εp | PG plást. GEO5/motor/ambos")
for k, rs in enumerate(RS, 1):
    fn = os.path.join(AQUI, "p13_k%d_sig.bin" % k)
    if not os.path.exists(fn): break
    g = lee(os.path.join(FM, rs + "_Restart_Step.bin"))
    SG, PG = g2m(g["sig"][:, P]), g["epl"][:, P]
    SO = np.fromfile(fn, "<f8").reshape(ne, 7, 4)[23:]; PO = np.fromfile(os.path.join(AQUI, "p13_k%d_epl.bin" % k), "<f8").reshape(ne, 7, 4)[23:]
    PO3 = np.stack([PO[..., 0], PO[..., 1], PO[..., 3]], -1); PG3 = PG[..., :3]
    plG = np.abs(PG3).sum(-1) > 1e-14; plO = np.abs(PO3).sum(-1) > 1e-14
    rp = rel(PO3, PG3) if np.linalg.norm(PG3) > 0 else np.linalg.norm(PO3)
    print("%2d | %s | %.2e | %.3e | %.2e | %d/%d/%d" % (k, rs, rel(SO, SG), np.abs(SO - SG).max(), rp, plG.sum(), plO.sum(), (plG & plO).sum()))
