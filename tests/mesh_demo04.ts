// Cadena INDEPENDIENTE: geometría (DSL) → MI malla → MI solver → MI FS, contra el FS de GEO5.
//   npx tsx tests/mesh_demo04.ts [h] [ts|wasm]
import { writeFileSync, mkdirSync } from "node:fs";
import { parseHgeo, DEMO04_HGEO } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const h = process.argv[2] ? parseFloat(process.argv[2]) : 2.3;
const engine = (process.argv[3] || "wasm") as "ts" | "wasm";
const def = parseHgeo(DEMO04_HGEO.replace(/malla [\d.]+/, `malla ${h}`));
const t0 = performance.now();
const { model, stats } = meshSlope(def);
console.log(`malla h=${h}: ${stats.elements} T6, ${stats.nodes} nudos (${stats.corners} esquinas, ${stats.steiner} Steiner), ángulo mín ${stats.minAngle.toFixed(1)}°, arista media ${stats.meanEdge.toFixed(2)} m, área ${stats.area.toFixed(2)} m², ${((performance.now() - t0) / 1000).toFixed(2)} s`);
const nfix = model.FIXED.length; console.log(`apoyos: ${nfix} gdl fijos; cargas: ${Object.keys(model.loads || {}).join(",")}`);
for (const [k, v] of Object.entries(model.loads || {})) { let sx = 0, sy = 0; for (let i = 0; i < v.length; i += 2) { sx += v[i]; sy += v[i + 1]; } console.log(`  ${k}: ΣFx=${sx.toFixed(3)} ΣFy=${sy.toFixed(3)} kN`); }
const lines: string[] = [];
const log = (l: string) => { lines.push(l); if (l.includes(">>> FS") || l.startsWith("TOTAL") || l.startsWith("cargas")) console.log(l); };
const fem = engine === "wasm" ? await GeoFemWasm.create(model, log) : new GeoFem(model, log);
const res = fem.run(model);
console.log("FS mi malla:", res.map((r) => r.fs.toFixed(4)).join(" / "), " GEO5:", def.stages.map((s) => s.geo5).join(" / "));
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL(`./out/mesh_demo04_h${h}.log`, import.meta.url), lines.join("\n") + "\n");
writeFileSync(new URL(`./out/mesh_demo04_h${h}.json`, import.meta.url), JSON.stringify(model));
