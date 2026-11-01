# -*- coding: utf-8 -*-
r"""Tanda 12: genera tests/x87/t12/geofem_modo_geo5.patch (NO lo aplica) con lo medido en la copia t12:
  1. Rigid body de GEO5 = elástico E = Eur = 1e9 kPa, ν = 0.2 (binario: Geo5Solver_decomp.c:73262, material tipo 1 'rigidbody').
     -> geofemWasm.ts (MAT que va al WASM) y solver.ts (D del motor TS).
  2. geofem.cpp, bit 32 de geofem_set_srm (modo GEO5 del muro): ALoad = F_int del estado de SRF 1 como carga/referencia de los
     peldaños (V5) y arranque de cada peldaño con u0 = η·Δu de la ÚLTIMA iteración del último peldaño convergido (0 tras fallo),
     metido solo en σ (porPaso), no en u. Línea de búsqueda de UNA pasada (bit 4 apagado). Corte: 4.º fallo (ya estaba).
  3. geofem.cpp, bit 64: desempate de principales σ_plano = σz (|Δ| <= 1e-14·max|σ|) -> σz delante. NO es del binario: es redondeo
     (GEO5 cae a un lado u otro según el último bit); es la elección que reproduce el peldaño decisivo del muro (1.2627, el. 519 PG 4).
  Modo del muro: srmContinua = 1|2|16|32|64 = 115.
Uso: python hacer_parche.py  (escribe copias en %TEMP%\t12_parche y el .patch aquí)."""
import os, subprocess, shutil, tempfile
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.abspath(os.path.join(AQUI, "..", "..", ".."))
TMP = os.path.join(tempfile.gettempdir(), "t12_parche"); shutil.rmtree(TMP, ignore_errors=True)
def editar(rel, cambios):
    src = open(os.path.join(RAIZ, rel), encoding="utf-8", newline="").read()
    for a, b in cambios:
        assert src.count(a) == 1, (rel, src.count(a), a[:80])
        src = src.replace(a, b)
    out = os.path.join(TMP, "b", rel); os.makedirs(os.path.dirname(out), exist_ok=True)
    ina = os.path.join(TMP, "a", rel); os.makedirs(os.path.dirname(ina), exist_ok=True)
    shutil.copy(os.path.join(RAIZ, rel), ina)
    open(out, "w", encoding="utf-8", newline="").write(src)

CPP = "src/geofem/cpp/geofem.cpp"
editar(CPP, [
 ("  int lsMax = 1;\n",
  "  int lsMax = 1;\n"
  "  // MODO GEO5 DEL MURO (bit 32 de geofem_set_srm; Tanda 12, tests/x87/t12): carga de los peldaños = ALoad = F_int del estado de\n"
  "  // SRF 1 (GEO5 pone ALoad = F_int al empezar la SRM) y arranque de cada peldaño con u0 = η·Δu de la ÚLTIMA iteración del último\n"
  "  // peldaño convergido (0 tras un fallo), metido solo en σ (porPaso), no en u. Medido contra el solver real: los 10 primeros\n"
  "  // peldaños del muro de Manabí iteración a iteración (η, |gi|) y FS = 1.362360 como GEO5.\n"
  "  bool modoG5 = false, soloFint = false; vector<double> lastRaw, u0ext, ALoadV; double lastEta = 1;\n"),
 # desempate
 ("    std::sort(ix, ix + 3, [&](int a, int b) { return pv[a] > pv[b]; });\n",
  "    std::sort(ix, ix + 3, [&](int a, int b) { return pv[a] > pv[b]; });\n    if (gDesempateZ) empateZ(pv, ix);\n"),
 ("    std::sort(ix, ix + 3, [&](int a, int b) { return str[a] > str[b]; });\n",
  "    std::sort(ix, ix + 3, [&](int a, int b) { return str[a] > str[b]; });\n    if (gDesempateZ) empateZ(str, ix);\n"),
 ("  static void mcPrincDevuelta(const double* sig, McInfo& in) {\n",
  "  // DESEMPATE de principales (bit 64): una principal del plano IGUAL a σz (|Δ| <= 1e-14·max|σ|, típico tras volver a la arista\n"
  "  // σ1 = σ2) -> σz delante. No sale del binario: GEO5 (invariant.cpp, FUN_0062d6a0, ordenación por selección con '<') decide por el\n"
  "  // último bit de su σ. Es la elección que reproduce el muro de Manabí (peldaño 1.2627, el. 519 PG 4: sin ella FS 2.1149, con ella 1.3624).\n"
  "  static inline bool gDesempateZ = false;\n"
  "  static void empateZ(const double* v, int* ix) {\n"
  "    double m = std::max(std::max(std::fabs(v[0]), std::fabs(v[1])), std::fabs(v[2])), tol = 1e-14 * m;\n"
  "    for (int k = 0; k < 2; k++) if (ix[k + 1] == 2 && std::fabs(v[ix[k]] - v[ix[k + 1]]) <= tol) std::swap(ix[k], ix[k + 1]);\n"
  "  }\n"
  "  static void mcPrincDevuelta(const double* sig, McInfo& in) {\n"),
 # nrstep: evalInc antes del arranque, con u0
 ("    if (!keep) resetState();   // keep = la etapa arranca del estado (σ, ε_pl) que dejó la anterior\n"
  "    // peldaño CONTINUADO de la SRM: la primera tangente sale del retorno con la resistencia YA reducida (GEO5 da en la\n"
  "    // iteración 1 un paso ~2 veces mayor que con la tangente del peldaño anterior, y lo recorta con η)\n"
  "    if (keep && Fref && tangIni) { soloTangente = true; assembleInc(du.data(), ab, false, Fi.data()); soloTangente = false; }\n"
  "    assembleInc(du.data(), ab, false, Fi.data());\n",
  "    if (!keep) resetState();   // keep = la etapa arranca del estado (σ, ε_pl) que dejó la anterior\n"
  "    // porPaso: el retorno de cada iteración sale del estado del INICIO del paso con el incremento ACUMULADO del paso\n"
  "    // (no se fijan tensiones por iteración). U0 = incremento inicial (modo GEO5: η·Δu del último peldaño), solo en σ.\n"
  "    const vector<double> S0 = SIG, E0 = EPL; vector<double> uT(ndof);\n"
  "    const vector<double> U0 = (porPaso && u0ext.size() == (size_t)ndof) ? u0ext : vector<double>(ndof, 0.0);\n"
  "    auto evalInc = [&](const double* dinc, bool commit, double* Fo) {\n"
  "      if (!porPaso) { assembleInc(dinc, ab, commit, Fo); return; }\n"
  "      for (int d = 0; d < ndof; d++) uT[d] = U0[d] + u[d] + dinc[d];\n"
  "      if (commit) { SIG = S0; EPL = E0; assembleInc(uT.data(), ab, true, Fo); return; }\n"
  "      vector<double> cur; cur.swap(SIG); SIG = S0; assembleInc(uT.data(), ab, false, Fo); SIG.swap(cur);\n"
  "    };\n"
  "    if (soloFint) { assembleInc(du.data(), ab, false, Fi.data()); ALoadV = Fi; itOut = 0; return true; }   // ALoad = F_int (modo GEO5)\n"
  "    // peldaño CONTINUADO de la SRM: la primera tangente sale del retorno con la resistencia YA reducida (GEO5 da en la\n"
  "    // iteración 1 un paso ~2 veces mayor que con la tangente del peldaño anterior, y lo recorta con η)\n"
  "    if (keep && Fref && tangIni) { soloTangente = true; evalInc(du.data(), false, Fi.data()); soloTangente = false; }\n"
  "    evalInc(du.data(), false, Fi.data());\n"),
 ("    double rPrev = 1e300; int ndiv = 0;\n"
  "    // porPaso: el retorno de cada iteración sale del estado del INICIO del paso con el incremento ACUMULADO del paso\n"
  "    // (no se fijan tensiones por iteración)\n"
  "    const vector<double> S0 = SIG, E0 = EPL; vector<double> uT(ndof);\n"
  "    auto evalInc = [&](const double* dinc, bool commit, double* Fo) {\n"
  "      if (!porPaso) { assembleInc(dinc, ab, commit, Fo); return; }\n"
  "      for (int d = 0; d < ndof; d++) uT[d] = u[d] + dinc[d];\n"
  "      if (commit) { SIG = S0; EPL = E0; assembleInc(uT.data(), ab, true, Fo); return; }\n"
  "      vector<double> cur; cur.swap(SIG); SIG = S0; assembleInc(uT.data(), ab, false, Fo); SIG.swap(cur);\n"
  "    };\n",
  "    double rPrev = 1e300; int ndiv = 0;\n"),
 ("      } while (nls < lsMax && ratio >= 0.8);\n",
  "      } while (nls < lsMax && ratio >= 0.8);\n      lastRaw = du; lastEta = al;   // DDisp crudo y η de la última iteración (arranque del peldaño siguiente en modo GEO5)\n"),
 # runStage
 ("    nstepsOut = 0;\n    vector<double> uBase = u;   // SRM continuada: desplazamiento del último estado convergido\n",
  "    nstepsOut = 0;\n    vector<double> uBase = u;   // SRM continuada: desplazamiento del último estado convergido\n"
  "    vector<double> FLv(Ftot, Ftot + ndof), pend;   // pend = η·Δu de la última iteración del último peldaño convergido\n"
  "    if (srmContinua && modoG5) {   // GEO5: ALoad = F_int del estado de SRF 1 (carga y referencia de las normas de los peldaños)\n"
  "      soloFint = true; vector<double> z; int iz; nrstep(1.0, Ftot, 0, z, iz, true); soloFint = false; FLv = ALoadV;\n"
  "      double a = 0, b = 0; for (int k = 0; k < nfree; k++) { a += FLv[free_[k]] * FLv[free_[k]]; b += Ftot[free_[k]] * Ftot[free_[k]]; }\n"
  "      LOG(fmt(\"    SRM modo GEO5: |ALoad| = %.4f (|F| = %.4f)\", std::sqrt(a), std::sqrt(b)));\n"
  "    }\n"
  "    const double* FL = FLv.data();\n"),
 ("        vector<double> du; conv = nrstep(trial, Ftot, rs, du, nit, true, Ftot);\n",
  "        u0ext.clear(); if (modoG5 && !pend.empty()) u0ext = pend;\n"
  "        vector<double> du; conv = nrstep(trial, FL, rs, du, nit, true, FL); u0ext.clear();\n"),
 ("        else { SIG = s0; EPL = e0; DEP = d0; hasDep = h0; }\n",
  "        else { SIG = s0; EPL = e0; DEP = d0; hasDep = h0; }\n"
  "        if (modoG5) { if (conv) { pend.assign(ndof, 0.0); for (int d = 0; d < ndof; d++) pend[d] = lastEta * lastRaw[d]; } else pend.clear(); }\n"),
 ("g->porPaso = (f & 16) != 0; }",
  "g->porPaso = (f & 16) != 0; g->modoG5 = (f & 32) != 0; GeoFem::gDesempateZ = (f & 64) != 0; }"),
 ("// resistencia reducida · 4 búsqueda lineal de 3 pasadas · 8 norma de energía con el residuo de la iteración ANTERIOR\n",
  "// resistencia reducida · 4 búsqueda lineal de 3 pasadas · 8 norma de energía con el residuo de la iteración ANTERIOR\n"
  "// · 16 porPaso · 32 modo GEO5 del muro (ALoad = F_int, u0 = η·Δu del último peldaño) · 64 desempate σz delante. Muro: 115\n"),
])
editar("src/geofem/geofemWasm.ts", [
 ("    mod.HEAPF64.set(m.MAT.flat(), pMat >> 3);\n",
  "    // RIGID BODY de GEO5 = elástico E = Eur = 1e9 kPa, ν = 0.2 (binario: Geo5Solver_decomp.c:73262, material tipo 1). Tanda 12:\n"
  "    // con el E del hormigón (2.1e7) el Δu del 1.1111 salía 12 % mayor que el del solver real; con 1e9, a 1e-10.\n"
  "    const rigM = m.RIGID ?? (m.MATNAMES ?? []).map((n) => /muro|hormig|concret|wall/i.test(n));\n"
  "    mod.HEAPF64.set(m.MAT.flatMap((M, i) => (rigM[i] ? [RIGID_E, RIGID_NU, ...M.slice(2)] : M)), pMat >> 3);\n"),
 ('import { GEO5_SRM } from "./solver";', 'import { GEO5_SRM, RIGID_E, RIGID_NU } from "./solver";'),
])
editar("src/geofem/solver.ts", [
 ("export const GEO5_SRM = 3;",
  "export const RIGID_E = 1e9, RIGID_NU = 0.2;   // «rigidbody» de GEO5: elástico E = Eur = 1e9 kPa, ν = 0.2 (Geo5Solver_decomp.c:73262)\n"
  "export const GEO5_SRM = 3;"),
 ("      const E = m.MAT[mm][0], nu = m.MAT[mm][1], f = E / ((1 + nu) * (1 - 2 * nu));",
  "      const E = this.rigid[mm] ? RIGID_E : m.MAT[mm][0], nu = this.rigid[mm] ? RIGID_NU : m.MAT[mm][1], f = E / ((1 + nu) * (1 - 2 * nu));"),
])
pat = os.path.join(AQUI, "geofem_modo_geo5.patch")
r = subprocess.run(["git", "diff", "--no-index", "--no-color", "a", "b"], cwd=TMP, capture_output=True, text=True, encoding="utf-8")
txt = r.stdout.replace("a/a/", "a/").replace("b/b/", "b/")
open(pat, "w", encoding="utf-8", newline="\n").write(txt)
print("ok", pat, len(txt.splitlines()), "líneas; copias en", TMP)
