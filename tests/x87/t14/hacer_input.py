# -*- coding: utf-8 -*-
"""Tanda 14: InputFile de la FASE 1 (peso propio en 10 pasos desde σ = 0) del muro de Manabí a partir de 160304_InputFile.txt (SRM),
con la cabecera/solver de una fase 1 real de GEO5 (files_muro_agua/173729: first_stage, restart_out, time_step 0.10) y
gravity rho = -γ por material (18.5 / 17.5 / 23 del .hgeo). Uso: python hacer_input.py <carpeta>"""
import os, sys, re
GC = r"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_capture"
src = open(os.path.join(GC, "files_muro", "160304_InputFile.txt"), encoding="latin-1").read()
ref = open(os.path.join(GC, "files_muro_agua", "173729_InputFile.txt"), encoding="latin-1").read()
d = os.path.abspath(sys.argv[1]); os.makedirs(d, exist_ok=True)
src = src.replace('title="PHASE 1, INPUT STABILITY_STRESS, CALCULATION PLASTIC"', 'title="PHASE 1, INPUT STRESS_STANDARD, CALCULATION PLASTIC"\n  first_stage')
src = src.replace("  safetyfactorstage\n", "")
src = re.sub(r"  restart_in=\"[^\"]*\"", lambda m: "  restart_out=\"C:\\x\\Restart_Out.bin\"", src)
src = src.replace("  load_elements\n  end", "  load_elements\n    gravity rho=-1.850000E+01 elements=[24-524]\n    gravity rho=-1.750000E+01 elements=[525-2684]\n    gravity rho=-2.300000E+01 elements=[1-23]\n  end")
sv = lambda t: re.search(r"solver_data\n.*?\nend\n", t, re.S).group(0)
src = src.replace(sv(src), sv(ref))
open(os.path.join(d, "Input.txt"), "w", encoding="latin-1", newline="\n").write(src)
print("ok", os.path.join(d, "Input.txt"))
