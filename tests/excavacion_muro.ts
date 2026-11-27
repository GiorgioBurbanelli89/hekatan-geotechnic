// PLANTILLA «Talud con excavación al pie y muro en voladizo (con dentellón)» (26-nov-2026): comprobaciones INDEPENDIENTES.
//   npx tsx tests/excavacion_muro.ts            (rápido: malla 1.0; entra en npm test)
//   npx tsx tests/excavacion_muro.ts --malla    (+ convergencia de malla 1.0 / 0.8 / 0.6 / 0.5)
// (a) sin excavación ni muro, el camino por etapas (talud natural → FS srm=1) da el MISMO FS que el cálculo normal (SRM de la
//     etapa de peso propio) sobre la misma malla, en los dos motores; y contra el corte original (otra malla y otro fondo) se dice
//     la diferencia.
// (b) EQUILIBRIO GLOBAL en cada etapa: Σ reacciones verticales (Σ Bᵀσ en los gdl fijos) = peso analítico (áreas de los polígonos
//     × γ: dominio, muro con γ del hormigón, menos la excavación); Σ reacciones horizontales = 0; residuo en los gdl libres.
// (c) el muro REDUCE el desplazamiento del pie frente a la MISMA excavación sin muro (misma malla: solo cambia el material).
// (d) la SRM de la etapa final en el motor TS (gdl dormidos) = la del motor WASM (submodelo solo con los elementos activos).
import { parseHgeo } from "../src/model/dsl";
import { hgeoPlantilla, muroExcavacion, poligonoMuro, paramsPorDefecto } from "../src/model/plantillas";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem, type GeoModel, type StageResult } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { subModeloSrm, resultadoCompleto } from "../src/geofem/submodelo";

let bad = 0; const ok = (c: boolean, t: string) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
const area = (P: [number, number][]) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
const nudo = (m: GeoModel, x: number, z: number) => { let b = 0, bd = Infinity; for (let i = 0; i < m.X.length; i++) { const d = Math.hypot(m.X[i] - x, m.Y[i] - z); if (d < bd) { bd = d; b = i; } } return b; };
const umax = (u: Float64Array) => { let a = 0; for (let i = 0; i < u.length; i += 2) a = Math.max(a, Math.hypot(u[i], u[i + 1])); return a; };

type Corrida = { model: GeoModel; res: StageResult[]; reac: { Ry: number; Rx: number; res: number; W?: number }[]; nel: number; nn: number; seg: number; txt: string };
async function correr(dados: Record<string, number>, motorSrm: "ts" | "wasm" = "wasm", quitarEtapas?: string): Promise<Corrida> {
  let txt = hgeoPlantilla("excavacion_muro", dados);
  if (quitarEtapas) txt = txt.replace(/^etapa .*$/gm, "").trim() + "\n" + quitarEtapas + "\n";
  const { model, stats } = meshSlope(parseHgeo(txt));
  const fem = new GeoFem(model, () => {});
  const subs: GeoFemWasm[] = [];
  if (motorSrm === "wasm" && model.staged) {
    const mp = new Map<number, { w: GeoFemWasm; s: ReturnType<typeof subModeloSrm> }>();
    for (let si = 0; si < model.stages.length; si++) if (model.stages[si].srm) { const s = subModeloSrm(model, si); const w = await GeoFemWasm.create(s.model, () => {}); subs.push(w); mp.set(si, { w, s }); }
    fem.srmExterno = (si) => { const q = mp.get(si)!; return resultadoCompleto(q.w.run(q.s.model)[0], q.s, model, si); };
  }
  const reac: Corrida["reac"] = [];
  const fijo = new Set(model.FIXED);
  const t0 = Date.now();
  const res = fem.run(model, undefined, (r, si) => {
    if (!model.staged || model.stages[si].srm) { reac.push({ Ry: NaN, Rx: NaN, res: NaN }); return; }
    // carga externa = peso de los activos, integrado APARTE (T6 de lados rectos: cada nudo medio lleva 1/3 del peso, las esquinas 0)
    const Fi = fem.fuerzasInternas(), F = new Float64Array(Fi.length), st = model.stages[si], act = st.active!, em = st.emat ?? model.EMAT;
    let W = 0;
    model.ELE.forEach((el, e) => {
      if (!act[e]) return;
      const [a, b, c] = el, A = Math.abs((model.X[b] - model.X[a]) * (model.Y[c] - model.Y[a]) - (model.X[c] - model.X[a]) * (model.Y[b] - model.Y[a])) / 2, w = A * model.MAT[em[e] - 1][4];
      W += w; for (let k = 3; k < 6; k++) F[2 * el[k] + 1] -= w / 3;
    });
    // reacción = (F_int − F) en los gdl fijos; residuo = lo mismo en los libres (≈ 0 en equilibrio)
    let Ry = 0, Rx = 0, rmax = 0;
    for (let d = 0; d < Fi.length; d++) { const r = Fi[d] - F[d]; if (fijo.has(d)) { if (d % 2) Ry += r; else Rx += r; } else rmax = Math.max(rmax, Math.abs(r)); }
    reac.push({ Ry, Rx, res: rmax, W });
  });
  for (const w of subs) w.destroy();
  return { model, res, reac, nel: stats.elements, nn: stats.nodes, seg: (Date.now() - t0) / 1000, txt };
}
/** peso analítico [kN/m] de cada etapa de tensiones: dominio·γs + muro·(γm − γs) − excavación·γs */
function pesos(dados: Record<string, number>): number[] {
  const p = { ...paramsPorDefecto("excavacion_muro"), ...dados }, g = muroExcavacion(p);
  const dom = area([[0, g.fondo], [g.xmax, g.fondo], [g.xmax, p.H], [g.xc, p.H], [g.xpie, 0], [0, 0]]);
  const Am = area(poligonoMuro(p)), Ae = g.dexc > 0.05 ? (g.xw - g.xe) * g.dexc : 0;
  const W0 = dom * p.gamma, out = [W0];
  if (p.muro >= 0.5) out.push(W0 + Am * (p.gm - p.gamma));
  if (Ae > 0) out.push(out[out.length - 1] - Ae * p.gamma);
  return out;
}

const H1 = 1.0;
console.log(`\n== (a) sin excavación ni muro: camino por etapas = cálculo normal (malla ${H1}) ==`);
{
  const d0 = { h: H1, dexc: 0, muro: 0 };
  const st = await correr(d0, "ts"), stw = await correr(d0, "wasm"), nor = await correr(d0, "ts", "etapa peso propio");
  const fsSt = st.res[st.res.length - 1].fs, fsW = stw.res[stw.res.length - 1].fs, fsN = nor.res[0].fs;
  console.log(`   FS por etapas (TS) ${fsSt.toFixed(6)} · por etapas (SRM en WASM) ${fsW.toFixed(6)} · normal ${fsN.toFixed(6)}   [${st.nel} T6]`);
  ok(Math.abs(fsSt - fsN) < 1e-9, "etapas (TS) = normal (TS) en la misma malla");
  ok(Math.abs(fsW - fsN) < 1e-6, "etapas con la SRM en WASM (submodelo) = normal");
  // contra el corte ORIGINAL (plantilla «corte»: sin líneas del muro, fondo −4): otra malla, se informa la diferencia
  const dc = parseHgeo(hgeoPlantilla("corte", {})); dc.h = H1; const mc = meshSlope(dc).model;
  const wc = await GeoFemWasm.create(mc, () => {}); const fsC = wc.run(mc)[0].fs; wc.destroy();
  console.log(`   corte original (fondo −4, sin líneas del muro, malla ${H1}): FS ${fsC.toFixed(4)} → diferencia ${(100 * (fsN / fsC - 1)).toFixed(2)} % (malla y fondo distintos)`);
  ok(Math.abs(fsN / fsC - 1) < 0.03, "talud sin obra ≈ corte original (< 3 %)");
}

console.log(`\n== (b) equilibrio global por etapa (malla ${H1}) ==`);
const conMuro = await correr({ h: H1 });
{
  const W = pesos({ h: H1 }), tens = conMuro.reac.filter((r) => Number.isFinite(r.Ry));
  tens.forEach((r, i) => {
    console.log(`   ${conMuro.res[i].name.padEnd(14)} peso analítico ${W[i].toFixed(3)} · Σ elementos ${r.W!.toFixed(3)} · ΣRy ${r.Ry.toFixed(3)} kN/m (dif ${(100 * (r.Ry / W[i] - 1)).toFixed(4)} %) · ΣRx ${r.Rx.toExponential(2)} · |residuo|max ${r.res.toExponential(2)} kN`);
    ok(Math.abs(r.W! / W[i] - 1) < 1e-9, `${conMuro.res[i].name}: peso de los elementos activos = polígonos × γ`);
    ok(Math.abs(r.Ry / W[i] - 1) < 1e-3, `${conMuro.res[i].name}: Σ reacciones verticales = peso (0.1 %)`);
    ok(Math.abs(r.Rx) < 1e-3 * W[i], `${conMuro.res[i].name}: Σ reacciones horizontales ≈ 0`);
  });
}

console.log(`\n== (c) el muro frente a la MISMA excavación sin muro (malla ${H1}) ==`);
const sinMuro = await correr({ h: H1, muro: 0 });
{
  const g = muroExcavacion({ ...paramsPorDefecto("excavacion_muro") });
  const iE = (c: Corrida) => c.res.findIndex((r) => r.name === "excavacion");
  const pts: [string, number, number][] = [["cara, z = −0.9", g.xw, -g.dexc / 2], ["pie del talud (8, 0)", g.xpie, 0]];
  for (const [nm, x, z] of pts) {
    const a = nudo(conMuro.model, x, z), b = nudo(sinMuro.model, x, z);
    const ua = conMuro.res[iE(conMuro)].u, ub = sinMuro.res[iE(sinMuro)].u;
    console.log(`   ${nm.padEnd(26)} d_x con muro ${(ua[2 * a] * 1e3).toFixed(3)} mm · sin muro ${(ub[2 * b] * 1e3).toFixed(3)} mm   (d_z ${(ua[2 * a + 1] * 1e3).toFixed(3)} / ${(ub[2 * b + 1] * 1e3).toFixed(3)})`);
    if (nm.startsWith("cara")) ok(Math.abs(ua[2 * a]) < Math.abs(ub[2 * b]), "el muro reduce |d_x| de la cara excavada");
  }
  const fa = conMuro.res[conMuro.res.length - 1].fs, fb = sinMuro.res[sinMuro.res.length - 1].fs;
  console.log(`   FS final: con muro ${fa.toFixed(4)} · sin muro ${fb.toFixed(4)}`);
  ok(fa >= fb - 1e-9, "el muro no baja el FS");
}

console.log(`\n== (d) SRM de la etapa final: motor TS (gdl dormidos) = motor WASM (submodelo) ==`);
{
  const ts = await correr({ h: H1 }, "ts");
  const a = ts.res[ts.res.length - 1], b = conMuro.res[conMuro.res.length - 1];
  let du = 0; for (let d = 0; d < a.u.length; d++) du = Math.max(du, Math.abs(a.u[d] - b.u[d]));
  console.log(`   FS TS ${a.fs.toFixed(6)} (${ts.seg.toFixed(1)} s) · WASM ${b.fs.toFixed(6)} (${conMuro.seg.toFixed(1)} s) · máx |Δu| ${du.toExponential(2)} m`);
  ok(Math.abs(a.fs - b.fs) < 1e-6, "FS TS = WASM");
}

if (process.argv.includes("--malla")) {
  console.log(`\n== convergencia de malla (con muro y excavación) ==`);
  for (const h of [1.0, 0.8, 0.6, 0.5]) {
    const c = h === H1 ? conMuro : await correr({ h });
    const g = muroExcavacion(paramsPorDefecto("excavacion_muro")), k = nudo(c.model, g.xw, -g.dexc / 2);
    const iE = c.res.findIndex((r) => r.name === "excavacion"), fin = c.res[c.res.length - 1];
    console.log(`   h=${h.toFixed(2)}  ${String(c.nel).padStart(5)} T6 ${String(c.nn).padStart(5)} nudos · d_x cara ${(c.res[iE].u[2 * k] * 1e3).toFixed(3)} mm · |u|max excav. ${(umax(c.res[iE].u) * 1e3).toFixed(3)} mm · FS ${fin.fs.toFixed(4)} · ${c.seg.toFixed(1)} s`);
  }
}
console.log(bad ? `\n✗ ${bad} comprobación(es) fallaron` : "\n✓ excavación + muro: todo bien");
process.exit(bad ? 1 : 0);
