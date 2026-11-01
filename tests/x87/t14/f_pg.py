# -*- coding: utf-8 -*-
"""Tanda 14: σ, F de Mohr-Coulomb, bandera y εp de un PG (motor 0-based e, q) en cada paso de carga: GEO5 (Restart_Step) frente al motor (t13/p13_k*)."""
import sys, os, numpy as np
AQUI = os.path.dirname(os.path.abspath(__file__)); T9 = os.path.join(AQUI, "..", "t9"); sys.path.insert(0, T9)
exec(open(os.path.join(T9, "orden_gp.py"), encoding="utf-8").read().split('if __name__')[0])
FM = os.path.join(AQUI, "..", "..", "..", "..", "ingenieria-inversa", "hekatan-geo5-bridge", "geofem_capture", "files_muro")
P = np.array([6, 2, 0, 1, 3, 4, 5]); ne = len(ELE)
RS = ["160230", "160235", "160239", "160243", "160246", "160249", "160252", "160255", "160259", "160302"]
def g2m(s): return np.stack([s[..., 0], s[..., 1], s[..., 3], s[..., 2]], -1)
def F(s, phi=30.0):
    sp = np.sin(np.radians(phi)); c_ = (s[0] + s[1]) / 2; R = np.hypot((s[0] - s[1]) / 2, s[3]); p = sorted([c_ + R, c_ - R, s[2]], reverse=True)
    f = lambda a, b: 0.5 * (a - b) + 0.5 * (a + b) * sp
    return f(p[0], p[2]), f(p[0], p[1]), f(p[1], p[2]), p
e, q = int(sys.argv[1]), int(sys.argv[2]); kk = e - 23; pre = sys.argv[3] if len(sys.argv) > 3 else os.path.join(AQUI, "..", "t13", "p13")
for k, rs in enumerate(RS, 1):
    g = lee(os.path.join(FM, rs + "_Restart_Step.bin")); SG = g2m(g["sig"][kk, P[q]]); EG = g["epl"][kk, P[q]]; fl = g["fl"][kk, P[q]]
    fn = "%s_k%d_sig.bin" % (pre, k)
    SO = np.fromfile(fn, "<f8").reshape(ne, 7, 4)[e, q] if os.path.exists(fn) else np.full(4, np.nan)
    EO = np.fromfile("%s_k%d_epl.bin" % (pre, k), "<f8").reshape(ne, 7, 4)[e, q] if os.path.exists(fn) else np.full(4, np.nan)
    fg, fo = F(SG), F(SO)
    print("k%2d fl %3d  G5 σ %s F %s εp %s" % (k, fl, np.array2string(SG, precision=10), np.array2string(np.array(fg[:3]), precision=3), np.array2string(EG, precision=4)))
    print("        mot σ %s F %s εp %s  |Δσ| %.2e" % (np.array2string(SO, precision=10), np.array2string(np.array(fo[:3]), precision=3), np.array2string(EO, precision=4), np.abs(SO - SG).max()))
