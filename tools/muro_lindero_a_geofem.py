# -*- coding: utf-8 -*-
"""El muro en L de LINDERO con dentellón (examples/muro_lindero_etapas_mc.hgeo) en GEO5 2024 FEM, por la interfaz.

    python tools/muro_lindero_a_geofem.py <paso> [<paso> ...]
    pasos: nuevo  geometria  suelos  rigido  asignar  malla  guardar_topo  etapas[=desde] [reusar]  guardar

Como el muro de Manabí (muro_manabi_a_geofem.py): en GeoFEM las regiones las crean las INTERFACES (z(x), x creciente;
una interfaz puede empezar y acabar en otra), el hormigón es un «Rigid body». Las caras «verticales» llevan 1 cm.
z = 0 en la coronación; base de la zapata a −3.90 (= contacto SP / SP-SM); terreno de delante a −3.10.
Medido el 30-sep-2026: Rigid Bodies → Add abre TG5SoilDlgSoil «Add new rigid bodies» con nombre en (909,444) y γ en
(986,573); en Assign el icono del cuerpo rígido va DESPUÉS de los suelos (3.º). Malla 0.6: 4921 nudos, 1753 elementos.
"""
import os, sys, time
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import hgeo_to_geo5 as H

M = {"xmin": 0.0, "xmax": 25.0, "bottom": -12.0}
TERRENO = [(0, -3.1), (9.99, -3.1), (10.00, 0), (10.40, 0), (25, 3.2361)]   # talud 12.5° desde la coronación
SUELOS = [(0, -3.9), (25, -3.9)]
CARA = [(9.98, -3.9), (9.99, -3.1)]                                        # cara vista enterrada (va de SUELOS al terreno)
TRASDOS = [(10.40, 0), (10.75, -3.5), (13.25, -3.5), (13.26, -3.9)]         # trasdós inclinado 0.40 → 0.75, talón, cara del talón
DENTELLON = [(12.84, -3.9), (12.85, -4.75), (13.25, -4.75), (13.26, -3.9)]
def x_tras(z): return 10.40 + 0.35 * (-z / 3.5)
CAPAS = [[(13.25, -3.5), (25, -3.5)]] + [[(round(x_tras(z), 4), z), (25, z)] for z in (-2.8, -2.1, -1.4, -0.7)]
# sobre la coronación, capas horizontales que empiezan en el talud (x = 10.40 + z·14.6/3.2361)
CAPAS += [[(round(10.40 + z * 14.6 / 3.2361, 4), z), (25, z)] for z in (0.7, 1.4, 2.1, 2.8)]
ARENAS = [{"name": "ARENA_SP", "E": 25000, "nu": 0.28, "phi": 30.0, "c": 0.0, "gamma": 18.5, "modelo": 2},
          {"name": "ARENA_SPSM", "E": 15500, "nu": 0.30, "phi": 29.97, "c": 0.0, "gamma": 17.5, "modelo": 2}]
GAMMA_HORMIGON = 23.0
MALLA = 0.6
TOPO = r"C:\Users\j-b-j\Documents\GEO5_Manabi\muro_lindero_fem_topo.gmk"
SALIDA = r"C:\Users\j-b-j\Documents\GEO5_Manabi\muro_lindero_fem_etapas.gmk"
SHOTS = os.path.join(AQUI, "..", "tests", "shots", "geo5", "muro_lindero")
# regiones de GEO5 (numeradas por GEO5, captura de Assign) y un punto dentro de cada una
REG = {1: (24.5, 2.95), 2: (24, 2.45), 3: (21, 1.75), 4: (18, 1.05), 5: (18, 0), 6: (18, -1.05), 7: (18, -1.75), 8: (18, -2.45), 9: (18, -3.15),
       10: (10.3, -2), 11: (5, -3.5), 12: (18, -3.7), 13: (13.05, -4.3), 14: (15, -8)}
MATERIAL = {r: "ARENA_SP" for r in REG}; MATERIAL.update({10: "HORMIGON", 13: "HORMIGON", 14: "ARENA_SPSM"})
# etapas = las del .hgeo: terreno (con el dentellón) · muro y tierra de delante · bajo el talón · capas 1..9
ACTIVAS = [[14, 13], [10, 11], [12], [9], [8], [7], [6], [5], [4], [3], [2], [1]]
ACTIVAS = [sum(ACTIVAS[:k + 1], []) for k in range(len(ACTIVAS))]

# centro de cada pestaña de etapa [1]..[12] en la captura a 1280 px de ancho (medido): las de dos cifras son más anchas y
# la regla de 53.2 px (hgeo_to_geo5.stage_tab) cae en el borde de la [12]
TABS = [453, 487, 521, 555, 589, 623, 657, 691, 725, 761, 800, 839]
def tab(g, k):
    g.click(TABS[k - 1] * 2 / H.S, 88); time.sleep(1.0); g.dismiss_modals()


def estado(g, r):
    """Color de la región r en el marco Activity: 'A' (verde = activa), 'I' (rojo = inactiva) o '?'."""
    from PIL import ImageGrab
    X, Y = g.world(*REG[r]); im = ImageGrab.grab((X - 8, Y - 8, X + 8, Y + 8)).convert("RGB"); v = list(im.getdata())
    rojo = sum(1 for p in v if p[0] > 200 and p[1] < 90 and p[2] < 90); verde = sum(1 for p in v if p[1] > 110 and p[0] < 170 and p[2] < 170 and p[1] > p[0] + 30)
    return "A" if verde > rojo and verde > 3 else ("I" if rojo > verde and rojo > 3 else "?")


def actividad(g, k):
    """Deja activas SOLO las regiones de ACTIVAS[k−1]. Los botones «Active»/«Inactive» se buscan POR SU TEXTO (desde la
    etapa 2 aparece «Adopt» delante y se corren: el 30-sep se activaron al revés) y cada región se COMPRUEBA por su color."""
    quiero = {r: ("A" if r in ACTIVAS[k - 1] else "I") for r in REG}
    for pasada in range(3):
        mal = [r for r in REG if estado(g, r) != quiero[r]]
        print("   etapa %d, pasada %d: %s" % (k, pasada, "todo bien" if not mal else "a corregir " + str(mal)))
        if not mal: return True
        for modo in ("Inactive", "Active"):
            rs = [r for r in mal if quiero[r] == modo[0]]
            if not rs: continue
            bs = [c for c in g.main.descendants() if c.is_visible() and c.window_text().replace("&", "").strip() == modo]
            if not bs: print("   !! no encuentro el botón", modo); return False
            bs[0].click_input(); time.sleep(0.6)
            for r in rs: g.mclick(*g.world(*REG[r])); time.sleep(0.6); g.dismiss_modals()
    return all(estado(g, r) == quiero[r] for r in REG)


def cal_etapas(g):
    """Mapa mundo→pantalla en la vista de ETAPAS (líneas grises, no moradas): los márgenes x = 0 y x = 25 son las dos
    columnas oscuras largas; el terreno de delante (z = −3.10) y la base (−3.90) las dos primeras filas largas entre ellos."""
    from PIL import ImageGrab
    im = ImageGrab.grab().convert("RGB"); px = im.load()
    dark = lambda p: sum(p) < 450
    cols = [x for x in range(300, 2300) if sum(1 for y in range(700, 1000) if dark(px[x, y])) > 250]
    x0, x1 = min(cols), max(cols); k = (x1 - x0) / (M["xmax"] - M["xmin"])
    a, b = int(x0 + 2 * k), int(x0 + 8 * k)
    rows = [y for y in range(200, 1400) if sum(1 for x in range(a, b) if dark(px[x, y])) > 0.85 * (b - a)]
    g.map = (x0, k, rows[0], -3.1)
    print("   vista de etapas: x=0→px %d, %.2f px/m, z=−3.1→py %d (base −3.9 → py %d, esperado %d)" % (x0, k, rows[0], rows[1], rows[0] + 0.8 * k))


if __name__ == "__main__":
    pasos = sys.argv[1:]
    if not pasos: raise SystemExit(__doc__)
    sys.argv = [sys.argv[0]] + (["--from", "x"] if "nuevo" not in pasos else [])
    g = H.Geo5(SHOTS, attach=True); g.m = M
    if "nuevo" in pasos: g.settings_stability()
    else: g.click(645, 88); time.sleep(0.8); g.dismiss_modals()            # [Topo]
    if "geometria" in pasos:
        g.ranges(M, [TERRENO, SUELOS])
        for k, it in enumerate([TERRENO, SUELOS, CARA, TRASDOS, DENTELLON] + CAPAS):
            print("   interfaz %d: %s" % (k + 1, " ".join("%g,%g" % p for p in it))); g.interface(it, k + 1)
        print("   avisos de GEO5:", g.avisos)
    if "suelos" in pasos:
        for s in ARENAS: g.soil(s)
        g.soils_done()
    if "rigido" in pasos:
        g.frame("rigid"); time.sleep(0.8)
        [c for c in g.buttons() if c.window_text() == "Add"][0].click(); time.sleep(1.5)
        d = [m for m in g.modals() if m.class_name() == "TG5SoilDlgSoil"][0]
        g.put_at(d, 909, 444, "HORMIGON"); g.put_at(d, 986, 573, GAMMA_HORMIGON)
        g.btn("Add", d).click(); time.sleep(1.0); g.dismiss_modals()
        for m in g.modals():
            if m.class_name() == "TG5SoilDlgSoil": g.btn("Cancel", m).click(); time.sleep(0.5)
    if "asignar" in pasos:
        g.click(34, 262); time.sleep(1.0)                                  # «ajustar a la vista»: si no, las capas de arriba del talud quedan fuera
        g.calibrate(M, TERRENO)
        g.assign([{"name": "ARENA_SP"}, {"name": "ARENA_SPSM"}, {"name": "HORMIGON"}], [{"soil": MATERIAL[r], "p": REG[r]} for r in REG])
    if "malla" in pasos: g.mesh(MALLA)
    if "guardar_topo" in pasos: g.save_as(TOPO)
    et = [p for p in pasos if p.startswith("etapas")]
    if et:
        import muro_manabi_etapas_geofem as E                              # marco() y calcular() (OCR del resultado)
        g.calibrate(M, TERRENO)
        pxm, kk, py, zr = g.map; g.map = (pxm - 15, kk, py, zr)   # el marco Activity = la vista de Topo con x = 0 unos 15 px a la izquierda (medido; OJO: el marco Analysis tiene OTRO encuadre)
        desde = int(et[0].split("=")[1]) if "=" in et[0] else 1
        for k in range(desde, len(ACTIVAS) + 1):
            if k == 1 or "reusar" in pasos: tab(g, k)                # «reusar»: las etapas ya existen (se rehace su actividad)
            else:
                if k == desde: tab(g, k - 1)
                g.add_stage()
            time.sleep(1.0); g.dismiss_modals()
            E.marco(g, "activity", k)
            if not actividad(g, k): print("   !! etapa %d: la actividad no quedó como debe; se para" % k); break
            print("etapa %d:" % k, g.shot("activity%d" % k)); E.calcular(g, k)
    if "guardar" in pasos: g.save_as(SALIDA)
    print(g.shot("fin_" + "_".join(pasos)))
