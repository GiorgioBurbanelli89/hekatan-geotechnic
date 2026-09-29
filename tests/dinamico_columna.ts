// Dinámico LINEAL de Geotechnic contra Abaqus/Standard 2017 (oráculo) y la referencia en Python:
// columna de suelo a cortante, 147 nudos, 48 T6 (= CPE6 nudo a nudo), base fija, lados atados (u_der = u_izq, v = 0).
// Capa por capa: masa → frecuencias (y masa efectiva) → u_x(t) de la coronación con Newmark β=¼ γ=½, Δt = 0.005 s.
//   npx tsx tests/dinamico_columna.ts
// Datos: tests/datos/columna_malla.json, columna_abaqus.json (tools/dinamico/leer_abaqus_columna.py), columna_ref_python.json
// (tools/dinamico/columna_ref.py). Tolerancia: 4 decimales en las unidades de la tabla (t, Hz, mm) → |dif| < 5e-5.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { GeoFem, GeoModel } from "../src/geofem/solver";

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
log(fallos ? `DINÁMICO: ${fallos} FALLOS` : "DINÁMICO: todo OK a 4 decimales contra Abaqus");
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL("./out/dinamico_columna.log", import.meta.url), lines.join("\n") + "\n", "utf-8");
if (fallos) process.exit(1);
