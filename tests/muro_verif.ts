// VERIFICACIÓN DEL MURO (módulo Cantilever Wall de GEO5) — comprobaciones de la formulación.
//   npx tsx tests/muro_verif.ts [modelo.hgeo]
//
// 1) Los coeficientes de empuje, contra los casos donde se conoce la respuesta EXACTA:
//    Coulomb con δ = 0 y trasdós vertical y relleno horizontal DEBE reducirse a Rankine,
//      Ka = tan²(45 − φ/2)   y   Kp = tan²(45 + φ/2);
//    Mazindrani con β = 0 debe dar lo mismo que Rankine;
//    Jáky, K0 = 1 − sinφ.
// 2) El empuje total del análisis analítico contra el que reparte la MALLA DE SÓLIDOS H8 sobre la
//    misma altura: los dos caminos del programa (cuerpo rígido y elementos finitos) tienen que
//    cargar lo mismo, y si no, uno de los dos está mal.
// 3) La tabla completa de verificación de un muro del modelo, para leerla.
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { verificarMuro, kaCoulomb, kpCoulomb, kaMazindrani, k0Jaky } from "../src/wall/verify";
import { mallaMuroSolido } from "../src/solid/muroMalla";

let fallos = 0;
const cmp = (nombre: string, a: number, b: number, tol: number, u = "") => {
  const d = Math.abs(a - b), ok = d <= tol; if (!ok) fallos++;
  console.log(`  ${ok ? "ok  " : "✖   "} ${nombre.padEnd(52)} ${a.toFixed(8)}${u} vs ${b.toFixed(8)}${u}  (dif ${d.toExponential(2)}, tol ${tol.toExponential(1)})`);
};

console.log("1) coeficientes de empuje");
for (const phi of [20, 25, 30, 35, 40]) {
  const rank = Math.tan(Math.PI / 4 - (phi * Math.PI) / 360) ** 2;
  cmp(`Coulomb(φ=${phi}, δ=0, α=0, β=0) = Rankine`, kaCoulomb(phi, 0, 0, 0), rank, 1e-12);
  cmp(`Kp Coulomb(φ=${phi}, δ=0) = 1/Rankine`, kpCoulomb(phi, 0, 0, 0), 1 / rank, 1e-12);
  cmp(`Mazindrani(φ=${phi}, β=0) = Rankine`, kaMazindrani(phi, 0), rank, 1e-12);
  cmp(`Jáky K0(φ=${phi}) = 1 − sinφ`, k0Jaky(phi), 1 - Math.sin((phi * Math.PI) / 180), 1e-15);
}
// la fricción del trasdós REDUCE el empuje y el talud del relleno lo AUMENTA (control de signos)
const k00 = kaCoulomb(30, 0, 0, 0);
console.log(`  ${kaCoulomb(30, 20, 0, 0) < k00 ? "ok  " : "✖   "} δ = 20° reduce Ka: ${kaCoulomb(30, 20, 0, 0).toFixed(5)} < ${k00.toFixed(5)}`);
console.log(`  ${kaCoulomb(30, 0, 0, 15) > k00 ? "ok  " : "✖   "} β = 15° aumenta Ka: ${kaCoulomb(30, 0, 0, 15).toFixed(5)} > ${k00.toFixed(5)}`);
if (kaCoulomb(30, 20, 0, 0) >= k00 || kaCoulomb(30, 0, 0, 15) <= k00) fallos++;

console.log("\n2) el mismo empuje por los dos caminos (cuerpo rígido vs malla de sólidos H8)");
{
  const H = 4, gamma = 18, q0 = 10, Ka = 1 / 3;            // Ka = 1/3 = Rankine con φ = 30°
  const m = mallaMuroSolido({ H, t: 0.4, toe: 0.6, heel: 1.6, tf: 0.4, L: 1, ms: 0.2, E: 2.5e7, nu: 0.2, Ka, gamma, q0 });
  const analitico = 0.5 * Ka * gamma * H * H + Ka * q0 * H;   // triangular del terreno + rectangular de la sobrecarga
  cmp("empuje sobre el fuste (H = 4 m, Ka = 1/3, q = 10)", m.info.empujeTotal, analitico, 1e-9, " kN/m");
  cmp("Ka de Coulomb con φ = 30°, δ = 0", kaCoulomb(30, 0, 0, 0), Ka, 1e-12);
}

console.log("\n3) tabla de verificación del muro del modelo");
const f = process.argv[2] || "examples/muro_cantilever.hgeo";
const def = parseHgeo(readFileSync(f, "utf-8"));
if (!def.walls.length) { console.log("   (el modelo no tiene muros)"); }
for (const w of def.walls) {
  const r = verificarMuro(def, w, { Rd: 400, pasivo: false });
  console.log(`\n   ${f} · muro ${w.soil} en x = ${w.pm.x} m`);
  console.log(`   B = ${r.geom.B.toFixed(2)} m · fuste libre ${r.geom.Hf.toFixed(2)} m · plano ficticio ${r.geom.Htot.toFixed(2)} m (extremo del talón x = ${r.geom.xTalon.toFixed(2)})`);
  console.log(`   relleno ${r.suelos.relleno.name} (φ=${r.suelos.relleno.phi}° γ=${r.suelos.relleno.gamma}) · apoyo ${r.suelos.base.name} (φ=${r.suelos.base.phi}° c=${r.suelos.base.c})`);
  console.log(`   Ka = ${r.K.Ka.toFixed(4)} con δ = ${r.K.delta.toFixed(1)}°`);
  console.log("   fuerzas [kN/m]:");
  for (const q of r.fuerzas) console.log(`      ${q.nombre.padEnd(40)} H=${q.H.toFixed(2).padStart(8)}  V=${q.V.toFixed(2).padStart(8)}  (brazo V ${q.brazoV.toFixed(3)} m, brazo H ${q.brazoH.toFixed(3)} m)`);
  console.log(`   N = ${r.N.toFixed(2)} kN/m · H = ${r.Hd.toFixed(2)} kN/m · σ = ${r.sigma.min.toFixed(1)} … ${r.sigma.max.toFixed(1)} kPa (reparto ${r.sigma.reparto})`);
  console.log("   verificaciones:");
  for (const c of r.chequeos) {
    const op = c.sentido === "min" ? (c.ok ? "≥" : "<") : (c.ok ? "≤" : ">");
    console.log(`      ${c.ok ? "✓" : "✖"} ${c.nombre.padEnd(20)} ${c.valor.toFixed(3)}${c.unidad} ${op} ${c.limite.toFixed(3)}${c.unidad}`);
    console.log(`         ${c.formula}`);
    console.log(`         ${c.detalle}`);
  }
  for (const a of r.avisos) console.log(`      · ${a}`);
}
console.log(fallos ? `\n✖ ${fallos} comprobaciones FALLAN` : "\n✓ la formulación del empuje cuadra con los casos exactos y con la malla de sólidos");
process.exit(fallos ? 1 : 0);
