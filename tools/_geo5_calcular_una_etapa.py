# Recalcula UNA etapa del .gmk abierto en GeoFEM (para que el vigilante capture su InputFile): python tools/_geo5_calcular_una_etapa.py <k>
import sys, time
K = int(sys.argv[1])
sys.argv = ["x", "--from", "x"]; sys.path.insert(0, "tools")
import muro_manabi_etapas_geofem as E, hgeo_to_geo5 as H
g = H.Geo5(r"tests/shots/geo5/muro_agua", attach=True)
g.stage_tab(K - 1); time.sleep(2); g.dismiss_modals()
E.calcular(g, K)
print("fin")
