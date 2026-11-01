# -*- coding: utf-8 -*-
"""Tanda 12: escalera SRM iteración a iteración, Log_File de GEO5 frente al log de la copia (líneas RS=).
Uso: python cmp_log.py <Log_File.txt de GEO5> <log.txt de t12>   -> tabla por peldaño y la peor diferencia relativa en |gi| y η."""
import re, sys
g5, mo = [], []
cur = None
for l in open(sys.argv[1], encoding="mbcs", errors="replace"):
    if "REDUCTION STEP" in l: cur = None
    m = re.match(r"Iteration process:\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", l)
    if m and float(m.group(6)) > 0:
        if cur is None: cur = []; g5.append(cur)
        cur.append((float(m.group(2)), float(m.group(3)), float(m.group(6))))
prev = None
for l in open(sys.argv[2], encoding="utf-8", errors="replace"):
    m = re.match(r"\s+RS=(\d+) SRF=(\S+) it=\s*(\d+) eta=(\S+) DNorm=(\S+) .*\|gi\|=(\S+)", l)
    if m:
        if m.group(1) != prev: mo.append((float(m.group(2)), [])); prev = m.group(1)
        mo[-1][1].append((float(m.group(4)), float(m.group(5)), float(m.group(6))))
peor = 0
for k in range(max(len(g5), len(mo))):
    a = g5[k] if k < len(g5) else []; srf, b = mo[k] if k < len(mo) else (0, [])
    n = min(len(a), len(b)); dg = max([abs(b[i][2] / a[i][2] - 1) for i in range(n)] or [0]); de = max([abs(b[i][0] - a[i][0]) for i in range(n)] or [0])
    peor = max(peor, dg if len(a) == len(b) else 1)
    print("peldaño %2d SRF %.4f  it GEO5 %2d motor %2d  max|Δgi|/gi %.1e  max|Δη| %.1e  %s" % (k + 1, srf, len(a), len(b), dg, de, "OK" if len(a) == len(b) and dg < 1e-3 else "DIFIERE"))
print("peor dif relativa |gi| (1 = nº de iteraciones distinto): %.1e" % peor)
