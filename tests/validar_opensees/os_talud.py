# -*- coding: utf-8 -*-
"""
[COPIA de tools/opensees_talud_agua.py con la tolerancia/iteraciones por variables de entorno OS_TOL, OS_ITER para ver cómo cambia el FS]
Talud con agua en OpenSees (openseespy 3.7.1 = el de Hekatan OpenSees): MISMO caso que GEO5 GeoFEM / Geotechnic.
  python tools/opensees_talud_agua.py [sin|gwt|ru0.3] [dx] [ny]
Modelo: terreno llano -9 hasta x=12, talud 30° hasta -3 (x=22.39), llano hasta x=40; fondo -20; rodillos laterales, base fija.
Suelo Drucker-Prager de GEO5 (cono INTERIOR, manual FEM ec. 4.3): sqrt(J2) + alpha*I1 - k = 0
   alpha = 2 sen(phi) / (sqrt(3) (3 + sen(phi)))     k = 2 sqrt(3) c cos(phi) / (3 + sen(phi))        psi = 0
En OpenSees (UWmaterials/DruckerPrager.cpp:408):  f = ||dev|| + rho*I1 - sqrt(2/3)*sigmaY   =>  rho = sqrt(2) alpha,  sigmaY = sqrt(3) k
Elemento SSPquad (cuadrilátero estabilizado, sin bloqueo volumétrico). FS por reducción c-phi: se baja la resistencia (tan phi, c) y se mira
si el peso converge. El agua entra como CARGA (igual que Geotechnic): peso con gamma_sat bajo el GWT + ∫Bt m p dA (tensiones efectivas).
"""
import sys, math, time
import numpy as np
import openseespy.opensees as ops

E, NU, PHI, C, GAM, GSAT, GW = 22000.0, 0.3, 28.0, 7.0, 18.5, 20.5, 9.81
XMIN, XMAX, FONDO = 0.0, 40.0, -20.0
GWT = [(0, -10), (12, -10), (22, -6), (40, -6)]

def terreno(x):
    if x <= 12: return -9.0
    if x >= 12 + 6 / math.tan(math.radians(30)): return -3.0
    return -9.0 + (x - 12) * math.tan(math.radians(30))

def ygwt(x):
    for (x0, y0), (x1, y1) in zip(GWT, GWT[1:]):
        if x <= x1: return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return GWT[-1][1]

def malla(dx, ny):
    nx = int(round((XMAX - XMIN) / dx))
    xs = [XMIN + i * (XMAX - XMIN) / nx for i in range(nx + 1)]
    nodes = {}
    for i, x in enumerate(xs):
        h = terreno(x) - FONDO
        for j in range(ny + 1): nodes[(i, j)] = (x, FONDO + h * j / ny)
    els = [((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)) for i in range(nx) for j in range(ny)]
    return nx, nodes, els

GP = [(-1 / math.sqrt(3), -1 / math.sqrt(3)), (1 / math.sqrt(3), -1 / math.sqrt(3)), (1 / math.sqrt(3), 1 / math.sqrt(3)), (-1 / math.sqrt(3), 1 / math.sqrt(3))]

def cargas(nodes, els, modo, ru=0.0):
    """Fg (peso) y Fp (∫Bt m p) por nudo, integración 2x2; modo: sin | gwt | ru"""
    F = {k: [0.0, 0.0] for k in nodes}
    pn = {}
    if modo == "gwt":
        for k, (x, y) in nodes.items(): pn[k] = max(0.0, GW * (ygwt(x) - y))
    for el in els:
        xy = np.array([nodes[k] for k in el])
        for (r, s) in GP:
            N = 0.25 * np.array([(1 - r) * (1 - s), (1 + r) * (1 - s), (1 + r) * (1 + s), (1 - r) * (1 + s)])
            dNr = 0.25 * np.array([-(1 - s), (1 - s), (1 + s), -(1 + s)]); dNs = 0.25 * np.array([-(1 - r), -(1 + r), (1 + r), (1 - r)])
            J = np.array([[dNr @ xy[:, 0], dNr @ xy[:, 1]], [dNs @ xy[:, 0], dNs @ xy[:, 1]]]); dJ = np.linalg.det(J); Ji = np.linalg.inv(J)
            dN = Ji @ np.array([dNr, dNs])   # fila 0 = dN/dx, fila 1 = dN/dy
            xg, yg = N @ xy[:, 0], N @ xy[:, 1]
            if modo == "gwt":
                gam = GSAT if yg < ygwt(xg) else GAM; pg = float(N @ np.array([pn[k] for k in el]))
            elif modo == "ru":
                gam = GSAT; pg = ru * GAM * max(0.0, terreno(xg) - yg)
            else:
                gam = GAM; pg = 0.0
            for a, k in enumerate(el):
                F[k][1] += -N[a] * gam * dJ
                F[k][0] += dN[0, a] * pg * dJ; F[k][1] += dN[1, a] * pg * dJ
    return F

def corre(nodes, els, nx, F, srf):
    ops.wipe(); ops.model("basic", "-ndm", 2, "-ndf", 2)
    tag = {k: i + 1 for i, k in enumerate(nodes)}
    for k, (x, y) in nodes.items(): ops.node(tag[k], x, y)
    for k in nodes:
        i, j = k
        if j == 0: ops.fix(tag[k], 1, 1)
        elif i == 0 or i == nx: ops.fix(tag[k], 1, 0)
    phi = math.atan(math.tan(math.radians(PHI)) / srf); c = C / srf; sp = math.sin(phi)
    alpha = 2 * sp / (math.sqrt(3) * (3 + sp)); kk = 2 * math.sqrt(3) * c * math.cos(phi) / (3 + sp)
    K, G = E / (3 * (1 - 2 * NU)), E / (2 * (1 + NU))
    ops.nDMaterial("DruckerPrager", 1, K, G, math.sqrt(3) * kk, math.sqrt(2) * alpha, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    ops.nDMaterial("PlaneStrain", 2, 1)
    for n, el in enumerate(els): ops.element("SSPquad", n + 1, *[tag[k] for k in el], 2, "PlaneStrain", 1.0, 0.0, 0.0)
    ops.timeSeries("Linear", 1); ops.pattern("Plain", 1, 1)
    for k, (fx, fy) in F.items(): ops.load(tag[k], fx, fy)
    ops.constraints("Plain"); ops.numberer("RCM"); ops.system("BandGeneral"); ops.test("NormDispIncr", float(__import__("os").environ.get("OS_TOL", "1e-6")), int(__import__("os").environ.get("OS_ITER", "60")), 0)
    ops.algorithm("Newton"); ops.integrator("LoadControl", 0.05); ops.analysis("Static")
    ok = ops.analyze(20)
    return ok == 0

def fs(nodes, els, nx, F):
    lo, hi = 1.0, 4.0
    if not corre(nodes, els, nx, F, 1.0): return 1.0
    while hi - lo > 0.01:
        mid = 0.5 * (lo + hi)
        if corre(nodes, els, nx, F, mid): lo = mid
        else: hi = mid
    return lo

if __name__ == "__main__":
    caso = sys.argv[1] if len(sys.argv) > 1 else "sin"
    dx = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5; ny = int(sys.argv[3]) if len(sys.argv) > 3 else 36
    nx, nodes, els = malla(dx, ny)
    modo, ru = ("ru", float(caso[2:])) if caso.startswith("ru") else (caso, 0.0)
    t0 = time.time(); F = cargas(nodes, els, modo, ru)
    print("%s: %d nudos, %d SSPquad, dx=%.2f ny=%d, sumaFy=%.1f kN" % (caso, len(nodes), len(els), dx, ny, sum(v[1] for v in F.values())))
    print("FS OpenSees (%s) = %.3f   [%.0f s]" % (caso, fs(nodes, els, nx, F), time.time() - t0))
