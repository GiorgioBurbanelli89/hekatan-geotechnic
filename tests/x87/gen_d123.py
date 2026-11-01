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
open(os.path.join(AQUI, "geofem_d123.cpp"), "w", encoding="utf-8").write(src)
m = open(os.path.join(AQUI, "main_x87.cpp"), encoding="utf-8").read()
m = m.replace("int main(int argc, char** argv) {", "int main(int argc, char** argv) {\n  if (getenv(\"D123\")) g_d123 = atoi(getenv(\"D123\")); printf(\"D123=%d\\n\", g_d123);", 1)
open(os.path.join(AQUI, "_d123.cpp"), "w", encoding="utf-8").write(src + "\n#include <cstdlib>\n" + m)
print("ok geofem_d123.cpp")
