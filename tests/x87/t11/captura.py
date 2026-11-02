# -*- coding: utf-8 -*-
"""Corre el muro con el solver real y en CADA aviso de progreso lee de la memoria, para los 5686 nudos (orden del Input),
los vectores apuntados por nudo+0x18 (u) y nudo+0x1c (?) ; guarda cada estado distinto en cap/NNNNN.npz.
Uso: python captura.py <carpeta> [evento_desde=1] [evento_hasta=99999]"""
import sys, os, struct, numpy as np, hashlib
sys.path.insert(0, os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\tools")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geo5_solver as G, memg5
d = os.path.abspath(sys.argv[1]); E0 = int(sys.argv[2]) if len(sys.argv) > 2 else 1; E1 = int(sys.argv[3]) if len(sys.argv) > 3 else 99999
OFFS = [0x18, 0x1c, 0x1d0]
inp = os.path.join(d, "Input.txt"); G.rutas_a_su_carpeta(inp)
cap = os.path.join(d, "cap"); os.makedirs(cap, exist_ok=True)
n = [0]; st = {"A": None, "m": None, "last": None}; s = G.Geo5Solver(cwd=d); out = open(os.path.join(d, "captura.txt"), "w")
NN = 5686; SZ = 0x1d8
def mirar():
    n[0] += 1
    if n[0] < E0 or n[0] > E1: return False
    if st["m"] is None: st["m"] = memg5.Mem(s.proc.pid)
    m = st["m"]
    if st["A"] is None:
        h1 = m.buscar(struct.pack("<dd", 9.28, -3.0)); h2 = set(m.buscar(struct.pack("<dd", 9.710832, -3.0)))
        A = [a for a in h1 if a + SZ in h2]
        if not A: return False
        st["A"] = A[0]; out.write("evento %d: arreglo A %#x\n" % (n[0], A[0]))
    b = m.read(st["A"], NN * SZ)
    if not b: return False
    vals = np.zeros((len(OFFS), NN, 2))
    for k in range(NN):
        for j, off in enumerate(OFFS):
            p = struct.unpack_from("<I", b, k * SZ + off)[0]
            q = m.read(p, 16) if p else None
            if q: vals[j, k] = struct.unpack("<2d", q)
    h = hashlib.md5(vals.tobytes()).hexdigest()
    if h != st["last"]:
        st["last"] = h
        lg = os.path.getsize(os.path.join(d, "Log_File.txt")) if os.path.exists(os.path.join(d, "Log_File.txt")) else -1
        np.savez(os.path.join(cap, "%05d.npz" % n[0]), v=vals, ev=n[0])
        p = s.view + G.OFF_PROG
        out.write("ev %d  cod %d  |u18| %.6e |u1c| %.6e |u1d0| %.6e  log %d\n" % (n[0], C.c_int32.from_address(p).value,
                  *[np.linalg.norm(vals[j]) for j in range(3)], lg)); out.flush()
    return False
import ctypes as C
try:
    s.start(); s.calcular(inp, os.path.join(d, "OutputFile.txt"), "", 3600, cancelar=mirar)
finally:
    s.close(); out.close()
