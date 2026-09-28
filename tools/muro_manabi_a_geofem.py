# -*- coding: utf-8 -*-
"""El muro de Portoviejo (Manabí) en GEO5 2024 FEM, por la interfaz, paso a paso.

    python tools/muro_manabi_a_geofem.py <paso> [<paso> ...]
    pasos: nuevo  geometria  suelos  rigido  asignar  malla  calcular  guardar

LO QUE SE APRENDIÓ EL 28-SEP-2026 (medido en el programa, no supuesto):
  · Una LÍNEA LIBRE no crea región: con el contorno del muro hecho de líneas libres, Assign
    seguía enseñando 2 áreas y el hormigón se asignó a todo el relleno. Las regiones las crean
    las INTERFACES. El muro se dibuja con interfaces.
  · Una interfaz es z(x): x siempre creciente. Las caras verticales llevan 2 cm de desplome.
  · El hormigón NO es un suelo: va en el cuadro «Rigid Bodies» (solo pide el peso específico).
  · Una interfaz a 5 cm de la base de la zapata da el aviso W086 (puntos demasiado juntos): la
    interfaz entre suelos va a −3.00, que es la base de la zapata, y pasa por sus dos esquinas.

Geometría (m), z = 0 en la coronación; terreno de delante a −2.40; base a −3.00:
    terreno      (0,−2.4) (10,−2.4) (10.15,0) (30,0)        la cara vista del muro es parte del terreno
    suelos       (0,−3) (9.28,−3) (12.32,−3) (30,−3)        arena SP arriba, SP-SM abajo; base de la zapata
    puntera      (9.28,−3) (9.30,−2.6) (9.98,−2.6) (10,−2.4)
    trasdós      (10.40,0) (10.42,−2.6) (12.30,−2.6) (12.32,−3)
"""
import os, sys, time
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import hgeo_to_geo5 as H
from pywinauto import mouse
from pywinauto.keyboard import send_keys

M = {"xmin": 0.0, "xmax": 30.0, "bottom": -12.0}
TERRENO = [(0, -2.4), (10, -2.4), (10.15, 0), (30, 0)]
SUELOS = [(0, -3), (9.28, -3), (12.32, -3), (30, -3)]
PUNTERA = [(9.28, -3), (9.30, -2.6), (9.98, -2.6), (10, -2.4)]
TRASDOS = [(10.40, 0), (10.42, -2.6), (12.30, -2.6), (12.32, -3)]
# modelo 2 = Mohr-Coulomb: el mismo criterio (φ, c) con el que GEO5 Cantilever Wall calcula el empuje
ARENAS = [{"name": "ARENA_SP", "E": 25000, "nu": 0.28, "phi": 30.0, "c": 0.0, "gamma": 18.5, "modelo": 2},
          {"name": "ARENA_SPSM", "E": 15500, "nu": 0.30, "phi": 29.97, "c": 0.0, "gamma": 17.5, "modelo": 2}]
GAMMA_HORMIGON = 23.0
MALLA = 0.5
SALIDA = r"C:\Users\j-b-j\Documents\GEO5_Manabi\muro_manabi_fem.gmk"
SHOTS = os.path.join(AQUI, "..", "tests", "shots", "geo5", "muro_manabi2")


def area(P):
    return abs(sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))) / 2


MURO = [(9.28, -3), (12.32, -3), (12.30, -2.6), (10.42, -2.6), (10.40, 0), (10.15, 0), (10, -2.4), (9.98, -2.6), (9.30, -2.6)]

if __name__ == "__main__":
    pasos = sys.argv[1:]
    print("área del muro %.4f m² → peso %.2f kN/m (Cantilever Wall: 2.045 m², 47.04 kN/m)" % (area(MURO), area(MURO) * GAMMA_HORMIGON))
    if not pasos: raise SystemExit(__doc__)
    sys.argv = [sys.argv[0]] + (["--from", "x"] if "nuevo" not in pasos else [])
    g = H.Geo5(SHOTS, attach=True); g.m = M
    if "nuevo" in pasos:
        print("1) Settings: estabilidad"); g.settings_stability()
    else:
        g.click(645, 88); time.sleep(0.8); g.dismiss_modals()            # [Topo]
    if "geometria" in pasos:
        g.ranges(M, [TERRENO, SUELOS])
        for k, it in enumerate([TERRENO, SUELOS, PUNTERA, TRASDOS]):
            print("   interfaz %d: %s" % (k + 1, " ".join("%g,%g" % p for p in it))); g.interface(it, k + 1)
        print("   avisos de GEO5:", g.avisos)
    if "suelos" in pasos:
        for s in ARENAS: g.soil(s)
        g.soils_done()
    if "asignar" in pasos:
        g.calibrate(M, TERRENO)
        for nombre, p in (("delante", (5, -2.7)), ("relleno", (20, -1.5)), ("base", (15, -8)), ("muro", (10.25, -1.2))):
            print("   %s → px %s" % (nombre, g.world(*p)))
    if "malla" in pasos: g.mesh(MALLA)
    if "calcular" in pasos:
        g.stage_tab(0); r = g.analyze("etapa1"); print(r)
    if "guardar" in pasos: g.save_as(SALIDA)
    g.shot("fin_" + "_".join(pasos))
