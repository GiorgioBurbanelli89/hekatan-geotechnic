# -*- coding: utf-8 -*-
r"""Tanda 10: copia _t10.cpp a partir de ../t9/_t9.cpp (geofem.cpp original NO se toca).
Variables de entorno:
  T10_DUMP=1      tras cada peldaño SRM convergido vuelca t10_rsNN_{sig,epl,u,raw}.bin (float64) y eta en t10_rsNN_eta.txt
  T10_SEED2=f     tras V5 (ALoad = F_int del estado de SRF 1) sustituye SIG por f (estado de GEO5 de otro Restart_Step)
  T10_R0=x        Racc inicial (0.9 => el primer peldaño es 1.2346)
  T10_PEND=f      incremento eta*DDisp (ndof float64) a re-aplicar en el 1.er peldaño (D2 con estado ajeno)
  T10_D2P=k       base del retorno por punto en porPaso:
                    0 = la de siempre (sigma convergida del peldaño anterior, u0 = 0)
                    1 = base sigma convergida, u0 = eta*DDisp del último peldaño (D2 dentro de porPaso)
                    4 = base = sigma de SRF 1 (fija toda la SRM), u0 = u total desde SRF 1
                    5 = 4 + eta*DDisp re-aplicado (doble cuenta del último incremento)
                    3 = base = estado desde el último FALLO (o SRF 1) fija; u0 = incremento acumulado desde ella; tras fallo base = sigma convergida, u0 = 0
                    6 = 3 + eta*DDisp re-aplicado
                    7 = base = inicio del peldaño anterior (memoria de un peldaño), u0 = su incremento; 8 = 7 + eta*DDisp
  T10_PHIACC=1    phi = atan(f*tan(phi_prev)) acumulado por peldaño (como FUN_00427520) en vez de atan(tan(phi0)/SRF)"""
import os
AQUI = os.path.dirname(os.path.abspath(__file__)); X87 = os.path.dirname(AQUI)
src = open(os.path.join(X87, "t9", "_t9.cpp"), encoding="utf-8").read()
def rep(a, b, n=1):
    global src
    assert src.count(a) == n, (src.count(a), a)
    src = src.replace(a, b)
rep("static std::vector<REAL> g_seed, g_seedGP; static int g_dump = 0;",
    "static std::vector<REAL> g_seed, g_seedGP; static int g_dump = 0;\n"
    "static std::vector<REAL> g_seed2, g_pend0, g_S0ext, g_u0ext; static REAL g_R0 = 1; static int g_d2p = 0, g_t10dump = 0, g_phiacc = 0; static std::vector<REAL> g_tanAcc;")
# reducción acumulada (tan) por material
rep("      REAL phi = std::atan(std::tan(MAT[mm * 6 + 2] * 3.141592653589793 / 180) / SRF), c = MAT[mm * 6 + 3] / SRF;",
    "      REAL phi = std::atan(std::tan(MAT[mm * 6 + 2] * 3.141592653589793 / 180) / SRF), c = MAT[mm * 6 + 3] / SRF;\n"
    "      if (g_phiacc && (int)g_tanAcc.size() > mm && g_tanAcc[mm] > 0) phi = std::atan(g_tanAcc[mm]);")
# porPaso con base y u0 externos
rep("    const vector<REAL> S0 = SIG, E0 = EPL; vector<REAL> uT(ndof);",
    "    const vector<REAL> S0 = g_S0ext.empty() ? SIG : g_S0ext, E0 = EPL; vector<REAL> uT(ndof);\n"
    "    const vector<REAL> U0 = g_u0ext.empty() ? vector<REAL>(ndof, 0.0) : g_u0ext;")
rep("      for (int d = 0; d < ndof; d++) uT[d] = u[d] + dinc[d];",
    "      for (int d = 0; d < ndof; d++) uT[d] = U0[d] + u[d] + dinc[d];")
rep("    for (it = 1; it <= maxit; it++) {\n      if (!std::isfinite(vnorm(Rf.data(), nf))) break;",
    "    if (porPaso && g_d2p && srmPel) { vector<REAL> z(ndof, 0.0); soloTangente = true; evalInc(z.data(), false, Fi.data()); soloTangente = false;\n"
    "      for (int k = 0; k < nf; k++) Rf[k] = Fext[fr[k]] - Fi[fr[k]];\n"
    "      LOG(fmt(\"    T10 D2P=%d: |u0| = %.4f mm, |R inicio| = %.4f\", g_d2p, vnorm(U0.data(), ndof) * 1e3, vnorm(Rf.data(), nf))); }\n"
    "    for (it = 1; it <= maxit; it++) {\n      if (!std::isfinite(vnorm(Rf.data(), nf))) break;")
# estado ajeno tras V5 + Racc inicial
rep("    const REAL* FL = (g_d123 & 128) ? ALoadV.data() : Ftot;",
    "    const REAL* FL = (g_d123 & 128) ? ALoadV.data() : Ftot;\n"
    "    if (!g_seed2.empty()) { SIG = g_seed2; Racc = g_R0; LOG(fmt(\"    T10: SIG := estado GEO5 (seed2), Racc = %.4f\", Racc)); }\n"
    "    const vector<REAL> SIGsrf1 = SIG; g_tanAcc.assign(nmat, 0.0); vector<REAL> baseNext, u0Next;\n"
    "    for (int mm = 0; mm < nmat; mm++) g_tanAcc[mm] = std::tan(MAT[mm * 6 + 2] * 3.141592653589793 / 180) * Racc;")
rep("        vector<REAL> du; conv = nrstep(trial, FL, rs, du, nit, true, FL); pend.clear();",
    "        if (rs == 1 && !g_pend0.empty()) { pend = g_pend0; LOG(\"    T10: pend del fichero\"); }\n"
    "        g_S0ext.clear(); g_u0ext.clear();\n"
    "        if (g_d2p == 1) { g_u0ext.assign(ndof, 0.0); if (!pend.empty()) g_u0ext = pend; }\n"
    "        if (g_d2p == 4 || g_d2p == 5) { g_S0ext = SIGsrf1; g_u0ext = uBase; if (g_d2p == 5 && !pend.empty()) for (int d = 0; d < ndof; d++) g_u0ext[d] += pend[d]; }\n"
    "        if (g_d2p == 3 || g_d2p == 6 || g_d2p == 7 || g_d2p == 8) { if (baseNext.empty()) { baseNext = SIGsrf1; u0Next.assign(ndof, 0.0); }\n"
    "          g_S0ext = baseNext; g_u0ext = u0Next; if ((g_d2p == 6 || g_d2p == 8) && !pend.empty()) for (int d = 0; d < ndof; d++) g_u0ext[d] += pend[d]; }\n"
    "        if (g_d2p) pend.clear();\n"
    "        const vector<REAL> Sstart = SIG, U0used = g_u0ext;\n"
    "        vector<REAL> tanSave = g_tanAcc; for (int mm = 0; mm < nmat; mm++) g_tanAcc[mm] *= s;\n"
    "        vector<REAL> du; conv = nrstep(trial, FL, rs, du, nit, true, FL); pend.clear(); g_S0ext.clear(); g_u0ext.clear();\n"
    "        if (!conv) g_tanAcc = tanSave;\n"
    "        if (g_d2p == 3 || g_d2p == 6 || g_d2p == 7 || g_d2p == 8) {\n"
    "          bool okc = conv; if (okc) { REAL mx = 0; for (int d = 0; d < ndof; d++) mx = rmax(mx, std::fabs(du[d])); okc = mx < 1.0; }\n"
    "          if (!okc) { baseNext = s0; u0Next.assign(ndof, 0.0); }\n"
    "          else if (g_d2p <= 6) { for (int d = 0; d < ndof; d++) u0Next[d] = U0used[d] + du[d]; }\n"
    "          else { baseNext = Sstart; u0Next = du; } }")
rep("        if (conv) { rawConv = lastRaw; etaConv = lastEta; } prevFail = !conv;",
    "        if (conv) { rawConv = lastRaw; etaConv = lastEta; } prevFail = !conv;\n"
    "        if (conv && g_t10dump) { char nm[80]; auto wr = [&](const char* k, const vector<REAL>& v) { snprintf(nm, sizeof nm, \"t10_rs%02d_%s.bin\", rs, k); FILE* fo = fopen(nm, \"wb\"); fwrite(v.data(), sizeof(REAL), v.size(), fo); fclose(fo); };\n"
    "          wr(\"sig\", SIG); wr(\"epl\", EPL); wr(\"u\", u); wr(\"raw\", lastRaw); snprintf(nm, sizeof nm, \"t10_rs%02d_eta.txt\", rs); FILE* fo = fopen(nm, \"w\"); fprintf(fo, \"%.17g\\n\", (double)lastEta); fclose(fo); }")
# main: entorno
def ldf(var, vec, n):
    return (f'  if (getenv("{var}")) {{ FILE* fq = fopen(getenv("{var}"), "rb"); {vec}.assign({n}, 0); size_t r = fread({vec}.data(), sizeof(REAL), {vec}.size(), fq); fclose(fq); printf("{var}: %zu\\n", r); }}\n')
rep("  int ndof = 2 * nn;",
    "  if (getenv(\"T10_DUMP\")) g_t10dump = 1; if (getenv(\"T10_R0\")) g_R0 = atof(getenv(\"T10_R0\")); if (getenv(\"T10_D2P\")) g_d2p = atoi(getenv(\"T10_D2P\")); if (getenv(\"T10_PHIACC\")) g_phiacc = 1;\n"
    + ldf("T10_SEED2", "g_seed2", "(size_t)ne * 7 * 4") + ldf("T10_PEND", "g_pend0", "(size_t)2 * nn") +
    "  int ndof = 2 * nn;")
rep('FILE* fg = fopen("semilla_gp.bin", "rb");', 'FILE* fg = fopen(getenv("T10_SEED1") ? getenv("T10_SEED1") : "../t9/semilla_gp.bin", "rb");')
open(os.path.join(AQUI, "_t10.cpp"), "w", encoding="utf-8").write(src)
print("ok _t10.cpp")
