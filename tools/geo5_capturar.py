# -*- coding: utf-8 -*-
"""Capturador GENÉRICO de la interfaz de un programa de GEO5 2024 (para los vídeos «cada botón, cada configuración»).

    python tools/geo5_capturar.py <Programa> <archivo_ejemplo> <carpeta_salida> [--etapa N]

  <Programa> = SlopeStability | GeoFEM | SpreadFooting | CantileverWall (exe <Programa>_5_EN.exe)
Abre el ejemplo, lee por OCR (tools/ocr_cajas.ps1) la lista de marcos del panel derecho y entra en cada uno: captura,
OCR con cajas del panel inferior, controles (pywinauto) y, por cada botón SEGURO (Add, Edit, Settings, Select…), el
diálogo que abre y la lista de cada desplegable. Todo se CANCELA: no cambia el modelo ni lo guarda.
Salida: <carpeta>/<marco>.png, <marco>__<boton>.png, <marco>__dd<k>.png y inventario.json.
"""
import json, os, re, subprocess, sys, time
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from pywinauto import Application, mouse
from pywinauto.findwindows import find_windows
from pywinauto.keyboard import send_keys
from PIL import ImageGrab
import psutil
try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

PROG, ARCH, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ETAPA = int(sys.argv[sys.argv.index("--etapa") + 1]) if "--etapa" in sys.argv else 0
EXE = r"C:\Program Files (x86)\Fine Software\GEO5 2024 EN\%s_5_EN.exe" % PROG
SEGUROS = re.compile(r"^(Add|Edit|Settings|Select|Details|In detail|Project data|Show|Overview|Generator|Course|Monitors settings|Analysis settings)", re.I)
PELIGRO = re.compile(r"(Remove|Delete|Generate$|&?Generate|Analy[sz]e|Import|Export|Clear|Adopt|Run|Save|Cancel|Close|OK)", re.I)
os.makedirs(OUT, exist_ok=True)


def ocr(fn, x, y, w, h):
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(AQUI, "ocr_cajas.ps1"), fn, str(x), str(y), str(w), str(h)],
                       capture_output=True, timeout=120).stdout.decode("utf-8", "replace")   # bytes: una notificación con tildes rompía la decodificación
    out = []
    for l in r.splitlines():
        p = l.split("\t")
        if len(p) == 5:
            try: out.append([p[0], int(p[1]), int(p[2]), int(p[3]), int(p[4])])
            except ValueError: pass
    return out


def foto(nombre):
    fn = os.path.join(OUT, nombre + ".png"); ImageGrab.grab().save(fn); return fn


def ventana_principal():
    pid = None
    for p in psutil.process_iter(["name", "pid"]):
        if p.info["name"] and p.info["name"].lower() == ("%s_5_EN.exe" % PROG).lower(): pid = p.info["pid"]
    return pid


# ---------- arrancar con el ejemplo
pid = ventana_principal()
if pid is None:
    subprocess.Popen([EXE, ARCH]); t0 = time.time()
    while time.time() - t0 < 180:
        time.sleep(1.0); pid = ventana_principal()
        if pid:
            ws = [w for w in Application(backend="win32").connect(process=pid).windows() if w.is_visible() and w.rectangle().width() > 800]
            if ws: break
    time.sleep(6)
app = Application(backend="win32").connect(process=pid)
from pywinauto.controls.hwndwrapper import HwndWrapper
for _ in range(20):   # «Restoring files» (autoguardado de una sesión anterior): APLAZAR, no borrar; puede tardar en salir
    hs = find_windows(class_name="TBsAutoSaveDlg")
    if not hs:
        time.sleep(1.0)
        if [w for w in app.windows() if w.is_visible() and w.rectangle().width() > 800 and "GEO5" in w.window_text()]: break
        continue
    for c in HwndWrapper(hs[0]).descendants():
        if c.class_name() == "TEnvButton" and "Postpone" in c.window_text(): print("   autoguardado: Postpone"); c.click(); time.sleep(4)   # click() por mensaje: click_input no lo cerraba


def principal():
    ws = [w for w in app.windows() if w.is_visible()]
    return max(ws, key=lambda w: w.rectangle().width() * w.rectangle().height())


def modales():
    main = principal()
    return [w for w in app.windows() if w.is_visible() and w.handle != main.handle and w.rectangle().width() > 150]


def cerrar_modales(dejar_principal=True):
    for _ in range(4):
        ms = modales()
        if not ms: return
        for m in ms:
            bs = [c for c in m.descendants() if c.class_name() == "TEnvButton" and c.is_visible()]
            pref = [c for c in bs if re.search(r"Cancel|Close|^No$|&No", c.window_text())] or [c for c in bs if re.search(r"^OK$|&OK", c.window_text())]
            try:
                if pref: pref[0].click()
                else: m.set_focus(); send_keys("{ESC}")
            except Exception: send_keys("{ESC}")
            time.sleep(0.7)


main = principal(); main.maximize(); time.sleep(1.0)
try: main.set_focus()
except Exception: pass
cerrar_modales()
R = main.rectangle()
class _R:
    def __init__(s, a, b, c, d): s.left, s.top, s.right, s.bottom = a, b, c, d
    def width(s): return s.right - s.left
    def height(s): return s.bottom - s.top
R = _R(max(0, R.left), max(0, R.top), min(2560, R.right), min(1600, R.bottom))   # la ventana maximizada se sale 11 px de la pantalla
print("ventana:", main.window_text(), R)


def controles(w):
    r = []
    for c in w.descendants():
        try:
            if c.is_visible(): t = c.rectangle(); r.append([c.class_name(), c.window_text(), t.left, t.top, t.width(), t.height()])
        except Exception: pass
    return r


def botones_panel():
    out = []
    for c in principal().descendants():
        try:
            if c.class_name() == "TEnvButton" and c.is_visible() and c.rectangle().top > R.top + 0.62 * R.height(): out.append(c)
        except Exception: pass
    return out


def ventanas_vis():
    return {w.handle: w for w in app.windows() if w.is_visible()}


def listas(w, base, limite=40):
    """Abre CADA desplegable visible de w, captura la lista y la cierra con ESC (no cambia nada). El OCR es solo de la
    lista abierta: la ventana emergente nueva si aparece; si no, la franja bajo el desplegable."""
    res = []
    dds = [c for c in w.descendants() if c.class_name() == "TEnvDropDown" and c.is_visible()][:limite]
    for k, dd in enumerate(dds):
        try:
            r = dd.rectangle(); antes = ventanas_vis(); dd.click_input(); time.sleep(0.8)
            nuevas = [v for h, v in ventanas_vis().items() if h not in antes]
            fn = foto("%s__dd%d" % (base, k))
            if nuevas: p = nuevas[0].rectangle(); zona = (p.left, p.top, p.width(), p.height())
            else: zona = (max(0, r.left - 10), r.bottom, min(max(r.width() + 40, 420), 2560 - r.left), 600)
            send_keys("{ESC}"); time.sleep(0.4)
            res.append({"caja": [r.left, r.top, r.width(), r.height()], "valor": dd.window_text(), "png": os.path.basename(fn),
                        "zona": list(zona), "ocr": ocr(fn, *zona)})
        except Exception as e: res.append({"error": str(e)})
    return res


def pestanas(m, dn):
    """Diálogos con pestañas (TEnvPageControl): OCR de la tira de pestañas, clic en cada una y, por cada pestaña,
    captura + controles + listas. La pestaña inicial se vuelve a dejar activa."""
    out = []
    for pc in [c for c in m.descendants() if c.class_name() == "TEnvPageControl" and c.is_visible()]:
        r = pc.rectangle(); fn = foto(dn + "__tiras")
        tiras = [b for b in ocr(fn, r.left, r.top, r.width(), 40) if b[0].strip()]
        for k, (t, x, y, w_, h) in enumerate(tiras):
            try:
                mouse.click(coords=(x + w_ // 2, y + h // 2)); time.sleep(1.0)
                pn = "%s__tab%d" % (dn, k); f2 = foto(pn)
                out.append({"pestana": t, "png": os.path.basename(f2), "ocr": ocr(f2, r.left, r.top, r.width(), r.height()),
                            "controles": controles(m), "listas": listas(m, pn)})
            except Exception as e: out.append({"pestana": t, "error": str(e)})
        if tiras: mouse.click(coords=(tiras[0][1] + tiras[0][3] // 2, tiras[0][2] + tiras[0][4] // 2)); time.sleep(0.6)
    return out


# ---------- etapa (los programas con etapas de construcción tienen pestañas [1], [2]…)
TOPO = "--topo" in sys.argv
if ETAPA or TOPO:   # pestañas medidas (pantalla 2560): GeoFEM [Topo] x = 826, [1] = 905; resto [1] = 816; cada 68 px; y = 112
    x1 = 905 if PROG == "GeoFEM" else 816
    mouse.click(coords=((826 if TOPO else x1 + 68 * (ETAPA - 1)), 112)); time.sleep(2.0); cerrar_modales()

# ---------- lista de marcos (panel «Frames» a la derecha)
fn = foto("_principal")
cajas = ocr(fn, R.right - 260, R.top + 150, 250, int(0.62 * R.height()))
marcos = [b for b in cajas if b[0].strip() and not re.match(r"^(Frames|Outputs|Add Picture|Total|List of|Copy)", b[0])]
print("marcos:", [m[0] for m in marcos])
inv = {"programa": PROG, "archivo": ARCH, "etapa": ETAPA, "ventana": [R.left, R.top, R.right, R.bottom], "marcos": []}
for k, (nombre, x, y, w, h) in enumerate(marcos):
    cerrar_modales()
    mouse.click(coords=(x + w // 2, y + h // 2)); time.sleep(1.6); cerrar_modales()
    base = "%02d_%s" % (k + 1, re.sub(r"[^A-Za-z0-9]+", "_", nombre).strip("_"))
    fn = foto(base)
    panel_y = R.top + int(0.66 * R.height())
    item = {"marco": nombre, "png": base + ".png", "panel_ocr": ocr(fn, 0, panel_y, R.right - 280, R.bottom - panel_y - 60),
            "controles": [c for c in controles(principal()) if c[3] > panel_y - 40], "listas": listas(principal(), base), "dialogos": []}
    for b in botones_panel():
        t = b.window_text().replace("&", "").strip()
        if not t or not SEGUROS.match(t) or PELIGRO.search(t): continue
        try: b.click(); time.sleep(1.8)
        except Exception: continue
        ms = modales()
        if ms:
            m = ms[0]; r = m.rectangle(); dn = "%s__%s" % (base, re.sub(r"[^A-Za-z0-9]+", "_", t).strip("_"))
            fn2 = foto(dn)
            item["dialogos"].append({"boton": t, "titulo": m.window_text(), "png": dn + ".png", "caja": [r.left, r.top, r.width(), r.height()],
                                     "ocr": ocr(fn2, r.left, r.top, r.width(), r.height()), "controles": controles(m), "listas": listas(m, dn), "pestanas": pestanas(m, dn)})
            print("   ", dn, "→", m.window_text())
        cerrar_modales()
        cs = [c for c in botones_panel() if c.window_text().replace("&", "") == "Cancel"]
        if cs: cs[0].click(); time.sleep(0.6)
    inv["marcos"].append(item); print(base, "·", len(item["panel_ocr"]), "textos ·", len(item["dialogos"]), "diálogos")
    json.dump(inv, open(os.path.join(OUT, "inventario.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("fin")
