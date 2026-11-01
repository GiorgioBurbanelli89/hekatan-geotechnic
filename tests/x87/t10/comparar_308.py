# -*- coding: utf-8 -*-
r"""Tanda 10 (1): estado tras el 1.1111 convergido, GEO5 (160308_Restart_Step) frente a la copia t10 (t10_rs01_*.bin),
punto de Gauss a punto de Gauss, como incrementos desde el estado de SRF 1 (160304) que comparten los dos.
Uso: python comparar_308.py [prefijo=t10_rs01] [restart=160308]"""
import sys, os, numpy as np
AQUI = os.path.dirname(os.path.abspath(__file__)); T9 = os.path.join(AQUI, "..", "t9"); sys.path.insert(0, T9)
exec(open(os.path.join(T9, "orden_gp.py"), encoding="utf-8").read().split('if __name__')[0])
FM = os.path.join(AQUI, "..", "..", "..", "..", "ingenieria-inversa", "hekatan-geo5-bridge", "geofem_capture", "files_muro")
PERM = [6, 2, 0, 1, 3, 4, 5]
pre = sys.argv[1] if len(sys.argv) > 1 else "t10_rs01"; rsn = sys.argv[2] if len(sys.argv) > 2 else "160308"
ne = len(ELE); ns = ne - 23; nn = len(X); ndof = 2 * nn
g4, g8 = lee(os.path.join(FM, "160304_Restart_Step.bin")), lee(os.path.join(FM, rsn + "_Restart_Step.bin"))
P = np.array(PERM)
def mot(a): return a[:, P, :]                       # registros GEO5 -> orden de PG del motor
sG4, sG8 = mot(g4["sig"]), mot(g8["sig"])             # sx sy txy sz
eG4, eG8 = mot(g4["eps"]), mot(g8["eps"])             # ex ey gxy ez
pG4, pG8 = mot(g4["epl"]), mot(g8["epl"])
fG4, fG8 = g4["fl"][:, P], g8["fl"][:, P]
S1 = np.fromfile(os.path.join(T9, "semilla_gp.bin"), "<f8").reshape(ne, 7, 4)[23:]
SO = np.fromfile(os.path.join(AQUI, pre + "_sig.bin"), "<f8").reshape(ne, 7, 4)[23:]   # xx yy zz xy
EO = np.fromfile(os.path.join(AQUI, pre + "_epl.bin"), "<f8").reshape(ne, 7, 4)[23:]
u = np.fromfile(os.path.join(AQUI, pre + "_u.bin"), "<f8")
def g2m(s): return np.stack([s[..., 0], s[..., 1], s[..., 3], s[..., 2]], -1)   # GEO5 (x y xy z) -> motor (x y z xy)
dsG = g2m(sG8 - sG4); dsO = SO - S1
print("semilla = GEO5 160304 (max dif): %.2e" % np.abs(S1 - g2m(sG4)).max())
# deformación incremental del motor: B u
deO = np.zeros((ns, 7, 3))
for k in range(ns):
    e = k + 23; idx = np.array([[2 * n, 2 * n + 1] for n in ELE[e]]).ravel()
    for q, (B, w, N) in enumerate(Bw(e)): deO[k, q] = B @ u[idx]
deG = (eG8 - eG4)[..., :3]
def rel(a, b): return np.linalg.norm(a - b) / np.linalg.norm(b)
mat = np.array([m["EMAT"][k + 23] for k in range(ns)])
print("\n            | rel ||dif||/||GEO5|| | max|dif| | max|GEO5| | corr")
for nm, a, b in [("dsig xx", dsO[..., 0], dsG[..., 0]), ("dsig yy", dsO[..., 1], dsG[..., 1]), ("dsig zz", dsO[..., 2], dsG[..., 2]),
                 ("dsig xy", dsO[..., 3], dsG[..., 3]), ("deps x", deO[..., 0], deG[..., 0]), ("deps y", deO[..., 1], deG[..., 1]), ("dgam xy", deO[..., 2], deG[..., 2]),
                 ("eps_p x", EO[..., 0], (pG8 - pG4)[..., 0]), ("eps_p y", EO[..., 1], (pG8 - pG4)[..., 1]), ("gam_p xy", EO[..., 3], (pG8 - pG4)[..., 2])]:
    print("%-11s | %.4f | %.3e | %.3e | %.5f" % (nm, rel(a, b), np.abs(a - b).max(), np.abs(b).max(), np.corrcoef(a.ravel(), b.ravel())[0, 1]))
# plasticidad: GEO5 banderas, motor: |dEPL| > 0
plG = (fG8 != 1); plO = (np.abs(EO).sum(-1) > 1e-14)
print("\nbanderas GEO5 304:", dict(zip(*np.unique(fG4, return_counts=True))), " 308:", dict(zip(*np.unique(fG8, return_counts=True))))
print("PG plasticos: GEO5 %d (bandera != 1) · motor %d (dEPL != 0) · ambos %d · solo GEO5 %d · solo motor %d" % (plG.sum(), plO.sum(), (plG & plO).sum(), (plG & ~plO).sum(), (~plG & plO).sum()))
dpG = np.abs(pG8 - pG4).sum(-1) > 1e-14
print("PG con d eps_p != 0 en GEO5: %d (ambos con motor %d)" % (dpG.sum(), (dpG & plO).sum()))
print("c, phi, psi GEO5 308 (rango, grados):", np.ptp(g8["cphi"][..., 0]), np.degrees(g8["cphi"][..., 1]).min(), np.degrees(g8["cphi"][..., 1]).max(), np.degrees(g8["cphi"][..., 2]).max())
for mt in (1, 2):
    f0 = np.radians([30.0, 29.97][mt - 1]); ph = g8["cphi"][mat == mt][..., 1]
    print("  mat %d: phi GEO5 - atan(tan(phi0)/1.1111) = %.2e" % (mt, np.abs(ph - np.arctan(np.tan(f0) * 0.9)).max()))
# equilibrio: F_int de cada estado frente a ALoad = F_int(160304), sólo nudos que NO tocan el rígido
rig = set(int(i) for e in range(23) for i in ELE[e]); fixed = set(m["FIXED"])
libre = np.array([d for d in range(ndof) if d not in fixed and d // 2 not in rig])
def fint(S, gorder):
    F = np.zeros(ndof)
    for k in range(ns):
        e = k + 23; s = S[k]
        for q, (B, w, N) in enumerate(Bw(e)):
            v = np.array([s[q, 0], s[q, 1], s[q, 2]]) if gorder else np.array([s[q, 0], s[q, 1], s[q, 3]])
            f = B.T @ v * w; F[2 * ELE[e]] += f[0::2]; F[2 * ELE[e] + 1] += f[1::2]
    return F
F4 = fint(sG4, 1); F8 = fint(sG8, 1); FO = fint(SO, 0)
print("\n|ALoad - F_int| fuera del rigido: GEO5 %s %.4f · motor %.4f · |F_int(GEO5) - F_int(motor)| %.4f" % (rsn, np.linalg.norm((F4 - F8)[libre]), np.linalg.norm((F4 - FO)[libre]), np.linalg.norm((F8 - FO)[libre])))
# dónde está la diferencia: 10 PG con mayor |dsig motor - GEO5|
d = np.linalg.norm(dsO - dsG, axis=-1); o = np.argsort(d.ravel())[::-1][:10]
print("\npeores PG (elem, pg, |dif| kPa, |dsig GEO5|, bandera GEO5 304->308, plast motor, x, y):")
for i in o:
    k, q = divmod(i, 7); e = k + 23; xc, yc = X[ELE[e][:3]].mean(), Y[ELE[e][:3]].mean()
    print("  %4d %d  %.3f  %.3f  %d->%d  %d  %.2f %.2f" % (e, q, d[k, q], np.linalg.norm(dsG[k, q]), fG4[k, q], fG8[k, q], plO[k, q], xc, yc))
np.save(os.path.join(AQUI, "dif_%s.npy" % pre), d)
