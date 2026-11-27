// Pestaña «Analítico vs FEM»: fórmula simbólica primero, luego números con unidades y la diferencia. Cálculos en calculos.ts
// (comprobados en tests/analitico.ts y tests/estado_k0.ts); el equilibrio límite es el de src/lem/slices.ts.
import type { GeoModel } from "../geofem/solver";
import { GP, t6 } from "../geofem/solver";
import { parseHgeo, interfaceY, spanInterface, type SlopeDef } from "../model/dsl";
import { criticalCircle, type LemResult } from "../lem/slices";
import { muroClasico, hgeoLemExcavacion, asientoPesoPropio } from "./calculos";

type St = { name: string; fs: number; steps: unknown[]; sig1?: Float64Array; uIni?: Float64Array; ngp?: number };
export type Marca = { x: number; z: number; t: string };
const f2 = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const dif = (fem: number, an: number) => (Number.isFinite(fem) && Number.isFinite(an) && Math.abs(an) > 1e-9 ? `${(100 * (fem / an - 1)) >= 0 ? "+" : ""}${(100 * (fem / an - 1)).toFixed(1)} %` : "—");

export function analitico(def: SlopeDef | null, model: GeoModel, stages: (St | undefined)[], tipo: { tipo?: string; p?: Record<string, number> } | undefined):
  { html: string; marcas: Marca[]; lem: LemResult | null } {
  const out: string[] = [], marcas: Marca[] = [];
  // ---- 1. estado inicial (etapa 1) en una columna lejos del talud ----
  const s0 = stages[0];
  if (def && s0?.sig1 && def.margins) {
    const m = def.margins, terr = spanInterface(def.interfaces[0], m.xmin, m.xmax), xs = m.xmax - Math.min(3, (m.xmax - m.xmin) / 10), zs = interfaceY(terr, xs);
    const filas: string[] = [];
    for (const prof of [2, 6, 10]) {
      const z = zs - prof; if (z <= m.bottom + 0.3) continue;
      let best = Infinity, sx = NaN, sz = NaN, mat = 1;
      model.ELE.forEach((el, e) => { if (model.stages[0]?.active && !model.stages[0].active[e]) return; GP.forEach((g, q) => { const [N] = t6(g[0], g[1]); let gx = 0, gz = 0; for (let k = 0; k < 6; k++) { gx += N[k] * model.X[el[k]]; gz += N[k] * model.Y[el[k]]; } const d = Math.hypot(gx - xs, gz - z); if (d < best) { best = d; const o = (e * 7 + q) * 4; sx = -s0.sig1![o]; sz = -s0.sig1![o + 1]; mat = (model.stages[0]?.emat ?? model.EMAT)[e]; } }); });
      const M = model.MAT[mat - 1], g = M[4], phi = M[2], nu = M[1], v = g * prof, kj = 1 - Math.sin((phi * Math.PI) / 180), ke = nu / (1 - nu);
      const k0 = model.inicial && model.inicial !== "gravedad" ? (Number.isFinite(model.K0?.[mat - 1] ?? NaN) ? model.K0![mat - 1] : kj) : ke;
      filas.push(`<tr><td>P${filas.length + 1} (${f2(xs, 1)}, ${f2(z, 1)}) · z = ${prof} m</td><td>${f2(v, 1)}</td><td>${f2(sz, 1)}</td><td>${dif(sz, v)}</td><td>${f2(kj * v, 1)} / ${f2(ke * v, 1)}</td><td>${f2(sx, 1)}</td><td>${dif(sx, k0 * v)}</td></tr>`);
      marcas.push({ x: xs, z, t: `P${filas.length}` });
    }
    let asiento = "";
    if (s0.uIni) {
      let k = 0, dmin = Infinity; for (let i = 0; i < model.X.length; i++) { const d = Math.hypot(model.X[i] - m.xmax, model.Y[i] - zs); if (d < dmin) { dmin = d; k = i; } }
      const M = model.MAT[(model.stages[0]?.emat ?? model.EMAT)[model.ELE.findIndex((el) => el.includes(k))] - 1] ?? model.MAT[0], H = zs - m.bottom;
      const an = asientoPesoPropio(M[4], H, M[0], M[1]) * 1000, fem = -s0.uIni[2 * k + 1] * 1000;
      asiento = `<p><b>Asiento por peso propio</b> (columna 1D en el borde derecho, x = ${f2(m.xmax, 1)}): s = γH²/(2M), M = E(1−ν)/((1+ν)(1−2ν)) → γ = ${M[4]}, H = ${f2(H)} m, E = ${M[0]} kPa, ν = ${M[1]} → <b>${f2(an)} mm</b> · FEM ${f2(fem)} mm (${dif(fem, an)}; el talud cercano y la plasticidad lo apartan de 1D)</p>`;
    }
    const k0txt = model.inicial && model.inicial !== "gravedad" ? "K0 del procedimiento (Jaky si no se da)" : "elástico ν/(1−ν) (carga por gravedad)";
    out.push(`<h4>1 · Estado inicial (etapa 1, ${model.inicial && model.inicial !== "gravedad" ? "procedimiento K0" : "carga por gravedad"})</h4>
      <p>σ_z = γ·z · σ_x = K0·γ·z, K0 Jaky = 1 − sinφ, K0 elástico = ν/(1−ν) · u = γ_w·z_w (sin agua: 0). Puntos P1–P3 marcados en el mapa; la diferencia de σ_x es contra el K0 ${k0txt}.</p>
      <table><tr><th>punto</th><th>γz [kPa]</th><th>σz FEM</th><th>dif</th><th>K0γz Jaky / elást.</th><th>σx FEM</th><th>dif</th></tr>${filas.join("")}</table>${asiento}`);
  }
  // ---- 2. FS del talud: equilibrio límite (círculo crítico) frente al FEM ----
  let lem: LemResult | null = null, lemF: LemResult | null = null, dl: SlopeDef | null = null;
  try {
    if (tipo?.tipo === "excavacion_muro" && tipo.p) dl = parseHgeo(hgeoLemExcavacion(tipo.p));
    else if (def && !model.staged) dl = def;
    if (dl) { lem = criticalCircle(dl, "bishop", 40); lemF = criticalCircle(dl, "fellenius", 40); }
  } catch { lem = null; }
  const fem = [...stages].reverse().find((s) => s && s.steps?.length && Number.isFinite(s.fs));
  if (lem) {
    const C = lem.circle;
    out.push(`<h4>2 · Factor de seguridad: equilibrio límite (dovelas, círculo crítico) vs FEM (SRM)</h4>
      <p>Fellenius: FS = Σ[c·l + (W cosα − u·l) tanφ] / Σ W sinα · Bishop: FS = Σ[(c·b + (W − u·b) tanφ)/m_α] / Σ W sinα, m_α = cosα + sinα·tanφ/FS</p>
      <table><tr><th>método</th><th>FS</th><th>dif. del FEM</th></tr>
      <tr><td>FEM (reducción de resistencia${fem ? `, ${fem.name}` : ""})</td><td><b>${fem ? f2(fem.fs, 3) : "—"}</b></td><td></td></tr>
      <tr><td>Bishop simplificado</td><td>${f2(lem.fs, 3)}</td><td>${fem ? dif(fem.fs, lem.fs) : "—"}</td></tr>
      <tr><td>Fellenius (OMS)</td><td>${lemF ? f2(lemF.fs, 3) : "—"}</td><td>${fem && lemF ? dif(fem.fs, lemF.fs) : "—"}</td></tr>
      <tr><td>Janbu, Spencer, Morgenstern-Price</td><td colspan="2">aún no en la app (pendiente: portar las hojas 192/194 verificadas con XSLOPE)</td></tr></table>
      <p>Círculo crítico de Bishop (magenta, sobre el mapa): centro (${f2(C.cx)}, ${f2(C.cy)}), R = ${f2(C.R)} m${tipo?.tipo === "excavacion_muro" ? ` · punto más bajo z = ${f2(C.cy - C.R)} m (${C.cy - C.R > 0 ? "pasa por ENCIMA del muro: la falla crítica es la del talud" : "pasa por debajo del muro"}); el círculo no puede cortar el hormigón` : ""}. Mira «Puntos plásticos · falla»: la banda del FEM debe seguir ese arco.</p>`);
  } else if (model.staged && tipo?.tipo !== "excavacion_muro") out.push(`<h4>2 · Equilibrio límite</h4><p>modelo por etapas: el equilibrio límite no ve la excavación/activación por etapas (solo los tipos que la traducen, como «excavación + muro»).</p>`);
  // ---- 3. muro (plantilla excavación + muro) ----
  if (tipo?.tipo === "excavacion_muro" && tipo.p && tipo.p.muro >= 0.5) {
    const m = muroClasico(tipo.p), ok = (v: number, l: number) => `<span style="color:${v >= l ? "#4caf50" : "#e5382b"}">${v >= l ? "cumple" : "NO cumple"}</span>`;
    out.push(`<h4>3 · Muro en voladizo como sólido rígido (por metro)</h4>
      <p>Empuje activo por cuñas de prueba (Coulomb generalizado, terreno del talud y cohesión; con β ${f2((Math.atan(1 / tipo.p.n) * 180) / Math.PI, 1)}° &gt; φ ${tipo.p.phi}° la fórmula cerrada no existe) en el plano vertical del talón, δ = φ:
      E = máx_θ E(θ) = <b>${f2(m.E)} kN/m</b> (cuña a θ = ${f2(m.cuna.theta, 1)}°, H = ${f2(m.H0)} m), E_h = ${f2(m.Eh)}, E_v = ${f2(m.Ev)}, aplicado a H/3.</p>
      <table><tr><th>verificación</th><th>fórmula</th><th>valor</th><th>exigido</th><th></th></tr>
      <tr><td>vuelco</td><td>ΣM_est / ΣM_vuelco (puntera)</td><td>${f2(m.Mest, 1)} / ${f2(m.Mdes, 1)} = <b>${f2(m.sfVuelco)}</b></td><td>1.5</td><td>${ok(m.sfVuelco, 1.5)}</td></tr>
      <tr><td>deslizamiento</td><td>(N tanφ + c·B) / E_h</td><td><b>${f2(m.sfDesl)}</b></td><td>1.5</td><td>${ok(m.sfDesl, 1.5)}</td></tr>
      <tr><td>excentricidad</td><td>e = B/2 − (M_est − M_des)/N ≤ B/6</td><td>|${f2(m.e, 3)}| m ≤ ${f2(m.B / 6, 3)}</td><td>B/6</td><td>${ok(m.B / 6, Math.abs(m.e))}</td></tr>
      <tr><td>capacidad portante</td><td>Meyerhof, B' = B − 2e, inclinación α = ${f2(m.cap.alfa, 1)}°: q_u = c N_c i_c + q N_q i_q + ½ γ B' N_γ i_γ</td><td>q_u ${f2(m.cap.qu, 0)} kPa · σ ${f2(m.sMin, 1)}…${f2(m.sMax, 1)} kPa · FS = Q_u/N = <b>${f2(m.sfPortante)}</b></td><td>3</td><td>${ok(m.sfPortante, 3)}</td></tr></table>
      <p>N = ${f2(m.N, 1)} kN/m (${m.F.map((f) => `${f.n} ${f2(f.V, 1)}`).join(" · ")}). El pasivo delante de la puntera y del dentellón NO se cuenta (lado seguro).</p>`);
  }
  out.push(`<p class="nota"><b>Por qué difieren:</b> el equilibrio límite supone la FORMA de la superficie de falla (aquí un círculo) y un sólido rígido; el FEM no la supone (sale de la plasticidad), incluye la rigidez, el muro dentro de la malla y las etapas de construcción, y su FS depende algo de la malla.</p>`);
  return { html: out.join(""), marcas, lem };
}
