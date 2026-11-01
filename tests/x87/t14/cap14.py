# -*- coding: utf-8 -*-
"""Tanda 14: solver REAL de GEO5 sobre la fase 1 (hacer_input.py) parado en cada aviso de progreso. Durante el paso de carga K (por el Log_File):
  - u (nudo+0x18) y DDisp (nudo+0x1c) de los 5686 nudos;
  - las copias en memoria del registro de PG del elemento E (0-based del JSON) PG Q: se localizan al empezar el paso buscando sx,sy del
    Restart_Step anterior; en cada aviso se leen 4 KB alrededor de cada copia.
Uso: python cap14.py <carpeta> [K=3] [E=520] [Q=2]   -> <carpeta>/cap/NNNNN.npz, captura.txt"""
import sys, os, struct, numpy as np, hashlib, ctypes as C
sys.path.insert(0, r"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\tools")
AQ = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(AQ, "..", "t11")); sys.path.insert(0, os.path.join(AQ, "..", "t9"))
import geo5_solver as G, memg5
from rs_gp import lee, H0, BLK, HDR, REC
FM = r"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_capture\files_muro"
RS = ["160224", "160230", "160235", "160239", "160243", "160246", "160249", "160252", "160255", "160259", "160302"]
d = os.path.abspath(sys.argv[1]); K = int(sys.argv[2]) if len(sys.argv) > 2 else 3; E = int(sys.argv[3]) if len(sys.argv) > 3 else 520; Q = int(sys.argv[4]) if len(sys.argv) > 4 else 2
P = [6, 2, 0, 1, 3, 4, 5]; kk = E - 23; r = P[Q]
b = open(os.path.join(FM, RS[K - 1] + "_Restart_Step.bin"), "rb").read(); o = H0 + kk * BLK + HDR + r * REC
PAT = b[o + 32:o + 48]   # sx, sy del paso anterior
inp = os.path.join(d, "Input.txt"); G.rutas_a_su_carpeta(inp)
cap = os.path.join(d, "cap"); os.makedirs(cap, exist_ok=True)
n = [0]; st = {"A": None, "m": None, "G": None}; s = G.Geo5Solver(cwd=d); out = open(os.path.join(d, "captura.txt"), "w")
NN = 5686; SZ = 0x1d8
def paso():   # pasos completados = escrituras de Restart_Step.bin (la 1.ª = estado inicial); el Log_File se vacía a trozos
    try: h = os.stat(os.path.join(d, "Restart_Step.bin")).st_mtime_ns
    except OSError: return 0, 0
    if h != st.get("h"): st["h"] = h; st["nrs"] = st.get("nrs", 0) + 1
    return st["nrs"], 0
def mirar():
    n[0] += 1
    k, nit = paso()
    if k < K or k > K: 
        return k > K
    if st["m"] is None: st["m"] = memg5.Mem(s.proc.pid)
    m = st["m"]
    if st["A"] is None:
        h1 = m.buscar(struct.pack("<dd", 9.28, -3.0)); h2 = set(m.buscar(struct.pack("<dd", 9.710832, -3.0)))
        st["A"] = [a for a in h1 if a + SZ in h2][0]
    if st["G"] is None:
        st["G"] = m.buscar(PAT, 20); out.write("ev %d: copias del PG %s\n" % (n[0], [hex(a) for a in st["G"]]))
    bb = m.read(st["A"], NN * SZ); vals = np.zeros((2, NN, 2))
    for i in range(NN):
        for j, off in enumerate((0x18, 0x1c)):
            p = struct.unpack_from("<I", bb, i * SZ + off)[0]
            q = m.read(p, 16) if p else None
            if q: vals[j, i] = struct.unpack("<2d", q)
    gp = [m.read(a - 2048, 4096) or b"" for a in st["G"]]
    cod = C.c_int32.from_address(s.view + G.OFF_PROG).value
    np.savez(os.path.join(cap, "%05d.npz" % n[0]), v=vals, ev=n[0], it=nit, cod=cod, gaddr=np.array(st["G"]), gp=np.array([np.frombuffer(g.ljust(4096, b"\0"), np.uint8) for g in gp]))
    out.write("ev %d cod %d it %d |u| %.9e |dd| %.9e\n" % (n[0], cod, nit, np.linalg.norm(vals[0]), np.linalg.norm(vals[1]))); out.flush()
    return False
try:
    s.start(); s.calcular(inp, os.path.join(d, "OutputFile.txt"), "", 3600, cancelar=mirar)
finally:
    s.close(); out.close()
