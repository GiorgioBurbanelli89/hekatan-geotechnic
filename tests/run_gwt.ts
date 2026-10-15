// Talud con GWT: FS sin agua y con agua (mismo modelo que se tecleo en GEO5 GeoFEM). 
//   npx tsx tests/run_gwt.ts examples/talud_gwt.hgeo "0,-10 12,-10 22,-6 40,-6" 20.5 [ts|wasm]
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { conAgua } from "../src/geofem/agua";
const def = parseHgeo(readFileSync(process.argv[2], "utf-8"));
const gwt = process.argv[3].split(" ").map((s) => s.split(",").map(Number) as [number, number]);
const gsat = parseFloat(process.argv[4]), engine = (process.argv[5] || "wasm") as "ts" | "wasm";
const { model } = meshSlope(def);
const log = (l: string) => { if (l.includes(">>> FS") || (process.env.V && l.length < 200)) console.log(l); };
for (const [tag, m] of [["sin agua", model], ["GWT", conAgua(model, { gwt, gammaSat: model.MAT.map(() => gsat) })]] as const) {
  const fem = engine === "wasm" ? await GeoFemWasm.create(m, log) : new GeoFem(m, log);
  const res = fem.run(m);
  console.log(`${tag}: FS = ${res.map((r) => r.fs.toFixed(4)).join(" / ")}  (${engine}, ${model.ELE.length} T6)`);
}
