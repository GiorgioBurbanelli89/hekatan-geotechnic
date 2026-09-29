// SRM de un modelo JSON (p. ej. la malla EXACTA de GEO5 sacada de su InputFile): npx tsx tools/srm_modelo.ts X.json [wasm|ts] [continua]
import { readFileSync } from "node:fs";
import { GeoFem, type GeoModel } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const f = process.argv[2], eng = process.argv.includes("ts") ? "ts" : "wasm", cont = process.argv.includes("continua");
const model = JSON.parse(readFileSync(f, "utf-8")) as GeoModel;
const bits = process.argv.find((a) => /^b\d+$/.test(a)); if (cont) model.srmContinua = bits ? parseInt(bits.slice(1)) : 1;
console.log(`SRM ${cont ? "CONTINUADA (GEO5)" : "desde cero"} · ${eng} · ${model.X.length} nudos, ${model.ELE.length} T6`);
const log = (l: string) => { if (/SRM rs|>>>/.test(l)) console.log(l.trim()); };
const t0 = performance.now();
const r = eng === "ts" ? new GeoFem(model, log).run(model) : (await GeoFemWasm.create(model, log)).run(model);
console.log(`FS = ${r.map((x) => x.fs.toFixed(4)).join(" / ")}  (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
