# -*- coding: utf-8 -*-
"""Tanda 14: copia solver14.ts de src/geofem/solver.ts (el original NO se toca) con:
  globalThis.T14 = {e, q, log: []}  volcado por commit del PG vigilado (σ inicial, Δε, región, σ devuelta)
  globalThis.T14REG = Int8Array    región del último commit de cada PG
  T14_ORD=1|2                      tangente con el orden (y ángulo) del TANTEO cuando la σ devuelta cambia de orden
  globalThis.T14KV = {rs, v}       en la it 1 del paso rs: t14_kv.bin = K_t·v − R y t14_R.bin (gdl completos)"""
import os
AQ = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(AQ, "..", "..", "..", "src", "geofem")
s = open(os.path.join(SRC, "solver.ts"), encoding="utf-8").read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a); s = s.replace(a, b)
NL = "\n"
rep('from "./band"', 'from "../../../src/geofem/band"'); rep('from "./agua"', 'from "../../../src/geofem/agua"')
rep("          got = ret(deps, sig) !== 0;",
    "          got = ret(deps, sig) !== 0;" + NL +
    "          const T14 = (globalThis as any).T14; if (T14 && commit && kk === T14.e * NG + T14.q) T14.log.push({ s0: Array.from(sigN), de: Array.from(deps), reg: inf.reg, s: Array.from(sig), ix: inf.ix.slice() });" + NL +
    "          if (commit) { const R14 = (globalThis as any).T14REG; if (R14) R14[kk] = inf.reg; }")
rep("          if (got) GeoFem.mcPrincDevuelta(sig, inf);",
    "          const infT = { t2: inf.t2, ix: inf.ix.slice(), reg: inf.reg };" + NL +
    "          if (got) GeoFem.mcPrincDevuelta(sig, inf);" + NL +
    "          if (got && process.env.T14_ORD === '1' && (inf.ix[0] !== infT.ix[0] || inf.ix[1] !== infT.ix[1])) { inf.t2 = infT.t2; inf.ix = infT.ix; }" + NL +
    "          if (got && process.env.T14_ORD === '3') { inf.t2 = infT.t2; inf.ix = infT.ix; }" + NL +
    "          if (got && process.env.T14_ORD === '4' && Math.cos(inf.t2 - infT.t2) < 0) { const R14I = (globalThis as any).T14INV; if (R14I && commit) R14I.push([kk, infT.t2, inf.t2]); inf.t2 = infT.t2; inf.ix = infT.ix; }" + NL +
    "          const ALT = (globalThis as any).T14ALT; const altM = ALT && ALT.kk.has(kk) ? ALT.mode : 0;" + NL +
    "          if (got && altM === 3) { inf.t2 = infT.t2; inf.ix = infT.ix; }" + NL +
    "          if (got && altM === 7) inf.reg = 3;" + NL +
    "          if (got && process.env.T14_ORD === '2' && (inf.ix[0] !== infT.ix[0] || inf.ix[1] !== infT.ix[1])) { inf.ix = infT.ix; }")
rep("          if (got && (commit || this.soloTangente)) GeoFem.mcTangenteGeo5(inf, De, q[0], q[2], Dep);   // la de GEO5",
    "          if (got && (commit || this.soloTangente)) GeoFem.mcTangenteGeo5(inf, De, q[0], q[2], Dep);   // la de GEO5" + NL +
    "          if (got && altM === 5) Dep.set(De);")
rep("      this.assembleK(this.Kt, false);" + NL + "      let ok = bandFactor(this.Kt);",
    "      this.assembleK(this.Kt, false);" + NL +
    "      { const KV = (globalThis as any).T14KV; if (KV && it === 1 && rstep === KV.rs) { const x = new Float64Array(nf), y = new Float64Array(nf);" + NL +
    "        for (let d = 0; d < ndof; d++) { const k = this.map[d]; if (k >= 0) x[k] = KV.v[d]; }" + NL +
    "        bandMul(this.Kt, x, y); for (let k = 0; k < nf; k++) y[k] -= Rf[k];" + NL +
    "        KV.kv = this.scatter(y); KV.R = this.scatter(Float64Array.from(Rf)); } }" + NL +
    "      let ok = bandFactor(this.Kt);")
# T14_FI=1: si el retorno deja las principales INVERTIDAS (r1 < r3 en las direcciones del tanteo), F_int con la σ ordenada
#   (mismas principales, σ1 en la dirección del tanteo); 2 = además se guarda esa σ
rep("        const w = this.dJw[kk];" + NL + "        const t0 = sig[0] * w, t1 = sig[1] * w, t3 = sig[3] * w;",
    "        const w = this.dJw[kk];" + NL +
    "        let sF: ArrayLike<number> = sig; if (commit && kk === 0) (globalThis as any).T14C = ((globalThis as any).T14C ?? 0) + 1;" + NL +
    "        if (process.env.T14_FI && this.model[mm - 1] === 1 && !this.rigid[mm - 1] && T14INF.got) {" + NL +
    "          const c_ = (sig[0] + sig[1]) / 2, R_ = Math.sqrt((sig[0] - sig[1]) * (sig[0] - sig[1]) / 4 + sig[3] * sig[3]);" + NL +
    "          const pv = [c_ + R_, c_ - R_, sig[2]].sort((a, b) => b - a), pr = [0, 0, 0]; for (let k = 0; k < 3; k++) pr[T14INF.ix[k]] = pv[k];" + NL +
    "          const cen2 = (pr[0] + pr[1]) / 2, R2 = (pr[0] - pr[1]) / 2, t2 = T14INF.t2;" + NL +
    "          const sf = new Float64Array([cen2 + R2 * Math.cos(t2), cen2 - R2 * Math.cos(t2), pr[2], R2 * Math.sin(t2)]);" + NL +
    "          if (Math.abs(sf[0] - sig[0]) + Math.abs(sf[1] - sig[1]) + Math.abs(sf[3] - sig[3]) > 1e-14 * (1 + Math.abs(sig[0]) + Math.abs(sig[1]))) { sF = sf; (globalThis as any).T14NFI = ((globalThis as any).T14NFI ?? 0) + 1; const LG = (globalThis as any).T14FILOG; if (LG && commit) LG.push([(globalThis as any).T14K, kk, (globalThis as any).T14C, T14INF.reg, Array.from(sig), Array.from(sf), T14INF.t2, T14INF.ix.join("")]); if (process.env.T14_FI === '2') sig.set(sf); }" + NL +
    "        }" + NL +
    "        const t0 = sF[0] * w, t1 = sF[1] * w, t3 = sF[3] * w;")
rep("          const infT = { t2: inf.t2, ix: inf.ix.slice(), reg: inf.reg };",
    "          const infT = { t2: inf.t2, ix: inf.ix.slice(), reg: inf.reg }; T14INF.t2 = inf.t2; T14INF.ix = inf.ix.slice(); T14INF.got = got; T14INF.reg = inf.reg;")
rep("export class GeoFem", "const T14INF = { t2: 0, ix: [0, 1, 2], got: false, reg: 0 };" + NL + "export class GeoFem")
# T14_R0=1: residuo de ARRANQUE de un paso sin porPaso = Fext − Σ Bᵀ·σ_N·w con la σ GUARDADA (sin pasar por el retorno con Δε = 0)
rep("    evalInc(du, false, Fi);" + NL + "    this.gather(Fext, Fi, Rf);",
    "    if (process.env.T14_R0 === '1' && !this.porPaso) {" + NL +
    "      Fi.fill(0);" + NL +
    "      for (let e = 0; e < this.ne; e++) { if (!this.act[e]) continue; for (let q = 0; q < NG; q++) { const kk = e * NG + q, B = this.Bc.subarray(kk * 36, kk * 36 + 36), w = this.dJw[kk];" + NL +
    "        const t0 = this.SIG[kk * 4] * w, t1 = this.SIG[kk * 4 + 1] * w, t3 = this.SIG[kk * 4 + 3] * w; for (let c = 0; c < 12; c++) Fi[this.edof[e * 12 + c]] += B[c] * t0 + B[12 + c] * t1 + B[24 + c] * t3; } }" + NL +
    "    } else evalInc(du, false, Fi);" + NL +
    "    this.gather(Fext, Fi, Rf);")
open(os.path.join(AQ, "solver14.ts"), "w", encoding="utf-8").write(s); print("ok solver14.ts")
