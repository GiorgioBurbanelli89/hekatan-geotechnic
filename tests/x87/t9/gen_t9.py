# -*- coding: utf-8 -*-
r"""Tanda 9: copia geofem_t9.cpp (de gen_d123.py; el original src/geofem/cpp/geofem.cpp NO se toca).
- 3.er argumento «semillagp»: el estado de SRF 1 = sigma EXACTA de GEO5 por punto de Gauss (semilla_gp.bin de semilla_gp.py), sin Newton.
- T9_DUMP=1: vuelca SIG (float64 ne*7*4) tras cada paso de carga de la etapa de tensiones -> sig_paso_<k>.bin (para comparar con
  los Restart_Step de GEO5 de cada paso: 160230 ... 160302)."""
import os, subprocess
AQUI = os.path.dirname(os.path.abspath(__file__)); X87 = os.path.dirname(AQUI)
subprocess.run(["python", os.path.join(X87, "gen_d123.py")], check=True, cwd=X87)
src = open(os.path.join(X87, "geofem_d123.cpp"), encoding="utf-8").read()
def rep(a, b, n=1):
    global src
    assert src.count(a) == n, (src.count(a), a)
    src = src.replace(a, b)
rep("static std::vector<REAL> g_seed;", "static std::vector<REAL> g_seed, g_seedGP; static int g_dump = 0;")
rep("    if (!g_seed.empty()) {\n      resetState();",
    "    if (!g_seedGP.empty()) { resetState(); SIG = g_seedGP; c0 = true; u.assign(ndof, 0.0); n0 = 0; LOG(\"    T9: estado de GEO5 por punto de Gauss (sin Newton)\"); }\n    else if (!g_seed.empty()) {\n      resetState();")
rep("      if (c) { for (int d = 0; d < ndof; d++) u[d] += du[d]; t = tn; }",
    "      if (c) { for (int d = 0; d < ndof; d++) u[d] += du[d]; t = tn;\n        if (g_dump) { char nm[64]; snprintf(nm, sizeof nm, \"sig_paso_%d.bin\", k); FILE* fo = fopen(nm, \"wb\"); fwrite(SIG.data(), sizeof(REAL), SIG.size(), fo); fclose(fo);\n          snprintf(nm, sizeof nm, \"u_paso_%d.bin\", k); fo = fopen(nm, \"wb\"); fwrite(u.data(), sizeof(REAL), u.size(), fo); fclose(fo); } }")
open(os.path.join(AQUI, "geofem_t9.cpp"), "w", encoding="utf-8").write(src)
m = open(os.path.join(X87, "main_x87.cpp"), encoding="utf-8").read()
m = m.replace("int main(int argc, char** argv) {", "int main(int argc, char** argv) {\n  if (getenv(\"D123\")) g_d123 = atoi(getenv(\"D123\")); if (getenv(\"T9_DUMP\")) g_dump = 1; printf(\"D123=%d\\n\", g_d123);", 1)
m = m.replace('FILE* f = fopen("modelo.txt", "r");', 'FILE* f = fopen("../modelo.txt", "r");', 1)
m = m.replace('  int ndof = 2 * nn;', '''  if (argc > 3 && std::string(argv[3]) == "semillagp") { FILE* fg = fopen("semilla_gp.bin", "rb"); g_seedGP.assign((size_t)ne * 7 * 4, 0); size_t r = fread(g_seedGP.data(), sizeof(REAL), g_seedGP.size(), fg); fclose(fg); printf("SEMILLA GP GEO5: %zu valores\\n", r); }
  int ndof = 2 * nn;''', 1)
open(os.path.join(AQUI, "_t9.cpp"), "w", encoding="utf-8").write(src + "\n#include <cstdlib>\n" + m)
print("ok geofem_t9.cpp")
