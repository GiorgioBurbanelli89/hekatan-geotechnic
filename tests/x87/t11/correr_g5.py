# -*- coding: utf-8 -*-
"""Corre el solver real GEO5 2024 sobre <carpeta>/Input.txt (--aqui) y, en CADA aviso de progreso
(el solver espera a la GUI), copia los ficheros auxiliares que cambiaron: snaps/NNNN_<nombre>.
Uso: python correr_g5.py <carpeta> [opts]"""
import sys, os, hashlib, shutil, time
sys.path.insert(0, os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\tools")
import geo5_solver as G

d = os.path.abspath(sys.argv[1]); opts = sys.argv[2] if len(sys.argv) > 2 else ""
inp = os.path.join(d, "Input.txt"); G.rutas_a_su_carpeta(inp)
snap = os.path.join(d, "snaps"); os.makedirs(snap, exist_ok=True)
vistos = {}; n = [0]; cod_log = open(os.path.join(d, "avisos.txt"), "w")

def mirar():
    n[0] += 1
    for f in os.listdir(d):
        if not (f.startswith("Iter_File") or f.startswith("Restart_Step") or f.startswith("Restart_Interval") or f.startswith("Restart_Out")):
            continue
        p = os.path.join(d, f)
        try:
            st = os.stat(p); h = (st.st_mtime_ns, st.st_size)
            if vistos.get(f) == h: continue
            b = open(p, "rb").read()
        except OSError:
            continue
        if True:
            vistos[f] = h
            lg = os.path.getsize(os.path.join(d, "Log_File.txt")) if os.path.exists(os.path.join(d, "Log_File.txt")) else -1
            nombre = "%05d_%s" % (n[0], f)
            open(os.path.join(snap, nombre), "wb").write(b)
            cod_log.write("SNAP %s log=%d\n" % (nombre, lg))
    return False

s = G.Geo5Solver(cwd=d)
try:
    s.start()
    orig = s.calcular
    t0 = time.time()
    r = s.calcular(inp, os.path.join(d, "OutputFile.txt"), opts, 3600, cancelar=mirar)
    for rec in r["progreso"][-50:]:
        cod_log.write("P %s\n" % (rec,))
finally:
    s.close(); cod_log.close()
print("avisos", n[0])
