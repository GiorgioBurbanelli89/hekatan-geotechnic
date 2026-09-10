# -*- coding: utf-8 -*-
"""
hgeo_to_geo5.py — teclea un modelo .hgeo de Hekatan Geotechnic en la GUI de GEO5 2024 FEM (GeoFEM) y deja que
GEO5 lo malle, lo calcule (estabilidad por reducción c-φ) y lo GRABE como .gmk con su propio checksum.
Así cada ejemplo se verifica contra GeoFEM (Jorge, 8-sep-2026: "necesitamos verificar nuestros resultados y eso lo da GeoFEM").

Manejo: pywinauto (win32) sobre los controles Delphi de GEO5 (TEnvButton, TEnvTextInputControl, diálogos TGeo2DDlg*)
+ clics por coordenadas en el panel Frames (no son ventanas). Pantalla 2560x1600, GEO5 maximizado.

Uso:  python tools/hgeo_to_geo5.py examples/capa_toca_terreno.hgeo [salida.gmk] [--keep]
Deja capturas en tests/shots/geo5/<nombre>/ y escribe <salida>.txt con el FS que reporta GEO5.
"""
import os, sys, time, subprocess, re, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgeo_parse import parse_hgeo, geo5_interfaces, geo5_free_lines, complete_assign, wall_inner_point, wall_ground
from pywinauto import Application, Desktop, mouse
from pywinauto.keyboard import send_keys
from PIL import ImageGrab
import psutil
try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

EXE = r"C:\Program Files (x86)\Fine Software\GEO5 2024 EN\GeoFEM_5_EN.exe"
S = 1.28   # captura de referencia 2000x1250 → pantalla 2560x1600
FR_TOPO = {"project": 168, "settings": 198, "interfaces": 233, "soils": 263, "rigid": 293, "assign": 323, "contact": 358, "lining": 393, "freepoints": 428, "freelines": 458, "pointref": 488, "lineref": 518, "freeref": 548, "mesh": 582}
FR_STAGE = {"activity": 168, "assign": 198, "water": 233, "beams": 269, "contacts": 298, "pointsup": 328, "linesup": 358, "anchors": 393, "nails": 423, "props": 452, "reinf": 482, "surcharge": 512, "regionloads": 541, "elastic": 576, "noreduction": 606, "analysis": 641, "monitors": 671, "graphs": 701}   # con «Allow stability analysis» aparece «No reduction regions» y Analysis baja un renglón
ANCHOR_L, ANCHOR_D, ANCHOR_E, ANCHOR_FC = 16.0, 32.0, 210000.0, 800.0   # supuestos para GEO5 (el .hgeo solo trae F, cabeza y ángulo)

class Geo5:
    def __init__(self, shots, attach=False):
        self.shots = shots; os.makedirs(shots, exist_ok=True); self.n = 0; self.avisos = []
        from pywinauto.findwindows import find_windows
        if attach and find_windows(class_name="TGeoFEMFormMain", visible_only=False):   # reutilizar el GEO5 abierto: File → New
            hwnd = find_windows(class_name="TGeoFEMFormMain", visible_only=False)[0]
            self.app = Application(backend="win32").connect(handle=hwnd); self.main = self.app.window(handle=hwnd); self.pid = self.main.process_id()
            self.main.restore(); time.sleep(0.5); self.main.maximize(); time.sleep(0.8)
            try: self.main.set_focus()
            except Exception: pass
            time.sleep(0.5); self.dismiss_modals()
            if "--from" in sys.argv: self.shot("attach"); return
            self.front(); send_keys("^n"); time.sleep(1.5)
            for m in self.modals():   # ¿guardar cambios? → No
                bt = [c for c in m.descendants() if c.class_name() == "TEnvButton"]; no = [c for c in bt if "No" in c.window_text()]
                if no: no[0].click(); time.sleep(1.0)
            self.dismiss_modals(); time.sleep(1.0); self.shot("nuevo"); return
        for p in psutil.process_iter(["name"]):
            if p.info["name"] and "GeoFEM" in p.info["name"]:
                try: p.kill()
                except Exception: pass
        time.sleep(1.0); subprocess.Popen([EXE])
        from pywinauto.findwindows import find_windows
        hwnd = None
        for _ in range(240):   # el splash tarda; esperar a la ventana principal
            time.sleep(0.5); hs = find_windows(class_name="TGeoFEMFormMain")
            if hs: hwnd = hs[0]; break
            from pywinauto.controls.hwndwrapper import HwndWrapper
            for m in Desktop(backend="win32").windows():   # confirmaciones (¿quitar el autoguardado?) → Yes
                try:
                    if m.class_name() == "TMsgBox" and m.is_visible():
                        bt = [c for c in m.descendants() if c.class_name() == "TEnvButton"]; yes = [c for c in bt if "Yes" in c.window_text() or "OK" in c.window_text()]
                        (yes[0] if yes else bt[0]).click_input(); time.sleep(0.8)
                except Exception: pass
            for h in find_windows(class_name="TBsAutoSaveDlg"):   # "Restoring files" (quedó un modelo sin guardar): descartar
                w = HwndWrapper(h); r = w.rectangle(); w.set_focus(); mouse.click(coords=(r.left + 150, r.top + 250)); time.sleep(0.4)   # seleccionar la fila
                for c in w.descendants():
                    if c.class_name() == "TEnvButton" and "emove" in c.window_text(): print("   autosave: Remove"); c.click_input(); time.sleep(1.2)
        if hwnd is None: raise SystemExit("GEO5 no arrancó")
        time.sleep(3.0)
        self.app = Application(backend="win32").connect(handle=hwnd)
        self.main = self.app.window(handle=hwnd); self.pid = self.main.process_id()
        try: self.main.set_focus()
        except Exception: pass
        time.sleep(0.5); self.main.maximize(); time.sleep(1.5); self.dismiss_modals()
        r = self.main.rectangle(); print("   ventana GEO5:", r)
    # ---------- utilidades ----------
    def shot(self, tag):
        self.n += 1; fn = os.path.join(self.shots, "%02d_%s.png" % (self.n, tag)); ImageGrab.grab().save(fn); return fn
    def click(self, x, y):
        """clic en coordenadas de pantalla (captura 2000x1250) por MENSAJE al control que está debajo (sin primer plano)"""
        X, Y = int(x * S), int(y * S); self.mclick(X, Y)
    def mclick(self, X, Y):
        best = None
        for d in self.main.descendants():
            try:
                r = d.rectangle()
                if d.is_visible() and r.left <= X < r.right and r.top <= Y < r.bottom and (best is None or r.width() * r.height() < best.rectangle().width() * best.rectangle().height()): best = d
            except Exception: pass
        if best is None: best = self.main
        self.front(); mouse.click(coords=(X, Y)); time.sleep(0.6)
    def frame(self, name, stage=False): self.click(1918 if stage else 1905, (FR_STAGE if stage else FR_TOPO)[name]); time.sleep(0.6)
    def modals(self):
        out = []
        for w in Desktop(backend="win32").windows():
            try:
                if w.process_id() == self.pid and w.is_visible() and w.class_name() != "TGeoFEMFormMain" and w.rectangle().width() > 50 and w.rectangle().height() > 50: out.append(w)
            except Exception: pass
        return out
    def dismiss_modals(self):
        for m in self.modals():
            if m.class_name() == "TMsgBox":
                try: txt = [c.window_text() for c in Desktop(backend="uia").window(handle=m.handle).descendants() if c.window_text().strip() and c.window_text() not in ("OK", "Cerrar", "Yes", "No")]
                except Exception: txt = self.texts(m)
                print("   [GEO5 %s] %s" % (m.window_text(), " ".join(txt))); self.shot("aviso"); self.avisos.append(" ".join(txt))
                btns = self.buttons(m); no = [b for b in btns if "No" in b.window_text()]
                (no[0] if no else btns[0]).click() if btns else m.type_keys("{ENTER}", set_foreground=False); time.sleep(0.5)
    def buttons(self, root=None):
        root = root if root is not None else self.main
        return [c for c in root.descendants() if c.class_name() == "TEnvButton" and c.is_visible()]
    def btn(self, title, root=None, bottom_only=True):
        for c in self.buttons(root):
            t = (c.window_text().replace("&", "").splitlines() or [""])[0].strip()
            if t == title and (root is not None or not bottom_only or c.rectangle().top > 1100): return c
        raise RuntimeError("no hay botón «%s»; hay: %s" % (title, [c.window_text() for c in self.buttons(root)]))
    def inputs(self, root):
        return [d for d in root.descendants() if d.class_name() == "TEnvTextInputControl" and d.is_visible()]
    def front(self, w=None):
        """trae GEO5 (o un diálogo suyo) al PRIMER PLANO aunque otra app lo tenga (AttachThreadInput + ALT): GEO5 solo acepta
        los números por teclado real, no por mensajes → mientras corre el driver no hay que usar el ratón/teclado"""
        import win32gui, win32process, win32api, win32con
        hwnd = (w or self.main).handle
        try:
            fg = win32gui.GetForegroundWindow()
            if fg == hwnd: return
            tid = win32process.GetWindowThreadProcessId(fg)[0]; me = win32api.GetCurrentThreadId()
            win32api.keybd_event(win32con.VK_MENU, 0, 0, 0); win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
            try: win32process.AttachThreadInput(me, tid, True)
            except Exception: pass
            try: win32gui.SetForegroundWindow(hwnd)
            except Exception: pass
            try: win32process.AttachThreadInput(me, tid, False)
            except Exception: pass
            time.sleep(0.25)
        except Exception as e: print("   (front)", e)
    def typein(self, c, val):
        """teclado real (SendInput) con GEO5 al frente: los TEnvTextInputControl de Delphi ignoran WM_SETTEXT/WM_CHAR"""
        top = c.top_level_parent() if hasattr(c, "top_level_parent") else None
        self.front(top); c.click_input(); time.sleep(0.1)
        send_keys("^a{BACKSPACE}"); send_keys(str(val).replace("(", "{(}").replace(")", "{)}"), with_spaces=True, pause=0.01); send_keys("{TAB}"); time.sleep(0.12)
    def put_at(self, root, left, top, val, tol=8):
        for c in self.inputs(root):
            r = c.rectangle()
            if abs(r.left - left) <= tol and abs(r.top - top) <= tol: self.typein(c, val); return c
        raise RuntimeError("no hay campo en %d,%d; hay %s" % (left, top, [(c.rectangle().left, c.rectangle().top) for c in self.inputs(root)]))
    def field_text(self, root, left, top, tol=8):
        for c in self.inputs(root):
            r = c.rectangle()
            if abs(r.left - left) <= tol and abs(r.top - top) <= tol: return c.parent().window_text() or c.window_text()
        return ""
    def checked(self, cb):
        """estado REAL de un TEnvCheckBox por píxeles (get_check_state miente en Delphi): marca oscura dentro del cuadro"""
        r = cb.rectangle(); im = ImageGrab.grab(bbox=(r.left + 3, r.top + 4, r.left + 21, r.bottom - 4)).convert("L")
        dark = sum(1 for v in im.getdata() if v < 110); return dark > 12
    def set_checkbox(self, cb, want=True):
        for _ in range(3):
            if self.checked(cb) == want: return True
            r = cb.rectangle(); self.front(); mouse.click(coords=(r.left + 12, (r.top + r.bottom) // 2)); time.sleep(0.5)
        return self.checked(cb) == want
    def texts(self, root):
        out = []
        for d in root.descendants():
            try:
                if d.is_visible() and d.window_text().strip(): out.append(d.window_text().strip())
            except Exception: pass
        return out
    def dialog(self, cls_prefix="TGeo2DDlg", wait=4.0):
        t0 = time.time()
        while time.time() - t0 < wait:
            for m in self.modals():
                if m.class_name().startswith(cls_prefix): return m
            time.sleep(0.2)
        raise RuntimeError("no apareció el diálogo " + cls_prefix)
    def points_dialog(self, pts):
        """diálogo 'New points' (x, z + Add): teclea todos los puntos y lo cierra"""
        d = self.dialog("TGeo2DDlgGBoundary")
        for (x, z) in pts:
            ins = sorted(self.inputs(d), key=lambda c: c.rectangle().left)
            self.typein(ins[0], "%g" % x); self.typein(ins[1], "%g" % z)
            self.btn("Add", d).click(); time.sleep(0.3)
        self.btn("Cancel", d).click(); time.sleep(0.5)
    # ---------- pasos ----------
    def settings_stability(self):
        cb = None
        for intento in range(6):   # la ventana puede tardar en responder al primer clic del panel Frames
            self.frame("settings"); time.sleep(1.0)
            cbs = [c for c in self.main.descendants() if c.class_name() == "TEnvCheckBox" and c.is_visible() and "stability" in c.window_text()]
            if cbs: cb = cbs[0]; break
            self.dismiss_modals(); self.shot("settings_intento%d" % intento)
        if cb is None: raise RuntimeError("no aparece el frame Settings (¿GEO5 no está maximizado en 2560x1600?)")
        print("   Allow stability analysis:", self.set_checkbox(cb, True)); self.shot("settings_stability")
    def ranges(self, m, interfaces):
        self.frame("interfaces"); self.btn("Setup ranges").click(); d = self.dialog("TGeo2DDlgInterfaceRange")
        deepest = min(p[1] for it in interfaces for p in it); depth = deepest - m["bottom"]
        ins = sorted(self.inputs(d), key=lambda c: c.rectangle().top)
        for c, v in zip(ins, [m["xmin"], m["xmax"], depth]): self.typein(c, "%g" % v)
        self.btn("OK", d).click(); time.sleep(0.8); self.dismiss_modals()
    def interface(self, pts, k):
        self.frame("interfaces"); self.btn("Add interface").click(); time.sleep(0.8)
        self.btn("Add points textually").click(); self.points_dialog(pts)
        ok = [c for c in self.buttons() if c.window_text().startswith("OK")]; ok[0].click(); time.sleep(1.0); self.dismiss_modals()
        if any(c.window_text().startswith("OK") for c in self.buttons()):   # rechazada: cerrar el panel y seguir
            print("   !! interfaz %d rechazada" % k); self.btn("Cancel").click(); time.sleep(0.6); self.dismiss_modals()
        self.shot("interfaz%d" % k)
    def free_line(self, pts, k):
        self.frame("freelines"); self.btn("Add textually").click(); self.points_dialog(pts); time.sleep(0.5)
        ok = [c for c in self.buttons() if c.window_text().startswith("OK")]
        if ok: ok[0].click(); time.sleep(0.8)
        self.dismiss_modals(); self.shot("linea%d" % k)
    def soil(self, s):
        self.frame("soils")
        d = None
        for m in self.modals():
            if m.class_name() == "TG5SoilDlgSoil": d = m
        rigido = bool(s.get("rigido"))
        if d is None:
            self.btn("Add").click(); d = self.dialog("TG5SoilDlgSoil")
            # el desplegable de modelo (TEnvDropDown en 653,569) se abre por mensaje y se elige con teclas.
            # Drucker-Prager = 5o de la lista (medido en la GUI). Un MURO (Rigid body) va ELASTICO: se elige el
            # PRIMERO de la lista. OJO: eso NO esta verificado en la GUI todavia -> hay que mirar la captura
            # suelo_*.png y comprobar que el modelo dice "Elastic" (si no, ajustar el numero de {DOWN}).
            dd = [c for c in d.descendants() if c.class_name() == "TEnvDropDown" and c.is_visible() and abs(c.rectangle().left - 653) < 8 and abs(c.rectangle().top - 569) < 8][0]
            self.front(d); dd.click_input(); time.sleep(0.6)
            send_keys("{HOME}{ENTER}" if rigido else "{HOME}{DOWN 4}{ENTER}"); time.sleep(0.9)
            if rigido: print("   OJO: %s es RIGIDO (muro) -> modelo = 1er elemento del desplegable; comprueba en la captura que dice Elastic" % s["name"])
        E = s["E"] / 1000.0
        if rigido:   # hormigon: solo nombre, peso y elasticidad (phi y c no existen en un material elastico)
            campos = [(654, 444, s["name"]), (715, 660, s["gamma"]), (715, 702, E), (715, 828, s["nu"]), (715, 957, s["gamma"]), (1435, 444, E)]
        else:
            campos = [(654, 444, s["name"]), (715, 660, s["gamma"]), (715, 702, E), (715, 828, s["nu"]), (715, 957, s["gamma"]), (1435, 444, E), (1435, 486, s["phi"]), (1435, 528, s["c"]), (1435, 570, 0)]
        for intento in range(3):
            for (l, t, v) in campos: self.put_at(d, l, t, v)
            vacios = [(l, t) for (l, t, v) in campos if not self.field_text(d, l, t).strip()]
            if not vacios: break
            print("   campos en blanco, reintento:", vacios)
        self.btn("Add", d).click(); time.sleep(1.0)
        if any(m.class_name() == "TMsgBox" for m in self.modals()):   # rechazado (p. ej. nombre repetido al continuar con --from): se deja pasar
            self.dismiss_modals(); print("   !! GEO5 rechazó el suelo %s (¿ya existía?)" % s["name"])
        self.dismiss_modals()
    def soils_done(self):
        for m in self.modals():
            if m.class_name() == "TG5SoilDlgSoil": self.btn("Cancel", m).click(); time.sleep(0.5)
        self.shot("suelos")
    def calibrate(self, m, terrain):
        """mapa mundo→pantalla: los márgenes (líneas a trazos en xmin/xmax) dan x y la escala; un tramo horizontal del terreno da z"""
        self.frame("interfaces"); time.sleep(0.5); im = ImageGrab.grab().convert("RGB"); W, H = im.size; px = im.load()
        view = [d for d in self.main.descendants() if d.class_name() == "TSchemaViewerWithXYCross" and d.is_visible()]
        r = view[0].rectangle() if view else None
        x0, x1, y0, y1 = (r.left + 5, r.right - 5, r.top + 30, r.bottom - 30) if r else (145, 2350, 220, 1090)   # los márgenes a trazos están pegados a los bordes de la vista
        # colores EXACTOS de GEO5 (medidos): líneas (128,0,128); márgenes a trazos (192,128,192) y (126,75,126)
        def margin(p): return (p[0] > 150 and p[2] > 150 and 100 < p[1] < 160 and abs(p[0] - p[2]) < 20) or (100 < p[0] < 150 and 100 < p[2] < 150 and 50 < p[1] < 100)
        def purple(p): return p[0] > 100 and p[2] > 100 and p[1] < 60 and abs(p[0] - p[2]) < 30
        cols = [x for x in range(x0, x1) if sum(1 for y in range(y0, y1, 2) if margin(px[x, y]) or purple(px[x, y])) > 25]
        if not cols: raise RuntimeError("no encuentro los márgenes en la captura")
        pxmin, pxmax = min(cols), max(cols); k = (pxmax - pxmin) / (m["xmax"] - m["xmin"])
        # tramo horizontal del terreno más largo
        seg = max(((a, b) for a, b in zip(terrain, terrain[1:]) if abs(a[1] - b[1]) < 1e-9), key=lambda ab: abs(ab[1][0] - ab[0][0]), default=None)
        if seg is None: raise RuntimeError("el terreno no tiene tramo horizontal para calibrar z")
        xa, xb = sorted([seg[0][0], seg[1][0]]); cx0 = int(pxmin + (xa - m["xmin"]) * k) + 3; cx1 = int(pxmin + (xb - m["xmin"]) * k) - 3
        rows = [(sum(1 for x in range(cx0, cx1, 2) if purple(px[x, y])), y) for y in range(y0, y1)]
        need = 0.6 * (cx1 - cx0) / 2; cand = [y for n, y in rows if n >= need]
        if not cand: raise RuntimeError("no encuentro el tramo horizontal del terreno en la captura")
        py = min(cand); z = seg[0][1]   # el MÁS ALTO: el fondo del modelo también es una línea horizontal morada (a z=fondo)
        self.map = (pxmin, k, py, z); print("   calibración: x=%g→px %d, %.2f px/m, z=%g→py %d" % (m["xmin"], pxmin, k, z, py))
    def world(self, x, z):
        pxmin, k, py, zr = self.map; m = self.m
        return int(pxmin + (x - m["xmin"]) * k), int(py - (z - zr) * k)
    def assign(self, soils, assign):
        self.frame("assign"); time.sleep(0.6)
        names = [s["name"] for s in soils]
        for a in assign:
            i = names.index(a["soil"]) if a["soil"] in names else 0
            # los iconos de suelo CONMUTAN: clicar el ya seleccionado lo deselecciona («(not assigned)»). Por eso se clica
            # antes otro icono y luego el que toca (con un solo suelo, el primero ya está seleccionado: no se toca).
            if len(names) > 1: self.click(54 + 58 * ((i + 1) % len(names)), 935); time.sleep(0.3); self.click(54 + 58 * i, 935); time.sleep(0.3)
            X, Y = self.world(*a["p"]); print("   %s → clic en %g,%g (px %d,%d)" % (a["soil"], a["p"][0], a["p"][1], X, Y))
            self.mclick(X, Y); time.sleep(0.8); self.dismiss_modals()
        self.shot("asignar")
    def mesh(self, h):
        for intento in range(4):
            self.frame("mesh"); time.sleep(0.8); self.dismiss_modals()
            if any(abs(c.rectangle().left - 326) < 8 and abs(c.rectangle().top - 1211) < 8 for c in self.inputs(self.main)): break
        c = self.put_at(self.main, 326, 1211, h); time.sleep(0.3)
        g = [c for c in self.buttons() if c.window_text().startswith("&Generate")][0]; g.click(); time.sleep(5.0); self.dismiss_modals(); self.shot("malla")
    def stage_tab(self, i):
        self.click(707 + 62 * i, 88); time.sleep(1.0); self.dismiss_modals()
    def add_stage(self):
        self.click(503, 70); time.sleep(1.0); self.dismiss_modals()
    def surcharge(self, sc):
        self.frame("surcharge", True); self.btn("Add textually").click(); d = self.dialog("TGeo2DDlgSurcharge")
        x = min(sc["a"][0], sc["b"][0]); L = abs(sc["b"][0] - sc["a"][0])
        self.put_at(d, 177, 533, "q=%g" % sc["q"]); self.put_at(d, 311, 697, x); self.put_at(d, 311, 739, L); self.put_at(d, 311, 781, 0); self.put_at(d, 311, 945, sc["q"])
        self.btn("Add", d).click(); time.sleep(0.6)
        if any(mm.class_name() == "TGeo2DDlgSurcharge" for mm in self.modals()): self.btn("Cancel", d).click()
        time.sleep(0.4); self.dismiss_modals()
    def anchor(self, an):
        self.frame("anchors", True); self.btn("Add textually").click(); d = self.dialog("TGeo2DDlgAnchor")
        self.put_at(d, 290, 455, an["p"][0]); self.put_at(d, 290, 497, an["p"][1])
        self.put_at(d, 290, 581, ANCHOR_L); self.put_at(d, 290, 623, an["ang"]); self.put_at(d, 290, 665, 1)
        self.put_at(d, 290, 787, ANCHOR_D); self.put_at(d, 290, 829, ANCHOR_E); self.put_at(d, 290, 871, ANCHOR_FC); self.put_at(d, 290, 987, an["F"])
        self.btn("Add", d).click(); time.sleep(0.6)
        if any(mm.class_name() == "TGeo2DDlgAnchor" for mm in self.modals()): self.btn("Cancel", d).click()
        time.sleep(0.4); self.dismiss_modals()
    def analyze(self, tag):
        self.frame("analysis", True); self.shot("analysis_%s_antes" % tag)
        # tipo de análisis (desplegable del panel, si existe tras «Allow stability analysis»)
        dds = [c for c in self.main.descendants() if c.class_name() == "TEnvDropDown" and c.is_visible() and c.rectangle().top > 1100]
        print("   desplegables en Analysis:", [(c.rectangle().left, c.rectangle().top) for c in dds])
        cbs = [c for c in self.main.descendants() if c.class_name() == "TEnvCheckBox" and c.is_visible() and "stability" in c.window_text().lower()]
        if cbs:
            print("   Calculate stability based on stress analysis:", self.set_checkbox(cbs[0], True))
        else: print("   !! no hay casilla de estabilidad en Analysis (¿Settings → Allow stability analysis?)")
        a = [c for c in self.buttons() if c.window_text().startswith("&Analyze")][0]; a.click(); time.sleep(3.0)
        t0 = time.time()
        while time.time() - t0 < 900:   # mientras calcula, el botón Analyze se vuelve «Terminate»
            time.sleep(2.0); self.dismiss_modals()
            if any(c.window_text().startswith("&Analyze") for c in self.buttons()): break
        self.dismiss_modals(); fn = self.shot("analysis_%s" % tag)
        # el panel de resultados de GEO5 no es texto de ventana: OCR de Windows (tools/ocr_win.ps1) sobre el recorte del panel
        ps1 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_win.ps1")
        try: ocr = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, fn, "630", "1170", "1500", "340"], capture_output=True, text=True, timeout=120).stdout.strip().splitlines()
        except Exception as e: ocr = ["(OCR fallo: %s)" % e]
        ocr = [l.strip() for l in ocr if l.strip()]
        m = re.search(r"FS\s*=\s*([0-9]+[.,][0-9]+)", " ".join(ocr))
        fs = float(m.group(1).replace(",", ".")) if m else None
        print("   GEO5 dice:", " | ".join(ocr)); print("   FS GEO5 =", fs); return {"fs": fs, "texto": ocr}
    def save_as(self, path):
        """File → Save as (Shift+Ctrl+S). El diálogo es propio de GEO5 (TEnvOpenDialogForm): se teclea en el campo File name
        una ruta SIN ESPACIOS (C:\\Users\\j-b-j\\geo5_out\\…; el control Delphi pierde los espacios) y luego se copia al destino."""
        import shutil
        tmpdir = r"C:\Users\j-b-j\geo5_out"; os.makedirs(tmpdir, exist_ok=True); tmp = os.path.join(tmpdir, os.path.basename(path).replace(" ", "_"))
        if os.path.exists(tmp): os.remove(tmp)
        antes = set(w.handle for w in self.modals()); self.front(); send_keys("+^s"); time.sleep(2.0)
        dlg = None
        for _ in range(10):
            for w in self.modals():
                if w.handle not in antes: dlg = w
            if dlg: break
            time.sleep(0.5)
        self.shot("guardar_dialogo")
        if dlg is None: raise RuntimeError("no apareció el diálogo Guardar (File → Save as)")
        print("   diálogo guardar:", dlg.window_text(), dlg.class_name())
        # diálogo propio de GEO5 (TEnvOpenDialogForm): el campo "File name" es el TEnvTextInputControl más bajo; texto por WM_SETTEXT (con espacios)
        edits = sorted([c for c in dlg.descendants() if c.class_name() == "TEnvTextInputControl" and c.is_visible()], key=lambda c: c.rectangle().top)
        fn = edits[-1]; self.typein(fn, tmp); time.sleep(0.3)
        save = [c for c in dlg.descendants() if c.class_name() == "TEnvButton" and c.window_text().replace("&", "") == "Save"]
        if save: save[0].click()
        else: fn.type_keys("{ENTER}", set_foreground=False)
        time.sleep(3.0)
        for m in self.modals():   # ¿sobrescribir? → Sí
            try:
                yes = [c for c in m.descendants() if c.window_text().replace("&", "") in ("Yes", "Sí", "OK")]
                if yes: yes[0].click(); time.sleep(1.0)
            except Exception: pass
        self.dismiss_modals(); self.shot("guardado")
        if os.path.exists(tmp): shutil.copyfile(tmp, path); print("   .gmk:", path, os.path.getsize(path), "bytes")
        else: raise RuntimeError("GEO5 no escribió " + tmp)

def run(hgeo, out_gmk, keep=False):
    m = parse_hgeo(open(hgeo, encoding="utf-8").read())
    name = os.path.splitext(os.path.basename(hgeo))[0]
    shots = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests", "shots", "geo5", name)
    pasos = ["settings", "geometria", "suelos", "asignar", "malla", "etapas", "guardar"]
    desde = sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else "settings"
    hacer = lambda paso: pasos.index(paso) >= pasos.index(desde)
    g = Geo5(shots, attach=("--attach" in sys.argv) or desde != "settings"); g.m = m["margins"]
    if desde != "settings": g.click(645, 88); time.sleep(0.8); g.dismiss_modals()   # [Topo]
    if hacer("settings"): print("1) Settings: estabilidad"); g.settings_stability()
    ifs = geo5_interfaces(m)
    if hacer("geometria"):
        print("2) rango + %d interfaces (capas cortadas donde tocan el terreno, como exige GEO5)" % len(ifs)); g.ranges(m["margins"], ifs)
        for k, it in enumerate(ifs): print("   interfaz %d: %s" % (k + 1, " ".join("%g,%g" % p for p in it))); g.interface(it, k + 1)
        fls = geo5_free_lines(m)   # incluye el contorno ENTERRADO de cada muro (cierra la region del hormigon)
        for k, ln in enumerate(fls): print("   linea libre %d: %s" % (k + 1, " ".join("%g,%g" % q for q in ln))); g.free_line(ln, k + 1)
    if hacer("suelos"):
        print("3) %d suelos" % len(m["soils"]))
        for s in m["soils"]: g.soil(s)
        g.soils_done()
    if hacer("asignar"):
        asg = complete_assign(m)
        for w in m.get("walls", []):   # el MURO es su propia region (cerrada por su linea libre): se le asigna el hormigon
            q = wall_inner_point(w["pm"], wall_ground(m, w)); asg.append({"soil": w["soil"], "p": (round(q[0], 2), round(q[1], 2))})
        print("4) asignar:", ", ".join("%s en %g,%g" % (a["soil"], a["p"][0], a["p"][1]) for a in asg))
        g.calibrate(m["margins"], ifs[0]); g.assign(m["soils"], asg)
    if hacer("malla"): print("5) malla h=%g" % m["h"]); g.mesh(m["h"])
    if hacer("malla"): topo = os.path.splitext(out_gmk)[0] + "_topo.gmk"; print("5b) guardar topología:", topo); g.save_as(topo)
    res = []
    for i, st in enumerate(m["stages"] if hacer("etapas") else []):
        print("6) etapa %d «%s»" % (i + 1, st["name"]))
        if i == 0: g.stage_tab(0)
        else: g.add_stage()
        for sc in st["surcharges"]: g.surcharge(sc)
        for an in st["anchors"]: g.anchor(an)
        r = g.analyze("etapa%d" % (i + 1)); res.append((st["name"], r))
    if hacer("guardar"): print("7) guardar", out_gmk); g.save_as(out_gmk)
    if res:
        with open(os.path.splitext(out_gmk)[0] + "_geo5.txt", "w", encoding="utf-8") as f:
            f.write("# %s -> GEO5 2024 FEM (GeoFEM), estabilidad por reduccion de c-phi, malla propia de GEO5 (edge %g m)\n" % (os.path.basename(hgeo), m["h"]))
            for nm, r in res: f.write("%s: FS_GEO5 = %s   [%s]\n" % (nm, r["fs"], " / ".join(r["texto"])))
        print("   resultados ->", os.path.splitext(out_gmk)[0] + "_geo5.txt")
    print("listo:", out_gmk)

if __name__ == "__main__":
    hgeo = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else os.path.abspath(os.path.splitext(hgeo)[0] + ".gmk")
    run(hgeo, out, "--keep" in sys.argv)
