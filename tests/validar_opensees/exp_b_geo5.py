# -*- coding: utf-8 -*-
"""Experimento (b) · UN T6 con Drucker-Prager 'extension', c = 0, tensión impuesta: solver REAL de GEO5 (FRGeoFEM_2024.exe sin ventana) con el InputFile de mk_1elem.py.
  python exp_b_geo5.py q1,q2,...   (kPa de tracción horizontal en el lado izquierdo; 0 = solo gravedad)  ->  geo5_1elem_q<q>.json con los 6 desplazamientos nodales y las tensiones nodales."""
import os, re, shutil, subprocess, sys, time, json
HR = os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_run"
BASE = os.path.expanduser("~") + r"\geo5_exp_b"; os.makedirs(BASE, exist_ok=True)
AQUI = os.path.dirname(os.path.abspath(__file__))
cs = sys.argv[2].split(",") if len(sys.argv) > 2 else ["0"]
for q, cc in [(float(x), c_) for x in (sys.argv[1] if len(sys.argv) > 1 else "0,20,40").split(",") for c_ in cs]:
    tag = "q%g_c%s" % (q, cc); w = os.path.join(BASE, tag); shutil.rmtree(w, ignore_errors=True); os.makedirs(w)
    inp0 = os.path.join(w, "in0.txt")
    subprocess.run([sys.executable, os.path.join(HR, "mk_1elem.py"), inp0, str(q), "--plain", "--c=" + cc], cwd=HR, capture_output=True)
    t = open(inp0, "rb").read().decode("mbcs")
    t = re.sub(r'(\s*)(log_file|restart_step|restart_interval|iter_file|error_file|iter_file_geo|output_file_geo|restart_in|restart_out)="([^"]*)"',
               lambda m: '%s%s="%s"' % (m.group(1), m.group(2), os.path.join(w, os.path.basename(m.group(3)))), t)
    inp = os.path.join(w, "Input.txt"); open(inp, "wb").write(t.encode("mbcs"))
    env = dict(os.environ, GEO5_SHM_VER="3", GEO5_EXE=os.path.join(HR, "FRGeoFEM_2024.exe"))
    p = subprocess.Popen([sys.executable, "-u", os.path.join(HR, "run_headless.py"), inp, os.path.join(w, "Out.txt")], cwd=HR, env=env,
                         stdout=open(os.path.join(w, "run.log"), "w"), stderr=subprocess.STDOUT)
    t0 = time.time()
    while p.poll() is None and time.time() - t0 < 180: time.sleep(2)
    if p.poll() is None: p.kill()
    subprocess.run(["taskkill", "/F", "/IM", "FRGeoFEM_2024.exe"], capture_output=True)
    out = os.path.join(w, "Out.txt")
    if not os.path.exists(out): print(tag, "sin Out.txt"); continue
    L = open(out, errors="ignore").read().split("\n"); sec = None; U = {}; S = {}
    for l in L:
        if l.startswith("NODAL DISPLACEMENTS") and "INCLUDING" not in l: sec = "u"; continue
        if l.startswith("NODAL STRESSES"): sec = "s"; continue
        if l.startswith("NODAL ") or l.startswith("ROD ") or l.startswith("SAFETY"): sec = None if not l.startswith("NODAL STRESSES") else sec; 
        p_ = l.split()
        if sec == "u" and len(p_) >= 4:
            try: U[int(p_[1])] = (float(p_[2]), float(p_[3]))
            except ValueError: pass
        if sec == "s" and len(p_) >= 6:
            try: S[int(p_[1])] = [float(x) for x in p_[2:6]]
            except ValueError: pass
    lg = os.path.join(w, "Log_File.txt"); log = open(lg, errors="ignore").read() if os.path.exists(lg) else ""
    json.dump({"q": q, "c": float(cc), "convergio": ("CONVERGENCE FAILURE" not in log and "EXCEEDED" not in log), "u": U, "s": S, "iteraciones": log.count("Iteration"), "log_cola": log[-600:]}, open(os.path.join(AQUI, "geo5_1elem_%s.json" % tag), "w"))
    print(tag, "convergió:", ("CONVERGENCE FAILURE" not in log and "EXCEEDED" not in log), "| u(3):", U.get(3), "| it:", log.count("Iteration"), flush=True)
