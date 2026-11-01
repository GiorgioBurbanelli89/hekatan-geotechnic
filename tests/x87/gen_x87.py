# -*- coding: utf-8 -*-
r"""Hipotesis x87 (1-nov-2026): la divergencia distinta de GEO5 (escalon SRF 1.2346) viene de que GEO5 calcula en x87 de 80 bits?
Genera geofem_x87.cpp = COPIA de src/geofem/cpp/geofem.cpp con REAL = long double (80 bits en MinGW) o double (control), sin emscripten,
y vuelca el modelo del muro a modelo.txt. NO modifica el original.   Uso: ver correr.sh"""
import re, json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(AQUI, "..", "..", "src", "geofem", "cpp", "geofem.cpp"), encoding="utf-8").read()
src = src.replace("EMSCRIPTEN_KEEPALIVE", "")
src = re.sub(r"\bdouble\b", "REAL", src)       # primero el tipo; los ayudantes de log (en double) se anaden despues
LOGF = "static void LOG(const std::string& s) { std::fputs(s.c_str(), stdout); std::fputc(10, stdout); }"
src = re.sub(r"static void LOG\(const std::string& s\) \{.*?\n\}", lambda m: LOGF, src, count=1, flags=re.S)
FMT = """static inline double cv(long double v) { return (double)v; }
template <class T> static inline T cv(T v) { return v; }
static std::string fmt_(const char* f, ...) { char buf[512]; va_list ap; va_start(ap, f); vsnprintf(buf, sizeof buf, f, ap); va_end(ap); return buf; }
template <class... A> static std::string fmt(const char* f, A... a) { return fmt_(f, cv(a)...); }"""
src = re.sub(r"static std::string fmt\(const char\* f, \.\.\.\) \{.*?\n\}", lambda m: FMT, src, count=1, flags=re.S)
src = src.replace("#include <emscripten.h>", "#include <cstdint>\n#ifndef REAL_T\n#define REAL_T long double\n#endif\ntypedef REAL_T REAL;\n")
src = src.replace("std::max(", "rmax(").replace("std::min(", "rmin(")
MM = """#include <type_traits>
template <class A, class B> static inline typename std::common_type<A, B>::type rmax(A a, B b) { return a > b ? a : b; }
template <class A, class B> static inline typename std::common_type<A, B>::type rmin(A a, B b) { return a < b ? a : b; }
"""
src = src.replace("typedef REAL_T REAL;\n", "typedef REAL_T REAL;\n" + MM, 1)
# --- SEMILLA (solo en la copia): estado inicial = sigma nodales de GEO5 (Restart_In.bin) interpolados a cada punto de Gauss con las N del T6
src = src.replace("struct GeoFem {", "static std::vector<REAL> g_seed;   // 4 por nudo: sx sy sz txy (orden de SIG)\nstruct GeoFem {", 1)
VIEJA = "bool c0 = srmContinua ? nrstepPasos(1.0, Ftot, u, n0) : nrstepInc(1.0, Ftot, 0, u, n0);"
assert VIEJA in src
NUEVA = """bool c0;
    if (!g_seed.empty()) {
      resetState();
      for (int e = 0; e < ne; e++) for (int q = 0; q < NG; q++) {
        REAL N[6], d1[6], d2[6]; t6(GP[q][0], GP[q][1], N, d1, d2);
        for (int k = 0; k < 4; k++) { REAL v = 0; for (int i = 0; i < 6; i++) v += N[i] * g_seed[(size_t)ELE[e * 6 + i] * 4 + k]; SIG[((size_t)e * NG + q) * 4 + k] = v; }
      }
      vector<double> duS; c0 = nrstep(1.0, Ftot, 0, duS, n0, true, Ftot); u = duS;       // SRF = 1 con el estado de GEO5: ¿converge en 1 iteración como el Log_File de GEO5?
    } else c0 = srmContinua ? nrstepPasos(1.0, Ftot, u, n0) : nrstepInc(1.0, Ftot, 0, u, n0);"""
src = src.replace(VIEJA, NUEVA.replace("vector<double>", "vector<REAL>"), 1)
open(os.path.join(AQUI, "geofem_x87.cpp"), "w", encoding="utf-8").write(src)
m = json.load(open(os.path.join(AQUI, "..", "..", "examples", "geofem_muro_manabi_malla.json"), encoding="utf-8"))
nn, ne, nm = len(m["X"]), len(m["ELE"]), len(m["MAT"])
w = [f"{nn} {ne} {nm} {len(m['FIXED'])}"]
w.append(" ".join(repr(v) for v in m["X"])); w.append(" ".join(repr(v) for v in m["Y"]))
w.append(" ".join(str(i) for e in m["ELE"] for i in e)); w.append(" ".join(str(i) for i in m["EMAT"]))
w.append(" ".join(str(i) for i in m["FIXED"])); w.append(" ".join(repr(v) for r in m["MAT"] for v in r))
w.append(" ".join("1" if r else "0" for r in m["RIGID"])); w.append(" ".join(str(i) for i in m["MODEL"]))
open(os.path.join(AQUI, "modelo.txt"), "w").write("\n".join(w) + "\n")
print("ok", nn, ne)
