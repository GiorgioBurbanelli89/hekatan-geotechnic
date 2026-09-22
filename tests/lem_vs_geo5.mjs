// Bishop y Fellenius de Hekatan Geotechnic contra GEO5 «Slope Stability», MISMO modelo y MISMO circulo.
//   node tests/lem_vs_geo5.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const { build } = require("esbuild");
const out = "tests/_lem_bundle.mjs";
await build({ entryPoints: ["tests/_lem_entry.ts"], bundle: true, format: "esm", outfile: out, platform: "neutral", logLevel: "error" });
const m = await import(pathToFileURL(resolve(out)).href);
const def = m.parseHgeo(readFileSync("examples/talud_geo5_bishop.hgeo", "utf-8"));
const CIRCULO = { cx: 16, cy: 14, R: 15 };            // el mismo que se tecleo en GEO5
const GEO5 = { bishop: 2.16, fellenius: 2.02 };        // GEO5 2024, MISMO circulo (22-sep-2026)
const LIMITE = 1.0;                                    // %; GEO5 solo imprime 2 decimales
const filas = [];
for (const met of ["bishop", "fellenius"]) {
  const r = m.fsCircle(def, CIRCULO, met, 40);
  filas.push({ metodo: met, fs: r ? +r.fs.toFixed(4) : null, dovelas: r ? r.slices.length : 0 });
}
console.log("circulo", CIRCULO);
for (const f of filas) {
  const ref = GEO5[f.metodo];
  console.log(` ${f.metodo.padEnd(10)} Hekatan FS = ${f.fs}` + (ref ? `   GEO5 = ${ref}   dif ${(((f.fs/ref)-1)*100).toFixed(2)} %` : ""));
}
const malas = filas.filter((f) => GEO5[f.metodo] && Math.abs(f.fs / GEO5[f.metodo] - 1) * 100 > LIMITE);
writeFileSync("tests/lem_vs_geo5.json", JSON.stringify({ circulo: CIRCULO, geo5: GEO5, hekatan: filas }, null, 1));
console.log(malas.length ? "FALLA: " + malas.map((f) => f.metodo).join(", ") : "OK: Hekatan = GEO5 dentro del 1 %");
process.exit(malas.length ? 1 : 0);
