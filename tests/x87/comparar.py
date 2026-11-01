# -*- coding: utf-8 -*-
r"""Escalon por escalon del SRM: 64 bits (log_d) contra 80 bits (log_ld) contra GEO5 (Log_File del muro). Uso: python comparar.py"""
import re, sys
pat = re.compile(r"RS=(\d+)\s+SRF=([\d.]+)\s+it=\s*(\d+)\s+eta=([\d.eE+-]+)\s+DNorm=([\d.eE+-]+)\s+OBFNorm=([\d.eE+-]+)\s+ENorm=([\d.eE+-]+)\s+\|gi\|=([\d.eE+-]+)")
def nuestro(fn):
    seq = []
    for l in open(fn, encoding="utf-8", errors="ignore"):
        m = pat.search(l)
        if not m: continue
        srf = float(m.group(2)); it = int(m.group(3)); v = [float(x) for x in m.groups()[3:]]
        if srf <= 1.0001: continue
        if it == 1: seq.append({"srf": srf, "its": []})
        seq[-1]["its"].append(v)
    return seq
def geo5(fn):
    pasos = []; cur = None
    for l in open(fn, encoding="utf-8", errors="ignore"):
        m = re.match(r"Reduction step\s+=\s+(\d+)", l)
        if m: cur = {"rs": int(m.group(1)), "its": [], "fail": False}; pasos.append(cur)
        m = re.match(r"Iteration process:\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", l)
        if m and cur is not None: cur["its"].append([float(m.group(i)) for i in (2, 3, 4, 5, 6)])
        if "CONVERGENCE FAILURE" in l and cur is not None: cur["fail"] = True
    return [p for p in pasos if p["its"] and p["rs"] >= 1]
d, ld = nuestro("log_d.txt"), nuestro("log_ld.txt")
g = geo5("../../../ingenieria-inversa/hekatan-geo5-bridge/geofem_capture/files_muro/160346_Log_File.txt")
print("escalón | 64 bits: it  eta1   |gi|1 -> fin   | 80 bits: it  eta1   |gi|1 -> fin   | GEO5: it  eta1   |gi|1 -> fin  falla")
for k in range(6):
    a = d[k] if k < len(d) else None; b = ld[k] if k < len(ld) else None; c = g[k] if k < len(g) else None
    f = lambda s: "%2d %.4f %7.3g->%-7.3g" % (len(s["its"]), s["its"][0][0], s["its"][0][4] if len(s["its"][0]) > 4 else s["its"][0][3], s["its"][-1][4] if len(s["its"][-1]) > 4 else s["its"][-1][3]) if s else "-"
    print("%2d SRF %s | %s | %s | %s %s" % (k + 1, ("%.4f" % a["srf"]) if a else "-", f(a), f(b), f(c) if c else "-", "FALLA" if c and c["fail"] else ""))
