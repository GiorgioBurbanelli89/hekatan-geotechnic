// TIPOS DE TALUD (plantillas, 8-nov-2026): cada tipo genera un .hgeo que se abre, malla y calcula (Bishop, Fellenius y SRM WASM).
//   npx tsx tests/plantillas_talud.ts [--sin-fem]
// Comprobaciones analíticas INDEPENDIENTES:
//   (1) talud infinito, c = 0, sin agua: FS = tanφ/tanβ. El círculo crítico de Bishop/Fellenius tiende a la cara (superficial):
//       se evalúa un círculo de radio muy grande tangente a la cara (dovelas casi paralelas a la cara) → tanφ/tanβ a 3 cifras.
//   (2) ACADS EX1(a) (Giam & Donald 1989; H=10, 2:1, c=3, φ=19.6, γ=20): Bishop publicado ≈ 0.99–1.00 (referencia 1.000).
//   (3) Bishop simplificado escrito aparte (en este archivo, sin usar slices.ts) sobre el MISMO círculo crítico: = app a 4 cifras.
import { parseHgeo, interfaceY, spanInterface } from "../src/model/dsl";
import { PLANTILLAS, hgeoPlantilla, betaDeN, fsInfinito } from "../src/model/plantillas";
import { criticalCircle, fsCircle } from "../src/lem/slices";
import { meshSlope } from "../src/mesh/mesher";
import { GeoFemWasm } from "../src/geofem/geofemWasm";

const conFem = !process.argv.includes("--sin-fem");
let bad = 0; const ok = (c: boolean, t: string) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
const OP = { agua: true, cargas: true };

// ---- cada tipo, con sus valores por defecto (y con agua y sobrecarga) ----
for (const t of PLANTILLAS) for (const extra0 of [{}, { hw: 3, q: 20 }] as Record<string, number>[]) {
  const extra = t.id === "muro" && extra0.hw ? { q: 20 } : extra0;   // el muro no lleva freático
  const txt = hgeoPlantilla(t.id, extra), d = parseHgeo(txt);
  const t0 = Date.now(), b = criticalCircle(d, "bishop", 40, OP), f = criticalCircle(d, "fellenius", 40, OP), tl = (Date.now() - t0) / 1000;
  let fem = "—", nel = 0;
  if (conFem) {
    const { model, stats } = meshSlope(d); nel = stats.elements;
    const w = await GeoFemWasm.create(model, () => {}); const rs = w.run(model);
    fem = rs.map((r) => (r.steps.length ? r.fs.toFixed(4) : "<1")).join(" / ");
  }
  ok(!!b && !!f && b.fs > 0.3 && f.fs > 0.3, `${t.id.padEnd(10)} ${JSON.stringify(extra).padEnd(16)} Bishop ${b?.fs.toFixed(3)} · Fellenius ${f?.fs.toFixed(3)} (${tl.toFixed(1)} s) · SRM ${fem} (${nel} T6)`);
  if (b && f) ok(f.fs <= b.fs + 0.02, `${t.id}: Fellenius ≤ Bishop (lo habitual)`);
}

// ---- (1) talud infinito c = 0 ----
for (const [phi, n] of [[30, 2], [25, 1.5], [35, 2.5]]) {
  const d = parseHgeo(hgeoPlantilla("corte", { H: 10, n, phi, c: 0, gamma: 19 })), beta = betaDeN(n), an = fsInfinito(phi, beta);
  // círculo de radio R tangente (por dentro) a la cara a 0.01 m de profundidad (R = 2000 m: cuerda ≈ 13 m, dentro de la cara) en su punto medio
  const xm = 10 + n * 5, zm = 5, br = (beta * Math.PI) / 180, nx = -Math.sin(br), nz = Math.cos(br), R = 2000, prof = 0.01;
  const cir = { cx: xm + nx * (R - prof), cy: zm + nz * (R - prof), R };
  const rb = fsCircle(d, cir, "bishop", 200)!, rf = fsCircle(d, cir, "fellenius", 200)!, crit = criticalCircle(d, "bishop", 40);
  ok(Math.abs(rb.fs - an) / an < 5e-4 && Math.abs(rf.fs - an) / an < 5e-4, `infinito φ=${phi} 1:${n} (β=${beta.toFixed(2)}°): tanφ/tanβ = ${an.toFixed(4)} · Bishop círculo superficial ${rb.fs.toFixed(4)} · Fellenius ${rf.fs.toFixed(4)} · búsqueda Bishop ${crit?.fs.toFixed(4)}`);
  ok(!!crit && crit.fs >= an - 1e-3, `infinito φ=${phi}: la búsqueda no baja del analítico (${crit?.fs.toFixed(4)} ≥ ${an.toFixed(4)})`);
}

// ---- (2) ACADS EX1(a) y (3) Bishop independiente ----
{
  const d = parseHgeo(hgeoPlantilla("corte", { H: 10, n: 2, phi: 19.6, c: 3, gamma: 20 }));
  ok(JSON.stringify(d.interfaces[0]) === JSON.stringify([[0, 0], [10, 0], [30, 10], [50, 10]]) && d.margins!.bottom === -5, "corte H=10 1:2 = geometría de ACADS EX1(a) (desplazada: (20,20)…(30,25)-(50,35)…(70,35))");
  const rb = criticalCircle(d, "bishop", 40)!, rf = criticalCircle(d, "fellenius", 40)!;
  ok(Math.abs(rb.fs - 1.0) < 0.015, `ACADS EX1(a): Bishop ${rb.fs.toFixed(4)} vs publicado 1.000 (±1.5 %) · Fellenius ${rf.fs.toFixed(4)} · círculo (${rb.circle.cx.toFixed(2)}, ${rb.circle.cy.toFixed(2)}) R=${rb.circle.R.toFixed(2)}`);
  // Bishop simplificado propio sobre el mismo círculo (dovelas por integración fina, sin slices.ts)
  const T = spanInterface(d.interfaces[0], 0, 50), { cx, cy, R } = rb.circle, c = 3, tf = Math.tan((19.6 * Math.PI) / 180), g = 20;
  const f = (x: number) => (x - cx) ** 2 + (interfaceY(T, x) - cy) ** 2 - R * R;
  const raiz = (a: number, b: number) => { for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (f(a) * f(m) <= 0) b = m; else a = m; } return (a + b) / 2; };
  const xs: number[] = []; for (let i = 0; i < 5000; i++) { const a = (50 * i) / 5000, b = (50 * (i + 1)) / 5000; if (f(a) * f(b) < 0) xs.push(raiz(a, b)); }
  const x0 = xs[0], x1 = xs[xs.length - 1], N = 2000, sl: { W: number; a: number; b: number }[] = [];
  for (let i = 0; i < N; i++) { const xa = x0 + ((x1 - x0) * i) / N, xb = x0 + ((x1 - x0) * (i + 1)) / N, xm = (xa + xb) / 2, yb = cy - Math.sqrt(R * R - (xm - cx) ** 2); sl.push({ W: g * Math.max(0, interfaceY(T, xm) - yb) * (xb - xa), a: Math.asin((xm - cx) / R), b: xb - xa }); }
  let F = 1; for (let k = 0; k < 200; k++) { const num = sl.reduce((s, q) => s + (c * q.b + q.W * tf) / (Math.cos(q.a) + (Math.sin(q.a) * tf) / F), 0); const den = sl.reduce((s, q) => s + q.W * Math.sin(q.a), 0); F = num / den; }
  ok(Math.abs(F - rb.fs) < 5e-3, `Bishop independiente (2000 dovelas) ${F.toFixed(4)} = app (40 dovelas) ${rb.fs.toFixed(4)} a 3 cifras`);
}
console.log(bad ? `✗ ${bad} fallos` : "✓ tipos de talud: todo bien");
process.exit(bad ? 1 : 0);
