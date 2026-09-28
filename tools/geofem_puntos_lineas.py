# -*- coding: utf-8 -*-
"""Puntos libres y líneas libres en GEO5 2024 FEM, por la interfaz.

`hgeo_to_geo5.py` esperaba para las líneas libres un diálogo de lista de puntos (TGeo2DDlgGBoundary)
que en GeoFEM 2024 NO existe: una línea libre se define ENTRE DOS PUNTOS ya existentes
(diálogo «New free line»: tipo segment/arc/circle + punto inicial + punto final). Medido el
28-sep-2026 con el muro de Manabí. Por eso primero van los puntos y después los segmentos.

    python tools/geofem_puntos_lineas.py puntos "10.4,0 10.4,-2.6 12.3,-2.6"
    python tools/geofem_puntos_lineas.py ver <nombre>
    python tools/geofem_puntos_lineas.py linea <objeto_ini> <n_ini> <objeto_fin> <n_fin>

GeoFEM abierto, maximizado, en modo topología. Pantalla 2560×1600.
"""
import os, sys, time, warnings
warnings.filterwarnings("ignore")
os.environ["G5_EXE"] = "GeoFEM_5_EN.exe"
ESCUELA = r"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\hekatan-school"
sys.path.insert(0, ESCUELA); sys.path.insert(0, os.path.join(ESCUELA, "serie_muro_manabi"))
import grabar_gui as gg, g5
from pywinauto.keyboard import send_keys

SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "shots", "geo5", "muro_manabi")
os.makedirs(SHOTS, exist_ok=True)
FX = 2440
F_PUNTOS, F_LINEAS = 548, 586


def pulsa(x, y, espera=0.8):
    gg.mover(x, y, 0.3); gg.clic(); time.sleep(espera)


def teclea(x, y, valor):
    gg.mover(x, y, 0.3); gg.clic(doble=True); time.sleep(0.15)
    send_keys("{HOME}+{END}{BACKSPACE}" + g5.teclas_de(str(valor)) + "{TAB}", pause=0.03); time.sleep(0.3)


def dialogo(clase, t=6.0):
    t0 = time.time()
    while time.time() - t0 < t:
        for w in g5.ventanas():
            if w.class_name() == clase: return w
        time.sleep(0.2)
    return None


def foto(nombre, caja=None):
    im, _ = gg.captura(caja)
    p = os.path.join(SHOTS, nombre + ".png"); im.save(p); return p


def campos(w, clase="TEnvTextInputEx"):
    return sorted([c for c in w.descendants() if c.class_name() == clase and c.is_visible()],
                  key=lambda c: (c.rectangle().top, c.rectangle().left))


def avisos():
    """Cierra los avisos de GEO5 y devuelve cuántos hubo (el texto no es accesible: se captura)."""
    n = 0
    for w in g5.ventanas():
        if w.class_name() == "TMsgBox":
            n += 1; foto("aviso_%d" % int(time.time()))
            for c in w.descendants():
                if c.class_name() == "TEnvButton" and c.window_text().replace("&", "") in ("OK", "No", "Yes"):
                    c.click_input(); time.sleep(0.8); break
    return n


def puntos(lista):
    g5.al_frente(); pulsa(FX, F_PUNTOS, 1.2)
    pulsa(412, 1188, 0.3)                                  # Add textually
    d = dialogo("TGeoFEMDlgFreePoint")
    if d is None: raise SystemExit("no sale «New free points»")
    time.sleep(0.8)
    for k, (x, z) in enumerate(lista):
        cs = campos(d)
        rx, rz = cs[0].rectangle(), cs[1].rectangle()
        teclea(rx.left + 60, (rx.top + rx.bottom) // 2, "%g" % x)
        teclea(rz.left + 60, (rz.top + rz.bottom) // 2, "%g" % z)
        leido = [c.window_text() for c in campos(d)]
        add = [c for c in d.descendants() if c.class_name() == "TEnvButton" and c.window_text() == "Add"][0]
        r = add.rectangle(); pulsa((r.left + r.right) // 2, (r.top + r.bottom) // 2, 0.9)
        print("   punto %d: %g, %g  (leído %s)  avisos %d" % (k + 1, x, z, leido, avisos()))
    d = dialogo("TGeoFEMDlgFreePoint", 1.0)
    if d is not None:
        c = [c for c in d.descendants() if c.class_name() == "TEnvButton" and c.window_text() == "Cancel"][0]
        r = c.rectangle(); pulsa((r.left + r.right) // 2, (r.top + r.bottom) // 2, 0.8)
    foto("puntos")


def elegir(desplegable, texto_o_indice):
    """Abre un TEnvDropDown y elige por posición (0 = el primero) con el teclado."""
    r = desplegable.rectangle()
    pulsa(r.right - 16, (r.top + r.bottom) // 2, 0.5)
    send_keys("{HOME}" + "{DOWN}" * int(texto_o_indice) + "{ENTER}", pause=0.05); time.sleep(0.5)


def linea(obj_ini, n_ini, obj_fin, n_fin, nombre="linea"):
    """obj = posición en la lista «Point object» (se mira en la captura); n = posición en la lista «Point»."""
    g5.al_frente(); pulsa(FX, F_LINEAS, 1.2)
    pulsa(412, 1188, 0.3)
    d = dialogo("TGeoFEMDlgFreeLine")
    if d is None: raise SystemExit("no sale «New free line»")
    time.sleep(0.8)
    dd = lambda: sorted([c for c in d.descendants() if c.class_name() == "TEnvDropDown" and c.is_visible()],
                        key=lambda c: (c.rectangle().top, c.rectangle().left))
    elegir(dd()[0], 0)                                     # Line type: segment
    ds = dd()                                              # [tipo, objeto ini, objeto fin, punto ini, punto fin]
    elegir([c for c in ds if c.rectangle().left < 600 and 700 < c.rectangle().top < 730][0], obj_ini)
    elegir([c for c in dd() if c.rectangle().left < 600 and 740 < c.rectangle().top < 770][0], n_ini)
    elegir([c for c in dd() if c.rectangle().left > 600 and 700 < c.rectangle().top < 730][0], obj_fin)
    elegir([c for c in dd() if c.rectangle().left > 600 and 740 < c.rectangle().top < 770][0], n_fin)
    r = d.rectangle(); foto(nombre + "_antes", (r.left, r.top, r.right, r.bottom))
    add = [c for c in d.descendants() if c.class_name() == "TEnvButton" and c.window_text() == "Add"][0]
    rr = add.rectangle(); pulsa((rr.left + rr.right) // 2, (rr.top + rr.bottom) // 2, 1.0)
    n = avisos()
    d2 = dialogo("TGeoFEMDlgFreeLine", 1.0)
    if d2 is not None:
        foto(nombre + "_despues", (r.left, r.top, r.right, r.bottom))
        c = [c for c in d2.descendants() if c.class_name() == "TEnvButton" and c.window_text() == "Cancel"][0]
        rc = c.rectangle(); pulsa((rc.left + rc.right) // 2, (rc.top + rc.bottom) // 2, 0.8)
    print("   línea %s: objeto %s punto %s → objeto %s punto %s · avisos %d" % (nombre, obj_ini, n_ini, obj_fin, n_fin, n))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "puntos":
        puntos([tuple(float(v) for v in p.split(",")) for p in sys.argv[2].split()])
    elif cmd == "linea":
        linea(*[int(v) for v in sys.argv[2:6]], nombre=sys.argv[6] if len(sys.argv) > 6 else "linea")
    elif cmd == "ver":
        g5.al_frente(); print(foto(sys.argv[2]))
