// Sismo SEUDOESTÁTICO (orden `sismo kh= kv=`): la CARGA contra Abaqus/Standard, capa 1 lineal.
// Muro de Manabí (0.70 m delante, geometría de GeoFEM, malla 0.8: 2798 nudos, 1341 T6), elástico, SOLO la carga kh·γ
// (kh = −0.336) en los T6 a ≥ 0.8 m de los márgenes; apoyos de GEO5 (base fija, lados u = 0).
// Árbitro: *STATIC con *DLOAD BX = kh·γ por material (tools/sismo/muro_sismo.ts generar → .inp; leer_abaqus_sismo.py).
//   npx tsx tests/sismo_muro.ts      Tolerancia: |u_TS − u_Abaqus| < 5e-5 mm en TODOS los nudos (4 decimales en mm).
import { readFileSync } from "node:fs";
import { GeoFem, GeoModel } from "../src/geofem/solver";
import { parseHgeo } from "../src/model/dsl";
import { seismicLoad } from "../src/mesh/mesher";

const rd = (f: string) => JSON.parse(readFileSync(new URL(`./datos/${f}`, import.meta.url), "utf-8"));
const m = rd("muro_sismo_malla.json"), A = rd("muro_sismo_abaqus.json");
const nn = m.X.length;
let fallos = 0;
// 1) la carga que escribe el mallador (guardada) = la que sale ahora de seismicLoad con la misma malla
const F = new Float64Array(2 * nn);
seismicLoad(F, m.kh, m.kv, m.borde, m.X, m.Y, m.ELE, m.EMAT, m.MAT.map((r: number[]) => r[4]));
let dF = 0, sx = 0; for (let i = 0; i < F.length; i++) { dF = Math.max(dF, Math.abs(F[i] - m.Fsis[i])); if (i % 2 === 0) sx += F[i]; }
if (dF > 1e-9) { console.log(`FALLA: la carga sísmica cambió (máx dif ${dF})`); fallos++; }
// 2) la orden del .hgeo se lee y se escribe
const d = parseHgeo("margenes xmin=0 xmax=10 fondo=-5\ninterfaz 0,0 10,0\nsuelo A E=1 nu=0.3 phi=30 c=0 gamma=18\netapa peso propio\nsismo kh=-0.336 kv=0.1");
if (!(d.stages[1]?.sismo?.kh === -0.336 && d.stages[1].sismo.kv === 0.1)) { console.log("FALLA: orden sismo"); fallos++; }
// 3) u lineal = K_el⁻¹·F contra Abaqus, nudo a nudo
const model: GeoModel = { ...m, Fg: new Array(2 * nn).fill(0), Fs: new Array(2 * nn).fill(0), Fa: new Array(2 * nn).fill(0), stages: [] };
const fem = new GeoFem(model, () => {});
const u = fem.elasticSolve(F);
let du = 0, iu = 0, umax = 0, ia = 0;
for (let i = 0; i < nn; i++) {
  const e = Math.max(Math.abs(u[2 * i] - A.ux[i]), Math.abs(u[2 * i + 1] - A.uy[i])) * 1e3; if (e > du) { du = e; iu = i; }
  if (Math.abs(u[2 * i]) > umax) { umax = Math.abs(u[2 * i]); ia = i; }
}
const ok = du < 5e-5; if (!ok) fallos++;
console.log(`SISMO seudoestático (kh ${m.kh}, kv ${m.kv}): ΣFx = ${sx.toFixed(4)} kN (Abaqus ΣRFx = ${(-A.rfx_total).toFixed(4)}) · ${nn} nudos`);
console.log(`  u_x máx TS ${(u[2 * ia] * 1e3).toFixed(4)} mm, Abaqus ${(A.ux[ia] * 1e3).toFixed(4)} mm (nudo ${ia + 1}) · máx |TS−Abaqus| = ${du.toExponential(2)} mm (nudo ${iu + 1}) ${ok ? "OK" : "FALLA"}`);
if (Math.abs(sx + A.rfx_total) > 1e-3) { console.log("FALLA: ΣFx ≠ −ΣRFx de Abaqus"); fallos++; }
console.log(fallos ? `SISMO: ${fallos} FALLOS` : "SISMO: carga y desplazamientos OK a 4 decimales contra Abaqus");
if (fallos) process.exit(1);
