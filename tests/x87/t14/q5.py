# -*- coding: utf-8 -*-
"""Tanda 14: el residuo de la it 1 del paso 3 = dirección plástica del el. 520 PG 5 con escala 0.0018 → qué variante de la
tangente de ESE PG da K_G5·v = R exactamente (ajuste escalar sobre la fila n·D·Δε/L)."""
import sys, os, json, numpy as np
AQ = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(AQ, "..", "t9"))
exec(open(os.path.join(AQ, "ke520.py"), encoding="utf-8").read().split("base = [")[0].replace("sys.argv", "['', '520', '3']"))
B, w, _ = BW[5]; de = B @ v; de4 = np.array([de[0], de[1], 0, de[2]])
r = json.load(open(os.path.join(AQ, "pg_k2_e520_q5.json")))[-1]; s = np.array(r["s"]); tr = np.array(r["s0"]) + De @ np.array(r["de"])
Dm = cand[5]["mot"]; Del = De
y_res = None
# residuo proyectado en q5: res = B^T (Dmot - DG5) de w  -> lo resolvemos por mínimos cuadrados en la dirección conocida
d_el = B.T @ (Dm - Del)[np.ix_(I3, I3)] @ de * w
alpha = d_el @ kv / (d_el @ d_el); print("alpha (DG5 = Dmot + alpha·(De − Dmot)) = %.6f  resto %.2e" % (-alpha, np.linalg.norm(kv - alpha * d_el) / np.linalg.norm(kv)))
target = Dm + (-alpha) * (Del - Dm)
def err(Dc): d = B.T @ (Dm - Dc)[np.ix_(I3, I3)] @ de * w; return np.linalg.norm(d - kv) / np.linalg.norm(kv)
print("err mot %.3e  target %.3e" % (err(Dm), err(target)))
for ph in [29.9, 29.95, 29.97, 29.99, 30.0, 30.01, 30.05]:
    phi = np.radians(ph); t2r, ixr, _ = princ(s); print("phi %.2f err %.3e" % (ph, err(tang(t2r, ixr, 1))))
phi = np.radians(30)
# tangente desde la σ de PRUEBA del paso 2 (it 6) / σ de prueba de LS, y rotaciones mixtas
t2r, ixr, pvr = princ(s); t2t, ixt, pvt = princ(tr)
print("princ dev", pvr, "prueba", pvt)
for nm, t2 in [("dev", t2r), ("prueba", t2t), ("dev+pi", t2r + np.pi)]:
    print(nm, "err %.3e" % err(tang(t2, ixr, 1)))
# barrido fino del ángulo
best = min((err(tang(t2r + a, ixr, 1)), a) for a in np.linspace(-0.2, 0.2, 4001)); print("mejor giro de t2: %.5f rad err %.3e" % (best[1], best[0]))
import itertools
print("permutaciones de la tangente de cara del q5:")
for perm in itertools.permutations(range(3)):
    for a in (0, np.pi):
        print("  ix %s giro %+.3f err %.3e" % (list(perm), a, err(tang(t2r + a, list(perm), 1))))
dsig = alpha * (Dm - Del) @ de4   # = −α·DM(ND·Δε)/L  (en la base 4 del motor)
print("Δσ equivalente en q5 (si fuera R): %s  |.| %.3e kPa" % (dsig, np.linalg.norm(dsig)))
print("σ q5 fin paso 2:", s, " DM dir:", (Del - Dm) @ de4 / np.linalg.norm((Del - Dm) @ de4))
