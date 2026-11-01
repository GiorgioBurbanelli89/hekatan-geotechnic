# -*- coding: utf-8 -*-
"""Tanda 14: tangente 4×4 de GEO5 (fr14.py, tg.txt) en la it 1 del paso K, PG a PG del el. E, frente a la del motor (misma fórmula, σ del motor)."""
import sys, os, json, numpy as np
AQ = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(AQ, "..", "t9"))
exec(open(os.path.join(AQ, "ke520.py"), encoding="utf-8").read().split("nd = ELE[E]")[0].replace("sys.argv", "['', '520', '3']"))
tg = sys.argv[1]; K = int(sys.argv[2]) if len(sys.argv) > 2 else 3; E = 520
L = [l.split() for l in open(tg) if l.startswith(("rp", "tc"))]
rows = [l for l in L if int(l[2]) == K][:7]
P = [6, 2, 0, 1, 3, 4, 5]; Pinv = {r: q for q, r in enumerate(P)}
G2M = [0, 1, 3, 2]   # GEO5 (xx yy xy zz) -> motor (xx yy zz xy)
for r, l in enumerate(rows):
    i = l.index("s38"); s = np.array(list(map(float, l[i + 1:i + 5]))); sm = s[G2M]
    j = l.index("D"); vals = l[j + 1:]; D = np.array([[float(x) for x in vals[6 * a:6 * a + 4]] for a in range(4)])
    Dm_ = D[np.ix_(G2M, G2M)]
    q = Pinv[r]; f = os.path.join(AQ, "pg_k%d_e%d_q%d.json" % (K - 1, E, q))
    if os.path.exists(f):
        rr = json.load(open(f))[-1]; t2r, ixr, _ = princ(np.array(rr["s"])); Dmot = tang(t2r, ixr, rr["reg"]) if rr["reg"] else De
    else: Dmot = De
    print("reg GEO5 %d = q%d %s fl %s  σ %s  |D_G5 − D_mot| %.3e (|D| %.3e)" % (r, q, l[0], l[4], np.array2string(sm, precision=6), np.abs(Dm_ - Dmot).max(), np.abs(Dmot).max()))
    if np.abs(Dm_ - Dmot).max() > 1e-6: print("   G5\n", Dm_, "\n   mot\n", Dmot)
