# -*- coding: utf-8 -*-
"""Corre <dir>/Input.txt con el solver REAL de GEO5 2024 (FRGeoFEM_2024.exe sin ventana, run_headless.py; mata solo SU hijo).
   python correr_geo5.py <dir> [<dir> ...]   ->  <dir>/Out.txt, <dir>/Log_File.txt, <dir>/Restart_Step.bin"""
import os, sys, subprocess, time
HR = os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_run"
for d in sys.argv[1:]:
    d = os.path.abspath(d)
    for f in ("Out.txt", "Log_File.txt"):
        if os.path.exists(os.path.join(d, f)): os.remove(os.path.join(d, f))
    env = dict(os.environ, GEO5_SHM_VER="3", GEO5_EXE=os.path.join(HR, "FRGeoFEM_2024.exe"), G5_TIMEOUT="120")
    t0 = time.time()
    r = subprocess.run([sys.executable, "-u", os.path.join(HR, "run_headless.py"), os.path.join(d, "Input.txt"), os.path.join(d, "Out.txt")],
                       cwd=HR, env=env, capture_output=True, text=True, errors="ignore", timeout=200)
    open(os.path.join(d, "run.log"), "w").write(r.stdout + r.stderr)
    lg = os.path.join(d, "Log_File.txt"); log = open(lg, errors="ignore").read() if os.path.exists(lg) else ""
    fs = [l for l in open(os.path.join(d, "Out.txt"), errors="ignore") if "FS" in l][-1:] if os.path.exists(os.path.join(d, "Out.txt")) else ["sin Out"]
    print(os.path.basename(d), "%.1f s" % (time.time() - t0), "it=%d" % log.count("Iteration process"), fs[0].strip() if fs else "-", flush=True)
