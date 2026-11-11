// Dinámico NO LINEAL (Mohr-Coulomb, HHT-α, búsqueda lineal) de Geotechnic contra GEO5 2024 (FRGeoFEM.exe corriendo): bloque de 2×2 m,
// 8 T6, base fija, 2 suelos MC (E=Edyn salvo en el caso edyn8), gravedad estática elástica con γ = 4 kN/m³, aceleración de la base
// A·sin(2π·6·t), Δt = 0.01 s, primer paso en t = 1e-6 como GEO5. Desplazamientos de los 9 nudos de vértice del Out.txt de GEO5
// (ux ABSOLUTO: se resta el de la base). Se corre en los DOS motores: TS (solver.ts) y el C++ compilado a WASM (geofem.cpp, el de
// producción); los dos deben dar lo mismo que GEO5 y entre sí.
//   npx tsx tests/dinamico_nl_geo5.ts
// Datos: tests/datos/dinnl_malla.json, dinnl_geo5.json (ingenieria-inversa/hekatan-geo5-bridge/geofem_run/dyn_min).
import { readFileSync } from "node:fs";
import { GeoFem, GeoModel, DynNLOptions, DynNLResult } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const rd = (f: string) => JSON.parse(readFileSync(new URL(`./datos/${f}`, import.meta.url), "utf-8"));
const model = rd("dinnl_malla.json") as GeoModel & { RHO: number[] };
const REF = rd("dinnl_geo5.json") as Record<string, Record<string, [number, number]>>;
const A = 6, F = 6;
let fallos = 0;
// casos: [clave de referencia, pasos, opciones extra]. rayleigh8: alpha_c/beta_c por material; edyn8: Edyn ≠ E (22000 y 36000 kPa)
const CASOS: [string, number, object][] = [["9", 9, {}], ["16", 16, {}],
  ["rayleigh8", 8, { rayleighMat: [[0.4589, 5.448e-3], [0.3, 8e-3]] }], ["edyn8", 8, { edyn: [22000, 36000] }]];
const motores: [string, () => Promise<{ dynamicNL(o: DynNLOptions): DynNLResult }>][] = [
  ["TS  ", async () => new GeoFem(model, () => {})],
  ["WASM", async () => GeoFemWasm.create(model, () => {})],
];
const finales: Record<string, Float64Array> = {};
for (const [nom, mk] of motores) for (const [clave, nst, extra] of CASOS) {
  const fem = await mk();
  const r = fem.dynamicNL({ dt: 0.01, tEnd: nst * 0.01, t0: 1e-6, accel: (t) => A * Math.sin(2 * Math.PI * F * t), rho: model.RHO, ...extra });
  finales[nom + clave] = r.u;
  const ref = REF[clave], ub = ref["1"][0];
  let err = 0, mx = 0;
  for (const [id, [sx, sy]] of Object.entries(ref)) {
    const nd = Number(id) - 1;
    err = Math.max(err, Math.abs(r.u[2 * nd] - (sx - ub)), Math.abs(r.u[2 * nd + 1] - sy)); mx = Math.max(mx, Math.abs(sx - ub), Math.abs(sy));
  }
  const rel = err / mx, ok = rel < 5e-6;
  if (!ok) fallos++;
  const ls = Array.from(r.etaMin, (e, k) => (e < 1 ? `p${k}:${e.toFixed(4)}` : "")).filter(Boolean).join(" ") || "no actúa";
  console.log(`${nom} ${clave.padEnd(9)} ${String(nst).padStart(2)} pasos: max|u|=${mx.toExponential(4)} m  error abs=${err.toExponential(2)}  rel=${rel.toExponential(2)}  ${ok ? "OK" : "FALLA"}  búsqueda lineal: ${ls}  [${r.seconds.toFixed(2)} s]`);
}
for (const [clave] of CASOS) {   // TS y WASM entre sí
  const a = finales["TS  " + clave], b = finales["WASM" + clave]; let d = 0, m = 0;
  for (let i = 0; i < a.length; i++) { d = Math.max(d, Math.abs(a[i] - b[i])); m = Math.max(m, Math.abs(a[i])); }
  const ok = d <= 1e-9 * m; if (!ok) fallos++;
  console.log(`TS vs WASM ${clave.padEnd(9)} dif max u = ${d.toExponential(2)} m (rel ${(d / m).toExponential(1)}) ${ok ? "OK" : "FALLA"}`);
}
console.log(fallos ? `${fallos} FALLO(S)` : "dinámico no lineal = GEO5 (TS y C++/WASM): OK");
process.exit(fallos ? 1 : 0);
