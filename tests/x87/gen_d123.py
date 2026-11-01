# -*- coding: utf-8 -*-
r"""Tanda 7 (1-nov-2026): cómo CONTINÚA GEO5 entre peldaños de la SRM (safefact_stage_NR, FUN_00426ee0; ver
ingenieria-inversa/hekatan-geo5-bridge/EXTRAIDO_GeoFEM_SRM_escalones.md). Parchea la COPIA geofem_x87.cpp (de gen_x87.py)
-> geofem_d123.cpp. El original src/geofem/cpp/geofem.cpp NO se toca.  Interruptores (variable de entorno D123, bits):
  1 = D1: al arrancar el peldaño, el retorno con c,phi nuevos se GRABA (5eb620 con 600&8 puesto), K con esa tangente
  2 = D2: ese arranque re-aplica a las TENSIONES eta_ult * DDisp_ult (nudo+0x16c, FUN_00559af0), no a u
  4 = D3: tras relajar, re-aplica eta_FALLIDO * DDisp_ult del último peldaño convergido (Restart_Step trae 0x16c, no eta)
SRF 1.0: DDisp_ult = 0 (GEO5 parte de Restart_In: 1 iteración, |gi| 1.9e-14)."""
import os, subprocess
AQUI = os.path.dirname(os.path.abspath(__file__))
subprocess.run(["python", os.path.join(AQUI, "gen_x87.py")], check=True, cwd=AQUI)
src = open(os.path.join(AQUI, "geofem_x87.cpp"), encoding="utf-8").read()

def rep(a, b):
    global src
    assert src.count(a) == 1, a
    src = src.replace(a, b)

rep("struct GeoFem {", "static int g_d123 = 0;\nstruct GeoFem {\n  vector<REAL> lastRaw, rawConv, pend; REAL lastEta = 1, etaConv = 1;")
rep("    if (keep && Fref && tangIni) { soloTangente = true; assembleInc(du.data(), ab, false, Fi.data()); soloTangente = false; }\n    assembleInc(du.data(), ab, false, Fi.data());",
"""    bool srmPel = keep && Fref; const REAL* inc0 = (srmPel && !pend.empty()) ? pend.data() : du.data();
    if (srmPel && !pend.empty()) LOG(fmt("    D2/D3: incremento re-aplicado a sigma |eta*DDisp| = %.4f mm", vnorm(pend.data(), ndof) * 1e3));
    if (srmPel && (g_d123 & 1)) assembleInc(inc0, ab, true, Fi.data());     // D1: retorno con c,phi nuevos GRABADO (+ tangente)
    else {
      if (srmPel && tangIni) { soloTangente = true; assembleInc(inc0, ab, false, Fi.data()); soloTangente = false; }
      assembleInc(inc0, ab, false, Fi.data());
    }""")
rep("      for (int d = 0; d < ndof; d++) du[d] *= al;", "      lastRaw = du; lastEta = al;\n      for (int d = 0; d < ndof; d++) du[d] *= al;")
rep("    LOG(fmt(\"    SRM rs00 paso=1.0000 SRF=1.0000 %s it=%d\", c0 ? \"CONVERGE\" : \"DIVERGE\", n0));",
    "    LOG(fmt(\"    SRM rs00 paso=1.0000 SRF=1.0000 %s it=%d\", c0 ? \"CONVERGE\" : \"DIVERGE\", n0));\n    rawConv.assign(ndof, 0); etaConv = 1; bool prevFail = false;")
rep("        vector<REAL> du; conv = nrstep(trial, Ftot, rs, du, nit, true, Ftot);",
"""        pend.clear();
        if (!prevFail && (g_d123 & 2)) { pend.assign(ndof, 0); for (int d = 0; d < ndof; d++) pend[d] = etaConv * rawConv[d]; }
        if (prevFail && (g_d123 & 4)) { pend.assign(ndof, 0); for (int d = 0; d < ndof; d++) pend[d] = lastEta * rawConv[d]; LOG(fmt("    D3: eta fallido %.4f", lastEta)); }
        vector<REAL> du; conv = nrstep(trial, Ftot, rs, du, nit, true, Ftot); pend.clear();""")
rep("        else { SIG = s0; EPL = e0; DEP = d0; hasDep = h0; }\n      } else conv",
    "        else { SIG = s0; EPL = e0; DEP = d0; hasDep = h0; }\n        if (conv) { rawConv = lastRaw; etaConv = lastEta; } prevFail = !conv;\n      } else conv")
# --- Tanda 8: la iteración del line search de GEO5 (FUN_00427a70, SRM_safefact_decomp.c:2440-2528)
#   8  = V1: R(0) del line search se EVALÚA con eta = 0 (5eb620 con eta 0: sin retorno, sigma = base grabada), no el residuo
#            con el que se resolvió (en la it 1 de un peldaño sin D1 el nuestro es el de la sigma ya devuelta con c,phi nuevos)
#   16 = V2: puerta estricta ratio > 0.8 (GEO5 `0x3d0 < ratio`); antes >= 0.8
#   32 = V3: tangente del peldaño = la de la sigma GRABADA (sin tangIni; K del peldaño anterior)
rep("static int g_d123 = 0;", "static int g_d123 = 0; static int g_noret = 0;")
rep("        } else got = dpReturn(deps, al, k, De, commit || soloTangente, sigN, sig, Dep);\n        REAL w = dJw[kk];",
    "        } else got = dpReturn(deps, al, k, De, commit || soloTangente, sigN, sig, Dep);\n        if (g_noret) { for (int i = 0; i < 4; i++) sig[i] = sigN[i]; got = false; }\n        REAL w = dJw[kk];")
rep("      REAL s0 = vdot(duf.data(), Rf.data(), nf), n0 = vnorm(Rf.data(), nf);",
"""      REAL s0 = vdot(duf.data(), Rf.data(), nf), n0 = vnorm(Rf.data(), nf);
      if (g_d123 & 8) { vector<REAL> z(ndof, 0), F0(ndof), R0(nf); g_noret = 1; assembleInc(z.data(), ab, false, F0.data()); g_noret = 0;
        for (int k = 0; k < nf; k++) R0[k] = Fext[fr[k]] - F0[fr[k]]; s0 = vdot(duf.data(), R0.data(), nf); n0 = vnorm(R0.data(), nf); }""")
rep("if (ratio >= 0.8) acc = acc * s0 / den;", "if ((g_d123 & 16) ? ratio > 0.8 : ratio >= 0.8) acc = acc * s0 / den;")
src = src.replace("if (srmPel && tangIni) { soloTangente = true;", "if (srmPel && tangIni && !(g_d123 & 32)) { soloTangente = true;", 1)
rep("        if (acc < 0.1) { al = 0.1; ratio = 0; }", "        if (g_d123 & 64) LOG(fmt(\"    LS n0=%.6e n1=%.6e ratio=%.6f s0=%.6e s1=%.6e acc=%.6f\", n0, n1, n1 / n0, s0, s1, acc));\n        if (acc < 0.1) { al = 0.1; ratio = 0; }")
# --- Tanda 8b (EXTRAIDO_GeoFEM_SRM_pendientes.md): 
#   128 = V5: SRF 1 como GEO5 (FUN_004261d0): estado proyectado y GRABADO con c,phi sin reducir y ALoad := F_int(sigma) (residuo 0 exacto);
#             la SRM usa ALoad como carga y como |g|. Con el 3.er argumento «semilla» el estado = sigma nodales de Restart_In (sin Newton previo).
#   256 = V4: corte del peldaño de GEO5: 2 subidas SEGUIDAS de |gi| (estricto >) o 3 en TOTAL; sin el «ndiv = 0 si ef <= 0.01»
rep("static int g_d123 = 0; static int g_noret = 0;", "static int g_d123 = 0; static int g_noret = 0; static int g_aload = 0;")
rep("  vector<REAL> lastRaw, rawConv, pend;", "  vector<REAL> lastRaw, rawConv, pend, ALoadV;")
rep("    REAL rPrev = 1e300; int ndiv = 0;", "    if (g_aload) { std::fill(du.begin(), du.end(), 0.0); assembleInc(du.data(), ab, true, Fi.data()); ALoadV = Fi; itOut = 0; return true; }\n    REAL rPrev = 1e300; int ndiv = 0, nosc = 0;")
rep("      if (nDL <= rPrev || ef <= 1e-2) ndiv = 0; else ndiv++;", "      if ((g_d123 & 256) && Fref) { if (nDL > rPrev) { ndiv++; nosc++; } else ndiv = 0; } else\n      if (nDL <= rPrev || ef <= 1e-2) ndiv = 0; else ndiv++;")
rep("      if (ndiv >= 2) break;", "      if (ndiv >= 2 || ((g_d123 & 256) && Fref && nosc >= 3)) break;")
rep("c0 = nrstep(1.0, Ftot, 0, duS, n0, true, Ftot); u = duS;", "if (g_d123 & 128) { c0 = true; u.assign(ndof, 0.0); } else { c0 = nrstep(1.0, Ftot, 0, duS, n0, true, Ftot); u = duS; }")
rep("    rawConv.assign(ndof, 0); etaConv = 1; bool prevFail = false;",
    "    rawConv.assign(ndof, 0); etaConv = 1; bool prevFail = false;\n    if (g_d123 & 128) { g_aload = 1; vector<REAL> z; int iz; nrstep(1.0, Ftot, 0, z, iz, true); g_aload = 0; u.assign(ndof, 0.0);\n      REAL a = 0, b = 0; for (int k = 0; k < nfree; k++) { a += ALoadV[free_[k]] * ALoadV[free_[k]]; b += Ftot[free_[k]] * Ftot[free_[k]]; } LOG(fmt(\"    V5: |ALoad| = %.4f (|Fg| = %.4f)\", std::sqrt(a), std::sqrt(b))); }\n    const REAL* FL = (g_d123 & 128) ? ALoadV.data() : Ftot;")
rep("conv = nrstep(trial, Ftot, rs, du, nit, true, Ftot); pend.clear();", "conv = nrstep(trial, FL, rs, du, nit, true, FL); pend.clear();")
open(os.path.join(AQUI, "geofem_d123.cpp"), "w", encoding="utf-8").write(src)
m = open(os.path.join(AQUI, "main_x87.cpp"), encoding="utf-8").read()
m = m.replace("int main(int argc, char** argv) {", "int main(int argc, char** argv) {\n  if (getenv(\"D123\")) g_d123 = atoi(getenv(\"D123\")); printf(\"D123=%d\\n\", g_d123);", 1)
open(os.path.join(AQUI, "_d123.cpp"), "w", encoding="utf-8").write(src + "\n#include <cstdlib>\n" + m)
print("ok geofem_d123.cpp")
