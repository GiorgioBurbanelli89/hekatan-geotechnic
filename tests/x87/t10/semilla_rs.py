# -*- coding: utf-8 -*-
"""Tanda 10: semilla por PG (orden del motor) de cualquier Restart_Step de GEO5: python semilla_rs.py <Restart_Step.bin> <salida.bin>"""
import sys, os
T9 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "t9"); sys.path.insert(0, T9)
import runpy
g = runpy.run_path(os.path.join(T9, "semilla_gp.py"), run_name="mod")
g["construir"](sys.argv[1], sys.argv[2])
