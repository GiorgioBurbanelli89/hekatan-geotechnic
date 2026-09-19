// MURO 2D (una sola área, deformación plana) — comprobaciones que NO dependen de otro programa:
//   1) equilibrio global exacto: ΣFx de las cargas = reacción del dentellón; ΣFz = fuerza de los muelles
//   2) el empuje y el peso que carga la malla = la cuenta a mano (Rankine y γc·área de la sección)
//   3) convergencia: la coronación con malla 0.2 / 0.1 / 0.05 (con y sin modos incompatibles)
// y escribe el modelo en JSON para SAP2000 (tools/sap_muro2d.py), que es el oráculo nudo a nudo.
//   npx tsx tests/muro2d_check.ts [modelo.hgeo] [salida.json]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseHgeo, wallGround, wallLevels } from "../src/model/dsl";
import { verificarMuro } from "../src/wall/verify";
import { mallaMuro2D, resolverMuro2D, type Muro2DOpts } from "../src/wall/fem2d";

const f = process.argv[2] || "examples/muro_cantilever.hgeo";
const salida = process.argv[3] || "tests/out/muro2d_modelo.json";
const def = parseHgeo(readFileSync(f, "utf-8"));
const w = def.walls[0];
const z = wallGround(def, w), lv = wallLevels(w.pm, z);
const r = verificarMuro(def, w, {}, 0);
const hormigon = def.soils.find((s) => s.name === w.soil)!;
const base: Muro2DOpts = {
  corona: 0.25, bD: 0.35, hD: 0.4, xD: w.pm.x + w.pm.fuste / 2, ms: 0.1, ks: 30000,
  Ka: r.K.Ka, gamma: r.suelos.relleno.gamma, q: r.q, gammaC: hormigon.gamma,
  E: hormigon.E, nu: hormigon.nu, incompatible: true,
};
let fallos = 0;
const cmp = (que: string, a: number, b: number, tol: number, escala = Math.max(1, Math.abs(b))) => {
  const ok = Math.abs(a - b) <= tol * escala; if (!ok) fallos++;
  console.log(`  ${ok ? "ok" : "✖ "} ${que.padEnd(58)} ${a.toFixed(6)} vs ${b.toFixed(6)}`);
};

console.log(`muro de ${f}: x=${w.pm.x} fuste=${w.pm.fuste} zapata=${w.pm.zapata} talón=${w.pm.talon} dedo=${w.pm.dedo} · zb=${lv.zb} ztf=${lv.ztf} ztop=${lv.ztop} · Ka=${r.K.Ka.toFixed(4)} γ=${base.gamma} q=${base.q}`);
for (const inc of [true, false]) {
  const m = mallaMuro2D(w.pm, z, { ...base, incompatible: inc });
  const s = resolverMuro2D(m, base.E, base.nu, inc);
  let Fx = 0, Fz = 0; for (const [, [fx, fz]] of m.loads) { Fx += fx; Fz += fz; }
  console.log(`\n${inc ? "CON" : "SIN"} modos incompatibles · ${m.nodes.length} nudos · ${m.quads.length} Q4 · ${s.ms.toFixed(0)} ms`);
  cmp("ΣFx cargas + reacción del dentellón = 0", Fx + s.Rx, 0, 1e-9, Math.abs(Fx));
  cmp("ΣFz cargas + fuerza de los muelles = 0", Fz + s.Rz, 0, 1e-9, Math.abs(Fz));
  const H = lv.ztop - lv.ztf;
  cmp("empuje cargado = Ka·(γH²/2 + qH)", m.info.empuje, base.Ka * (base.gamma * H * H / 2 + base.q * H), 1e-12);
  const uc = s.u[m.info.nCorona];
  console.log(`  coronación ux = ${(uc[0] * 1000).toFixed(4)} mm · uz = ${(uc[1] * 1000).toFixed(4)} mm · peso ${m.info.peso.toFixed(3)} kN/m · rellenos ${m.info.rellenos.toFixed(3)} kN/m`);
  const p = s.contacto.map((c) => c.p);
  console.log(`  contacto ${Math.min(...p).toFixed(1)} … ${Math.max(...p).toFixed(1)} kPa`);
}
console.log("\nconvergencia de la coronación (ux mm):");
for (const inc of [true, false]) {
  const fila = [0.2, 0.1, 0.05].map((ms) => {
    const m = mallaMuro2D(w.pm, z, { ...base, ms, incompatible: inc });
    return (resolverMuro2D(m, base.E, base.nu, inc).u[m.info.nCorona][0] * 1000).toFixed(4);
  });
  console.log(`  ${inc ? "con " : "sin "} incompatibles  ms 0.2 / 0.1 / 0.05 → ${fila.join(" / ")}`);
}
// modelo para SAP2000
const m = mallaMuro2D(w.pm, z, base);
mkdirSync("tests/out", { recursive: true });
writeFileSync(salida, JSON.stringify({
  E: base.E, nu: base.nu, espesor: 1,
  nodes: m.nodes, quads: m.quads,
  loads: [...m.loads].map(([n, v]) => [n, v[0], v[1]]),
  springs: [...m.springs], fixX: [...m.fixX],
}));
for (const inc of [true, false]) {
  const s = resolverMuro2D(m, base.E, base.nu, inc);
  writeFileSync(salida.replace(".json", inc ? "_hek_inc.json" : "_hek_noinc.json"), JSON.stringify({ u: s.u }));
}
console.log(`\nmodelo → ${salida} (${m.nodes.length} nudos, ${m.quads.length} Q4)`);
console.log(fallos ? `✖ ${fallos} fallos` : "✓ equilibrio exacto");
process.exit(fallos ? 1 : 0);
