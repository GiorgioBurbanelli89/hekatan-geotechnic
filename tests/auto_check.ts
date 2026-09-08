import { parseHgeo, autoAssign, serializeHgeo } from "../src/model/dsl";
import { readFileSync } from "node:fs";
const d = parseHgeo(readFileSync(process.argv[2], "utf8"), {}); console.log(autoAssign(d).join("\n")); console.log(serializeHgeo(d).split("\n").filter((l) => l.startsWith("asignar")).join("\n"));
