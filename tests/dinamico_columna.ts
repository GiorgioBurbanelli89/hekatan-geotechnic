// Dinámico LINEAL de Geotechnic contra Abaqus/Standard 2017 (oráculo) y la referencia en Python:
// columna de suelo a cortante, 147 nudos, 48 T6 (= CPE6 nudo a nudo), base fija, lados atados (u_der = u_izq, v = 0).
// Capa por capa: masa → frecuencias (y masa efectiva) → u_x(t) de la coronación con Newmark β=¼ γ=½, Δt = 0.005 s.
//   npx tsx tests/dinamico_columna.ts
// Datos: tests/datos/columna_malla.json, columna_abaqus.json (tools/dinamico/leer_abaqus_columna.py), columna_ref_python.json
// (tools/dinamico/columna_ref.py). Tolerancia: 4 decimales en las unidades de la tabla (t, Hz, mm) → |dif| < 5e-5.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { GeoFem, GeoModel, rayleighCoef } from "../src/geofem/solver";

const rd = (f: string) => JSON.parse(readFileSync(new URL(`./datos/${f}`, import.meta.url), "utf-8"));
const model = rd("columna_malla.json") as GeoModel & { CORONA: number };
const ABQ = rd("columna_abaqus.json"), PY = rd("columna_ref_python.json");
const TOL = 5e-5;
const lines: string[] = [];
const log = (l: string) => { lines.push(l); console.log(l); };

const fem = new GeoFem(model, () => {});
fem.setLog(log);
const md = fem.modes(3);
const TP = 0.2;
const dyn = fem.dynamic({ dt: 0.005, tEnd: 2.0, accel: (t) => (t < TP - 1e-12 ? Math.sin(Math.PI * t / TP) : 0), watch: [model.CORONA] });
const ux = dyn.hist[0].ux;

let fallos = 0;
const fila = (nom: string, ts: number, abq: number, py: number, ex?: number) => {
  const d = Math.abs(ts - abq), ok = d < TOL;
  if (!ok) fallos++;
  log(`${nom.padEnd(20)} TS ${ts.toFixed(4).padStart(9)}  Abaqus ${abq.toFixed(4).padStart(9)}  Python ${py.toFixed(4).padStart(9)}${ex !== undefined ? `  exacta ${ex.toFixed(4).padStart(9)}` : "".padEnd(17)}  |TS-Abq| ${d.toExponential(1)} ${ok ? "OK" : "FALLA"}`);
};
log("");
log(`== columna de suelo: ${model.X.length} nudos, ${model.ELE.length} T6, ${fem.nfree} gdl (banda ${fem.band}) ==`);
fila("masa total [t]", md.massTotal, ABQ.masa_total, PY.masa_total, PY.rhoA);
for (let k = 0; k < 3; k++) fila(`f${k + 1} [Hz]`, md.f[k], ABQ.f[k], PY.f[k], PY.f_exacta[k]);
for (let k = 0; k < 3; k++) fila(`Mef_x modo ${k + 1} [t]`, md.mefx[k], ABQ.masa_efectiva_x_odb[k], PY.masa_efectiva_x[k]);
// historia: mm
let dmax = 0, dpy = 0, imax = 0;
if (ABQ.ux_corona.length !== ux.length) { log(`FALLA: ${ux.length} instantes y Abaqus tiene ${ABQ.ux_corona.length}`); fallos++; }
for (let s = 0; s < ux.length; s++) {
  dmax = Math.max(dmax, Math.abs(ux[s] - ABQ.ux_corona[s]) * 1e3);
  dpy = Math.max(dpy, Math.abs(ux[s] - PY.ux_corona[s]) * 1e3);
  if (Math.abs(ux[s]) > Math.abs(ux[imax])) imax = s;
}
let ia = 0; for (let s = 0; s < ABQ.ux_corona.length; s++) if (Math.abs(ABQ.ux_corona[s]) > Math.abs(ABQ.ux_corona[ia])) ia = s;
fila("u_x corona max [mm]", ux[imax] * 1e3, ABQ.ux_corona[ia] * 1e3, PY.ux_max * 1e3);
fila("t del max [s]", dyn.t[imax], ABQ.t[ia], PY.t_max);
const okh = dmax < TOL; if (!okh) fallos++;
log(`u_x corona, ${ux.length} instantes: max|TS-Abaqus| = ${dmax.toExponential(2)} mm ${okh ? "OK" : "FALLA"} ; max|TS-Python| = ${dpy.toExponential(2)} mm`);
log(`(Abaqus guarda u en float32 en el .odb: ruido ~1e-6 mm)`);

// ---- capa 2: Rayleigh (ξ = 5 % en los modos 1 y 3, ω de los modos de Geotechnic) y HHT-α = −0.05 ----
const AC = rd("columna_abaqus_casos.json");
const [aR, bR] = rayleighCoef(0.05, md.omega[0], md.omega[2]);
const [aP, bP] = PY.casos.rayleigh.rayleigh;
log("");
log(`Rayleigh: a = ${aR.toFixed(10)} 1/s (Python ${aP.toFixed(10)}), b = ${bR.toExponential(10)} s (Python ${bP.toExponential(10)}) ; Abaqus ${AC.columna_rayleigh.damping[0]}`);
if (Math.abs(aR / aP - 1) > 1e-8 || Math.abs(bR / bP - 1) > 1e-8) { log("FALLA: coeficientes de Rayleigh"); fallos++; }
for (const [nom, ray, alpha] of [["rayleigh", true, 0], ["hht", false, -0.05], ["hht_rayleigh", true, -0.05]] as [string, boolean, number][]) {
  const r = fem.dynamic({ dt: 0.005, tEnd: 2.0, accel: (t) => (t < TP - 1e-12 ? Math.sin(Math.PI * t / TP) : 0), watch: [model.CORONA], alpha, rayleigh: ray ? [aR, bR] : undefined });
  const u = r.hist[0].ux, A = AC[`columna_${nom}`].ux_corona as number[], P = PY.casos[nom].ux_corona as number[];
  let d = 0, dp = 0, i = 0, j = 0;
  for (let s = 0; s < u.length; s++) {
    d = Math.max(d, Math.abs(u[s] - A[s]) * 1e3); dp = Math.max(dp, Math.abs(u[s] - P[s]) * 1e3);
    if (Math.abs(u[s]) > Math.abs(u[i])) i = s; if (Math.abs(A[s]) > Math.abs(A[j])) j = s;
  }
  log(`-- ${nom}: α=${alpha} β=${r.coef.beta} γ=${r.coef.gamma}${ray ? " + Rayleigh" : ""}`);
  fila(`  u_x max [mm]`, u[i] * 1e3, A[j] * 1e3, PY.casos[nom].ux_max * 1e3);
  fila(`  t del max [s]`, r.t[i], AC[`columna_${nom}`].t[j], PY.casos[nom].t_max);
  const ok = d < TOL && A.length === u.length; if (!ok) fallos++;
  log(`  u_x(t), ${u.length} instantes: max|TS-Abaqus| = ${d.toExponential(2)} mm ${ok ? "OK" : "FALLA"} ; max|TS-Python| = ${dp.toExponential(2)} mm`);
}
// ---- la SRM estática con TIES: material RÍGIDO (elástico), carga −M·1_x·1 m/s² → u_x de la coronación = Python ----
{
  const mEst: GeoModel = { ...model, RIGID: [true], loads: { Ax: Array.from({ length: model.X.length * 2 }, () => 0) }, stages: [{ name: "estatico", loads: ["Ax"] }] };
  const fe = new GeoFem(mEst, () => {});
  const m1 = fe.massMatrix().m1x;   // fila completa de M·1_x en gdl libres → la paso a gdl completos por el maestro
  for (let d = 0; d < mEst.X.length * 2; d += 2) { const k = fe.map[d]; if (k >= 0 && !(mEst.TIES ?? []).some(([s]) => s === d)) mEst.loads!.Ax[d] = -m1[k]; }
  const r0 = fe.run(mEst, [0])[0];
  const uc = r0.u1![2 * model.CORONA], der = r0.u1![2 * (model.CORONA + 2)];
  const d = Math.abs(uc - PY.ux_estatico_corona) * 1e3, ok = d < TOL && Math.abs(der - uc) < 1e-15; if (!ok) fallos++;
  log("");
  log(`SRM estática con TIES (rígido): u_x corona TS ${(uc * 1e3).toFixed(6)} mm, Python ${(PY.ux_estatico_corona * 1e3).toFixed(6)} mm, lado derecho ${(der * 1e3).toFixed(6)} mm ${ok ? "OK" : "FALLA"}`);
}
log(fallos ? `DINÁMICO: ${fallos} FALLOS` : "DINÁMICO: todo OK a 4 decimales contra Abaqus");
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL("./out/dinamico_columna.log", import.meta.url), lines.join("\n") + "\n", "utf-8");
if (fallos) process.exit(1);
