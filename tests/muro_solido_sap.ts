// MURO DE CONTENCIÓN EN SÓLIDOS H8 contra SAP2000, NUDO A NUDO, dentro de Hekatan Geotechnic.
//   npx tsx tests/muro_solido_sap.ts
//
// El motor (src/solid/cpp/hex8_wasm.cpp) y la malla (src/solid/muroMalla.ts) son los MISMOS ficheros
// de Hekatan Struct, copiados sin tocar, y las referencias de SAP2000 son las mismas que ya arbitran
// allí (tests/datos/muro_solido_*.json, armadas por OAPI con los mismos nudos, apoyos y cargas
// nodales — galpon-bodega-electoral/sap_h8_modelo.py, 2 y 3-sep-2026). Este test existe para que el
// motor no se separe: si algún día Geotechnic recompila su WASM y se mueve un dígito, salta aquí.
//
// Dos referencias:
//   con modos incompatibles (Wilson-Taylor) = «Incompatible Bending Modes» que SAP2000 trae
//     ACTIVADO por defecto en sus sólidos = C3D8I de Abaqus;
//   sin ellos = H8 clásico de integración completa = C3D8 de Abaqus.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initHex8, hex8Solve } from "../src/solid/hex8";
import { mallaMuroSolido, MURO_SOLIDO_DEFAULT } from "../src/solid/muroMalla";

const AQUI = dirname(fileURLToPath(import.meta.url));
await initHex8();

const p = MURO_SOLIDO_DEFAULT, m = mallaMuroSolido(p);
console.log(`muro en sólidos: H=${p.H} t=${p.t} puntera=${p.toe} talón=${p.heel} zapata=${p.tf} L=${p.L} malla=${p.ms} m`);
console.log(`  ${m.nodes.length} nudos, ${m.elements.length} hexaedros (${m.info.nx}×${m.info.ny}×${m.info.nz}), empuje ${m.info.empujeTotal.toFixed(2)} kN`);

let fallos = 0;
/** peor diferencia nudo a nudo en %, referida al |u_x| máximo del modelo (como en la suite de Struct) */
function comparar(tag: string, ref: string, malla: ReturnType<typeof mallaMuroSolido>, inc: boolean, E: number, nu: number) {
  const f = join(AQUI, "datos", ref);
  if (!existsSync(f)) { console.log(`  ✖ ${tag}: falta la referencia ${f}`); fallos++; return; }
  const S = JSON.parse(readFileSync(f, "utf-8"));
  const r = hex8Solve({ nodes: malla.nodes, elements: malla.elements, E, nu, supports: malla.supports, loads: malla.loads, incompatible: inc });
  if (S.nodes.length !== malla.nodes.length) { console.log(`  ✖ ${tag}: ${malla.nodes.length} nudos vs ${S.nodes.length} en SAP2000`); fallos++; return; }
  let mx = 0; for (let n = 0; n < malla.nodes.length; n++) mx = Math.max(mx, Math.abs((r.displacements.get(n) ?? [0, 0, 0])[0]));
  let peor = 0, nPeor = -1;
  for (let n = 0; n < malla.nodes.length; n++) {
    const u = r.displacements.get(n) ?? [0, 0, 0];
    for (let c = 0; c < 3; c++) { const d = Math.abs(u[c] - S.u[n][c]) / mx * 100; if (d > peor) { peor = d; nPeor = n; } }
  }
  const uxH = (r.displacements.get(malla.nudoCoronacion) ?? [0])[0] * 1000, uxS = S.u[malla.nudoCoronacion][0] * 1000;
  const ok = peor <= 1e-6;
  if (!ok) fallos++;
  console.log(`  ${ok ? "ok  " : "✖   "} ${tag}: peor ${peor.toExponential(2)} % (nudo ${nPeor}) · u_x coronación ${uxH.toFixed(4)} vs ${uxS.toFixed(4)} mm · ${r.elapsedMs.toFixed(0)} ms`);
}

comparar("con modos incompatibles (= SAP2000 por defecto = Abaqus C3D8I)", "muro_solido_sap_inc.json", m, true, p.E, p.nu);
comparar("H8 clásico (= SAP2000 sin modos = Abaqus C3D8)", "muro_solido_sap_noinc.json", m, false, p.E, p.nu);

// con PESO PROPIO del hormigón y el RELLENO sobre el talón (lo que de verdad carga un muro)
const pp = { ...p, gammaC: 24, relleno: 1 }, m2 = mallaMuroSolido(pp);
console.log(`  peso propio ${m2.info.pesoPropio.toFixed(1)} kN · relleno sobre el talón ${m2.info.pesoRelleno.toFixed(1)} kN · empuje ${m2.info.empujeTotal.toFixed(1)} kN`);
comparar("peso propio + relleno sobre el talón (= SAP2000)", "muro_solido_pp_sap_inc.json", m2, true, pp.E, pp.nu);

console.log(fallos ? `\n✖ ${fallos} comprobaciones FALLAN` : "\n✓ el sólido H8 de Geotechnic da lo MISMO que SAP2000, nudo a nudo");
process.exit(fallos ? 1 : 0);
