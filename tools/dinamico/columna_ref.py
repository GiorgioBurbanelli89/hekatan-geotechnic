# -*- coding: utf-8 -*-
"""Columna de suelo a cortante (deformación plana, elástica, T6) — REFERENCIA en Python para el
análisis dinámico lineal de Hekatan Geotechnic.  Capa por capa: masa -> rigidez -> modos -> Newmark.

  python tools/dinamico/columna_ref.py generar  [carpeta_abaqus]   # malla, .inp de Abaqus, referencia Python
  python tools/dinamico/columna_ref.py comparar [carpeta_abaqus]   # lee lo que sacó Abaqus y compara

Modelo (muro de Manabí, arena SP de GEO5): H = 12 m, ancho 1 m, E = 25000 kPa, nu = 0.28, gamma = 18.5 kN/m3,
rho = gamma/g (g = 9.80665) en t/m3.  Unidades kN, m, t, s.
Contorno: base fija (u = v = 0); lados: v = 0 y u(derecha) = u(izquierda) a cada cota.
La atadura se hace ELIMINANDO el gdl esclavo (u del lado derecho) con una matriz T (u = T·u_red): exacta, sin penalización.
Malla: 1 × 24 cuadrados de 1.0 × 0.5 m, cada uno partido por la diagonal (abajo-izq → arriba-der) en 2 T6.
Integración: Hammer de 7 puntos (grado 5) — integra EXACTO N·N (grado 4) y B·D·B (grado 2) en triángulos rectos.
Newmark: coeficientes b1…b6 tal como están en FRGeoFEM.exe 2024 (part_001.c:60956-60968), c = 0.5 leído del .rdata.
"""
import json, math, os, sys
import numpy as np
from scipy.linalg import eigh, cho_factor, cho_solve

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(AQUI))
DATOS = os.path.join(REPO, "tests", "datos")
ABQ = os.path.join(REPO, "..", "hekatan-school", "VIDEOS", "serie_muro_manabi", "08_abaqus", "columna")

# ---------------- datos ----------------
H, B = 12.0, 1.0
NY = 24                     # cuadrados en altura (0.5 m)
E, NU, GAM, G0 = 25000.0, 0.28, 18.5, 9.80665
RHO = GAM / G0              # t/m3
DT, TFIN, TP, APICO = 0.005, 2.0, 0.2, 1.0
BETA, GAMMA = 0.25, 0.5
NSTEP = int(round(TFIN / DT))


def acel(t):
    """Pulso de medio seno: a(t) = APICO·sin(pi·t/TP) para 0 <= t <= TP, 0 después (m/s2)."""
    return APICO * math.sin(math.pi * t / TP) if t < TP - 1e-12 else 0.0


# ---------------- malla ----------------
def malla():
    nx, nrow = 3, 2 * NY + 1                     # columnas x = 0, 0.5, 1 ; filas y = 0.25·j
    X = [0.5 * i * B for j in range(nrow) for i in range(nx)]
    Y = [j * H / (2 * NY) for j in range(nrow) for i in range(nx)]      # y = 0.25·j
    nid = lambda i, j: j * nx + i
    ELE = []
    for k in range(NY):
        j0 = 2 * k
        BL, BR, TR, TL = nid(0, j0), nid(2, j0), nid(2, j0 + 2), nid(0, j0 + 2)
        # T6: 3 esquinas CCW + medios (1-2, 2-3, 3-1)
        ELE.append([BL, BR, TR, nid(1, j0), nid(2, j0 + 1), nid(1, j0 + 1)])
        ELE.append([BL, TR, TL, nid(1, j0 + 1), nid(1, j0 + 2), nid(0, j0 + 1)])
    base = [nid(i, 0) for i in range(nx)]
    izq = [nid(0, j) for j in range(1, nrow)]
    der = [nid(2, j) for j in range(1, nrow)]
    corona = nid(0, nrow - 1)
    return np.array(X), np.array(Y), ELE, base, izq, der, corona


# ---------------- T6 y cuadratura (independientes del código TS) ----------------
def hammer7():
    s15 = math.sqrt(15.0)
    a1, a2 = (6 - s15) / 21, (6 + s15) / 21
    w1, w2 = (155 - s15) / 1200, (155 + s15) / 1200
    P = [(1 / 3, 1 / 3, 9 / 40)]
    for a, w in ((a1, w1), (a2, w2)):
        P += [(a, a, w), (1 - 2 * a, a, w), (a, 1 - 2 * a, w)]
    return [(x, y, w / 2) for x, y, w in P]      # área del triángulo de referencia = 1/2


def t6(xi, eta):
    L1, L2, L3 = 1 - xi - eta, xi, eta         # nudo 1 en (0,0), 2 en (1,0), 3 en (0,1)
    N = np.array([L1 * (2 * L1 - 1), L2 * (2 * L2 - 1), L3 * (2 * L3 - 1), 4 * L1 * L2, 4 * L2 * L3, 4 * L3 * L1])
    dxi = np.array([-(4 * L1 - 1), 4 * L2 - 1, 0, 4 * (L1 - L2), 4 * L3, -4 * L3])
    deta = np.array([-(4 * L1 - 1), 0, 4 * L3 - 1, -4 * L2, 4 * L2, 4 * (L1 - L3)])
    return N, dxi, deta


def D_plana():
    f = E / ((1 + NU) * (1 - 2 * NU))
    return f * np.array([[1 - NU, NU, 0], [NU, 1 - NU, 0], [0, 0, (1 - 2 * NU) / 2]])


def elemento(xe, ye):
    D = D_plana(); Ke = np.zeros((12, 12)); Me = np.zeros((12, 12))
    for xi, eta, w in hammer7():
        N, dxi, deta = t6(xi, eta)
        J = np.array([[dxi @ xe, dxi @ ye], [deta @ xe, deta @ ye]])
        dJ = np.linalg.det(J)
        dN = np.linalg.solve(J, np.vstack([dxi, deta]))     # [dN/dx; dN/dy]
        Bm = np.zeros((3, 12)); Nm = np.zeros((2, 12))
        Bm[0, 0::2] = dN[0]; Bm[1, 1::2] = dN[1]; Bm[2, 0::2] = dN[1]; Bm[2, 1::2] = dN[0]
        Nm[0, 0::2] = N; Nm[1, 1::2] = N
        Ke += Bm.T @ D @ Bm * dJ * w
        Me += RHO * Nm.T @ Nm * dJ * w
    return Ke, Me


def ensamblar(X, Y, ELE):
    nd = 2 * len(X); K = np.zeros((nd, nd)); M = np.zeros((nd, nd)); KE, ME = [], []
    for el in ELE:
        Ke, Me = elemento(X[el], Y[el]); KE.append(Ke); ME.append(Me)
        dofs = np.array([[2 * n, 2 * n + 1] for n in el]).ravel()
        K[np.ix_(dofs, dofs)] += Ke; M[np.ix_(dofs, dofs)] += Me
    return K, M, KE, ME


def reduccion(nn, base, izq, der):
    """u = T·u_red. Base: u=v=0. Lados: v=0. u(der_j) = u(izq_j) (esclavo = derecha)."""
    nd = 2 * nn; fijo = set()
    for n in base: fijo |= {2 * n, 2 * n + 1}
    for n in izq + der: fijo.add(2 * n + 1)
    esclavo = {2 * d: 2 * i for i, d in zip(izq, der)}
    libres = [d for d in range(nd) if d not in fijo and d not in esclavo]
    col = {d: k for k, d in enumerate(libres)}
    T = np.zeros((nd, len(libres)))
    for d, k in col.items(): T[d, k] = 1.0
    for s, m in esclavo.items(): T[s, col[m]] = 1.0
    return T, libres, sorted(fijo), esclavo


def newmark(K, M, Mr, C=None):
    """Newmark lineal con los b1…b6 del binario de GEO5 (sin HHT: alpha = 0).
    Mr = (M·1_x) en gdl reducidos, con la fila COMPLETA (incluye el acoplamiento con los nudos de la base):
    M_ff·ü_rel + K_ff·u_rel = −(M_ff·1_f + M_fc·1_c)·a_g, porque K·1 = 0 (traslación rígida)."""
    c = 0.5                                       # DAT_00613ff8 (leído del .rdata del exe)
    b1 = 1.0 / BETA / DT / DT
    b2 = 1.0 / BETA / DT
    b3 = (1.0 - 2 * BETA) * c / BETA
    b4 = GAMMA / BETA / DT
    b5 = GAMMA / BETA - 1.0
    b6 = (GAMMA - 2 * BETA) * c / BETA * DT
    # comprobación: son el Newmark de libro (Bathe 9.27-9.31)
    assert abs(b3 - (1 / (2 * BETA) - 1)) < 1e-15 and abs(b6 - DT / 2 * (GAMMA / BETA - 2)) < 1e-15
    n = K.shape[0]; C = np.zeros_like(K) if C is None else C
    Kef = K + b1 * M + b4 * C
    cf = cho_factor(Kef)
    u = np.zeros(n); v = np.zeros(n); a = np.zeros(n)          # arranca en reposo, a0 = 0 porque a_g(0) = 0
    hist = [u.copy()]
    for s in range(1, NSTEP + 1):
        t = s * DT
        F = -Mr * acel(t)
        R = F + M @ (b1 * u + b2 * v + b3 * a) + C @ (b4 * u + b5 * v + b6 * a)
        u1 = cho_solve(cf, R)
        a1 = b1 * (u1 - u) - b2 * v - b3 * a
        v = v + DT * ((1 - GAMMA) * a + GAMMA * a1)
        u, a = u1, a1
        hist.append(u.copy())
    return np.array(hist), dict(b1=b1, b2=b2, b3=b3, b4=b4, b5=b5, b6=b6)


def exactas(n=3):
    G = E / (2 * (1 + NU)); Vs = math.sqrt(G / RHO)
    return [(2 * k - 1) * Vs / (4 * H) for k in range(1, n + 1)], Vs, G


def generar(abq):
    X, Y, ELE, base, izq, der, corona = malla()
    nn = len(X)
    K, M, KE, ME = ensamblar(X, Y, ELE)
    T, libres, fijos, esclavo = reduccion(nn, base, izq, der)
    Kr, Mr = T.T @ K @ T, T.T @ M @ T
    # masa total (todas las filas x, sin contorno) = rho·A
    ex = np.zeros(2 * nn); ex[0::2] = 1
    masa = ex @ M @ ex
    # modos
    w2, PHI = eigh(Kr, Mr)
    f = np.sqrt(w2) / 2 / math.pi
    r = np.array([1.0 if d % 2 == 0 else 0.0 for d in libres])   # influencia x (gdl reducidos)
    # participación con la fila COMPLETA de M·1_x (incluye el acoplamiento con la base): así lo hace Abaqus
    # (medido: con M_ff·1_f solo, Mef_x3 = 0.7339308; con la fila completa 0.7340004 = Abaqus)
    Lx = PHI.T @ (T.T @ (M @ ex)); mefx = Lx ** 2 / np.diag(PHI.T @ Mr @ PHI)
    # masa diagonal (HRZ) solo para ver cuánto cambian las frecuencias si NO fuera consistente
    Ml = np.zeros_like(M)
    for el, Me in zip(ELE, ME):
        dofs = np.array([[2 * n, 2 * n + 1] for n in el]).ravel()
        d = np.diag(Me); s = Me[0::2, 0::2].sum()
        dl = d * s / d[0::2].sum()
        Ml[dofs, dofs] += dl
    fl = np.sqrt(eigh(Kr, T.T @ Ml @ T, eigvals_only=True)[:3]) / 2 / math.pi
    fex, Vs, G = exactas()
    # Newmark
    Mr1 = T.T @ (M @ ex)                          # fila completa (con la base)
    Mr1_ff = Mr @ r                               # solo M_ff·1_f (sin el acoplamiento con la base): para medir su efecto
    hist, bs = newmark(Kr, Mr, Mr1)
    hist_ff, _ = newmark(Kr, Mr, Mr1_ff)
    kc = libres.index(2 * corona)
    ux = hist[:, kc]
    imax = int(np.argmax(np.abs(ux)))
    ref = dict(
        caso="columna de suelo a cortante, T6, H=12 m, ancho 1 m", nn=nn, ne=len(ELE), ngdl_red=len(libres),
        rho=RHO, G=G, Vs=Vs, masa_total=masa, rhoA=RHO * H * B,
        f=[float(x) for x in f[:5]], f_exacta=fex, f_masa_diagonal_HRZ=[float(x) for x in fl],
        masa_efectiva_x=[float(x) for x in mefx[:5]], suma_masa_efectiva_x=float(mefx.sum()),
        newmark=bs, dt=DT, pasos=NSTEP, nudo_corona=corona,
        t=[s * DT for s in range(NSTEP + 1)], ux_corona=[float(x) for x in ux],
        ux_max=float(ux[imax]), t_max=imax * DT,
        ux_corona_sin_acoplamiento_base=[float(x) for x in hist_ff[:, kc]],
        # rigidez/masa de un elemento para la comparación capa a capa (elemento 1 y 2, orden de Abaqus)
        Ke1=KE[0].tolist(), Me1=ME[0].tolist(), Ke2=KE[1].tolist(), Me2=ME[1].tolist(),
    )
    os.makedirs(DATOS, exist_ok=True)
    with open(os.path.join(DATOS, "columna_ref_python.json"), "w", encoding="utf-8") as fo: json.dump(ref, fo)
    # modelo para Geotechnic (GeoModel + TIES)
    FIX = fijos
    modelo = dict(name="columna de suelo a cortante (dinámico lineal)", X=X.tolist(), Y=Y.tolist(), ELE=ELE,
                  EMAT=[1] * len(ELE), FIXED=FIX, Fg=[0.0] * (2 * nn), Fs=[0.0] * (2 * nn), Fa=[0.0] * (2 * nn),
                  MAT=[[E, NU, 30.0, 0.0, GAM, 0.0]], MATNAMES=["arena SP"], stages=[],
                  TIES=[[s, m] for s, m in sorted(esclavo.items())], CORONA=corona)
    with open(os.path.join(DATOS, "columna_malla.json"), "w", encoding="utf-8") as fo: json.dump(modelo, fo)
    escribir_inp(abq, X, Y, ELE, base, izq, der, corona)
    print(f"malla: {nn} nudos, {len(ELE)} T6, {len(libres)} gdl reducidos ({len(fijos)} fijos, {len(esclavo)} esclavos)")
    print(f"rho = {RHO:.6f} t/m3, G = {G:.4f} kPa, Vs = {Vs:.4f} m/s")
    print(f"masa total = {masa:.6f} t  (rho·A = {RHO*H*B:.6f})")
    for k in range(3):
        print(f"modo {k+1}: f = {f[k]:.6f} Hz  exacta {fex[k]:.6f}  masa diagonal {fl[k]:.6f}  Mef_x = {mefx[k]:.4f} t")
    print(f"b1..b6 = {[round(v, 6) for v in bs.values()]}")
    print(f"u_x corona max = {ux[imax]*1e3:.6f} mm en t = {imax*DT:.3f} s")


def escribir_inp(abq, X, Y, ELE, base, izq, der, corona):
    os.makedirs(abq, exist_ok=True)
    L = ["*HEADING", "Columna de suelo a cortante, CPE6, misma malla que Hekatan Geotechnic (kN, m, t, s)",
         "*PREPRINT, ECHO=NO, MODEL=NO, HISTORY=NO, CONTACT=NO", "*NODE"]
    L += [f"{i+1}, {x:.10g}, {y:.10g}" for i, (x, y) in enumerate(zip(X, Y))]
    L.append("*ELEMENT, TYPE=CPE6, ELSET=SUELO")
    L += [f"{e+1}, " + ", ".join(str(n + 1) for n in el) for e, el in enumerate(ELE)]
    L += ["*SOLID SECTION, ELSET=SUELO, MATERIAL=ARENA", "1.0,", "*MATERIAL, NAME=ARENA",
          "*ELASTIC", f"{E:.10g}, {NU:.10g}", "*DENSITY", f"{RHO:.15g},"]
    def nset(nm, ns):
        out = [f"*NSET, NSET={nm}"]
        for k in range(0, len(ns), 16): out.append(", ".join(str(n + 1) for n in ns[k:k + 16]))
        return out
    L += nset("BASE", base) + nset("IZQ", izq) + nset("DER", der) + nset("CORONA", [corona])
    L.append("*EQUATION")
    for i, d in zip(izq, der): L += ["2", f"{d+1}, 1, 1.0, {i+1}, 1, -1.0"]
    L += ["*BOUNDARY", "BASE, 1, 2", "IZQ, 2, 2", "DER, 2, 2"]
    pts = [(s * DT, acel(s * DT)) for s in range(int(round(TP / DT)) + 1)] + [(TFIN, 0.0)]
    L.append("*AMPLITUDE, NAME=PULSO, DEFINITION=TABULAR")
    for k in range(0, len(pts), 4): L.append(", ".join(f"{t:.10g}, {a:.15g}" for t, a in pts[k:k + 4]))
    L += ["*STEP, NAME=MODOS, PERTURBATION", "*FREQUENCY, EIGENSOLVER=LANCZOS, NORMALIZATION=MASS", "5,",
          "*ELEMENT MATRIX OUTPUT, ELSET=SUELO, MASS=YES, STIFFNESS=YES, OUTPUT FILE=USER DEFINED, FILE NAME=columna_elem",
          "*OUTPUT, FIELD, VARIABLE=PRESELECT", "*END STEP",
          "*STEP, NAME=SISMO, INC=1000", "*DYNAMIC, ALPHA=0.0, DIRECT", f"{DT}, {TFIN}",
          "*DLOAD, AMPLITUDE=PULSO", f"SUELO, GRAV, {APICO}, -1., 0., 0.",
          "*OUTPUT, FIELD, FREQUENCY=100", "*NODE OUTPUT", "U,", "*OUTPUT, HISTORY, FREQUENCY=1",
          "*NODE OUTPUT, NSET=CORONA", "U1, U2", "*END STEP"]
    with open(os.path.join(abq, "columna.inp"), "w", newline="\r\n") as fo: fo.write("\n".join(L) + "\n")


def comparar():
    """Capa por capa: matrices de elemento -> masa -> frecuencias -> u(t) de la coronación."""
    P = json.load(open(os.path.join(DATOS, "columna_ref_python.json"), encoding="utf-8"))
    A = json.load(open(os.path.join(DATOS, "columna_abaqus.json"), encoding="utf-8"))
    for nm in ("Ke1", "Me1", "Ke2", "Me2"):
        p, a = np.array(P[nm]), np.array(A[nm])
        print(f"{nm}: max|Py-Abq| = {np.abs(p-a).max():.3e}  (max|Abq| = {np.abs(a).max():.4f})")
    print(f"masa total: Py {P['masa_total']:.4f}  Abq {A['masa_total']:.4f}  rho·A {P['rhoA']:.4f}")
    for k in range(3):
        print(f"f{k+1}: Py {P['f'][k]:.4f}  Abq {A['f'][k]:.4f}  exacta {P['f_exacta'][k]:.4f}  diagonal {P['f_masa_diagonal_HRZ'][k]:.4f}"
              f"  |Py-Abq| = {abs(P['f'][k]-A['f'][k]):.1e} Hz ; Mef_x Py {P['masa_efectiva_x'][k]:.4f} Abq {A['masa_efectiva_x_odb'][k]:.4f}")
    up, ua = np.array(P["ux_corona"]), np.array(A["ux_corona"])
    ia = int(np.argmax(np.abs(ua)))
    print(f"u_x corona: {len(up)} vs {len(ua)} instantes; max|Py-Abq| = {np.abs(up-ua).max()*1e3:.2e} mm")
    uf = np.array(P["ux_corona_sin_acoplamiento_base"])
    print(f"   (con carga -M_ff·1 sin el acoplamiento con la base: max|Py-Abq| = {np.abs(uf-ua).max()*1e3:.2e} mm)")
    print(f"   Mef_x3 Py {P['masa_efectiva_x'][2]:.7f}  Abq(odb, float32) {A['masa_efectiva_x_odb'][2]:.7f}  Abq(.dat) {A['masa_efectiva_x'][2]}")
    print(f"u_max: Py {P['ux_max']*1e3:.4f} mm (t={P['t_max']:.3f})  Abq {ua[ia]*1e3:.4f} mm (t={A['t'][ia]:.3f})")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "generar"
    abq = sys.argv[2] if len(sys.argv) > 2 else ABQ
    if cmd == "generar": generar(abq)
    elif cmd == "comparar": comparar()
