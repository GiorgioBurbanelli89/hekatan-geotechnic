// «Pore pressure» dada = mismo camino que GWT: si u nodal = la hidrostática del GWT, la carga debe ser IDÉNTICA.
//   npx tsx tests/agua_poros_dada.ts examples/talud_gwt.hgeo
import { readFileSync } from "node:fs";
import { parseHgeo } from "../src/model/dsl";
import { meshSlope } from "../src/mesh/mesher";
import { cargaAgua, presionNodal } from "../src/geofem/agua";
const { model } = meshSlope(parseHgeo(readFileSync(process.argv[2], "utf-8")));
const a = model.agua!, p = presionNodal(model, a);
const A = cargaAgua(model, a), B = cargaAgua(model, { ...a, gwt: [[0, 1e9]], pNodal: Array.from(p) });
let d = 0; for (let i = 0; i < A.Fg.length; i++) d = Math.max(d, Math.abs(A.Fg[i] - B.Fg[i]), Math.abs(A.Fp[i] - B.Fp[i]));
console.log("dif máx carga GWT vs poros dada:", d, d === 0 ? "OK" : "FALLA");
