// MURO 2D (una sola área) contra SAP2000, NUDO A NUDO: la misma malla Q4 en deformación plana,
// las mismas cargas, muelles y restricciones (tests/muro2d_check.ts escribe el modelo y los u de
// Hekatan; tools/sap_muro2d.py lo arma en SAP2000 y vuelca sus u). Con y sin modos incompatibles.
//   node tests/muro2d_vs_sap.mjs
import { readFileSync } from "node:fs";
const S = JSON.parse(readFileSync("tests/out/muro2d_sap.json", "utf-8"));
let fallos = 0;
for (const [tag, fh, clave] of [["con modos incompatibles", "tests/out/muro2d_modelo_hek_inc.json", "u_inc"], ["sin modos incompatibles", "tests/out/muro2d_modelo_hek_noinc.json", "u_noinc"]]) {
  const H = JSON.parse(readFileSync(fh, "utf-8")).u, U = S[clave];
  let umax = 0; for (const u of H) umax = Math.max(umax, Math.hypot(u[0], u[1]));
  let peor = 0, donde = -1;
  H.forEach((u, n) => { for (let c = 0; c < 2; c++) { const d = Math.abs(u[c] - U[n][c]) / umax * 100; if (d > peor) { peor = d; donde = n; } } });
  const ok = peor < 1e-4; if (!ok) fallos++;
  console.log(`${ok ? "ok" : "✖ "} ${tag.padEnd(26)} peor ${peor.toExponential(2)} % del máximo (nudo ${donde}) · ${H.length} nudos · |u|máx ${(umax * 1000).toFixed(4)} mm`);
}
process.exit(fallos ? 1 : 0);
