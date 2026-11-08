// PANEL «CIMENTACIONES · ZAPATA AISLADA» (GEO5 Spread Footing dentro de Hekatan Geotechnic, sin ventana aparte).
// Entradas a la izquierda; a la derecha la planta con el mapa de presión de contacto, el corte con el bulbo
// Δσz frente a m·σor (zona de influencia) y la tabla de resultados con su fuente (GEO5 / literatura).
import { calcularZapata, ZAPATA_GUERRA, type ZapataDatos, type ZapataResultado } from "./zapata";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type Campo = { k: keyof ZapataDatos; et: string; u?: string; paso?: number; tip?: string };
const GRUPOS: { t: string; c: Campo[] }[] = [
  { t: "Zapata", c: [
    { k: "B", et: "B (lado x)", u: "m", paso: 0.05 }, { k: "L", et: "L (lado y)", u: "m", paso: 0.05 },
    { k: "h", et: "canto h", u: "m", paso: 0.05 }, { k: "Df", et: "Df (desde la rasante)", u: "m", paso: 0.1 },
    { k: "cx", et: "columna cx", u: "m", paso: 0.05 }, { k: "cy", et: "columna cy", u: "m", paso: 0.05 },
    { k: "gc", et: "γ hormigón", u: "γ", paso: 0.1 }, { k: "gr", et: "γ relleno", u: "γ", paso: 0.1 },
    { k: "Ec", et: "E hormigón", u: "MPa", paso: 1000 },
  ] },
  { t: "Suelo", c: [
    { k: "gamma", et: "γ", u: "γ", paso: 0.05 }, { k: "gsat", et: "γ saturado", u: "γ", paso: 0.05 },
    { k: "phi", et: "φ", u: "°", paso: 0.5 }, { k: "c", et: "c", u: "p", paso: 0.5 },
    { k: "cu", et: "c_u (no drenado)", u: "p", paso: 0.5 }, { k: "zw", et: "N.F. (prof.)", u: "m", paso: 0.1, tip: "vacío o ∞ = sin agua" },
    { k: "Edef", et: "E_def", u: "MPa", paso: 1, tip: "0 = no calcula el asiento de GEO5" }, { k: "nu", et: "ν", paso: 0.05 },
    { k: "m", et: "m (resist. estructural)", paso: 0.05 }, { k: "ks", et: "k_s (Winkler)", u: "F/m³", paso: 100, tip: "0 = sin Winkler" },
  ] },
  { t: "Cargas (servicio, cabeza)", c: [
    { k: "N", et: "N", u: "F", paso: 1 }, { k: "Mx", et: "Mx", u: "F·m", paso: 0.5 }, { k: "My", et: "My", u: "F·m", paso: 0.5 },
    { k: "Hx", et: "Hx", u: "F", paso: 0.5 }, { k: "Hy", et: "Hy", u: "F", paso: 0.5 },
  ] },
  { t: "Exigencias", c: [
    { k: "FS", et: "FS vertical", paso: 0.1 }, { k: "eAdm", et: "e relativa admisible", paso: 0.01 },
  ] },
];

let datos: ZapataDatos = { ...ZAPATA_GUERRA };
let montado = false;

function uni(u: string | undefined, d: ZapataDatos) {
  const t = d.unidad === "t";
  return ({ γ: t ? "t/m³" : "kN/m³", p: t ? "t/m²" : "kPa", F: t ? "t" : "kN", "F·m": t ? "t·m" : "kN·m", "F/m³": t ? "t/m³" : "kN/m³" } as Record<string, string>)[u ?? ""] ?? u ?? "";
}

function construir() {
  const caja = $<HTMLDivElement>("zapCampos");
  caja.innerHTML = GRUPOS.map((g) => `<div class="zg"><div class="zt">${g.t}</div>` + g.c.map((c) => {
    const v = datos[c.k] as number;
    return `<label class="zc" title="${c.tip ?? ""}"><span>${c.et}</span><input data-k="${c.k}" type="text" value="${Number.isFinite(v) ? v : "∞"}"><i>${uni(c.u, datos)}</i></label>`;
  }).join("") + `</div>`).join("");
  caja.querySelectorAll<HTMLInputElement>("input[data-k]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const k = inp.dataset.k as keyof ZapataDatos, t = inp.value.trim().replace(",", ".");
      const v = t === "" || t === "∞" || /^inf/i.test(t) ? Infinity : parseFloat(t);
      if (!Number.isNaN(v)) { (datos as unknown as Record<string, number>)[k] = v; calcular(); }
    });
  });
  $<HTMLSelectElement>("zapMetodo").value = datos.metodo;
  $<HTMLSelectElement>("zapDren").value = datos.drenado ? "1" : "0";
  $<HTMLSelectElement>("zapUni").value = datos.unidad;
}

const f = (v: number, n = 3) => (Number.isFinite(v) ? v.toFixed(n) : "∞");

function calcular() {
  const out = $<HTMLDivElement>("zapOut");
  let r: ZapataResultado;
  try { r = calcularZapata(datos); }
  catch (e) { out.innerHTML = `<span style="color:#e5382b">✖ ${(e as Error).message}</span>`; return; }
  (window as unknown as { __zapata: unknown }).__zapata = { datos, r };
  const u = r.unidades, okV = r.FS >= datos.FS, okE = r.ert <= datos.eAdm;
  const okB = r.beta == null || r.beta <= datos.betaAdm;
  const chip = (ok: boolean, t: string) => `<span class="zchip ${ok ? "ok" : "no"}">${ok ? "✔" : "✖"} ${t}</span>`;
  const filas = r.lineas.map((l) => `<tr><td>${l.nombre}</td><td class="n">${f(l.valor, Math.abs(l.valor) < 0.01 && l.valor !== 0 ? 6 : 3)}</td><td>${l.unidad}</td><td class="src ${l.fuente === "GEO5" ? "g5" : "lit"}">${l.fuente}</td><td class="mut">${l.nota ?? ""}</td></tr>`).join("");
  out.innerHTML = `
    <div class="zres">
      <div class="zbig"><span>q<sub>ult</sub> = R<sub>d</sub></span><b>${f(r.Rd, 2)}</b> ${u.p}</div>
      <div class="zbig"><span>q<sub>adm</sub> = R<sub>d</sub>/${datos.FS}</span><b>${f(r.qadm, 2)}</b> ${u.p}</div>
      <div class="zbig"><span>σ sobre A<sub>ef</sub></span><b>${f(r.sigEf, 2)}</b> ${u.p}</div>
      <div class="zbig"><span>FS = R<sub>d</sub>/σ</span><b style="color:${okV ? "#7ee08a" : "#ff6b5b"}">${f(r.FS, 2)}</b></div>
    </div>
    <div style="margin:6px 0">${chip(okV, `capacidad vertical (FS ≥ ${datos.FS})`)} ${chip(okE, `excentricidad e<sub>t</sub> = ${f(r.ert)} ≤ ${datos.eAdm}`)} ${chip(r.FSh >= 1.5, `deslizamiento FS = ${r.FSh > 999 ? "∞" : f(r.FSh, 2)}`)} ${r.beta != null ? chip(okB, `distorsión β = 1/${Math.round(1 / Math.max(r.beta, 1e-9))} (≤ 1/${Math.round(1 / datos.betaAdm)})`) : ""}</div>
    <table class="ztab"><tr><th>magnitud</th><th>valor</th><th></th><th>fuente</th><th></th></tr>${filas}</table>
    <div class="mut" style="margin-top:4px">N<sub>q</sub> ${f(r.N.Nq)} · N<sub>c</sub> ${f(r.N.Nc)} · N<sub>γ</sub> ${f(r.N.Ng)} · s<sub>c,q,γ</sub> ${f(r.f.sc)}/${f(r.f.sq)}/${f(r.f.sg)} · d<sub>c,q,γ</sub> ${f(r.f.dc)}/${f(r.f.dq)}/${f(r.f.dg)} · i ${f(r.f.iq)} · q<sub>0</sub> ${f(r.q0)} · γ<sub>2</sub> ${f(r.g2)} · R<sub>c</sub>/R<sub>q</sub>/R<sub>γ</sub> ${f(r.Rc, 2)}/${f(r.Rq, 2)}/${f(r.Rg, 2)}</div>
    ${r.asiento ? `<div class="mut">asiento GEO5: característico ${f(r.asiento.sCar)} · centro ${f(r.asiento.sCen)} mm · bordes x ${f(r.asiento.sBx1)} / ${f(r.asiento.sBx2)} · y ${f(r.asiento.sBy1)} / ${f(r.asiento.sBy2)} mm · k = ${f(r.asiento.k, 2)} (${r.asiento.rigida ? "rígida" : "deformable"}) · giro x ${f(r.asiento.giroX, 4)} ‰</div>` : ""}
    ${r.winkler ? `<div class="mut">Winkler (k<sub>s</sub> = ${datos.ks}): medio ${f(r.winkler.sMed)} · máx ${f(r.winkler.sMax)} · mín ${f(r.winkler.sMin)} mm</div>` : ""}
    ${r.avisos.map((a) => `<div style="color:var(--oro)">· ${a}</div>`).join("")}`;
  dibujarPlanta(r); dibujarCorte(r);
}

/** paleta tipo SAFE: azul = mínimo, rojo = máximo */
function color(t: number): string {
  const c = [[0, 0, 160], [0, 120, 255], [0, 200, 200], [60, 200, 60], [240, 220, 0], [255, 130, 0], [210, 0, 0]];
  const x = Math.max(0, Math.min(1, t)) * (c.length - 1), i = Math.min(c.length - 2, Math.floor(x)), w = x - i;
  return `rgb(${c[i].map((v, k) => Math.round(v + (c[i + 1][k] - v) * w)).join(",")})`;
}

function dibujarPlanta(r: ZapataResultado) {
  const cv = $<HTMLCanvasElement>("zapPlanta"), g = cv.getContext("2d")!, W = cv.width, H = cv.height;
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  const d = datos, m = 70, sc = Math.min((W - 2 * m - 70) / d.B, (H - 2 * m) / d.L);
  const x0 = (W - 70) / 2 - d.B * sc / 2, y0 = H / 2 - d.L * sc / 2;
  const X = (x: number) => x0 + (x + d.B / 2) * sc, Y = (y: number) => y0 + (d.L / 2 - y) * sc;
  const { nx, ny, p } = r.mapa, pmax = r.sigMax, pmin = r.sigMin;   // escala de mín a máx (como SAFE)
  const dx = d.B / nx * sc, dy = d.L / ny * sc;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = p[j * nx + i];
    g.fillStyle = v > 0 ? color((v - pmin) / Math.max(1e-9, pmax - pmin)) : "#e8e8e8";
    g.fillRect(x0 + i * dx, y0 + (ny - 1 - j) * dy, dx + 0.6, dy + 0.6);
  }
  // área efectiva (GEO5): rectángulo centrado en la resultante, rayado
  const ax = d.B - 2 * Math.abs(r.ex), ay = d.L - 2 * Math.abs(r.ey);
  g.save(); g.beginPath(); g.rect(X(r.ex - ax / 2), Y(r.ey + ay / 2), ax * sc, ay * sc); g.clip();
  g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1;
  for (let s = -H; s < W + H; s += 14) { g.beginPath(); g.moveTo(s, 0); g.lineTo(s + H, H); g.stroke(); }
  g.restore();
  g.strokeStyle = "#111"; g.lineWidth = 2; g.strokeRect(X(-d.B / 2), Y(d.L / 2), d.B * sc, d.L * sc);
  g.setLineDash([6, 4]); g.lineWidth = 1.5; g.strokeRect(X(r.ex - ax / 2), Y(r.ey + ay / 2), ax * sc, ay * sc); g.setLineDash([]);
  g.lineWidth = 2; g.strokeRect(X(-d.cx / 2), Y(d.cy / 2), d.cx * sc, d.cy * sc);
  g.fillStyle = "#e00"; g.beginPath(); g.arc(X(r.ex), Y(r.ey), 5, 0, 7); g.fill();
  g.font = "13px Segoe UI"; g.fillStyle = "#111"; g.textAlign = "center";
  g.fillText(`B = ${d.B} m`, X(0), Y(-d.L / 2) + 22);
  g.save(); g.translate(X(-d.B / 2) - 16, Y(0)); g.rotate(-Math.PI / 2); g.fillText(`L = ${d.L} m`, 0, 0); g.restore();
  g.textAlign = "left"; g.fillText(`área efectiva GEO5 ${ax.toFixed(3)} × ${ay.toFixed(3)} m (rayada) · ● resultante (e = ${r.ex.toFixed(4)}, ${r.ey.toFixed(4)})`, 10, 18);
  g.fillText(`presión de contacto (zapata rígida, sin tracción) [${r.unidades.p}]`, 10, H - 10);
  // valores extremos en las esquinas más / menos cargadas
  // barra de color
  const bx = W - 78, by = 50, bh = H - 100;
  for (let k = 0; k < bh; k++) { g.fillStyle = color(1 - k / bh); g.fillRect(bx, by + k, 18, 1.2); }
  g.strokeStyle = "#111"; g.lineWidth = 1; g.strokeRect(bx, by, 18, bh);
  g.fillStyle = "#111"; g.font = "12px Consolas";
  for (let k = 0; k <= 4; k++) { const v = pmax - (pmax - pmin) * k / 4; g.fillText(v.toFixed(2), bx - 2 - 44 + 66, by + k * bh / 4 + 4); }
  g.fillText(`máx ${r.sigMax.toFixed(3)}`, 10, 36); g.fillText(`mín ${r.sigMin.toFixed(3)}`, 10, 52);
}

function dibujarCorte(r: ZapataResultado) {
  const cv = $<HTMLCanvasElement>("zapCorte"), g = cv.getContext("2d")!, W = cv.width, H = cv.height;
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  const d = datos, zInf = r.asiento?.zInf ?? 2 * d.B, prof = d.Df + zInf + 0.5;
  const sc = Math.min((H - 50) / prof, (W * 0.45) / (d.B + 1));
  const xc = W * 0.27, yg = 30;
  const X = (x: number) => xc + x * sc, Y = (z: number) => yg + z * sc;
  // terreno y suelo
  g.fillStyle = "#efe2c4"; g.fillRect(0, Y(0), W * 0.55, H);
  g.strokeStyle = "#5a3d14"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W * 0.55, Y(0)); g.stroke();
  if (Number.isFinite(d.zw) && d.zw < prof) { g.strokeStyle = "#1e64d0"; g.setLineDash([8, 4]); g.beginPath(); g.moveTo(0, Y(d.zw)); g.lineTo(W * 0.55, Y(d.zw)); g.stroke(); g.setLineDash([]); g.fillStyle = "#1e64d0"; g.fillText("▽ N.F.", 6, Y(d.zw) - 4); }
  // zapata y columna
  g.fillStyle = "#b9b9b9"; g.fillRect(X(-d.B / 2), Y(d.Df - d.h), d.B * sc, d.h * sc); g.fillRect(X(-d.cx / 2), Y(-0.6), d.cx * sc, (d.Df - d.h + 0.6) * sc);
  g.strokeStyle = "#333"; g.lineWidth = 1.5; g.strokeRect(X(-d.B / 2), Y(d.Df - d.h), d.B * sc, d.h * sc); g.strokeRect(X(-d.cx / 2), Y(-0.6), d.cx * sc, (d.Df - d.h + 0.6) * sc);
  g.fillStyle = "#111"; g.font = "12px Segoe UI";
  g.fillText(`Df = ${d.Df} m`, X(d.B / 2) + 6, Y(d.Df) - 4); g.fillText(`φ = ${d.phi}°  c = ${d.c}  γ = ${d.gamma}`, 8, Y(d.Df) + 40);
  if (r.asiento) {
    g.strokeStyle = "#c33"; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(X(-d.B), Y(d.Df + zInf)); g.lineTo(X(d.B), Y(d.Df + zInf)); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#c33"; g.fillText(`fin de la zona de influencia ${zInf.toFixed(2)} m bajo el fondo`, 8, Y(d.Df + zInf) - 4);
    // perfil Δσz y m·σor (derecha)
    const px0 = W * 0.6, pw = W * 0.37, per = r.asiento.perfil, smax = Math.max(...per.map((q) => q.ds), 1e-9);
    const PX = (v: number) => px0 + v / smax * pw;
    g.strokeStyle = "#333"; g.lineWidth = 1; g.beginPath(); g.moveTo(px0, Y(d.Df)); g.lineTo(px0, Y(d.Df + zInf + 0.3)); g.moveTo(px0, Y(d.Df)); g.lineTo(px0 + pw, Y(d.Df)); g.stroke();
    g.fillStyle = "rgba(60,170,60,.25)"; g.beginPath(); g.moveTo(PX(per[0].msor), Y(d.Df + per[0].z));
    for (const q of per) g.lineTo(PX(q.ds), Y(d.Df + q.z));
    for (let i = per.length - 1; i >= 0; i--) g.lineTo(PX(per[i].msor), Y(d.Df + per[i].z));
    g.closePath(); g.fill();
    g.strokeStyle = "#2a8a2a"; g.lineWidth = 2; g.beginPath(); per.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, PX(q.ds), Y(d.Df + q.z))); g.stroke();
    g.strokeStyle = "#111"; g.lineWidth = 1.5; g.beginPath(); per.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, PX(q.msor), Y(d.Df + q.z))); g.stroke();
    g.fillStyle = "#111"; g.fillText(`Δσz (verde, máx ${smax.toFixed(2)} ${r.unidades.p}) · m·σor (negro)`, px0, Y(d.Df) - 6);
    g.fillText(`asiento GEO5 = ${r.asiento.s.toFixed(3)} mm`, px0, Y(d.Df + zInf) + 18);
  } else {
    g.fillStyle = "#555"; g.fillText("sin E_def: no se calcula el asiento de GEO5", W * 0.6, Y(d.Df));
  }
}

/** Monta el panel una vez y engancha los selectores. */
export function montarZapata(volver: () => void): void {
  if (montado) return; montado = true;
  $<HTMLSelectElement>("zapMetodo").addEventListener("change", (e) => { datos.metodo = (e.target as HTMLSelectElement).value as ZapataDatos["metodo"]; calcular(); });
  $<HTMLSelectElement>("zapDren").addEventListener("change", (e) => { datos.drenado = (e.target as HTMLSelectElement).value === "1"; calcular(); });
  $<HTMLSelectElement>("zapUni").addEventListener("change", (e) => {
    const u = (e.target as HTMLSelectElement).value as "kN" | "t";
    if (u !== datos.unidad) {   // se convierten los valores (1 t = 9.80665 kN): el modelo es el mismo
      const k = u === "kN" ? 9.80665 : 1 / 9.80665, D = datos as unknown as Record<string, number>;
      for (const c of ["gc", "gr", "gamma", "gsat", "c", "cu", "ks", "N", "Mx", "My", "Hx", "Hy"]) D[c] = Math.round(D[c] * k * 1e4) / 1e4;
      datos.unidad = u;
    }
    construir(); calcular();
  });
  $<HTMLButtonElement>("zapVolver").addEventListener("click", volver);
  $<HTMLButtonElement>("zapReset").addEventListener("click", () => { datos = { ...ZAPATA_GUERRA }; construir(); calcular(); });
}

/** Muestra (u oculta) el módulo de cimentaciones en lugar del de taludes/muros. */
export function mostrarZapata(on: boolean): void {
  $<HTMLElement>("zapsec").hidden = !on;
  Array.from(document.querySelectorAll<HTMLElement>("main > aside.panel, main > section.panel:not(#zapsec)")).forEach((el) => { el.hidden = on; });
  if (on) { construir(); calcular(); }
}
