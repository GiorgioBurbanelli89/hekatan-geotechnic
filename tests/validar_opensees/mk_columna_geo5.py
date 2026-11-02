# -*- coding: utf-8 -*-
"""Caso 1 · la columna elástica (2 x 10 m, 40 T6, E 20000, nu 0.3, gamma 18) como InputFile de GEO5 (formato de mk_1elem.py) y corrida con el
solver REAL (FRGeoFEM_2024.exe sin ventana). Elástico: Drucker-Prager con c = 1e6 (no plastifica). Lados sin ux, base empotrada.
  python mk_columna_geo5.py  ->  geo5_columna.json  (uy de los nudos vértice impresos)"""
import os, re, shutil, subprocess, sys, time, json
HR = os.path.expanduser("~") + r"\Documents\Hekatan Calc 1.0.0\ingenieria-inversa\hekatan-geo5-bridge\geofem_run"
W, H, nx, ny, E, nu, gam = 2.0, 10.0, 2, 10, 20000.0, 0.3, 18.0
w = os.path.expanduser("~") + r"\geo5_exp_b\columna"; shutil.rmtree(w, ignore_errors=True); os.makedirs(w)
X, Y = [], []
idn = lambda i, j: j * (2 * nx + 1) + i
for j in range(2 * ny + 1):
    for i in range(2 * nx + 1): X.append(i * W / (2 * nx)); Y.append(j * H / (2 * ny))
ELE = []
for j in range(ny):
    for i in range(nx):
        a, b, c, d = idn(2*i, 2*j), idn(2*i+2, 2*j), idn(2*i+2, 2*j+2), idn(2*i, 2*j+2)
        ELE.append([a, b, c, idn(2*i+1, 2*j), idn(2*i+2, 2*j+1), idn(2*i+1, 2*j+1)])
        ELE.append([a, c, d, idn(2*i+1, 2*j+1), idn(2*i+1, 2*j+2), idn(2*i, 2*j+1)])
caras = {}; CF = []
def cara(n1, n2, nm):
    k = frozenset((n1, n2))
    if k not in caras: caras[k] = len(caras) + 1; CF.append((caras[k], n1, n2, nm))
    return caras[k]
EF = []
for e in ELE:
    a, b, c, m1, m2, m3 = e
    EF.append([cara(a, b, m1), cara(b, c, m2), cara(c, a, m3)])
fixed_x = [n for n in range(len(X)) if X[n] == 0 or X[n] == W or Y[n] == 0]
fixed_y = [n for n in range(len(X)) if Y[n] == 0]
L = []; A = L.append
A("% GEO 5 FEM INPUT FILE"); A(""); A(""); A("problem_description"); A('  title="COLUMNA ELASTICA 40 T6"'); A("  renumber"); A("  2D"); A("  mechanical")
A("  average_multinode_samematerial"); A("  nonsymmetric"); A("  updatefull"); A("  linesearch"); A("  newtonraphson"); A("  gamma_w=1.000000E+01")
for k, f in (("log_file", "Log_File.txt"), ("restart_step", "Restart_Step.bin"), ("restart_interval", "Restart_Interval.bin"), ("iter_file", "Iter_File.bin"), ("error_file", "Error_File.txt"),
             ("iter_file_geo", "Iter_File_Geo.bin"), ("output_file_geo", "Output_File_Geo.bin"), ("restart_out", "Restart_Out.bin")): A('  %s="%s"' % (k, os.path.join(w, f)))
A("end"); A(""); A("active_fields"); A("  nodes")
for i, (x, y) in enumerate(zip(X, Y)): A("    %d x=%.6E y=%.6E" % (i + 1, x, y))
A("  end"); A(""); A("  faces")
for fid, n1, n2, nm in CF: A("    %d nodes=[%d,%d,%d]" % (fid, n1 + 1, n2 + 1, nm + 1))
A("  end"); A(""); A("  elements")
for k, (e, f) in enumerate(zip(ELE, EF)): A("    %d nodes=[%s] faces=[%s]" % (k + 1, ",".join(str(n + 1) for n in e), ",".join(str(x) for x in f)))
A("  end"); A("")
for b in ("multi_nodes","hinges","free_nodes","free_elements","free_element_sets","node_depths","elastic_elements","no_reduction_elements","quiet_boundary_nodes","quiet_boundary_faces","viscous_boundary_faces","freefield_boundary_faces"): A("  %s" % b); A("  end"); A("")
A("end"); A(""); A("altered_fields")
for b in ("new_area_multi_nodes","substitute_nodes","removed_elements_inside_massive"): A("  %s" % b); A("  end"); A("")
A("end"); A(""); A("initial_fields"); A("end"); A(""); A("problem_data"); A("  face_types"); A('    type="FL3" faces=[1-%d]' % len(CF)); A("  end"); A("")
A("  element_types"); A('    type="T6s_PlaneStrain" elements=[1-%d]' % len(ELE)); A("  end"); A("")
A("  material_types"); A('    type="SOIL_1" druckerprager extension E=%.6E nu=%.2f alpha_biot=1.00 Eur=%.6E phi_in=30.00 c_in=1.000000E+06 psi=0.00' % (E, nu, E)); A("  end"); A("")
A("  constraint_types"); A('    type="MX" fixed ct_x=c'); A('    type="MY" fixed ct_y=c'); A("  end"); A("")
A("  materials"); A('    "SOIL_1" elements=[1-%d]' % len(ELE)); A("  end"); A("")
A("  constraints"); A('    "MX" nodes=[%s]' % ",".join(str(n + 1) for n in fixed_x)); A('    "MY" nodes=[%s]' % ",".join(str(n + 1) for n in fixed_y)); A("  end"); A("end"); A("")
A("load_data"); A("  load_domain"); A("  end"); A(""); A("  load_nodes"); A("  end"); A(""); A("  load_faces"); A("  end"); A("")
A("  load_elements"); A("    gravity rho=%.6E elements=[1-%d]" % (-gam, len(ELE))); A("  end"); A(""); A("  load_excavations"); A("  end"); A("end"); A("")
# resto del archivo (solver_data) copiado del generador de un elemento
src = subprocess.run([sys.executable, os.path.join(HR, "mk_1elem.py"), os.path.join(w, "ref.txt"), "0", "--plain", "--c=1e6"], cwd=HR, capture_output=True)
ref = open(os.path.join(w, "ref.txt"), "rb").read().decode("mbcs"); tail = ref[ref.index("solver_data"):]
txt = "\r\n".join(L) + "\r\n" + tail
inp = os.path.join(w, "Input.txt"); open(inp, "wb").write(txt.encode("mbcs"))
env = dict(os.environ, GEO5_SHM_VER="3", GEO5_EXE=os.path.join(HR, "FRGeoFEM_2024.exe"))
p = subprocess.Popen([sys.executable, "-u", os.path.join(HR, "run_headless.py"), inp, os.path.join(w, "Out.txt")], cwd=HR, env=env, stdout=open(os.path.join(w, "run.log"), "w"), stderr=subprocess.STDOUT)
t0 = time.time()
while p.poll() is None and time.time() - t0 < 240: time.sleep(2)
if p.poll() is None: p.kill()
subprocess.run(["taskkill", "/F", "/IM", "FRGeoFEM_2024.exe"], capture_output=True)
U = {}; sec = None
for l in open(os.path.join(w, "Out.txt"), errors="ignore").read().split("\n"):
    if l.startswith("NODAL DISPLACEMENTS") and "INCLUDING" not in l: sec = "u"; continue
    if l.startswith("NODAL"): sec = None
    q = l.split()
    if sec == "u" and len(q) >= 4:
        try: U[int(q[1])] = (float(q[2]), float(q[3]))
        except ValueError: pass
top = [n + 1 for n in range(len(X)) if Y[n] == H]
sal = {"u": U, "top": top, "uy_cima": [U[n][1] for n in top if n in U]}
json.dump(sal, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "geo5_columna.json"), "w"))
print("GEO5 (solver real): nudos con u:", len(U), "| uy cima:", sal["uy_cima"], "| exacto -0.033429")
