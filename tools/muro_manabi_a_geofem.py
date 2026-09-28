# -*- coding: utf-8 -*-
"""Teclea el muro de Manabí (examples/muro_manabi.hgeo) en GEO5 2024 FEM con el driver de siempre.

    python tools/muro_manabi_a_geofem.py [--from <paso>] [--attach]

Lo único que cambia respecto a `hgeo_to_geo5.py`: el talud de la cara vista. El driver usa 0.06 m
(casi vertical); el muro del vídeo 1 tiene 0.25 m en coronación y 0.40 m en el pie, o sea 0.15 m.
Con 0.15 el área del muro sale 2.060 m² frente a 2.045 m² de GEO5 Cantilever Wall (0.7 % más:
aquí el talud arranca en el terreno de delante y no en la cara de arriba de la zapata).

Salida: Documents\\GEO5_Manabi\\muro_manabi_fem.gmk (+ _topo.gmk y _geo5.txt).
"""
import os, runpy, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import hgeo_parse
hgeo_parse.MURO_BAT = 0.15

HGEO = os.path.join(AQUI, "..", "examples", "muro_manabi.hgeo")
SALIDA = r"C:\Users\j-b-j\Documents\GEO5_Manabi\muro_manabi_fem.gmk"
sys.argv = [os.path.join(AQUI, "hgeo_to_geo5.py"), os.path.abspath(HGEO), SALIDA] + sys.argv[1:]
runpy.run_path(sys.argv[0], run_name="__main__")
