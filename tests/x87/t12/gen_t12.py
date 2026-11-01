# -*- coding: utf-8 -*-
r"""Tanda 12: copia _t12.cpp a partir de ../t10/_t10.cpp (geofem.cpp original NO se toca).
Añade, sobre los interruptores de T10:
  T12_RS=k        peldaño SRM (rs) a vigilar (por defecto 1)
  T12_ITDUMP=1    en ese peldaño vuelca por iteración it: t12_itNN_R.bin (residuo ANTES de resolver, ndof),
                  t12_itNN_raw.bin (DDisp crudo, ndof), t12_itNN_u.bin (incremento acumulado del peldaño tras la it), eta en t12_eta.txt
  T12_FORCE=pref  al empezar la it k>=2 del peldaño vigilado sustituye u por pref_itKK.bin (float64 ndof, u de GEO5 tras la it k-1),
                  re-evalúa σ/tangente desde la base del peldaño (porPaso) y el residuo -> error de UNA iteración aislado
  T12_KV=pref     en la it k vuelca t12_itKK_Kv.bin = K_t(ensamblada de la it k) * pref_itKK.bin (para ver si la diferencia es K o R)
  T12_EWALL=E     E del material RÍGIDO (muro); T12_NUWALL=nu
  T12_STOP=k      corta la escalera tras el peldaño rs = k
  T12_EL=e        log por PG del elemento e (0-based) en cada commit y tangente inicial
  T12_ETA=a,b,c   fuerza η de las iteraciones 1,2,3.. del peldaño vigilado (0 = el del line search)"""
import os
AQUI = os.path.dirname(os.path.abspath(__file__)); X87 = os.path.dirname(AQUI)
src = open(os.path.join(X87, "t10", "_t10.cpp"), encoding="utf-8").read()
def rep(a, b, n=1):
    global src
    assert src.count(a) == n, (src.count(a), a)
    src = src.replace(a, b)
rep("static int g_d123 = 0;",
    "static int g_t12rs = 1, g_t12dump = 0, g_t12el = -1; static const char* g_t12force = nullptr; static const char* g_t12kv = nullptr; static double g_t12eta[32] = {0};\n"
    "static void t12w(const char* nm, const REAL* v, int n) { std::vector<double> d(v, v + n); FILE* fo = fopen(nm, \"wb\"); fwrite(d.data(), 8, n, fo); fclose(fo); }\n"
    "static int g_d123 = 0;")
# forzar u de GEO5 al inicio de la it k y volcar R antes de resolver
rep("    for (it = 1; it <= maxit; it++) {\n      if (!std::isfinite(vnorm(Rf.data(), nf))) break;\n      assembleK(Kt, false);",
    "    const bool vig = srmPel && rstep == g_t12rs;\n"
    "    for (it = 1; it <= maxit; it++) {\n      if (!std::isfinite(vnorm(Rf.data(), nf))) break;\n"
    "      if (vig && g_t12force && it >= 2) { char nm[300]; snprintf(nm, sizeof nm, \"%s_it%02d.bin\", g_t12force, it); FILE* fq = fopen(nm, \"rb\");\n"
    "        if (fq) { std::vector<double> d(ndof); size_t r = fread(d.data(), 8, ndof, fq); fclose(fq); for (int k = 0; k < ndof; k++) u[k] = d[k];\n"
    "          vector<REAL> z(ndof, 0.0); evalInc(z.data(), true, Fi.data()); for (int k = 0; k < nf; k++) Rf[k] = Fext[fr[k]] - Fi[fr[k]];\n"
    "          LOG(fmt(\"    T12: u := %s (%d), |R| = %.6e\", nm, (int)r, vnorm(Rf.data(), nf))); } }\n"
    "      if (vig && g_t12dump) { vector<REAL> Rn(ndof, 0.0); for (int k = 0; k < nf; k++) Rn[fr[k]] = Rf[k]; char nm[64]; snprintf(nm, sizeof nm, \"t12_it%02d_R.bin\", it); t12w(nm, Rn.data(), ndof); }\n"
    "      assembleK(Kt, false);\n"
    "      if (vig && g_t12kv) { char nm[300]; snprintf(nm, sizeof nm, \"%s_it%02d.bin\", g_t12kv, it); FILE* fq = fopen(nm, \"rb\");\n"
    "        if (fq) { std::vector<double> d(ndof); fread(d.data(), 8, ndof, fq); fclose(fq); vector<REAL> Kv(ndof, 0.0);\n"
    "          for (int i = 0; i < nf; i++) { REAL s = 0; int j0 = rmax(0, i - Kt.b), j1 = rmin(nf - 1, i + Kt.b); for (int j = j0; j <= j1; j++) s += Kt.a[(size_t)i * Kt.w + (j - i + Kt.b)] * d[fr[j]]; Kv[fr[i]] = s; }\n"
    "          snprintf(nm, sizeof nm, \"t12_it%02d_Kv.bin\", it); t12w(nm, Kv.data(), ndof); LOG(\"    T12: K*v volcado\"); } }")
rep("      lastRaw = du; lastEta = al;",
    "      if (vig && it < 32 && g_t12eta[it] > 0) { al = g_t12eta[it]; for (int k = 0; k < nf; k++) drf[k] = al * duf[k]; LOG(fmt(\"    T12: eta := %.6f\", al)); }\n"
    "      if (vig && g_t12dump) { char nm[64]; snprintf(nm, sizeof nm, \"t12_it%02d_raw.bin\", it); t12w(nm, du.data(), ndof); FILE* fe = fopen(\"t12_eta.txt\", \"a\"); fprintf(fe, \"%d %.17g\\n\", it, (double)al); fclose(fe); }\n"
    "      lastRaw = du; lastEta = al;")
rep("      for (int d = 0; d < ndof; d++) u[d] += du[d];\n      for (int k = 0; k < nf; k++) Rf[k] = Fext[fr[k]] - Fi[fr[k]];",
    "      for (int d = 0; d < ndof; d++) u[d] += du[d];\n"
    "      if (vig && g_t12dump) { char nm[64]; snprintf(nm, sizeof nm, \"t12_it%02d_u.bin\", it); t12w(nm, u.data(), ndof); }\n"
    "      for (int k = 0; k < nf; k++) Rf[k] = Fext[fr[k]] - Fi[fr[k]];")
rep("  int ndof = 2 * nn;",
    "  if (getenv(\"T12_RS\")) g_t12rs = atoi(getenv(\"T12_RS\")); if (getenv(\"T12_ITDUMP\")) g_t12dump = 1; if (getenv(\"T12_EL\")) g_t12el = atoi(getenv(\"T12_EL\")); g_t12force = getenv(\"T12_FORCE\"); g_t12kv = getenv(\"T12_KV\");\n"
    "  if (getenv(\"T12_ETA\")) { const char* p = getenv(\"T12_ETA\"); for (int k = 1; k < 32 && *p; k++) { g_t12eta[k] = atof(p); while (*p && *p != ',') p++; if (*p) p++; } }\n"
    "  int ndof = 2 * nn;")
rep("  int h = geofem_create(",
    "  if (getenv(\"T12_EWALL\")) for (int m_ = 0; m_ < nm; m_++) if (RG[m_]) { MAT[6 * m_] = atof(getenv(\"T12_EWALL\")); if (getenv(\"T12_NUWALL\")) MAT[6 * m_ + 1] = atof(getenv(\"T12_NUWALL\")); puts(\"T12: E muro cambiado\"); }\n"
    "  int h = geofem_create(")
rep("      if (trial > 3) break;\n      rs++;",
    "      if (trial > 3) break;\n      if (getenv(\"T12_STOP\") && rs >= atoi(getenv(\"T12_STOP\"))) break;\n      rs++;")
rep("if (got && (commit || soloTangente)) mcTangenteGeo5(inf, De, q[0], q[2], Dep);",
    "if (got && (commit || soloTangente)) mcTangenteGeo5(inf, De, q[0], q[2], Dep);\n"
    "          if (e == g_t12el && (commit || soloTangente)) LOG(fmt(\"    EL%d q%d %s reg=%d sigN=(%.6f %.6f %.6f %.6f) sig=(%.6f %.6f %.6f %.6f) Dep00=%.4f\", e, q, commit ? \"COMMIT\" : \"TANG\", got ? inf.reg : 0, sigN[0], sigN[1], sigN[2], sigN[3], sig[0], sig[1], sig[2], sig[3], got ? Dep[0] : De[0]));")
# T12_ALT=e:q:modo -> tangente INICIAL alternativa (solo la del arranque del peldaño vigilado) en el PG q del elemento e:
#   1 = De · 2 = no se toca (queda la DEP restaurada/anterior) · 4 = arista σ1=σ2 · 5 = arista σ2=σ3 · 6 = cara con el orden del TANTEO (sin mcPrincDevuelta)
rep("    std::sort(ix, ix + 3, [&](int a, int b) { return str[a] > str[b]; });\n    REAL ss[3]",
    "    std::sort(ix, ix + 3, [&](int a, int b) { return str[a] > str[b]; });\n    if (g_t12swap) { std::swap(ix[0], ix[1]); g_t12swap = 0; }\n    REAL ss[3]")
rep("          got = ret(deps, sig) != 0;",
    "          const bool alt = g_t12alton && soloTangente && e == g_t12ae && (int)(kk % NG) == g_t12aq;\n"
    "          if (alt && g_t12am >= 7) g_t12swap = 1;\n"
    "          got = ret(deps, sig) != 0;")
rep("          if (got) mcPrincDevuelta(sig, inf);",
    "          McInfo infT = inf; if (got) mcPrincDevuelta(sig, inf);\n"
    "          if (alt && g_t12am == 8 && got) inf = infT;\n"
    "          if (alt && g_t12am == 6 && got) inf = infT;\n"
    "          if (alt && got && (g_t12am == 4 || g_t12am == 5)) inf.reg = g_t12am == 4 ? 4 : 2;")
rep("          if (e == g_t12el && (commit || soloTangente)) LOG(",
    "          if (alt && g_t12am == 1) { std::memcpy(Dep, De, sizeof(REAL) * 16); got = true; }\n"
    "          if (alt && g_t12am == 2) { got = hasDep[kk]; if (got) std::memcpy(Dep, &DEP[kk * 16], sizeof(REAL) * 16); }\n"
    "          if (alt) LOG(fmt(\"    T12 ALT: el %d PG %d modo %d reg %d\", e, g_t12aq, g_t12am, got ? inf.reg : 0));\n"
    "          if (e == g_t12el && (commit || soloTangente)) LOG(")
rep("static int g_t12rs = 1,", "static int g_t12swap = 0; static int g_t12alton = 0, g_t12ae = -1, g_t12aq = -1, g_t12am = 0;\nstatic int g_t12rs = 1,")
rep("    if (srmPel && (g_d123 & 1)) assembleInc(inc0, ab, true, Fi.data());",
    "    g_t12alton = (srmPel && rstep == g_t12rs) ? 1 : 0;\n"
    "    if (srmPel && (g_d123 & 1)) assembleInc(inc0, ab, true, Fi.data());")
rep("    for (it = 1; it <= maxit; it++) {\n      if (!std::isfinite(vnorm(Rf.data(), nf))) break;\n      if (vig && g_t12force",
    "    g_t12alton = 0;\n    for (it = 1; it <= maxit; it++) {\n      if (!std::isfinite(vnorm(Rf.data(), nf))) break;\n      if (vig && g_t12force")
rep("  int ndof = 2 * nn;", "  if (getenv(\"T12_ALT\")) sscanf(getenv(\"T12_ALT\"), \"%d:%d:%d\", &g_t12ae, &g_t12aq, &g_t12am);\n  int ndof = 2 * nn;")
# T12_ORD=1 -> ORDEN de las principales como GEO5 (invariant.cpp FUN_0062d6a0, Geo5Solver_decomp.c:77046): θ = ½·atan(2τ/(σx−σy))
#   (|τ| < 1e-10 → 0; |σx−σy| < 1e-10 → π/2), λ1 = σx c² + σy s² + 2csτ, λ2 = c²σy + σx s² − 2csτ, λ3 = σz, y ORDENACIÓN POR
#   SELECCIÓN con '<' estricto. Decide qué dirección es σ1 cuando dos principales empatan (arista σ1 = σ2 del paso anterior).
rep("static int g_t12swap = 0;",
    "static int g_t12ord = 0;\n"
    "static void geo5Ord(const REAL* sg, int* ix) {\n"
    "  double sx = sg[0], sy = sg[1], sz = sg[2], t = sg[3], th;\n"
    "  if (std::fabs(t) >= 1e-10) { if (std::fabs(sx - sy) >= 1e-10) { th = (t + t) / (sx - sy); th = std::atan(th); th = th * 0.5; } else th = 1.5707963267948966; } else th = 0.0;\n"
    "  double c = std::cos(th), s = std::sin(th), d14 = (c + c) * s * t;\n"
    "  double p[3] = {sx * c * c + sy * s * s + d14, (c * c * sy + sx * s * s) - d14, sz};\n"
    "  double cen = (sx + sy) / 2, R = std::sqrt((sx - sy) * (sx - sy) / 4 + t * t);\n"
    "  int id[3]; id[0] = (std::fabs(p[0] - (cen + R)) <= std::fabs(p[0] - (cen - R))) ? 0 : 1; id[1] = 1 - id[0]; id[2] = 2;\n"
    "  for (int i = 0; i < 3; i++) for (int j = i; j < 3; j++) if (p[i] < p[j]) { std::swap(p[i], p[j]); std::swap(id[i], id[j]); }\n"
    "  for (int k = 0; k < 3; k++) ix[k] = id[k];\n"
    "}\n"
    "static int g_t12swap = 0;")
rep("    if (g_t12swap) { std::swap(ix[0], ix[1]); g_t12swap = 0; }",
    "    if (g_t12ord == 1) geo5Ord(st, ix); if (g_t12ord >= 2) empate(str, ix);\n    if (g_t12swap) { std::swap(ix[0], ix[1]); g_t12swap = 0; }")
rep("    std::sort(ix, ix + 3, [&](int a, int b) { return pv[a] > pv[b]; });",
    "    std::sort(ix, ix + 3, [&](int a, int b) { return pv[a] > pv[b]; });\n    if (g_t12ord == 1) geo5Ord(sig, ix); if (g_t12ord >= 2) empate(pv, ix);")
# T12_ORD=2: EMPATE (|Δ| <= 1e-14·max|σ|) entre una principal del plano y σz -> σz delante; 3 -> la del plano delante
rep("static int g_t12swap = 0;",
    "static int g_nemp = 0;\n"
    "static void empate(const REAL* v, int* ix) {\n"
    "  REAL m = rmax(rmax(std::fabs(v[0]), std::fabs(v[1])), std::fabs(v[2])), tol = 1e-14 * m;\n"
    "  for (int k = 0; k < 2; k++) if (std::fabs(v[ix[k]] - v[ix[k + 1]]) <= tol && (ix[k] == 2 || ix[k + 1] == 2)) {\n"
    "    bool zDel = ix[k] == 2; bool quiero = (g_t12ord == 2);\n"
    "    if (zDel != quiero) { std::swap(ix[k], ix[k + 1]); } g_nemp++; }\n"
    "}\n"
    "static int g_t12swap = 0;")
rep("  printf(\"FS_FINAL %.6f\\n\", (double)fs);", "  printf(\"FS_FINAL %.6f\\n\", (double)fs); printf(\"EMPATES %d\\n\", g_nemp);")
rep("  if (getenv(\"T12_ALT\"))", "  if (getenv(\"T12_ORD\")) g_t12ord = atoi(getenv(\"T12_ORD\"));\n  if (getenv(\"T12_ALT\"))")
open(os.path.join(AQUI, "_t12.cpp"), "w", encoding="utf-8").write(src)
print("ok _t12.cpp")
