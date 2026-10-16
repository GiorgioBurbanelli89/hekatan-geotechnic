// Agua en la construcción por etapas: con GWT la última etapa debe pesar más (γsat) y tener u≠0; sin agua queda igual.
//   npx tsx tests/etapas_agua.ts <hgeo con agua> [ts|wasm]
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";
import { GeoFem } from "../src/geofem/solver";
import { conAgua } from "../src/geofem/agua";
const [f, motor = "wasm"] = process.argv.slice(2);
const { model } = meshSlope(parseHgeo(readFileSync(f, "utf-8")), { topeMs: 120000, maxIter: 40000 });
const seco = { ...model, agua: undefined };
const corre = async (m: typeof model) => {
  const fem: any = motor === "ts" ? new GeoFem(m, process.env.LOG ? (s: string) => console.log(s) : () => {}) : await GeoFemWasm.create(m, process.env.LOG ? (s: string) => console.log(s) : undefined);
  const rs = fem.runStaged(m); const r = rs[rs.length - 1], per = Math.round(r.ngp / m.ELE.length);
  let sz = 0, ux = 0; for (let i = 0; i < r.sig1.length / 4; i++) sz = Math.min(sz, r.sig1[i * 4 + 1]); for (const v of r.u) ux = Math.max(ux, Math.abs(v));
  return { sz, ux, conv: rs.every((x: any) => x.alcanzada >= 1), per };
};
console.log("agua:", model.agua ? "sí" : "NO", "| motor", motor);
console.log("sin agua  ", await corre(seco as any));
console.log("con agua  ", await corre(model));
