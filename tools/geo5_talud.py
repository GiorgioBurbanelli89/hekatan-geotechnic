# -*- coding: utf-8 -*-
"""Teclea un talud SENCILLO en GEO5 2024 «Slope Stability» (equilibrio límite) y saca el FS,
capturando un FOTOGRAMA por paso para el manual.

Jorge, 22-sep-2026: «haz un manual y compara con Hekatan Geotechnic; tiene que dar los mismos
valores, así mejoras Geotechnic».

El modelo es el más simple que sirve para comparar de verdad: UN suelo, terreno de cuatro puntos
con un talud, sin agua, sin sobrecarga, sin anclajes. Así la única diferencia posible entre GEO5 y
Hekatan es el MÉTODO (Bishop, Fellenius), no el modelo.

    python tools/geo5_talud.py            → tests/shots/geo5_talud/*.png + geo5_talud.json

Requiere GEO5 abierto o lo abre él. Ventana principal: TStabFormMain (32 bit).
"""
import json, os, sys, time, subprocess, warnings

warnings.filterwarnings("ignore")
from pywinauto import Application, Desktop, mouse
from pywinauto.findwindows import find_windows
from pywinauto.keyboard import send_keys
from PIL import Image, ImageDraw, ImageGrab

EXE = r"C:\Program Files (x86)\Fine Software\GEO5 2024 EN\SlopeStability_5_EN.exe"
AQUI = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(AQUI, "..", "tests", "shots", "geo5_talud")

# El talud: terreno de cuatro puntos (x, z) y un suelo. z hacia ARRIBA, en metros.
TERRENO = [(0.0, 0.0), (12.0, 0.0), (22.39, 6.0), (40.0, 6.0)]     # talud de H = 6 m a 30°
SUELO = {"name": "LIMO_ARENOSO", "gamma": 18.5, "phi": 28.0, "c": 7.0}

# Marcos del panel derecho (ventana MAXIMIZADA en 2560x1600), medidos en la captura de pantalla.
FR = {"project": 216, "settings": 254, "interfaces": 299, "soils": 337, "rigid": 375, "assign": 412,
      "anchors": 458, "nails": 496, "reinf": 534, "piles": 572, "surcharge": 610, "water": 648,
      "earthquake": 686, "stage": 724, "analysis": 769}
FR_X = 2420

os.makedirs(SHOTS, exist_ok=True)
# El contador SIGUE donde lo dejo la ejecucion anterior: si se reinicia, cada tanda pisa a la
# anterior y el manual se queda en tres fotogramas (pasado el 22-sep-2026).
_n = [len([f for f in os.listdir(SHOTS) if f.startswith("p") and f.endswith(".png")])]


def foto(texto, x=None, y=None, r=90):
    """Fotograma de la PANTALLA con el cursor dibujado y un círculo sobre lo que se pulsa."""
    im = ImageGrab.grab(all_screens=True).convert("RGB")
    d = ImageDraw.Draw(im)
    if x is not None:
        d.ellipse([x - r, y - r, x + r, y + r], outline=(255, 80, 80), width=6)
        d.polygon([(x, y), (x + 16, y + 44), (x + 22, y + 24), (x + 44, y + 20)], fill=(255, 255, 255),
                  outline=(0, 0, 0))
    d.rectangle([0, 0, im.width, 64], fill=(11, 16, 22))
    d.text((24, 22), f"{_n[0] + 1}. {texto}", fill=(240, 240, 240))
    im.save(os.path.join(SHOTS, "p%02d.png" % _n[0]))
    _n[0] += 1


class Talud:
    def __init__(self):
        hs = find_windows(class_name="TStabFormMain")
        if not hs:
            subprocess.Popen([EXE])
            for _ in range(240):
                time.sleep(0.5)
                hs = find_windows(class_name="TStabFormMain")
                if hs:
                    break
        self.app = Application(backend="win32").connect(handle=hs[0])
        self.w = self.app.window(handle=hs[0])
        self.w.restore(); time.sleep(0.4); self.w.maximize(); time.sleep(0.8)
        try: self.w.set_focus()
        except Exception: pass
        time.sleep(0.5)

    # ---------- utilidades ----------
    def modals(self):
        out = []
        for m in Desktop(backend="win32").windows():
            try:
                if m.is_visible() and m.class_name().startswith(("TGeo2DDlg", "TG5", "TMsgBox", "TEnv", "TStab")) \
                        and m.handle != self.w.handle:
                    out.append(m)
            except Exception:
                pass
        return out

    def btn(self, titulo, root=None):
        root = root or self.w
        for c in root.descendants():
            try:
                if c.class_name() == "TEnvButton" and titulo.lower() in c.window_text().lower():
                    return c
            except Exception:
                pass
        return None

    def frame(self, nombre, texto=None):
        mouse.click(coords=(FR_X, FR[nombre]))
        time.sleep(0.9)
        foto(texto or f"Marco «{nombre}»", FR_X, FR[nombre], 60)

    def nuevo(self):
        send_keys("^n"); time.sleep(1.5)
        for m in self.modals():
            b = self.btn("No", m)
            if b: b.click_input(); time.sleep(1.0)
        time.sleep(0.8)
        foto("Modelo nuevo (Ctrl+N)")


if __name__ == "__main__":
    t = Talud()
    t.nuevo()
    t.frame("interfaces", "Interfaces: el perfil del terreno")
    print("listo hasta interfaces; fotogramas en", SHOTS)
