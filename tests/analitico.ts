// MÉTODO ANALÍTICO (src/analitico/calculos.ts, src/wall/cunaCulmann.ts) contra fórmulas cerradas y tablas de libro:
//   (1) cuñas de prueba: terreno horizontal c = 0 → ½·Ka·γ·H² (Ka de Coulomb); δ = 0, c > 0 → Rankine ½KaγH² − 2c√Ka·H
//   (2) factores de capacidad portante de Meyerhof a φ = 30°: Nq 18.40, Nc 30.14, Nγ 15.67 (Das, tabla 3.4)
//   (3) muro de la plantilla: equilibrio (vuelco, deslizamiento, excentricidad, portante) y FS global por equilibrio límite
//       (Bishop / Fellenius con el círculo que puede pasar POR DEBAJO del muro) frente al FS del FEM
//   npx tsx tests/analitico.ts
import { empujeCulmann } from "../src/wall/cunaCulmann";
import { kaCoulomb } from "../src/wall/verify";
import { muroClasico, portanteMeyerhof, hgeoLemExcavacion, asientoPesoPropio } from "../src/analitico/calculos";
import { paramsPorDefecto } from "../src/model/plantillas";
import { parseHgeo } from "../src/model/dsl";
import { criticalCircle } from "../src/lem/slices";

let bad = 0; const ok = (c: boolean, t: string) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
const rad = (g: number) => (g * Math.PI) / 180;
console.log("(1) cuñas de prueba contra Coulomb y Rankine (H = 6 m, γ = 19)");
for (const [phi, delta] of [[30, 0], [30, 20], [28, 28]]) {
  const r = empujeCulmann(0, 0 - 6, () => 0, 60, 19, phi, 0, delta), an = 0.5 * kaCoulomb(phi, delta, 0, 0) * 19 * 36;
  console.log(`   φ ${phi} δ ${delta}: cuñas ${r.E.toFixed(3)} kN/m (θ ${r.theta.toFixed(2)}°) · Coulomb ${an.toFixed(3)}`);
  ok(Math.abs(r.E / an - 1) < 1e-3, `φ ${phi}, δ ${delta}: cuñas = Coulomb (0.1 %)`);
}
{ const Ka = Math.tan(rad(45 - 14)) ** 2, an = 0.5 * Ka * 19 * 36 - 2 * 10 * Math.sqrt(Ka) * 6, r = empujeCulmann(0, -6, () => 0, 60, 19, 28, 10, 0);
  console.log(`   φ 28 c 10 δ 0: cuñas ${r.E.toFixed(3)} · Rankine ½KaγH² − 2c√Ka·H = ${an.toFixed(3)}`); ok(Math.abs(r.E - an) < 0.05, "con cohesión = Rankine"); }
console.log("(2) Meyerhof φ = 30°");
{ const c = portanteMeyerhof(2, 0, 1, 19, 30, 0, 0, 100); console.log(`   Nq ${c.Nq.toFixed(2)} Nc ${c.Nc.toFixed(2)} Nγ ${c.Ng.toFixed(2)}`); ok(Math.abs(c.Nq - 18.40) < 0.01 && Math.abs(c.Nc - 30.14) < 0.01 && Math.abs(c.Ng - 15.67) < 0.01, "factores = tabla de Das"); }
console.log("(3) muro de la plantilla (valores por defecto)");
const p = paramsPorDefecto("excavacion_muro"), m = muroClasico(p);
console.log(`   empuje activo E = ${m.E.toFixed(2)} kN/m (cuña θ ${m.cuna.theta.toFixed(1)}°, H plano ficticio ${m.H0.toFixed(2)} m) · Eh ${m.Eh.toFixed(2)} · Ev ${m.Ev.toFixed(2)}`);
console.log(`   N ${m.N.toFixed(2)} kN/m · M_est ${m.Mest.toFixed(2)} · M_des ${m.Mdes.toFixed(2)} kN·m/m · B ${m.B.toFixed(2)} m`);
console.log(`   FS vuelco ${m.sfVuelco.toFixed(2)} · FS deslizamiento ${m.sfDesl.toFixed(2)} · e ${m.e.toFixed(3)} m (B/6 = ${(m.B / 6).toFixed(3)}) · σ ${m.sMin.toFixed(1)}…${m.sMax.toFixed(1)} kPa · q_u ${m.cap.qu.toFixed(1)} kPa (B' ${m.cap.Bp.toFixed(2)} m, α ${m.cap.alfa.toFixed(1)}°) · FS portante ${m.sfPortante.toFixed(2)}`);
const sumV = m.F.reduce((s, f) => s + f.V, 0); ok(Math.abs(sumV - m.N) < 1e-9, "N = Σ pesos + E·sinδ");
ok(m.E > 0 && m.cuna.theta > 20 && m.cuna.theta < 80, "hay empuje activo con una cuña razonable");
const asi = asientoPesoPropio(19, 10, 20000, 0.3); ok(Math.abs(asi * 1000 - 35.286) < 0.01, `asiento 1D γH²/(2M) = ${(asi * 1000).toFixed(3)} mm (el de tests/estado_k0.ts)`);
console.log("(4) FS global por equilibrio límite (estado final: excavado + muro) frente al FEM 1.6935 (h 0.8)");
const d = parseHgeo(hgeoLemExcavacion(p));
const b = criticalCircle(d, "bishop", 40), f = criticalCircle(d, "fellenius", 40);
console.log(`   Bishop ${b?.fs.toFixed(3)} (centro ${b?.circle.cx.toFixed(2)}, ${b?.circle.cy.toFixed(2)}, R ${b?.circle.R.toFixed(2)}) · Fellenius ${f?.fs.toFixed(3)}`);
ok(!!b && !!f && f.fs <= b.fs + 0.02, "Fellenius ≤ Bishop");
ok(!!b && Math.abs(b.fs / 1.6935 - 1) < 0.15, "Bishop a < 15 % del FS del FEM");
console.log(bad ? `\n✗ ${bad} fallaron` : "\n✓ analítico: todo bien"); process.exit(bad ? 1 : 0);
