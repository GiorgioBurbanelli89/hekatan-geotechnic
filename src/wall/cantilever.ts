// MÓDULO «MURO CANTILEVER (GEO5)»: el Cantilever Wall de GEO5 solo, sin el talud de GeoFEM.
// Entradas a la izquierda con los nombres de los cuadros de GEO5 (Geometry k, h, xx, v1, v2, s1; dentellón; Material;
// Profile + Soils; Earthquake kh, kv); a la derecha el corte del muro a escala con COTAS QUE SE EDITAN (clic en el número),
// la cuña de tierra y las fuerzas como flechas con su valor (como el dibujo de GEO5), y la tabla «Verification».
// El cálculo es muroGeo5 (geo5Cantilever.ts): igual al binario de GEO5 a 1e-14 (tests/muro_manabi_bits.ts).
import { muroGeo5, alfaBiseccionGeo5, type ResultadoG5 } from "./geo5Cantilever";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Datos del muro (kN, m, °). Por defecto: el muro de Portoviejo (Manabí) de GEO5_Manabi/muro_portoviejo_01.guz. */
export type DatosMuro = {
  k: number; h: number; xx: number; v1: number; v2: number; s1: number;   // Geometry de GEO5
  dk: number; dw: number;                                                  // dentellón en el extremo del talón: profundidad bajo la zapata y ancho (dk = 0: sin dentellón)
  gc: number;                                                              // γ del hormigón
  g1: number; f1: number; d1: number; z1: number;                          // suelo 1 (relleno): γ, φ, δ pared, hasta qué profundidad desde la coronación
  g2: number; f2: number; d2: number;                                      // suelo 2 (debajo)
  kh: number; kv: number;                                                  // sismo
  fsV: number; fsD: number;                                                // factores exigidos
};
export const MURO_PORTOVIEJO: DatosMuro = { k: 0.25, h: 2.6, xx: 0.4, v1: 0.7, v2: 1.9, s1: 17.33, dk: 0, dw: 0.4, gc: 23, g1: 18.5, f1: 30, d1: 20, z1: 3, g2: 17.5, f2: 29.97, d2: 20, kh: 0.336, kv: 0, fsV: 2, fsD: 1.05 };

type Campo = { k: keyof DatosMuro; et: string; u?: string; tip?: string };
const GRUPOS: { t: string; c: Campo[] }[] = [
  { t: "Geometría (GEO5: Geometry)", c: [
    { k: "k", et: "k · fuste arriba", u: "m" }, { k: "h", et: "h · altura del fuste", u: "m" }, { k: "xx", et: "xx · canto de la zapata", u: "m" },
    { k: "v1", et: "v1 · puntera", u: "m" }, { k: "v2", et: "v2 · talón", u: "m" }, { k: "s1", et: "s1 · talud cara vista (1:s1)", tip: "0 = fuste vertical" },
    { k: "dk", et: "dentellón · profundidad", u: "m", tip: "bajo la zapata, en el extremo del talón; 0 = sin dentellón" }, { k: "dw", et: "dentellón · ancho", u: "m" },
  ] },
  { t: "Material", c: [{ k: "gc", et: "γ hormigón", u: "kN/m³" }] },
  { t: "Suelo 1 · relleno (Soils)", c: [
    { k: "g1", et: "γ", u: "kN/m³" }, { k: "f1", et: "φ", u: "°" }, { k: "d1", et: "δ pared", u: "°", tip: "fricción suelo-hormigón en la cara del talón" },
    { k: "z1", et: "hasta (desde arriba)", u: "m", tip: "profundidad, desde la coronación, donde empieza el suelo 2 (Profile)" },
  ] },
  { t: "Suelo 2 · debajo", c: [{ k: "g2", et: "γ", u: "kN/m³" }, { k: "f2", et: "φ (base)", u: "°" }, { k: "d2", et: "δ pared", u: "°" }] },
  { t: "Sismo (Earthquake)", c: [{ k: "kh", et: "k_h", tip: "NEC-SE-GC: 0.6·Z·Fa (Manabí 0.336)" }, { k: "kv", et: "k_v", tip: "positivo = hacia abajo (levanta el muro)" }] },
  { t: "Exigencias", c: [{ k: "fsV", et: "FS vuelco", tip: "NEC-SE-GC tabla 5: 3.00 estático, 2.00 sismo" }, { k: "fsD", et: "FS deslizamiento", tip: "NEC-SE-GC tabla 5: 1.60 estático, 1.05 sismo" }] },
];

let datos: DatosMuro = { ...MURO_PORTOVIEJO };
let ultimo: ResultadoG5 | null = null;
let cotas: { x: number; y: number; w: number; h: number; k: keyof DatosMuro }[] = [];

export function calcularMuro(d: DatosMuro): ResultadoG5 {
  const dent = d.dk > 0 ? { x1: d.xx + d.dk, x2: d.dw, x3: 0 } : undefined;
  return muroGeo5({ k: d.k, h: d.h, xx: d.xx, v1: d.v1, v2: d.v2, s1: d.s1 > 0 ? d.s1 : 0, gammaC: d.gc, dent },
    [{ nombre: "suelo 1", gamma: d.g1, phi: d.f1, deltaPared: d.d1, hasta: d.z1 }, { nombre: "suelo 2", gamma: d.g2, phi: d.f2, deltaPared: d.d2, hasta: Infinity }],
    { kh: d.kh, kv: d.kv });
}

function construir() {
  const caja = $<HTMLDivElement>("cwCampos");
  caja.innerHTML = GRUPOS.map((g) => `<div class="zg"><div class="zt">${g.t}</div>` + g.c.map((c) =>
    `<label class="zc" title="${c.tip ?? ""}"><span>${c.et}</span><input data-k="${c.k}" type="text" value="${datos[c.k]}"><i>${c.u ?? ""}</i></label>`).join("") + `</div>`).join("");
  caja.querySelectorAll<HTMLInputElement>("input[data-k]").forEach((inp) => inp.addEventListener("input", () => {
    const v = parseFloat(inp.value.replace(",", "."));
    if (Number.isFinite(v)) { (datos as Record<string, number>)[inp.dataset.k!] = v; calcular(); }
  }));
}
function refrescaCampos() { document.querySelectorAll<HTMLInputElement>("#cwCampos input[data-k]").forEach((i) => { if (document.activeElement !== i) i.value = String((datos as Record<string, number>)[i.dataset.k!]); }); }

const f2 = (v: number) => v.toFixed(2);
function calcular() {
  const out = $<HTMLDivElement>("cwOut");
  try {
    const r = calcularMuro(datos); ultimo = r;
    const okV = r.fsVuelco >= datos.fsV, okD = r.fsDeslizamiento >= datos.fsD;
    const col = (ok: boolean) => (ok ? "#7ee08a" : "#e5382b");
    const filas = r.fuerzas.map((q, i) => `<tr><td>${i + 1}</td><td>${q.nombre}</td><td>${f2(-q.Fx)}</td><td>${f2(q.Fz)}</td><td>${f2(q.x)}</td><td>${f2(-q.z)}</td></tr>`).join("");
    out.innerHTML = `<div style="margin:0 0 6px;font-size:13.5px"><b>Vuelco</b>: M<sub>res</sub> = ${r.Mres.toFixed(2)} · M<sub>ovr</sub> = ${r.Movr.toFixed(2)} kN·m/m → FS = <b style="color:${col(okV)}">${r.fsVuelco.toFixed(2)}</b> ${okV ? "≥" : "&lt;"} ${datos.fsV.toFixed(2)} · <span style="color:${col(okV)}">${okV ? "SATISFACTORY" : "NOT SATISFACTORY"}</span><br>
      <b>Deslizamiento</b>: H<sub>res</sub> = ${r.Hres.toFixed(2)} · H<sub>act</sub> = ${r.Hact.toFixed(2)} kN/m → FS = <b style="color:${col(okD)}">${r.fsDeslizamiento.toFixed(2)}</b> ${okD ? "≥" : "&lt;"} ${datos.fsD.toFixed(2)} · <span style="color:${col(okD)}">${okD ? "SATISFACTORY" : "NOT SATISFACTORY"}</span><br>
      <span style="color:var(--mut)">B = ${r.B.toFixed(3)} m · α cara virtual = ${alfaBiseccionGeo5(45 - datos.f1 / 2).toFixed(9)}° (bisección de GEO5)${r.epsBase ? ` · base inclinada ${r.epsBase.toFixed(2)}°` : ""} · mismas columnas y signos que «Verification» de GEO5</span></div>
      <table class="cwt"><tr><th>No.</th><th>Force</th><th>F<sub>x</sub> [kN/m]</th><th>F<sub>z</sub> [kN/m]</th><th>x [m]</th><th>z [m]</th></tr>${filas}</table>`;
    dibujar(r);
  } catch (e) { out.innerHTML = `<span style="color:#e5382b">✖ ${(e as Error).message}</span>`; }
}

/** Corte del muro a escala (x desde la punta de la puntera, y desde el fondo de la zapata): hormigón, cuña, terreno,
 *  cotas editables y las fuerzas de la tabla como flechas con su valor (el dibujo de GEO5). */
function dibujar(r: ResultadoG5) { cotas = dibujarMuro($<HTMLCanvasElement>("cwCv"), datos, r, true); }

/** El dibujo solo (sin estado): lo usa este módulo y el panel del muro de la página del talud (panel.ts).
 *  Devuelve dónde quedaron las cotas (para editarlas con clic). `ayuda` escribe la línea de arriba. */
export function dibujarMuro(cv: HTMLCanvasElement, d: DatosMuro, r: ResultadoG5, ayuda = false): typeof cotas {
  const c = cv.getContext("2d")!, W = cv.width, H = cv.height, cotas: { x: number; y: number; w: number; h: number; k: keyof DatosMuro }[] = [];
  c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
  const kb = d.k + (d.s1 > 0 ? d.h / d.s1 : 0), xt = d.v1 + kb, B = r.B, Ht = d.xx + d.h, dk = d.dk > 0 ? d.dk : 0;
  const xmin = -1.2, xmax = B + 1.4, ymin = -dk - 0.9, ymax = Ht + 0.9, sc = Math.min((W - 40) / (xmax - xmin), (H - 40) / (ymax - ymin));
  const X = (x: number) => 20 + (x - xmin) * sc, Y = (y: number) => H - 20 - (y - ymin) * sc;
  const poli = (pts: number[][], relleno: string | null, trazo: string, ancho = 1.5) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.closePath(); if (relleno) { c.fillStyle = relleno; c.fill(); } c.strokeStyle = trazo; c.lineWidth = ancho; c.stroke(); };
  // terreno: relleno detrás hasta la coronación, delante a la cota de la zapata
  c.strokeStyle = "#7a5a2a"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X(xt), Y(Ht)); c.lineTo(X(xmax), Y(Ht)); c.moveTo(X(xmin), Y(d.xx)); c.lineTo(X(0), Y(d.xx)); c.stroke();
  if (d.z1 < Ht + dk) { c.setLineDash([6, 4]); c.beginPath(); c.moveTo(X(B), Y(Ht - d.z1)); c.lineTo(X(xmax), Y(Ht - d.z1)); c.stroke(); c.setLineDash([]); }
  // cuña de tierra (cara virtual con el α de GEO5)
  const xv = r.xv;
  poli([[xt, d.xx], [B, d.xx], [xv + 1e-5, Ht], [xt, Ht]], "rgba(120,170,90,0.25)", "#6a9a4a", 1);
  c.setLineDash([5, 4]); c.strokeStyle = "#c0392b"; c.beginPath(); c.moveTo(X(B), Y(d.xx)); c.lineTo(X(xv), Y(Ht)); c.stroke(); c.setLineDash([]);
  // hormigón (con dentellón)
  const zap = dk > 0 ? [[0, 0], [B - d.dw, 0], [B - d.dw, -dk], [B, -dk], [B, d.xx], [0, d.xx]] : [[0, 0], [B, 0], [B, d.xx], [0, d.xx]];
  poli(zap, "#d4d4d4", "#7b2d7b", 2); poli([[d.v1, d.xx], [xt, d.xx], [xt, Ht], [xt - d.k, Ht]], "#d4d4d4", "#7b2d7b", 2);
  // cotas editables
  const cota = (x1: number, y1: number, x2: number, y2: number, off: number, k: keyof DatosMuro, valor: number) => {
    const hz = Math.abs(y2 - y1) < 1e-9, ox = hz ? 0 : off, oy = hz ? off : 0;
    const a = [X(x1 + ox), Y(y1 + oy)], b = [X(x2 + ox), Y(y2 + oy)];
    c.strokeStyle = "#333"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(X(x1), Y(y1)); c.lineTo(a[0], a[1]); c.moveTo(X(x2), Y(y2)); c.lineTo(b[0], b[1]); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    for (const [p, q] of [[a, b], [b, a]]) { const ang = Math.atan2(q[1] - p[1], q[0] - p[0]); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + 7 * Math.cos(ang - 0.35), p[1] + 7 * Math.sin(ang - 0.35)); c.lineTo(p[0] + 7 * Math.cos(ang + 0.35), p[1] + 7 * Math.sin(ang + 0.35)); c.closePath(); c.fillStyle = "#333"; c.fill(); }
    const t = valor.toFixed(2); c.font = "bold 13px Segoe UI, Arial"; const tw = c.measureText(t).width + 8, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const bx = hz ? mx - tw / 2 : mx - tw - 4, by = hz ? my - 19 : my - 9;
    c.fillStyle = "#fff8d8"; c.fillRect(bx, by, tw, 18); c.strokeStyle = "#b8860b"; c.strokeRect(bx, by, tw, 18);
    c.fillStyle = "#1a3fbf"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(t, bx + 4, by + 9);
    cotas.push({ x: bx, y: by, w: tw, h: 18, k });
  };
  cota(0, 0, d.v1, 0, -0.45, "v1", d.v1);
  cota(xt, 0, B, 0, -0.45 - (dk > 0 ? dk : 0), "v2", d.v2);
  cota(xt - d.k, Ht, xt, Ht, 0.45, "k", d.k);
  cota(-0.0, 0, 0, d.xx, -0.55, "xx", d.xx);
  cota(-0.0, d.xx, 0, Ht, -0.55, "h", d.h);
  if (dk > 0) { cota(B, -dk, B, 0, 0.45, "dk", dk); cota(B - d.dw, -dk, B, -dk, -0.4, "dw", d.dw); }
  // fuerzas como flechas (Fx, Fz con su signo de la tabla; largo fijo, el valor escrito)
  const flecha = (x: number, y: number, fx: number, fz: number, txt: string, col: string) => {
    const L = Math.hypot(fx, fz); if (L < 1e-9) return; const ux = fx / L, uy = fz / L, len = 0.7;
    const x0 = X(x - ux * len), y0 = Y(y - uy * len), x1 = X(x), y1 = Y(y);          // la flecha TERMINA en el punto de aplicación
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - 9 * Math.cos(ang - 0.4), y1 - 9 * Math.sin(ang - 0.4)); c.lineTo(x1 - 9 * Math.cos(ang + 0.4), y1 - 9 * Math.sin(ang + 0.4)); c.closePath(); c.fill();
    c.font = "12px Segoe UI, Arial"; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText(txt, x0, y0 - 2);
  };
  for (const q of r.fuerzas) {
    const sis = /Earthq/i.test(q.nombre), col = sis ? "#c0392b" : "#1f3fbf";
    // GEO5 dibuja la resultante de cada fuerza; la del empuje va hacia el muro (Fx hacia −x) y hacia abajo
    flecha(q.x, q.z, -q.Fx, -q.Fz, Math.hypot(q.Fx, q.Fz).toFixed(2), col);
  }
  if (ayuda) { c.fillStyle = "#555"; c.font = "12px Segoe UI, Arial"; c.textAlign = "left"; c.textBaseline = "top";
    c.fillText("clic en una cota amarilla para cambiarla · azul: peso y empuje · rojo: sismo (k_h)", 10, 6); }
  return cotas;
}

/** Clic en una cota → un campo encima del número; Enter (o salir) la cambia y recalcula. */
function editarCota(ev: MouseEvent) {
  const cv = $<HTMLCanvasElement>("cwCv"), rc = cv.getBoundingClientRect(), sx = cv.width / rc.width, sy = cv.height / rc.height;
  const px = (ev.clientX - rc.left) * sx, py = (ev.clientY - rc.top) * sy;
  const hit = cotas.find((q) => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h); if (!hit) return;
  const inp = document.createElement("input"); inp.type = "text"; inp.value = String(datos[hit.k]);
  Object.assign(inp.style, { position: "absolute", left: `${rc.left + window.scrollX + hit.x / sx - 6}px`, top: `${rc.top + window.scrollY + hit.y / sy - 3}px`, width: "80px", zIndex: "50", font: "bold 13px Consolas, monospace", padding: "2px 4px" });
  document.body.appendChild(inp); inp.focus(); inp.select();
  let hecho = false;
  const fin = (ok: boolean) => { if (hecho) return; hecho = true; const v = parseFloat(inp.value.replace(",", ".")); inp.remove(); if (ok && Number.isFinite(v) && v >= 0) { (datos as Record<string, number>)[hit.k] = v; refrescaCampos(); calcular(); } };
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") fin(true); else if (e.key === "Escape") fin(false); });
  inp.addEventListener("blur", () => fin(true));
}

let montado = false;
export function montarMuro(volver: () => void): void {
  if (montado) return; montado = true;
  $<HTMLButtonElement>("cwVolver").addEventListener("click", () => { mostrarMuro(false); volver(); });
  $<HTMLButtonElement>("cwReset").addEventListener("click", () => { datos = { ...MURO_PORTOVIEJO }; construir(); calcular(); });
  $<HTMLCanvasElement>("cwCv").addEventListener("click", editarCota);
}
export function mostrarMuro(on: boolean): void {
  $<HTMLElement>("murosec").hidden = !on;
  Array.from(document.querySelectorAll<HTMLElement>("main > aside.panel, main > section.panel:not(#murosec):not(#zapsec)")).forEach((el) => { el.hidden = on; });
  if (on) { construir(); calcular(); }
}
/** Para el MCP y las pruebas: el último resultado. */
(window as unknown as { __muroG5: () => unknown }).__muroG5 = () => (ultimo ? { Mres: ultimo.Mres, Movr: ultimo.Movr, Hres: ultimo.Hres, Hact: ultimo.Hact, fsVuelco: ultimo.fsVuelco, fsDeslizamiento: ultimo.fsDeslizamiento, fuerzas: ultimo.fuerzas, datos } : null);
(window as unknown as { __muroCotas: () => unknown }).__muroCotas = () => cotas;          // para las pruebas: dónde está cada cota editable (px del lienzo)
