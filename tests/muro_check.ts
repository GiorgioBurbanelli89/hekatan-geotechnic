// MURO CANTILEVER como «Rigid body» de GEO5: qué hace el hormigón rígido en el talud.
// Tres modelos con la MISMA malla objetivo y los mismos suelos:
//   A  talud natural, sin muro ni relleno            → FS de referencia
//   B  el MISMO perfil que deja el muro (relleno retenido hasta la coronación) pero TODO de suelo
//   C  A + muro (relleno retenido + hormigón rígido)
// B es la comparación honesta: el relleno pesa igual en B y en C, así que C − B es lo que aporta el MURO.
// Además se comprueba que el hormigón NO plastifica (ε_pl ≈ 0 en sus puntos de Gauss): eso es ser rígido.
import { readFileSync } from "node:fs";
import { parseHgeo, effectiveTerrain, serializeHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const txt = readFileSync(process.argv[2] || "examples/muro_cantilever.hgeo", "utf-8");
const conMuro = parseHgeo(txt);
const terrEf = effectiveTerrain(conMuro);
console.log("terreno natural :", conMuro.interfaces[0].map((p) => p.join(",")).join(" "));
console.log("terreno efectivo:", terrEf.map((p) => p.map((v) => Math.round(v * 1000) / 1000).join(",")).join(" "));

// A: sin muro (se quitan la orden `muro` y el hormigón)
const sinMuro = parseHgeo(txt.split("\n").filter((l) => !/^\s*muro\b/.test(l) && !/HORMIGON/.test(l)).join("\n"));
// B: el perfil del muro, pero de suelo: el terreno pasa a ser el EFECTIVO y no hay muro
const soloRelleno = parseHgeo(txt.split("\n").filter((l) => !/^\s*muro\b/.test(l) && !/HORMIGON/.test(l)).join("\n"));
soloRelleno.interfaces[0] = terrEf;

const run = async (name: string, def: ReturnType<typeof parseHgeo>) => {
  const { model, stats } = meshSlope(def);
  const fem = await GeoFemWasm.create(model, () => {});
  const r = fem.run(model);
  const cnt = new Map<number, number>(); for (const m of model.EMAT) cnt.set(m, (cnt.get(m) ?? 0) + 1);
  const mats = def.soils.map((s, i) => `${s.name}=${cnt.get(i + 1) ?? 0}`).join(" ");
  console.log(`${name.padEnd(34)} FS=${r[0].fs.toFixed(4)}  ${stats.elements} T6  área=${stats.area.toFixed(1)} m²  áng.mín=${stats.minAngle.toFixed(1)}°  [${mats}]`);
  return { r, model, def };
};

const A = await run("A  talud natural (sin muro)", sinMuro);
const B = await run("B  relleno retenido, TODO suelo", soloRelleno);
const C = await run("C  relleno + MURO rígido", conMuro);

// ¿el hormigón plastifica? ε_pl acumulada por punto de Gauss, elemento a elemento
const iMuro = C.def.soils.findIndex((s) => s.rigido) + 1;
const { model, r } = C; const epl = r[0].epl1!, NG = 7;
let maxMuro = 0, maxSuelo = 0;
for (let e = 0; e < model.ELE.length; e++) for (let q = 0; q < NG; q++) {
  const k = (e * NG + q) * 4; const n = Math.hypot(epl[k], epl[k + 1], epl[k + 2], epl[k + 3]);
  if (model.EMAT[e] === iMuro) maxMuro = Math.max(maxMuro, n); else maxSuelo = Math.max(maxSuelo, n);
}
console.log(`\n|ε_pl| máx en el HORMIGÓN = ${maxMuro.toExponential(2)}  (en el suelo = ${maxSuelo.toExponential(2)})  → rígido: ${maxMuro < 1e-12 ? "SÍ, no plastifica" : "✖ PLASTIFICA"}`);
console.log(`el MURO aporta: FS ${B.r[0].fs.toFixed(4)} (solo relleno) → ${C.r[0].fs.toFixed(4)} (con muro) = ${(100 * (C.r[0].fs / B.r[0].fs - 1) >= 0 ? "+" : "")}${(100 * (C.r[0].fs / B.r[0].fs - 1)).toFixed(1)} %`);
console.log(`el RELLENO cuesta: FS ${A.r[0].fs.toFixed(4)} (natural) → ${B.r[0].fs.toFixed(4)} (relleno) = ${(100 * (B.r[0].fs / A.r[0].fs - 1)).toFixed(1)} %`);
console.log("\n.hgeo reescrito (el terreno guardado sigue siendo el NATURAL + la orden muro):");
console.log(serializeHgeo(conMuro).split("\n").filter((l) => /muro|interfaz|HORMIGON/.test(l)).join("\n"));
