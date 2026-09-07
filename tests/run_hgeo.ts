// Corre CUALQUIER .hgeo por la cadena completa (texto → malla → solver WASM → FS por etapa).
//   npx tsx tests/run_hgeo.ts examples/talud_nuevo.hgeo [ts|wasm]
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const file = process.argv[2]; if (!file) { console.error("uso: tsx tests/run_hgeo.ts modelo.hgeo [ts|wasm]"); process.exit(1); }
const engine = (process.argv[3] || "wasm") as "ts" | "wasm";
const def = parseHgeo(readFileSync(file, "utf-8"));
console.log(`modelo: ${file}\n  márgenes ${def.margins?.xmin}…${def.margins?.xmax} m, fondo ${def.margins?.bottom} m · ${def.interfaces.length} interfaces · ${def.soils.length} suelos (${def.soils.map((s) => s.name).join(", ")}) · ${def.stages.length} etapas`);
const t0 = performance.now();
const { model, stats } = meshSlope(def);
console.log(`malla h=${def.h}: ${stats.elements} T6, ${stats.nodes} nudos, ángulo mín ${stats.minAngle.toFixed(1)}°, arista media ${stats.meanEdge.toFixed(2)} m, área ${stats.area.toFixed(1)} m², ${((performance.now() - t0) / 1000).toFixed(2)} s`);
const cnt = new Map<number, number>(); for (const m of model.EMAT) cnt.set(m, (cnt.get(m) ?? 0) + 1);
console.log("  elementos por suelo:", def.soils.map((s, i) => `${s.name}=${cnt.get(i + 1) ?? 0}`).join("  "));
for (const [k, v] of Object.entries(model.loads || {})) { let sx = 0, sy = 0; for (let i = 0; i < v.length; i += 2) { sx += v[i]; sy += v[i + 1]; } if (sx || sy) console.log(`  carga ${k}: ΣFx=${sx.toFixed(2)} ΣFy=${sy.toFixed(2)} kN`); }
const log = (l: string) => { if (l.startsWith("    SRM") || l.includes(">>> FS") || l.startsWith("cargas")) console.log(l); };
const fem = engine === "wasm" ? await GeoFemWasm.create(model, log) : new GeoFem(model, log);
const res = fem.run(model);
console.log("FS:", res.map((r) => `${r.name} = ${r.fs.toFixed(4)}`).join(" · "), `(${res.reduce((a, r) => a + r.seconds, 0).toFixed(1)} s)`);
