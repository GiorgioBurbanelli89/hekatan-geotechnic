// FS por equilibrio límite (Fellenius/Bishop) del talud crítico. Caso clásico Griffiths-Lane 1999: talud homogéneo
// φ=20°, c=constante, H=... FS Bishop ≈ 1.4. Aquí un talud homogéneo simple para comparar el orden y Bishop>Fellenius.
import { parseHgeo } from "../src/model/dsl";
import { criticalCircle, fsCircle } from "../src/lem/slices";
import { readFileSync } from "node:fs";
const f = process.argv[2] || "examples/talud_nuevo.hgeo";
const def = parseHgeo(readFileSync(f, "utf8"), {});
for (const m of ["fellenius", "bishop"] as const) {
  const r = criticalCircle(def, m, 40);
  if (!r) { console.log(`${m}: sin superficie`); continue; }
  console.log(`${m}: FS = ${r.fs.toFixed(3)} · círculo c=(${r.circle.cx.toFixed(1)},${r.circle.cy.toFixed(1)}) R=${r.circle.R.toFixed(1)} · ${r.slices.length} dovelas · entra ${r.x0.toFixed(1)} sale ${r.x1.toFixed(1)}${r.iters ? ` · ${r.iters} iters` : ""}`);
}
