# Calcula las etapas 1..7 del .gmk abierto en GeoFEM (sin estabilidad), guardando captura de cada una.
import sys, time
DESDE = sys.argv[1] if len(sys.argv) > 1 else "1"
sys.argv = ["x", "--from", "x"]; sys.path.insert(0, "tools")
import muro_manabi_etapas_geofem as E, hgeo_to_geo5 as H
g = H.Geo5(r"tests/shots/geo5/muro_ebowles", attach=True)
for k in range(int(DESDE), 8):
    g.stage_tab(k - 1); time.sleep(2); g.dismiss_modals()
    E.calcular(g, k)
g.save_as(r"C:\Users\j-b-j\geo5_out\muro_etapas_ebowles.gmk")
print("fin")
