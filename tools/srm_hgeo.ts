// SRM (factor de seguridad) de un .hgeo, sin navegador y sin cortar el mallador: npx tsx tools/srm_hgeo.ts X.hgeo [wasm|ts]
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const f = process.argv[2], eng = process.argv[3] ?? "wasm", cont = process.argv.includes("continua");
const { model, stats } = meshSlope(parseHgeo(readFileSync(f, "utf-8")), { topeMs: 300000, maxIter: 60000 });
if (cont) model.srmContinua = true;
console.log(`SRM ${cont ? "CONTINUADA (GEO5)" : "desde cero"} · malla ${stats.nodes} nudos, ${stats.elements} T6, ángulo mín ${stats.minAngle.toFixed(1)}°`, stats.avisos.join(" | "));
const log = (l: string) => { if (/SRM rs|>>>/.test(l)) console.log(l.trim()); };
const t0 = performance.now();
const r = eng === "ts" ? new GeoFem(model, log).run(model) : (await GeoFemWasm.create(model, log)).run(model);
console.log(`FS = ${r.map((x) => x.fs.toFixed(4)).join(" / ")}  (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
