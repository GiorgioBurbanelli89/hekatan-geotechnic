// ¿La malla del SÓLIDO respeta la sección del muro?  npx tsx tests/muro_solido_malla.ts
//
// La rejilla UNIFORME (la que usan las referencias de SAP2000, y por eso se mantiene) redondea las caras
// del muro a la columna más cercana: con B = 2.45 m y malla 0.2, dx = 0.2042 y un fuste de 0.35 m se
// CONSTRUYE de 0.408 m — un 17 % más gordo, +58 % de inercia. El resultado dependía de la malla un 160 %
// porque lo que cambiaba era la GEOMETRÍA, no la discretización.
//
// La rejilla AJUSTADA (`ajustada: true`, la que usa la app) da a la puntera, al fuste, al talón, a la
// zapata y al alzado su propio número entero de divisiones: sus caras caen EXACTAS y al refinar el
// resultado CONVERGE, que es lo que tiene que pasar.
import { mallaMuroSolido, MURO_SOLIDO_DEFAULT } from "../src/solid/muroMalla";
import { initHex8, hex8Solve } from "../src/solid/hex8";
await initHex8();

const P = { ...MURO_SOLIDO_DEFAULT, t: 0.35, toe: 0.6, heel: 1.5, tf: 0.35, H: 4.55, gammaC: 24, relleno: 1, Ka: 0.2771, gamma: 19, q0: 0, E: 3e7, nu: 0.2 };
const MALLAS = [0.3, 0.2, 0.15];
let fallos = 0;

function corre(ms: number, ajustada: boolean) {
  const m = mallaMuroSolido({ ...P, ms, ajustada });
  const r = hex8Solve({ nodes: m.nodes, elements: m.elements, E: P.E, nu: P.nu, supports: m.supports, loads: m.loads, incompatible: true });
  const zt = Math.max(...m.nodes.map((n) => n[2]));                    // espesor REAL del fuste en la coronación
  const xs = [...new Set(m.nodes.filter((n) => Math.abs(n[2] - zt) < 1e-9).map((n) => n[0]))].sort((a, b) => a - b);
  return { fuste: xs[xs.length - 1] - xs[0], hex: m.elements.length, ux: (r.displacements.get(m.nudoCoronacion) ?? [0])[0] * 1000, E: m.info.empujeTotal };
}

for (const ajustada of [false, true]) {
  console.log(`\n${ajustada ? "AJUSTADA (la que usa la app)" : "UNIFORME (la de las referencias de SAP2000)"}`);
  const us: number[] = [];
  for (const ms of MALLAS) {
    const c = corre(ms, ajustada);
    const ok = !ajustada || Math.abs(c.fuste - P.t) < 1e-6;
    if (!ok) fallos++;
    us.push(c.ux);
    console.log(`  ${ok ? "ok  " : "✖   "} malla ${ms} m: fuste mallado ${c.fuste.toFixed(4)} m (nominal ${P.t}) · ${c.hex} hex · u_x ${c.ux.toFixed(4)} mm · empuje ${c.E.toFixed(2)} kN`);
  }
  const disp = (Math.max(...us.map(Math.abs)) / Math.min(...us.map(Math.abs)) - 1) * 100;
  const conv = disp < 3;
  if (ajustada && !conv) fallos++;
  console.log(`  ${ajustada ? (conv ? "ok   " : "✖    ") : "     "}dispersión de u_x entre las tres mallas: ${disp.toFixed(1)} %${ajustada ? "  (tiene que converger: < 3 %)" : "  (la geometría cambia con la malla: no converge)"}`);
}
console.log(fallos ? `\n✖ ${fallos} comprobaciones FALLAN` : "\n✓ con la rejilla ajustada el fuste es exacto y el resultado converge al refinar");
process.exit(fallos ? 1 : 0);
