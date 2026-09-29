# Abre un .gmk en GeoFEM y calcula la etapa 1 con estabilidad (para capturar el InputFile.txt del solver).
#   python tools/_geofem_abrir_calcular.py <ruta.gmk>
import sys, time
ruta = sys.argv[1]; fila_y = sys.argv[2] if len(sys.argv) > 2 else "430"
sys.argv = ["x", "--from", "x", fila_y]; sys.path.insert(0, "tools")
import hgeo_to_geo5 as H
from pywinauto.keyboard import send_keys
from pywinauto import mouse

g = H.Geo5(r"tests/shots/geo5/muro_1etapa", attach=True)


def no_guardar():
    for m in g.modals():
        if m.class_name() == "TMsgBox":
            for c in m.descendants():
                if c.class_name() == "TEnvButton" and "No" in c.window_text(): c.click_input(); time.sleep(3)


g.front(); send_keys("^o"); time.sleep(3); no_guardar()
dlg = [m for m in g.modals() if m.class_name() == "TEnvOpenDialogForm"][0]
f = [c for c in dlg.descendants() if c.class_name() == "TEnvTextInputEx" and c.is_visible() and c.rectangle().top > 1100][0]
r = f.rectangle(); mouse.double_click(coords=((r.left + r.right) // 2, (r.top + r.bottom) // 2)); time.sleep(0.3)
# el Enter no abre: se hace doble clic en la fila de la lista cuyo nombre coincide (carpeta geo5_out del diálogo)
import os
nombre = os.path.basename(ruta)
filas = [c for c in dlg.descendants() if c.is_visible() and c.window_text() == nombre]
if filas:
    rr = filas[0].rectangle(); mouse.double_click(coords=((rr.left + rr.right) // 2, (rr.top + rr.bottom) // 2))
else:
    mouse.double_click(coords=(1024, int(fila_y)))
time.sleep(10); no_guardar()
print(g.main.window_text())
g.click(707, 88); time.sleep(3)
print(g.analyze("muro1"))
