import { parseHgeo, clampLayersToTerrain, serializeHgeo } from "../src/model/dsl";
import { readFileSync } from "node:fs";
const d = parseHgeo(readFileSync(process.argv[2], "utf8"), {}); const n = clampLayersToTerrain(d);
console.log(`capas corregidas: ${n}\n` + serializeHgeo(d).split("\n").filter((l) => l.startsWith("interfaz")).join("\n"));
