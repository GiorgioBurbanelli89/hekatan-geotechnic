# -*- coding: utf-8 -*-
"""Experimento (a) · dinámico del muro con a(t) = 0 en el SOLVER REAL de GEO5 (FRGeoFEM_2024.exe, sin ventana; mismo conductor que exp_beta.py).
Modelo: el dinámico capturado del muro (ARENA_SP / ARENA_SPSM, 1159 nodos, Newmark 0.5/0.25), recortado a t <= TRUNC.
  orig   : acelerograma y campo libre originales
  a0     : acceleration_x = 0 y ff_* = 0   (registro nulo: si hay desplazamiento, es un desfase del algoritmo)
  a0_ff  : acceleration_x = 0 pero ff_* originales (¿lo introduce el campo libre?)
  python exp_a0_geo5.py [TRUNC=0.30] [variantes,...]
Resultado: máx |ux|, |uy| de «NODAL DISPLACEMENTS» (relativos al inicio de la etapa dinámica), por variante."""
import os, re, shutil, subprocess, sys, time
SRC = os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_capture\files_alpha"
HR = os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_run"
BASE = os.path.expanduser("~") + r"\geo5_exp_a0"
TRUNC = float(sys.argv[1]) if len(sys.argv) > 1 else 0.30
SEL = sys.argv[2].split(",") if len(sys.argv) > 2 else ["orig", "a0", "a0_ff"]
src = open(os.path.join(SRC, "053904_InputFile.txt"), "rb").read().decode("mbcs")
def hist(m, cero):
    v = m.group(2).split(","); par = [(float(v[i]), v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)]
    keep = [p for p in par if p[0] <= TRUNC]
    return m.group(1) + ",".join(s for _, a, b in keep for s in (a, "0.000000E+00" if cero else b)) + "]"
def variante(tag):
    w = os.path.join(BASE, tag); shutil.rmtree(w, ignore_errors=True); os.makedirs(w)
    shutil.copy(os.path.join(SRC, "053301_Restart_In.bin"), os.path.join(w, "Restart_In.bin"))
    t = src
    t = re.sub(r'(\s*)(log_file|restart_step|restart_interval|iter_file|error_file|iter_file_geo|output_file_geo|restart_in|restart_out)="([^"]*)"',
               lambda m: '%s%s="%s"' % (m.group(1), m.group(2), os.path.join(w, os.path.basename(m.group(3)))), t)
    a0 = tag in ("a0", "a0_ff"); ff0 = tag == "a0"
    t = re.sub(r'((?:acceleration_x)[^\n]*?history=\[)([^\]]*)\]', lambda m: hist(m, a0), t)
    t = re.sub(r'((?:ff_\w+)[^\n]*?history=\[)([^\]]*)\]', lambda m: hist(m, ff0), t)
    # Newmark clásico (0.5/0.25), el que el solver usa en GEO5 2024.20 aunque el usuario elija alfa
    t = re.sub(r'(solver_method_parameters\r?\n)(\s*gamma_dyn=[^\r\n]*\r?\n\s*beta_dyn=[^\r\n]*\r?\n)', lambda m: m.group(1) + "    gamma_dyn=0.50\r\n    beta_dyn=0.25\r\n", t, count=1)
    inp = os.path.join(w, "Input.txt"); open(inp, "wb").write(t.encode("mbcs"))
    env = dict(os.environ, GEO5_SHM_VER="3", GEO5_EXE=os.path.join(HR, "FRGeoFEM_2024.exe"))
    return subprocess.Popen([sys.executable, "-u", os.path.join(HR, "run_headless.py"), inp, os.path.join(w, "Out.txt")],
                            cwd=HR, env=env, stdout=open(os.path.join(w, "run.log"), "w"), stderr=subprocess.STDOUT), w
def pasos(w):
    f = os.path.join(w, "Log_File.txt"); return open(f, errors="ignore").read().count("LOAD STEP") if os.path.exists(f) else 0
def maximos(w):
    f = os.path.join(w, "Out.txt")
    if not os.path.exists(f): return None
    L = open(f, errors="ignore").read().split("\n"); mx = my = 0.0; n = 0; on = False
    for l in L:
        if l.startswith("NODAL DISPLACEMENTS") and "INCLUDING" not in l: on = True; continue
        if on and l.strip().startswith("NODAL"): break
        if on:
            p = l.split()
            if len(p) >= 4:                                   # índice, nudo, ux, uy
                try: mx = max(mx, abs(float(p[2]))); my = max(my, abs(float(p[3]))); n += 1
                except ValueError: pass
    return mx, my, n
os.makedirs(BASE, exist_ok=True)
for tag in SEL:                                  # uno a uno (memoria)
    p, w = variante(tag); t0 = time.time()
    while time.time() - t0 < 900 and p.poll() is None and pasos(w) < 200: time.sleep(3)
    t0b = time.time()
    while p.poll() is None and time.time() - t0b < 120: time.sleep(2)
    if p.poll() is None: p.kill()
    subprocess.run(["taskkill", "/F", "/IM", "FRGeoFEM_2024.exe"], capture_output=True)
    r = maximos(w); print("%-6s pasos %d  max|ux| %s  max|uy| %s  nodos %s   (%.0f s)" % (tag, pasos(w), *(("%.3e" % r[0], "%.3e" % r[1], r[2]) if r else ("-", "-", "-")), time.time() - t0), flush=True)
