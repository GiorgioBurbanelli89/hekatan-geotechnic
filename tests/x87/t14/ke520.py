# -*- coding: utf-8 -*-
"""Tanda 14: ¿qué tangente de los PG del el. E (fin del paso K-1) explica K_t·du_G5 − R en sus nudos? (K_mot − K_cand)·v_e frente al residuo."""
import sys, os, json, numpy as np, itertools
AQ = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(AQ, "..", "t9"))
exec(open(os.path.join(AQ, "..", "t9", "orden_gp.py"), encoding="utf-8").read().split('if __name__')[0])
E = int(sys.argv[1]) if len(sys.argv) > 1 else 520; K = int(sys.argv[2]) if len(sys.argv) > 2 else 3
Ey, nu = 25000., 0.28; lam = Ey*nu/((1+nu)*(1-2*nu)); G = Ey/(2*(1+nu))
De = np.array([[lam+2*G, lam, lam, 0], [lam, lam+2*G, lam, 0], [lam, lam, lam+2*G, 0], [0, 0, 0, G]])
phi, psi = np.radians(30), 0.0
def princ(s):
    c = (s[0]+s[1])/2; R = np.hypot((s[0]-s[1])/2, s[3]); pv = [c+R, c-R, s[2]]; ix = sorted(range(3), key=lambda a: -pv[a]); return np.arctan2(2*s[3], s[0]-s[1]), ix, pv
def tang(t2, ix, reg):
    sp, sg = np.sin(phi), np.sin(psi); a, b, ag, bg = .5*(1+sp), .5*(sp-1), .5*(1+sg), .5*(sg-1); D = De[:3, :3]
    if reg == 3: Dn = np.zeros((3, 3))
    else:
        N = [np.array([a, 0, b])]; M = [np.array([ag, 0, bg])]
        if reg == 2: N.append(np.array([a, b, 0])); M.append(np.array([ag, bg, 0]))
        if reg == 4: N.append(np.array([0, a, b])); M.append(np.array([0, ag, bg]))
        DM = [D@m for m in M]; ND = [n@D for n in N]; L = np.array([[n@dm for dm in DM] for n in N]); Li = np.linalg.inv(L)
        Dn = D - sum(np.outer(DM[p], ND[q])*Li[p, q] for p in range(len(N)) for q in range(len(N)))
    P = np.zeros((4, 4))
    for i in range(3):
        for j in range(3): P[ix[i], ix[j]] = Dn[i, j]
    P[3, 3] = De[3, 3]; th = t2/2; c, s = np.cos(th), np.sin(th)
    Rm = np.array([[c*c, s*s, 0, c*s], [s*s, c*c, 0, -c*s], [0, 0, 1, 0], [-2*c*s, 2*c*s, 0, c*c-s*s]])
    return Rm.T @ P @ Rm
nd = ELE[E]; dof = np.ravel([[2*n, 2*n+1] for n in nd])
kv = np.fromfile(os.path.join(AQ, "kv_k%d.bin" % K))[dof]; v = np.fromfile(os.path.join(AQ, "g5_k%d_du1.bin" % K))[dof]
print("residuo en los nudos del el. %d: |.| %.3e (total %.3e)" % (E, np.linalg.norm(kv), np.linalg.norm(np.fromfile(os.path.join(AQ, "kv_k%d.bin" % K)))))
BW = Bw(E); I3 = [0, 1, 3]
def Ke(Ds):
    k = np.zeros((12, 12))
    for q, (B, w, _) in enumerate(BW): k += B.T @ Ds[q][np.ix_(I3, I3)] @ B * w
    return k
cand = {}
for q in range(7):
    f = os.path.join(AQ, "pg_k%d_e%d_q%d.json" % (K-1, E, q))
    if not os.path.exists(f): cand[q] = {"el": De}; continue
    r = json.load(open(f))[-1]; tr = np.array(r["s0"]) + De @ np.array(r["de"]); s = np.array(r["s"])
    if r["reg"] == 0: cand[q] = {"el": De}; continue
    t2r, ixr, _ = princ(s); t2t, ixt, _ = princ(tr)
    cand[q] = {"mot": tang(t2r, ixr, r["reg"]), "tanteo": tang(t2t, ixt, r["reg"]), "el": De, "apex": tang(0, [0, 1, 2], 3),
               "arista2": tang(t2r, ixr, 2), "arista4": tang(t2r, ixr, 4), "t+90": tang(t2r + np.pi, ixr, r["reg"])}
    print("q%d reg %d  t2 dev %.4f tanteo %.4f  ix dev %s tanteo %s" % (q, r["reg"], t2r, t2t, ixr, ixt))
base = [cand[q].get("mot", De) for q in range(7)]; K0 = Ke(base)
res = []
qs = [q for q in range(7) if "mot" in cand[q]]
for combo in itertools.product(*[list(cand[q].keys()) for q in qs]):
    Ds = list(base)
    for q, nm in zip(qs, combo): Ds[q] = cand[q][nm]
    d = (K0 - Ke(Ds)) @ v; res.append((np.linalg.norm(d - kv) / np.linalg.norm(kv), combo))
res.sort()
for r_, c in res[:8]: print("  %.3e  %s" % (r_, dict(zip(qs, c))))
print("|K_e·v| %.3e" % np.linalg.norm(K0 @ v))
for q in qs:
    for nm in cand[q]:
        Ds = list(base); Ds[q] = cand[q][nm]; d = (K0 - Ke(Ds)) @ v
        print("  q%d %-8s |ΔK·v| %.3e  corr con residuo %.4f  escala %.4f" % (q, nm, np.linalg.norm(d), d @ kv / (np.linalg.norm(d) * np.linalg.norm(kv) + 1e-300), d @ kv / (d @ d + 1e-300)))
# PG a PG: B·v (Δε) y residuo proyectado
for q, (B, w, _) in enumerate(BW): print("  q%d Δε %s w %.4e" % (q, B @ v, w))
