# -*- coding: utf-8 -*-
"""Copia de ../x87/geofem_x87.cpp (= src/geofem/cpp/geofem.cpp con REAL) + instrumentos. El original no se toca.
   - contador de regiones del retorno MC (g_reg)
   - MC_TOL (env): tolerancia ABSOLUTA del retorno, como GEO5 (ys_tolerance -> DAT_00722718)
   - MC_DUMP (env): cada llamada al retorno MC -> fichero «MC k prueba(xx yy xy zz) | devuelta | región» (orden de GEO5) y NORMS por iteración"""
NL = chr(10); BS = chr(92)
s = open("../x87/geofem_x87.cpp", encoding="utf-8").read()
cab = ('static double g_ystol() { static double v = getenv("MC_TOL") ? atof(getenv("MC_TOL")) : 0; return v; }' + NL +
       'static FILE* g_dump() { static FILE* f = getenv("MC_DUMP") ? fopen(getenv("MC_DUMP"), "w") : nullptr; return f; }' + NL +
       'static long g_ncall = 0;' + NL +
       'static void mcDump(const REAL* t, const REAL* o, int reg) { FILE* f = g_dump(); if (!f) return;' + NL +
       '  fprintf(f, "MC %ld %.16e %.16e %.16e %.16e | %.16e %.16e %.16e %.16e | %d' + BS + 'n", g_ncall++, (double)t[0], (double)t[1], (double)t[3], (double)t[2],'
       ' (double)o[0], (double)o[1], (double)o[3], (double)o[2], reg); }' + NL +
       'static void normDump() { FILE* f = g_dump(); if (f) fprintf(f, "NORMS %ld' + BS + 'n", g_ncall); }' + NL +
       'static long g_reg[5] = {0, 0, 0, 0, 0};' + NL)
s = s.replace("struct GeoFem {", cab + "struct GeoFem {", 1)
a = "    if (info) info->reg = reg;" + NL + "    return reg;"
assert a in s
s = s.replace(a, "    if (info) info->reg = reg;" + NL + "    g_reg[reg]++; mcDump(st, out, reg);" + NL + "    return reg;", 1)
e = "    if (fmc(ss, sp, ccos) <= tol) return 0;"
assert e in s
s = s.replace(e, "    if (fmc(ss, sp, ccos) <= tol) { mcDump(st, out, 0); return 0; }", 1)
b = "    REAL tol = 1e-7 * rmax(1.0, rmax(std::fabs(str[0]), rmax(std::fabs(str[1]), std::fabs(str[2]))));"
assert b in s
s = s.replace(b, b + NL + "    if (g_ystol() > 0) tol = g_ystol();", 1)
n = '      LOG(fmt("  RS=%d SRF=%.4f it=%2d'
assert n in s
s = s.replace(n, "      normDump();" + NL + n, 1)
open("_copia.cpp", "w", encoding="utf-8").write(s)
# MC_TRET (env): la tangente toma las direcciones principales de la σ DEVUELTA (como FUN_005a8680: thunk_FUN_0062d6a0 sobre la
# tensión guardada), no de la σ de prueba. En el ápice (σ isótropa) el ángulo sale 0.
s = open("_copia.cpp", encoding="utf-8").read()
g = "          got = ret(deps, sig) != 0;"
assert g in s
s = s.replace(g, g + NL + '          if (got && getenv("MC_TRET")) inf.t2 = std::atan2(2 * sig[3], sig[0] - sig[1]);', 1)
open("_copia.cpp", "w", encoding="utf-8").write(s)
# MC_G5VAL (env): admisibilidad como FUN_005a67e0: F1, F2 y F3 (sobre los valores devueltos SIN reordenar) <= tolerancia,
# en vez de «orden σ1 >= σ2 >= σ3 (± tol) y F1 <= tol». Con MC_TOL=0.001 = ys_tolerance del InputFile.
s = open("_copia.cpp", encoding="utf-8").read()
v = "    return s3[0] >= s3[1] - tol && s3[1] >= s3[2] - tol && fmc(s3, sp, cc) <= tol;"
assert v in s
s = s.replace(v, '    if (getenv("MC_G5VAL")) { REAL f2 = 0.5 * (s3[1] - s3[2]) + 0.5 * (s3[1] + s3[2]) * sp - cc, f3 = 0.5 * (s3[0] - s3[1]) + 0.5 * (s3[0] + s3[1]) * sp - cc;'
              ' return fmc(s3, sp, cc) <= tol && f2 <= tol && f3 <= tol; }' + NL + v, 1)
open("_copia.cpp", "w", encoding="utf-8").write(s)
# MC_DUMP: también la tangente guardada en cada punto al CONFIRMAR la iteración (orden xx yy xy zz, como GEO5)
s = open("_copia.cpp", encoding="utf-8").read()
t = "          if (got && (commit || soloTangente)) mcTangenteGeo5(inf, De, q[0], q[2], Dep);"
assert t in s
s = s.replace(t, t + NL + "          if (got && commit && g_dump()) { const int o[4] = {0, 1, 3, 2}; fprintf(g_dump(), " + chr(34) + "TG %ld" + chr(34) + ", g_ncall);"
              " for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) fprintf(g_dump(), " + chr(34) + " %.12e" + chr(34) + ", (double)Dep[o[i] * 4 + o[j]]); fprintf(g_dump(), " + chr(34) + BS + "n" + chr(34) + "); }", 1)
open("_copia.cpp", "w", encoding="utf-8").write(s)
# MC_TRET=2: además del ángulo, el ORDEN σ1 >= σ2 >= σ3 de la tangente sale de la σ DEVUELTA (FUN_005a8680 recalcula las principales
# de la tensión guardada y las ordena; el retorno a la cara admitido con tolerancia puede dejar σ2 > σ1 y entonces los papeles cambian)
s = open("_copia.cpp", encoding="utf-8").read()
g = '          if (got && getenv("MC_TRET")) inf.t2 = std::atan2(2 * sig[3], sig[0] - sig[1]);'
assert g in s
s = s.replace(g, g + NL + '          if (got && getenv("MC_TRET") && atoi(getenv("MC_TRET")) == 2) { REAL c_ = (sig[0] + sig[1]) / 2, R_ = std::sqrt((sig[0] - sig[1]) * (sig[0] - sig[1]) / 4 + sig[3] * sig[3]);'
              ' REAL pv[3] = {c_ + R_, c_ - R_, sig[2]}; int ix_[3] = {0, 1, 2}; std::sort(ix_, ix_ + 3, [&](int x, int y) { return pv[x] > pv[y]; }); for (int k_ = 0; k_ < 3; k_++) inf.ix[k_] = ix_[k_]; }', 1)
open("_copia.cpp", "w", encoding="utf-8").write(s)
