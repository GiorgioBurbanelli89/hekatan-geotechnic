# -*- coding: utf-8 -*-
"""Corre <dir>/Input.txt con el solver de GEO5 5.2022 (geofem_run/FRGeoFEM.exe, las direcciones del decompilado) y Frida
con mc_dump.js -> <dir>/g5_mc.txt (cada llamada al retorno MC).   python correr_frida.py <dir>"""
import sys, os, subprocess, time, frida, threading
HR = r"C:\Users\j-b-j\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_run"
AQUI = os.path.dirname(os.path.abspath(__file__))
d = os.path.abspath(sys.argv[1]); out = os.path.join(d, "Out22.txt"); dump = os.path.join(d, "g5_mc.txt")
for f in (out, os.path.join(d, "Log_File.txt")):
    if os.path.exists(f): os.remove(f)
env = dict(os.environ); env["GEO5_ATTACH_WAIT"] = "6"; env.pop("GEO5_EXE", None); env.pop("GEO5_SHM_VER", None)
p = subprocess.Popen([sys.executable, "-u", os.path.join(HR, "run_headless.py"), os.path.join(d, "Input.txt"), out], cwd=HR,
                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
pid = None; lines = []
threading.Thread(target=lambda: [lines.append(l.rstrip()) for l in p.stdout], daemon=True).start()
t0 = time.time()
while pid is None and time.time() - t0 < 30:
    for l in lines:
        if l.startswith("PID_SOLVER="): pid = int(l.split("=")[1])
    time.sleep(0.1)
if pid is None: print("sin PID"); p.kill(); raise SystemExit(1)
s = frida.get_local_device().attach(pid)
sc = s.create_script(open(os.path.join(AQUI, "mc_dump.js"), encoding="utf-8").read().replace("__OUT__", dump.replace("\\", "/")))
sc.on("message", lambda m, dd: print("  frida:", m.get("payload", m), flush=True)); sc.load()
t1 = time.time()
while time.time() - t1 < 150 and p.poll() is None: time.sleep(0.5)
if p.poll() is None: p.kill()
subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)   # el solver (nieto) no muere con el arnés
try: s.detach()
except Exception: pass
print("\n".join(lines[-4:])); print("fin", round(time.time() - t0, 1), "s")
