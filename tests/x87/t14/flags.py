# -*- coding: utf-8 -*-
"""Tanda 14: bandera de GEO5 por PG (Restart_Step) frente a la región del último commit del motor (p14_k*_reg.bin). Uso: python flags.py k1,k2"""
import sys, os, numpy as np
AQ = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(AQ, "..", "t9")); from rs_gp import lee
FM = r"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_capture\files_muro"
RS = ["160230", "160235", "160239", "160243", "160246", "160249", "160252", "160255", "160259", "160302"]
P = np.array([6, 2, 0, 1, 3, 4, 5]); pre = sys.argv[2] if len(sys.argv) > 2 else "p14"
for k in map(int, sys.argv[1].split(",")):
    g = lee(os.path.join(FM, RS[k - 1] + "_Restart_Step.bin")); fl = g["fl"][:, P]
    R = np.fromfile(os.path.join(AQ, "%s_k%d_reg.bin" % (pre, k)), np.int8).reshape(-1, 7)[23:]
    print("paso", k)
    for f in np.unique(fl):
        m = fl == f; print("  G5 flag %3d: n %5d  motor reg %s" % (f, m.sum(), dict(zip(*[x.tolist() for x in np.unique(R[m], return_counts=True)]))))
