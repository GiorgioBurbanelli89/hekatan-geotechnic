// Dinámico LINEAL del muro de Manabí contra Abaqus/Standard 2017 (misma malla nudo a nudo, CPE6):
// 6900 nudos, 3365 T6, muro pegado, Vs 195/286 m/s, APO1 N 8–30 s, Δt 0.01, Newmark ¼–½, Rayleigh 5 % modos 1 y 3.
// Capas: masa → 3 frecuencias → u_x(t) de la coronación (2201 instantes) → empuje sobre el trasdós (peso y u(t)).
//   npx tsx tests/dinamico_muro.ts        (≈ 3 min)
// Datos: tests/datos/muro_din_malla.json (tools/dinamico/muro_manabi_dinamico.ts generar), muro_din_abaqus.json
// (leer_abaqus_muro.py), muro_empuje_abaqus.json (leer_abaqus_empuje.py). Tolerancia 4 decimales: |dif| < 5e-5 (t, Hz, mm, kN/m).
import { readFileSync, existsSync } from "node:fs";
import { correr, loadMalla } from "../tools/dinamico/muro_manabi_dinamico";

const rd = (f: string) => JSON.parse(readFileSync(new URL(`./datos/${f}`, import.meta.url), "utf-8"));
const TOL = 5e-5;
const m = loadMalla(), A = rd("muro_din_abaqus.json");
const r = correr(m, () => {}) as any;
let fallos = 0;
const fila = (nom: string, ts: number, abq: number, tol = TOL) => {
  const d = Math.abs(ts - abq), ok = d < tol; if (!ok) fallos++;
  console.log(`${nom.padEnd(28)} Geotechnic ${ts.toFixed(4).padStart(10)}  Abaqus ${abq.toFixed(4).padStart(10)}  |dif| ${d.toExponential(1)} ${ok ? "OK" : "FALLA"}`);
};
console.log(`== muro de Manabí, dinámico lineal: ${r.nudos} nudos, ${r.T6} T6, ${r.gdl} gdl ==`);
fila("masa total [t]", r.masa_total, A.masa_total);
for (let k = 0; k < 3; k++) fila(`f${k + 1} [Hz]`, r.f[k], A.f[k]);
const nc = String(m.WATCH.corona + 1), hc = A.nudos[nc];
const ux = r.hist.corona.ux as number[];
let d = 0, i = 0, j = 0;
if (hc.ux.length !== ux.length) { console.log(`FALLA: ${ux.length} instantes y Abaqus ${hc.ux.length}`); fallos++; }
for (let s = 0; s < Math.min(ux.length, hc.ux.length); s++) {
  d = Math.max(d, Math.abs(ux[s] - hc.ux[s]) * 1e3);
  if (Math.abs(ux[s]) > Math.abs(ux[i])) i = s; if (Math.abs(hc.ux[s]) > Math.abs(hc.ux[j])) j = s;
}
fila("u_x coronación máx [mm]", ux[i] * 1e3, hc.ux[j] * 1e3);
fila("instante del máx [s]", r.t[i], hc.t[j]);
const okh = d < TOL; if (!okh) fallos++;
console.log(`u_x coronación, ${ux.length} instantes: máx |Geotechnic − Abaqus| = ${d.toExponential(2)} mm ${okh ? "OK" : "FALLA"}`);
// aceleración RELATIVA (A1 de Abaqus) de la coronación y de la superficie lejos del muro, en m/s²
for (const k of ["corona", "sup_detras"]) {
  const a = r.hist[k].ax as number[], b = A.nudos[String(m.WATCH[k] + 1)].ax as number[];
  let da = 0; for (let s = 0; s < a.length; s++) da = Math.max(da, Math.abs(a[s] - b[s]));
  const oka = da < TOL; if (!oka) fallos++;
  console.log(`a_x relativa ${k.padEnd(10)} ${a.length} instantes: máx |dif| = ${da.toExponential(2)} m/s² ${oka ? "OK" : "FALLA"}`);
}
if (existsSync(new URL("./datos/muro_empuje_abaqus.json", import.meta.url))) {
  const E = rd("muro_empuje_abaqus.json"), e = r.empuje;
  fila("empuje peso [kN/m]", e.peso, E.peso);
  // Abaqus NFORC lleva la tensión viscosa del Rayleigh de rigidez (β·De·B·v): se compara con esa variante; la elástica
  // pura se enseña para medir cuánto pesa.
  let de = 0, d0 = 0; for (let s = 0; s < Math.min(e.dinamico.length, E.dinamico.length); s++) { de = Math.max(de, Math.abs(e.dinamico_con_viscosa[s] - E.dinamico[s])); d0 = Math.max(d0, Math.abs(e.dinamico[s] - E.dinamico[s])); }
  console.log(`(solo σ elástica, sin la viscosa: máx |dif| con Abaqus ${d0.toExponential(2)} kN/m; es la parte β·K·v)`);
  let k = 0; for (let s = 0; s < E.dinamico.length; s++) if (Math.abs(E.peso + E.dinamico[s]) > Math.abs(E.peso + E.dinamico[k])) k = s;
  fila("empuje máximo [kN/m]", e.total_max_con_viscosa, E.peso + E.dinamico[k]);
  fila("instante del máximo [s]", e.t_max_con_viscosa, E.t[k]);
  const oke = de < TOL && E.dinamico.length === e.dinamico.length; if (!oke) fallos++;
  console.log(`empuje sísmico, ${e.dinamico.length} instantes: máx |dif| = ${de.toExponential(2)} kN/m ${oke ? "OK" : "FALLA"}`);
}
console.log(fallos ? `MURO DINÁMICO: ${fallos} FALLOS` : "MURO DINÁMICO: todo OK a 4 decimales contra Abaqus");
if (fallos) process.exit(1);
