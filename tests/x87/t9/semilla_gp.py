# -*- coding: utf-8 -*-
r"""Tanda 9: estado EXACTO de GEO5 por punto de Gauss (Restart_Step/Restart_In) -> semilla_gp.bin para la copia t9 del motor.
Orden de PG medido: PG del motor q -> registro GEO5 PERM[q] = [6,2,0,1,3,4,5] (registro 6 = centroide; elegido por ajuste lineal
de eps (1.9e-5) y por equilibrio: |Fg - F_int| = 0.073 kN fuera del rigido; las otras 5 rotaciones/reflexiones dan 59-131 kN).
Rigido (23 T6 sin PG en GEO5): sigma = D B u con K_rig u = Fg - F_int(suelo) en sus nudos (minimos cuadrados).
Salida: semilla_gp.bin = float64 [ne*7*4] en el orden SIG del motor (xx yy zz xy)."""
import sys, numpy as np, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
exec(open(os.path.join(AQUI, "orden_gp.py"), encoding="utf-8").read().split('if __name__')[0])
PERM = [6, 2, 0, 1, 3, 4, 5]
def construir(fn, salida=None, verbose=True):
    d = lee(fn); nn = len(X); ndof = 2 * nn; ne = len(ELE)
    BW = [Bw(e) for e in range(ne)]
    SIG = np.zeros((ne, 7, 4)); grav = np.zeros(ndof); F = np.zeros(ndof)
    for e in range(ne):
        rho = -m["MAT"][m["EMAT"][e] - 1][4]
        for B, w, N in BW[e]: grav[2 * ELE[e] + 1] += N * rho * w
    for k in range(ne - 23):
        e = k + 23; s = d["sig"][k]
        for q, (B, w, N) in enumerate(BW[e]):
            sq = s[PERM[q]]; SIG[e, q] = [sq[0], sq[1], sq[3], sq[2]]
            f = B.T @ np.array([sq[0], sq[1], sq[2]]) * w; F[2 * ELE[e]] += f[0::2]; F[2 * ELE[e] + 1] += f[1::2]
    # rigido
    Er, nur = m["MAT"][2][0], m["MAT"][2][1]; ff = Er / ((1 + nur) * (1 - 2 * nur))
    D3 = np.array([[ff * (1 - nur), ff * nur, 0], [ff * nur, ff * (1 - nur), 0], [0, 0, ff * (1 - 2 * nur) / 2]])
    rn = sorted(set(int(i) for e in range(23) for i in ELE[e])); loc = {n: i for i, n in enumerate(rn)}; nr = len(rn)
    K = np.zeros((2 * nr, 2 * nr))
    for e in range(23):
        idx = np.array([[2 * loc[int(i)], 2 * loc[int(i)] + 1] for i in ELE[e]]).ravel()
        for B, w, N in BW[e]: K[np.ix_(idx, idx)] += B.T @ D3 @ B * w
    fixed = set(m["FIXED"])
    r = np.array([(grav[2 * n + c] - F[2 * n + c]) for n in rn for c in (0, 1)])
    fx = np.array([(2 * n + c) in fixed for n in rn for c in (0, 1)])
    fr = ~fx; u = np.zeros(2 * nr)
    u[fr] = np.linalg.lstsq(K[np.ix_(fr, fr)], r[fr], rcond=None)[0]
    Fr = np.zeros(ndof)
    for e in range(23):
        idx = np.array([[2 * loc[int(i)], 2 * loc[int(i)] + 1] for i in ELE[e]]).ravel()
        for q, (B, w, N) in enumerate(BW[e]):
            s3 = D3 @ (B @ u[idx]); szz = nur * (s3[0] + s3[1]); SIG[e, q] = [s3[0], s3[1], szz, s3[2]]
            f = B.T @ s3 * w; Fr[2 * ELE[e]] += f[0::2]; Fr[2 * ELE[e] + 1] += f[1::2]
    free = np.array([i for i in range(ndof) if i not in fixed])
    Ft = F + Fr
    if verbose:
        print("|F_int| (suelo+rigido, libres) = %.4f · |Fg| = %.4f · |Fg - F_int| = %.4f · residuo en el rigido tras K+u: %.2e" % (
            np.linalg.norm(Ft[free]), np.linalg.norm(grav[free]), np.linalg.norm((grav - Ft)[free]), np.linalg.norm((r - K @ u)[fr])))
    if salida: SIG.astype("<f8").tofile(salida)
    return SIG, d
if __name__ == "__main__":
    construir(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(AQUI, "semilla_gp.bin"))
