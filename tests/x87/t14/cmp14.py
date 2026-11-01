# -*- coding: utf-8 -*-
"""Tanda 14: como t13/cmp_pasos.py pero con prefijo: estado tras cada paso (pasos14.ts PRE) frente a los Restart_Step de GEO5.  python cmp14.py PRE"""
import sys, os, numpy as np
AQ = os.path.dirname(os.path.abspath(__file__)); src = open(os.path.join(AQ, "..", "t13", "cmp_pasos.py"), encoding="utf-8").read()
PRE = sys.argv[1]
src = src.replace('AQUI = os.path.dirname(os.path.abspath(__file__))', 'AQUI = os.path.join(%r, "..", "t13"); OUT = %r' % (AQ, AQ))
src = src.replace('os.path.join(AQUI, "p13_k%d_sig.bin" % k)', 'os.path.join(OUT, "%s_k%%d_sig.bin" %% k)' % PRE).replace('os.path.join(AQUI, "p13_k%d_epl.bin" % k)', 'os.path.join(OUT, "%s_k%%d_epl.bin" %% k)' % PRE)
exec(compile(src, "cmp_pasos", "exec"))
