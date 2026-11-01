# -*- coding: utf-8 -*-
"""De un talud (.hgeo) al **InputFile del solver de GEO5** (`FRGeoFEM.exe`), sin tocar la interfaz.

Jorge, 22-sep-2026: «tienes acceso a la interfaz gráfica…» y, antes: «me dijiste que podías ver los
valores de iteraciones de GeoFEM». Esto es lo segundo, que es mucho mejor: el solver de GEO5 corre
headless, escribe el FS y además el *course of analysis* (eta y las tres normas por iteración), así
que la comparación con nuestra reducción c-φ se puede hacer PELDAÑO A PELDAÑO, no solo con el FS.

El formato del InputFile está medido: capturado de una corrida real de la GUI
(`ingenieria-inversa/hekatan-geo5-bridge/geofem_capture/`) y reproducido en `mk_1elem.py`.

Malla: columnas verticales entre el fondo del modelo y el terreno, cada celda partida en dos
triángulos y cada triángulo elevado a **T6** (nudos de mitad de lado). Es una malla estructurada,
no la de GEO5: para comparar SOLVERS lo que importa es que los DOS resuelvan la MISMA malla, y esa
misma malla se le da luego a Hekatan.

    python tools/hgeo_a_geofem_input.py examples/talud_geo5_bishop.hgeo InputFile_talud.txt [nx] [nz]
"""
import math, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from hgeo_parse import parse_hgeo                                   # noqa: E402

CR = chr(13) + chr(10)


def terreno_z(terreno, x):
    """z del terreno en x, interpolando entre sus puntos."""
    for (x0, z0), (x1, z1) in zip(terreno, terreno[1:]):
        if x0 - 1e-9 <= x <= x1 + 1e-9:
            return z0 if abs(x1 - x0) < 1e-12 else z0 + (z1 - z0) * (x - x0) / (x1 - x0)
    return terreno[-1][1] if x > terreno[-1][0] else terreno[0][1]


def malla_t6(terreno, xmin, xmax, fondo, nx, nz):
    """Malla estructurada de T6. Devuelve (nudos, elementos, bordes)."""
    nudos, idx = [], {}

    def nudo(x, z):
        k = (round(x, 6), round(z, 6))
        if k not in idx:
            nudos.append(k)
            idx[k] = len(nudos)          # 1-based, como GEO5
        return idx[k]

    # rejilla de esquinas y de puntos medios: se usa paso medio en las dos direcciones
    X = [xmin + (xmax - xmin) * i / (2 * nx) for i in range(2 * nx + 1)]
    cols = []
    for x in X:
        zt = terreno_z(terreno, x)
        cols.append([fondo + (zt - fondo) * j / (2 * nz) for j in range(2 * nz + 1)])

    elems = []
    for i in range(nx):
        for j in range(nz):
            I, J = 2 * i, 2 * j
            # esquinas de la celda
            a = (X[I], cols[I][J]);       b = (X[I + 2], cols[I + 2][J])
            c = (X[I + 2], cols[I + 2][J + 2]); d = (X[I], cols[I][J + 2])
            # triángulo inferior a-b-c y superior a-c-d, cada uno con sus tres puntos medios
            for tri in ((a, b, c), (a, c, d)):
                p1, p2, p3 = tri
                n1, n2, n3 = nudo(*p1), nudo(*p2), nudo(*p3)
                m12 = nudo((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
                m23 = nudo((p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2)
                m31 = nudo((p3[0] + p1[0]) / 2, (p3[1] + p1[1]) / 2)
                elems.append([n1, n2, n3, m12, m23, m31])
    return nudos, elems


def escribe(hgeo, salida, nx=24, nz=10):
    m = parse_hgeo(open(hgeo, encoding="utf-8").read())
    xmin, xmax, fondo = m["xmin"], m["xmax"], m["bottom"]
    terreno = m["interfaces"][0]
    s = m["soils"][0]
    nudos, elems = malla_t6(terreno, xmin, xmax, fondo, nx, nz)

    # apoyos: el fondo empotrado, los lados con el horizontal impedido (lo estándar en un talud)
    base = [i + 1 for i, (x, z) in enumerate(nudos) if abs(z - fondo) < 1e-6]
    lados = [i + 1 for i, (x, z) in enumerate(nudos) if abs(x - xmin) < 1e-6 or abs(x - xmax) < 1e-6]

    L, A = [], None
    A = L.append
    A("% GEO 5 FEM INPUT FILE")
    A(""); A("")
    A("problem_description")
    A('  title="TALUD HEKATAN - REDUCCION C-PHI"')
    A("  renumber"); A("  2D"); A("  mechanical")
    A("  average_multinode_samematerial"); A("  nonsymmetric"); A("  updatefull")
    A("  linesearch"); A("  newtonraphson")
    A("  safetyfactor reduction_cphi")
    A("  gamma_w=1.000000E+01")
    for k, f in (("log_file", "Log_File.txt"), ("restart_step", "Restart_Step.bin"),
                 ("restart_interval", "Restart_Interval.bin"), ("iter_file", "Iter_File.bin"),
                 ("error_file", "Error_File.txt"), ("iter_file_geo", "Iter_File_Geo.bin"),
                 ("output_file_geo", "Output_File_Geo.bin")):
        A('  %s="%s"' % (k, os.path.join(AQUI, "tmp_geofem", f)))    # run_geo5.py las reescribe
    A("end"); A("")
    A("active_fields")
    A("  nodes")
    for i, (x, z) in enumerate(nudos):
        A("    %d x=%.6E y=%.6E" % (i + 1, x, z))
    A("  end"); A("")
    A("  faces"); A("  end"); A("")
    A("  elements")
    for k, e in enumerate(elems):
        A("    %d nodes=[%s]" % (k + 1, ",".join(str(n) for n in e)))
    A("  end"); A("")
    for b in ("multi_nodes", "hinges", "free_nodes", "free_elements", "free_element_sets",
              "node_depths", "elastic_elements", "no_reduction_elements", "quiet_boundary_nodes",
              "quiet_boundary_faces", "viscous_boundary_faces", "freefield_boundary_faces"):
        A("  %s" % b); A("  end"); A("")
    A("end"); A("")
    A("altered_fields")
    for b in ("new_area_multi_nodes", "substitute_nodes", "removed_elements_inside_massive"):
        A("  %s" % b); A("  end"); A("")
    A("end"); A("")
    A("initial_fields"); A("end"); A("")
    A("problem_data")
    A("  face_types"); A("  end"); A("")
    A("  element_types")
    A('    type="T6s_PlaneStrain" elements=[1-%d]' % len(elems))
    A("  end"); A("")
    A("  material_types")
    A('    type="SOIL_1" druckerprager extension E=%.6E nu=%.2f alpha_biot=1.00 Eur=%.6E '
      'phi_in=%.5f c_in=%.6E psi=0.00' % (s["E"], s["nu"], s["E"], s["phi"], s["c"]))
    A("  end"); A("")
    A("  constraint_types")
    A('    type="MX" fixed ct_x=c')
    A('    type="MY" fixed ct_y=c')
    A("  end"); A("")
    A("  materials")
    A('    "SOIL_1" elements=[1-%d]' % len(elems))
    A("  end"); A("")
    A("  constraints")
    A('    "MX" nodes=[%s]' % ",".join(str(n) for n in sorted(set(base + lados))))
    A('    "MY" nodes=[%s]' % ",".join(str(n) for n in base))
    A("  end")
    A("end"); A("")
    A("load_data")
    A("  load_domain"); A("  end"); A("")
    A("  load_nodes"); A("  end"); A("")
    A("  load_faces"); A("  end"); A("")
    A("  load_elements")
    A("    gravity rho=-%.6E elements=[1-%d]" % (s["gamma"], len(elems)))
    A("  end"); A("")
    A("  load_excavations"); A("  end")
    A("end"); A("")
    A("solver_data")
    A("  solver_general_parameters")
    A("    tolerance_displacement=0.0100"); A("    tolerance_force=0.0100")
    A("    tolerance_energy=0.0100"); A("    max_step_iterations=100")
    A("    time_step=1.00"); A("    reduction_step=0.90")
    A("  end"); A("")
    A("  solver_method_parameters")
    A("    time_step_relaxation_factor=2"); A("    time_step_max_relaxations=0")
    A("    reduction_step_relaxation_factor=2"); A("    reduction_step_max_relaxations=3")
    A("    min_reduction_step=0.990")
    A("  end"); A("")
    A("  solver_linesearch_parameters")
    A("    ls_tolerance=0.8000"); A("    max_ls_iterations=3")
    A("    eta_min=0.100"); A("    eta_max=1.000")
    A("  end"); A("")
    A("  solver_plasticity_parameters")
    A("    ys_tolerance=0.00100"); A("    max_ys_iterations=20")
    A("  end")
    A("end"); A("")
    A("monitors"); A("end"); A("")
    A("output_fields"); A("  geo_detailed"); A("  strain_plastic"); A("  stress"); A("end"); A("")
    A("stochastic_data"); A("end")
    open(salida, "wb").write(CR.join(L).encode("mbcs") + CR.encode("mbcs"))
    print("escrito %s: %d nudos, %d elementos T6 (malla %dx%d)" % (salida, len(nudos), len(elems), nx, nz))
    return len(nudos), len(elems)


if __name__ == "__main__":
    h = sys.argv[1] if len(sys.argv) > 1 else "examples/talud_geo5_bishop.hgeo"
    o = sys.argv[2] if len(sys.argv) > 2 else "InputFile_talud.txt"
    nx = int(sys.argv[3]) if len(sys.argv) > 3 else 24
    nz = int(sys.argv[4]) if len(sys.argv) > 4 else 10
    escribe(h, o, nx, nz)
