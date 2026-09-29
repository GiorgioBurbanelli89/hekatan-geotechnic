# -*- coding: utf-8 -*-
"""El muro de Manabí en GEO5 2024 FEM (GeoFEM) CONSTRUIDO POR ETAPAS, por la interfaz, paso a paso.

    python tools/muro_manabi_etapas_geofem.py <paso> [<paso> ...]
    pasos: capas  malla  etapas  monitores  calcular  guardar

Parte del modelo del vídeo 3 (`muro_manabi_a_geofem.py`, una sola etapa, FS 1.36) abierto en GeoFEM y le
añade lo que hace falta para compararlo con Abaqus (`hekatan-school/serie_muro_manabi/abaqus_ssi/muro_pesos.py`):
  · 4 interfaces detrás del muro: el terreno bajo el talón (−3.00 a −2.60) y el relleno en 4 capas de 0.65 m;
  · etapas: 1 terreno de apoyo · 2 muro y tierra de delante · 3 terreno detrás del talón · 4 a 7 las capas;
  · monitores de punto: coronación del muro y 7 puntos bajo la zapata.
Mismas etapas que Abaqus. Diferencias que se dicen: en GeoFEM el muro es cuerpo RÍGIDO pegado al suelo (sin
contacto con rozamiento ni despegue) y el suelo es Mohr-Coulomb de GEO5.
"""
import os, sys, time
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
sys.argv = [sys.argv[0]] + sys.argv[1:] + ["--from", "x"]
import hgeo_to_geo5 as H

XT0, XT1 = 10.40, 10.42            # trasdós: de (10.40, 0) a (10.42, −2.60), 2 cm de desplome
def x_trasdos(z): return XT0 + (XT1 - XT0) * (-z / 2.6)
CAPAS = [[(12.30, -2.6), (30, -2.6)]] + [[(round(x_trasdos(z), 4), z), (30, z)] for z in (-1.95, -1.30, -0.65)]
SHOTS = os.path.join(AQUI, "..", "tests", "shots", "geo5", "muro_etapas")
SALIDA = r"C:\Users\j-b-j\Documents\GEO5_Manabi\muro_manabi_fem_etapas.gmk"

if __name__ == "__main__":
    pasos = [p for p in sys.argv[1:] if p != "--from" and p != "x"]
    if not pasos: raise SystemExit(__doc__)
    g = H.Geo5(SHOTS, attach=True)
    if "capas" in pasos:
        g.click(645, 88); time.sleep(1.0); g.dismiss_modals()                    # [Topo]
        for k, it in enumerate(CAPAS):
            print("   capa %d: %s" % (k + 1, " ".join("%g,%g" % p for p in it))); g.interface(it, 10 + k)
        print("   avisos de GEO5:", g.avisos)
    if "malla" in pasos: g.mesh(0.5)
    if "guardar" in pasos: g.save_as(SALIDA)
    print(g.shot("fin_" + "_".join(pasos)))


# ------------------------------------------------------------------ etapas (medido en la captura de 2000x1250)
def pix(x, z): return 124 + 55.72 * x, 262 - 55.7 * z
REG = {1: (20, -0.3), 2: (20, -1.0), 3: (20, -1.6), 4: (20, -2.3), 5: (11.2, -2.8), 6: (5, -2.7), 7: (20, -2.8), 8: (15, -8)}
ACTIVAS = {1: [8], 2: [8, 5, 6], 3: [8, 5, 6, 7], 4: [8, 5, 6, 7, 4], 5: [8, 5, 6, 7, 4, 3], 6: [8, 5, 6, 7, 4, 3, 2], 7: [8, 5, 6, 7, 4, 3, 2, 1]}


def marco(g, nombre, etapa):
    """Desde la etapa 2 aparece arriba el marco «Excavation» (módulo de túneles): todos bajan 30 px."""
    g.click(1918, H.FR_STAGE[nombre] + (30 if etapa > 1 else 0)); time.sleep(0.8)


def actividad(g, etapa):
    """Deja activas SOLO las regiones de ACTIVAS[etapa]: modo «Inactive» y clic en las demás; «Active» en las que tocan."""
    marco(g, "activity", etapa)
    for modo, regs in (("Inactive", [r for r in REG if r not in ACTIVAS[etapa]]), ("Active", ACTIVAS[etapa])):
        g.click(183 if modo == "Inactive" else 79, 928); time.sleep(0.5)
        for r in regs:
            g.click(*pix(*REG[r])); time.sleep(0.5); g.dismiss_modals()
    time.sleep(0.8); return g.shot("activity%d" % etapa)


def calcular(g, etapa):
    """Analysis de la etapa SIN estabilidad (el FS no se pide aquí: solo tensiones y desplazamientos)."""
    import subprocess, re
    marco(g, "analysis", etapa)
    cbs = [c for c in g.main.descendants() if c.class_name() == "TEnvCheckBox" and c.is_visible() and "stability" in c.window_text().lower()]
    if cbs: g.set_checkbox(cbs[0], False)
    a = [c for c in g.buttons() if c.window_text().startswith("&Analyze")][0]; a.click(); time.sleep(3.0)
    t0 = time.time()
    while time.time() - t0 < 1200:
        time.sleep(2.0); g.dismiss_modals()
        if any(c.window_text().startswith("&Analyze") for c in g.buttons()): break
    g.dismiss_modals(); fn = g.shot("calculo%d" % etapa)
    ps1 = os.path.join(AQUI, "ocr_win.ps1")
    ocr = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, fn, "630", "1170", "1500", "340"],
                         capture_output=True, text=True, timeout=120).stdout.strip().splitlines()
    print("   etapa %d: %.0f s · %s" % (etapa, time.time() - t0, " | ".join(l.strip() for l in ocr if l.strip())))
    return fn


def todas(g, desde=1, hasta=7):
    for k in range(desde, hasta + 1):
        if k == 1: g.stage_tab(0)
        else: g.add_stage()
        time.sleep(1.0); print("etapa %d:" % k, actividad(g, k)); calcular(g, k)
