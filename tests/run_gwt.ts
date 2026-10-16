// Talud con GWT leído del .hgeo (`agua gwt …`, `gsat=`): FS sin agua y con agua. GEO5 GeoFEM: 1.98 -> 1.76.
//   npx tsx tests/run_gwt.ts examples/talud_gwt.hgeo [ts|wasm]
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFem } from "../src/geofem/solver";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
const def = parseHgeo(readFileSync(process.argv[2], "utf-8")), engine = (process.argv[3] || "wasm") as "ts" | "wasm";
const { model } = meshSlope(def);
if (!model.agua) throw new Error("el .hgeo no trae `agua gwt …`");
const log = (l: string) => { if (l.includes(">>> FS")) console.log(l); };
for (const [tag, m] of [["sin agua", { ...model, agua: undefined }], ["GWT", model]] as const) {
  const fem = engine === "wasm" ? await GeoFemWasm.create(m, log) : new GeoFem(m, log);
  const res = fem.run(m);
  console.log(`${tag}: FS = ${res.map((r) => r.fs.toFixed(4)).join(" / ")}  (${engine}, ${model.ELE.length} T6)`);
}
