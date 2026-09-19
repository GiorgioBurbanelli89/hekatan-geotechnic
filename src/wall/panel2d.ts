// TERCERA VENTANA DEL MURO: la sección como UNA sola área 2D (deformación plana), src/wall/fem2d.ts.
// Mismo empuje, mismos rellenos y mismo hormigón que la verificación y el sólido; la base sobre
// Winkler y el deslizamiento tomado por el dentellón. Contrastado nudo a nudo con el elemento Plane
// de SAP2000 (tools/sap_muro2d.py).
import type { SlopeDef, Wall } from "../model/dsl";
import { wallGround } from "../model/dsl";
import type { VerifResult } from "./verify";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function jet(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const c = (k: number) => Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - k))));
  return `rgb(${c(3)},${c(2)},${c(1)})`;
}

export type Muro2DCtx = { def: SlopeDef; w: Wall; r: VerifResult };

export async function resolverMuro2DUI(ctx: Muro2DCtx | null): Promise<void> {
  const out = $<HTMLDivElement>("w2out"), cv = $<HTMLCanvasElement>("w2Cv");
  if (!ctx) { out.textContent = "no hay muro en el modelo"; return; }
  try {
    const { mallaMuro2D, resolverMuro2D } = await import("./fem2d");
    const { def, w, r } = ctx;
    const z = wallGround(def, w);
    const hormigon = def.soils.find((s) => s.name === w.soil);
    const num = (id: string, d: number) => { const v = parseFloat($<HTMLInputElement>(id).value); return Number.isFinite(v) ? v : d; };
    const xdTxt = $<HTMLInputElement>("w2Xd").value.trim().toLowerCase();
    const inc = $<HTMLInputElement>("w2Inc").checked;
    const o = {
      corona: num("w2Corona", w.pm.fuste), ms: Math.max(0.025, num("w2Ms", 0.1)),
      bD: Math.max(0, num("w2Bd", 0)), hD: Math.max(0, num("w2Hd", 0)),
      xD: xdTxt === "auto" || xdTxt === "" ? w.pm.x + w.pm.fuste / 2 : parseFloat(xdTxt.replace(",", ".")),
      ks: Math.max(1, num("w2Ks", 30000)),
      Ka: r.K.Ka, gamma: r.suelos.relleno.gamma, q: r.q, gammaC: hormigon?.gamma ?? 24,
      E: hormigon?.E ?? 3e7, nu: hormigon?.nu ?? 0.2, incompatible: inc,
    };
    const m = mallaMuro2D(w.pm, z, o);
    const s = resolverMuro2D(m, o.E, o.nu, inc);

    // ── dibujo: malla deformada coloreada por von Mises + presión de contacto FEM vs cuerpo rígido ──
    cv.style.display = "block";
    const g = cv.getContext("2d")!, W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const xs = m.nodes.map((p) => p[0]), zs = m.nodes.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const hDiag = 130;                                                // franja inferior para la presión
    const sc = Math.min((W - 40) / (x1 - x0), (H - hDiag - 30) / (z1 - z0));
    const ox = (W - sc * (x1 - x0)) / 2, oz = 18;
    const umax = Math.max(...s.u.map((u) => Math.hypot(u[0], u[1]))) || 1;
    const amp = 0.08 * (z1 - z0) / umax;                              // deformada: 8 % del alto
    const P = (n: number, deformada = true): [number, number] => {
      const [px, pz] = m.nodes[n], [ux, uz] = deformada ? s.u[n] : [0, 0];
      return [ox + sc * (px + amp * ux - x0), oz + sc * (z1 - (pz + amp * uz))];
    };
    const poly = (q: number[], deformada: boolean) => {
      g.beginPath(); q.forEach((n, i) => { const [a, b] = P(n, deformada); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath();
    };
    const vm = s.sigma.map((t) => t[3]), vmax = Math.max(...vm) || 1;
    m.quads.forEach((q, e) => {
      poly(q, true); g.fillStyle = jet(vm[e] / vmax); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 0.5; g.stroke();
    });
    g.strokeStyle = "rgba(255,255,255,0.45)"; g.setLineDash([3, 3]);
    m.quads.forEach((q) => { poly(q, false); g.stroke(); });
    g.setLineDash([]);

    // presión de contacto en la base: FEM (nudos) y cuerpo rígido con las MISMAS cargas
    const base = s.contacto.filter((c) => Math.abs(c.z - m.info.zb) < 1e-6).sort((a, b) => a.x - b.x);
    let N = 0, Mi = 0, Fx = 0;
    const B = m.info.B, xc = w.pm.x - w.pm.dedo + B / 2;
    for (const [n, [fx, fz]] of m.loads) { const [px, pz] = m.nodes[n]; N += -fz; Fx += fx; Mi += (px - xc) * fz - (pz - m.info.zb) * fx; }
    Mi += o.hD * -Fx;                                                 // la reacción del dentellón actúa en su fondo
    const pend = -12 * Mi / B ** 3, pm = N / B;
    const pr = (px: number) => pm + pend * (px - xc);
    const pMax = Math.max(...base.map((c) => Math.abs(c.p)), Math.abs(pr(xc - B / 2)), Math.abs(pr(xc + B / 2))) || 1;
    // la presión se dibuja HACIA ABAJO bajo la base (como el diagrama de contacto de GEO5)
    const yb = H - hDiag + 34, hp = hDiag - 50;
    const X = (px: number) => ox + sc * (px - x0), Y = (p: number) => yb + hp * p / pMax;
    g.strokeStyle = "#94a3b8"; g.lineWidth = 1; g.beginPath(); g.moveTo(X(xc - B / 2), yb); g.lineTo(X(xc + B / 2), yb); g.stroke();
    g.fillStyle = "rgba(34,211,238,0.25)"; g.beginPath(); g.moveTo(X(base[0].x), yb);
    base.forEach((c) => g.lineTo(X(c.x), Y(c.p))); g.lineTo(X(base[base.length - 1].x), yb); g.closePath(); g.fill();
    g.strokeStyle = "#22d3ee"; g.lineWidth = 2; g.beginPath();
    base.forEach((c, i) => { if (i) g.lineTo(X(c.x), Y(c.p)); else g.moveTo(X(c.x), Y(c.p)); }); g.stroke();
    g.strokeStyle = "#f59e0b"; g.setLineDash([5, 3]); g.beginPath();
    g.moveTo(X(xc - B / 2), Y(pr(xc - B / 2))); g.lineTo(X(xc + B / 2), Y(pr(xc + B / 2))); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#e5e7eb"; g.font = "11px system-ui";
    g.fillText(`von Mises máx ${vmax.toFixed(0)} kPa · deformada ×${amp.toFixed(0)}`, 6, 12);
    g.fillStyle = "#22d3ee"; g.fillText("contacto FEM", 6, H - 8);
    g.fillStyle = "#f59e0b"; g.fillText("- - cuerpo rígido", 92, H - 8);
    g.fillStyle = "#e5e7eb"; g.fillText(`${Math.max(...base.map((c) => c.p)).toFixed(0)} kPa`, X(base[base.length - 1].x) - 44, Y(Math.max(...base.map((c) => c.p))) + 12);

    const uc = s.u[m.info.nCorona], pFem = base.map((c) => c.p);
    const pr0 = pr(xc - B / 2), pr1 = pr(xc + B / 2);
    out.innerHTML = `<b>coronación u_x = ${(uc[0] * 1000).toFixed(3)} mm</b> · u_z = ${(uc[1] * 1000).toFixed(3)} mm<br>
      ${m.nodes.length} nudos · ${m.quads.length} Q4 ${inc ? "con" : "sin"} modos incompatibles · malla ${o.ms} m · ${s.ms.toFixed(0)} ms<br>
      contacto FEM ${Math.min(...pFem).toFixed(1)} … ${Math.max(...pFem).toFixed(1)} kPa · cuerpo rígido ${Math.min(pr0, pr1).toFixed(1)} … ${Math.max(pr0, pr1).toFixed(1)} kPa (mismas cargas, N = ${N.toFixed(1)} kN/m)<br>
      empuje ${m.info.empuje.toFixed(2)} kN/m (K<sub>a</sub>=${o.Ka.toFixed(4)}) · peso ${m.info.peso.toFixed(2)} · rellenos ${m.info.rellenos.toFixed(2)} kN/m · ${o.bD > 0 && o.hD > 0 ? "reacción del dentellón" : "reacción horizontal de la base"} ${s.Rx.toFixed(2)} kN/m (= empuje)<br>
      <span style="color:var(--mut)">una sola área con la forma de la sección (puntera, fuste de ${w.pm.fuste} a ${o.corona} m, talón, zapata${o.bD > 0 && o.hD > 0 ? `, dentellón ${o.bD}×${o.hD} m` : ""}) · Q4 de deformación plana = elemento Plane de SAP2000 (tools/sap_muro2d.py lo arma con la misma malla).</span>`;
  } catch (e) { out.innerHTML = `<span style="color:#e5382b">✖ ${(e as Error).message}</span>`; }
}
