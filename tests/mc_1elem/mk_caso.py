# -*- coding: utf-8 -*-
r"""UN T6 con MOHR-COULOMB (como el muro de Manabí: «mohrcoulomb», psi = 0), SRM de GEO5 (safetyfactor reduction_cphi),
mismos parámetros de solver que el muro (tol 0.01 x3, LS 0.8/3/0.1, ys 0.001/20, reducción 0.9 / relajación 2 / 3 / 0.99).
Escribe  <dir>/Input.txt  (GEO5)  y  <dir>/caso.txt  (motor nativo de Geotechnic, main_1e.cpp).

T6: esquinas 1(0,0) 2(2,0) 3(0,2); medios 4(1,0) 5(1,1) 6(0,1). Caras: 1=[1,2,4] base, 2=[2,3,5] hipotenusa, 3=[3,1,6] izquierda.
  python mk_caso.py <dir> --c=0 --phi=30 --bc=A|B --p=<kPa sobre la hipotenusa, hacia dentro> --qx=<kPa en x sobre la cara izquierda>
  bc A: base empotrada.  bc B: base empotrada + rodillo x en la cara izquierda (nudos 3, 6)."""
import os, sys, math
arg = lambda k, d: next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--" + k + "=")), d)
W = sys.argv[1]; os.makedirs(W, exist_ok=True)
c, phi, bc = float(arg("c", "0")), float(arg("phi", "30")), arg("bc", "B")
p, qx, E, nu, gam = float(arg("p", "0")), float(arg("qx", "0")), float(arg("E", "25000")), float(arg("nu", "0.28")), float(arg("g", "18.5"))
srm = arg("srm", "1") == "1"
NOD = [(1, 0.0, 0.0), (2, 2.0, 0.0), (3, 0.0, 2.0), (4, 1.0, 0.0), (5, 1.0, 1.0), (6, 0.0, 1.0)]
FACES = {1: [1, 2, 4], 2: [2, 3, 5], 3: [3, 1, 6]}
fix = {1: "xy", 2: "xy", 4: "xy"}
if bc == "B": fix.update({3: "x", 6: "x"})
loads = []   # (cara, tx, ty) constantes en kPa, componentes globales
if p: s = -p / math.sqrt(2); loads.append((2, s, s))
if qx: loads.append((3, qx, 0.0))
CR = "\r\n"; L = []; A = L.append
A("% GEO 5 FEM INPUT FILE"); A(""); A(""); A("problem_description"); A('  title="T6 MC"'); A("  renumber"); A("  2D"); A("  mechanical")
A("  average_multinode_samematerial"); A("  nonsymmetric"); A("  updatefull"); A("  linesearch"); A("  newtonraphson")
if srm: A("  safetyfactor reduction_cphi")
A("  gamma_w=1.000000E+01")
F = {"log_file": "Log_File.txt", "restart_step": "Restart_Step.bin", "restart_interval": "Restart_Interval.bin", "iter_file": "Iter_File.bin",
     "error_file": "Error_File.txt", "iter_file_geo": "Iter_File_Geo.bin", "output_file_geo": "Output_File_Geo.bin"}
if not srm: F["restart_out"] = "Restart_Out.bin"
for k, f in F.items(): A('  %s="%s"' % (k, os.path.join(os.path.abspath(W), f)))
A("end"); A(""); A("active_fields"); A("  nodes")
for i, x, y in NOD: A("    %d x=%.6E y=%.6E" % (i, x, y))
A("  end"); A(""); A("  faces")
for k, v in FACES.items(): A("    %d nodes=[%d,%d,%d]" % (k, *v))
A("  end"); A(""); A("  elements"); A("    1 nodes=[1,2,3,4,5,6] faces=[1,2,3]"); A("  end"); A("")
for b in ("multi_nodes", "hinges", "free_nodes", "free_elements", "free_element_sets", "node_depths", "elastic_elements", "no_reduction_elements",
          "quiet_boundary_nodes", "quiet_boundary_faces", "viscous_boundary_faces", "freefield_boundary_faces"): A("  " + b); A("  end"); A("")
A("end"); A(""); A("altered_fields")
for b in ("new_area_multi_nodes", "substitute_nodes", "removed_elements_inside_massive"): A("  " + b); A("  end"); A("")
A("end"); A(""); A("initial_fields"); A("end"); A(""); A("problem_data"); A("  face_types"); A('    type="FL3" faces=[1-3]'); A("  end"); A("")
A("  element_types"); A('    type="T6s_PlaneStrain" elements=[1]'); A("  end"); A(""); A("  material_types")
A('    type="SOIL_1" mohrcoulomb E=%.6E nu=%.2f alpha_biot=1.00 Eur=%.6E phi_in=%.2f c_in=%.6E psi=0.00' % (E, nu, E, phi, c))
A("  end"); A(""); A("  constraint_types"); A('    type="MX" fixed ct_x=c'); A('    type="MY" fixed ct_y=c'); A("  end"); A("")
A("  materials"); A('    "SOIL_1" elements=[1]'); A("  end"); A(""); A("  constraints")
A('    "MX" nodes=[%s]' % ",".join(str(n) for n in fix if "x" in fix[n])); A('    "MY" nodes=[%s]' % ",".join(str(n) for n in fix if "y" in fix[n]))
A("  end"); A("end"); A(""); A("load_data"); A("  load_domain"); A("  end"); A(""); A("  load_nodes"); A("  end"); A(""); A("  load_faces")
for (f, tx, ty) in loads: A("    distributed intensity=[%s] faces=[%d]" % (",".join("%.6E,%.6E" % (tx, ty) for _ in range(3)), f))
A("  end"); A(""); A("  load_elements"); A("    gravity rho=-%.6E elements=[1]" % gam); A("  end"); A(""); A("  load_excavations"); A("  end"); A("end"); A("")
A("solver_data"); A("  solver_general_parameters"); A("    tolerance_displacement=0.0100"); A("    tolerance_force=0.0100"); A("    tolerance_energy=0.0100")
A("    max_step_iterations=100"); A("    time_step=1.00"); A("    reduction_step=0.90"); A("  end"); A(""); A("  solver_method_parameters")
A("    time_step_relaxation_factor=2"); A("    time_step_max_relaxations=5"); A("    reduction_step_relaxation_factor=2"); A("    reduction_step_max_relaxations=3")
A("    min_reduction_step=0.990"); A("  end"); A(""); A("  solver_linesearch_parameters"); A("    ls_tolerance=0.8000"); A("    max_ls_iterations=3")
A("    eta_min=0.100"); A("    eta_max=1.000"); A("  end"); A(""); A("  solver_plasticity_parameters"); A("    ys_tolerance=0.00100"); A("    max_ys_iterations=20")
A("  end"); A("end"); A(""); A("monitors"); A("end"); A(""); A("output_fields"); A("  geo_detailed"); A("  strain_plastic"); A("  stress"); A("end"); A("")
A("stochastic_data"); A("end")
open(os.path.join(W, "Input.txt"), "wb").write((CR.join(L) + CR).encode("mbcs"))
# --- motor nativo: misma malla (nudos 0-based), gdl fijos, MAT, carga de superficie equivalente (cara cuadrática: L/6, L/6, 2L/3)
Fs = [0.0] * 12
for (f, tx, ty) in loads:
    a, b, m = FACES[f]; xa, ya = NOD[a - 1][1:]; xb, yb = NOD[b - 1][1:]; Lf = math.hypot(xb - xa, yb - ya)
    for n, w in ((a, Lf / 6), (b, Lf / 6), (m, 2 * Lf / 3)): Fs[2 * (n - 1)] += w * tx; Fs[2 * (n - 1) + 1] += w * ty
FX = sorted([2 * (n - 1) for n in fix if "x" in fix[n]] + [2 * (n - 1) + 1 for n in fix if "y" in fix[n]])
with open(os.path.join(W, "caso.txt"), "w") as o:
    o.write("6 1 %d\n" % len(FX)); o.write(" ".join(repr(x) for _, x, _ in NOD) + "\n"); o.write(" ".join(repr(y) for _, _, y in NOD) + "\n")
    o.write("0 1 2 3 4 5\n"); o.write(" ".join(map(str, FX)) + "\n"); o.write("%r %r %r %r %r 0\n" % (E, nu, phi, c, gam)); o.write(" ".join(repr(v) for v in Fs) + "\n")
print("caso", W, "c=%g phi=%g bc=%s p=%g qx=%g" % (c, phi, bc, p, qx))
