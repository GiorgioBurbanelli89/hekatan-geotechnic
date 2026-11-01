# -*- coding: utf-8 -*-
"""Tanda 12: DDisp crudo y u por iteración, GEO5 (captura.py, cap/NNNNN.npz) frente a la copia (t12_itNN_*.bin), nudo a nudo.
Uso: python cmp_it.py <dir_cap_geo5> <dir_t12> ev_raw1,ev_raw2,.. [prefijo_salida_u_geo5]
  ev_raw = evento cód 2 (DDisp resuelto) de cada iteración; el u tras la it es ev_raw+3 (cód 0).
  Con prefijo escribe <pref>_itKK.bin = u de GEO5 tras la it K-1 (para T12_FORCE)."""
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("T11_INPUT", os.path.join(sys.argv[1], "..", "Input.txt"))
import mapa12 as mapa
cap, d12 = sys.argv[1], sys.argv[2]; evs = [int(e) for e in sys.argv[3].split(",")]; pref = sys.argv[4] if len(sys.argv) > 4 else None
X, Y = mapa.X, mapa.Y; nn = len(X)
fix = np.zeros(2 * nn, bool)
# gdl libres = los que el motor mueve alguna vez
def g5(ev, j): return mapa.a_json(np.load(os.path.join(cap, "%05d.npz" % ev))["v"][j])
def md(k, w): return np.fromfile(os.path.join(d12, "t12_it%02d_%s.bin" % (k, w)), "<f8")
def zona(v):  # norma por zonas en x
    xs = np.repeat(X, 2); out = []
    for a, b in [(-1e9, 9.3), (9.3, 10.5), (10.5, 1e9)]:
        m = (xs >= a) & (xs < b); out.append(np.linalg.norm(v[m]))
    return out
def cmp(nom, a, b):  # a = motor, b = GEO5
    d = a - b; s = a @ b / (b @ b)
    za, zb, zd = zona(a), zona(b), zona(d)
    print("%-14s |mot| %.5e |G5| %.5e  rel %.2e  esc %.7f  corr %.6f  | zonas x<9.3 / muro / x>10.5: mot/G5 %s  dif rel %s" % (
        nom, np.linalg.norm(a), np.linalg.norm(b), np.linalg.norm(d) / np.linalg.norm(b), s, np.corrcoef(a, b)[0, 1],
        " ".join("%.4f" % (p / q if q else 0) for p, q in zip(za, zb)), " ".join("%.3f" % (p / q if q else 0) for p, q in zip(zd, zb))))
    return d
eta_m = dict((int(l.split()[0]), float(l.split()[1])) for l in open(os.path.join(d12, "t12_eta.txt")))
U0g = g5(evs[0], 0)   # u de GEO5 al empezar el peldaño (ADisp acumulado): el motor vuelca el incremento del peldaño
for k, ev in enumerate(evs, 1):
    raw_g, u_g = g5(ev, 1), g5(ev + 3, 0) - U0g
    u_prev_g = g5(evs[k - 2] + 3, 0) - U0g if k > 1 else np.zeros(2 * nn)
    eta_g = ((u_g - u_prev_g) @ raw_g) / (raw_g @ raw_g)
    print("it %d: eta motor %.6f  GEO5 %.6f" % (k, eta_m.get(k, np.nan), eta_g))
    if not os.path.exists(os.path.join(d12, "t12_it%02d_raw.bin" % k)): continue
    cmp("  DDisp crudo", md(k, "raw"), raw_g)
    cmp("  eta*DDisp", eta_m[k] * md(k, "raw"), eta_g * raw_g)
    cmp("  u tras it", md(k, "u"), u_g)
    if pref: (u_g).astype("<f8").tofile("%s_it%02d.bin" % (pref, k + 1))
