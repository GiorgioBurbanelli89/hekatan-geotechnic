// PANEL «DINÁMICO» de la interfaz: acelerograma (pulso de ejemplo o archivo del usuario), opciones (Δt, Rayleigh, HHT),
// cálculo en el Worker con barra de avance y cancelar, y resultados: modos, historias de los nudos vigilados, empuje sobre
// el trasdós (si hay muro), deformada en un instante (deslizador) y envolvente de |u| sobre la gráfica del modelo.
// El motor es el validado contra Abaqus (src/dyn/dinamico.ts → GeoFem.modes / dynamic).
import type { GeoModel } from "../geofem/solver";
import type { WorkerOut } from "../geofem/worker";
import type { SlopeDef } from "../model/dsl";
import type { SlopePlot } from "../viewer/plot";
import type { DynOut } from "./dinamico";
import { leerAcelerograma, pulso, ventana, pico, G, type Acel, type Unidad } from "./acelerograma";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TONF = 9.80665;

export type Ctx = {
  modelo: () => GeoModel | null;       // malla actual (sin sliders de φ/c: el dinámico es elástico)
  def: () => SlopeDef | null;
  plot: () => SlopePlot | null;
  canvas: HTMLCanvasElement;           // lienzo del modelo (clic para elegir nudo)
  redibujarEstatico: () => void;
};

let ctx: Ctx;
let acel: Acel | null = null, archivo: Acel | null = null;
let res: DynOut | null = null, resModelo: GeoModel | null = null;
let worker: Worker | null = null, elegido: number | null = null, t0 = 0;

/** gráfica de líneas sencilla (fondo oscuro), con marca vertical en tMarca */
function grafica(cv: HTMLCanvasElement, series: { t: ArrayLike<number>; y: ArrayLike<number>; color: string; nombre: string }[], ylab: string, titulo: string, tMarca?: number) {
  const c = cv.getContext("2d")!, W = cv.width, H = cv.height, mL = 64, mR = 14, mT = 22, mB = 30;
  c.fillStyle = "#0b0906"; c.fillRect(0, 0, W, H);
  let tmax = 0, ymin = 0, ymax = 0;
  for (const s of series) for (let i = 0; i < s.t.length; i++) { tmax = Math.max(tmax, s.t[i]); ymin = Math.min(ymin, s.y[i]); ymax = Math.max(ymax, s.y[i]); }
  if (!(ymax - ymin > 0)) { ymax = 1; ymin = -1; }
  const pad = 0.08 * (ymax - ymin); ymin -= pad; ymax += pad;
  const X = (t: number) => mL + (W - mL - mR) * t / (tmax || 1), Y = (y: number) => mT + (H - mT - mB) * (ymax - y) / (ymax - ymin);
  c.strokeStyle = "#3a3020"; c.lineWidth = 1; c.font = "11px Segoe UI, Arial"; c.fillStyle = "#b9ad8c"; c.textAlign = "right"; c.textBaseline = "middle";
  const paso = (r: number) => { const p = Math.pow(10, Math.floor(Math.log10(r / 4))); return [1, 2, 5, 10].map((k) => k * p).find((q) => r / q <= 6)!; };
  const py = paso(ymax - ymin); for (let y = Math.ceil(ymin / py) * py; y <= ymax; y += py) { c.beginPath(); c.moveTo(mL, Y(y)); c.lineTo(W - mR, Y(y)); c.stroke(); c.fillText(+y.toPrecision(3) + "", mL - 4, Y(y)); }
  c.textAlign = "center"; c.textBaseline = "top";
  const pt = paso(tmax || 1); for (let t = 0; t <= tmax + 1e-9; t += pt) { c.beginPath(); c.moveTo(X(t), mT); c.lineTo(X(t), H - mB); c.stroke(); c.fillText(+t.toPrecision(3) + "", X(t), H - mB + 3); }
  c.fillText("t [s]", W - 30, H - 14);
  c.strokeStyle = "#7d7259"; c.beginPath(); c.moveTo(mL, Y(0)); c.lineTo(W - mR, Y(0)); c.stroke();
  for (const s of series) { c.strokeStyle = s.color; c.lineWidth = 1.3; c.beginPath(); for (let i = 0; i < s.t.length; i++) { const x = X(s.t[i]), y = Y(s.y[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
  if (tMarca !== undefined) { c.strokeStyle = "#f3ead0"; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(X(tMarca), mT); c.lineTo(X(tMarca), H - mB); c.stroke(); c.setLineDash([]); }
  c.save(); c.translate(14, (mT + H - mB) / 2); c.rotate(-Math.PI / 2); c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#b9ad8c"; c.fillText(ylab, 0, 0); c.restore();
  c.textAlign = "left"; c.textBaseline = "top"; c.fillStyle = "#d3a53c"; c.font = "600 12px Segoe UI, Arial"; c.fillText(titulo, mL, 4);
  let lx = W - mR; c.textAlign = "right"; c.font = "11px Segoe UI, Arial";
  for (const s of [...series].reverse()) { c.fillStyle = s.color; c.fillText("— " + s.nombre, lx, 5); lx -= c.measureText("— " + s.nombre).width + 14; }
}

function leerAcel(): Acel | null {
  const msg = $<HTMLDivElement>("dAccInfo");
  try {
    let a: Acel | null;
    if ($<HTMLSelectElement>("dAcc").value === "pulso") {
      const dt = parseFloat($<HTMLInputElement>("dDt").value) || 0.01;
      a = pulso(parseFloat($<HTMLInputElement>("dAmp").value) || 0, Math.max(0.01, parseFloat($<HTMLInputElement>("dDur").value) || 0.2), Math.max(0.1, parseFloat($<HTMLInputElement>("dTot").value) || 2), dt);
    } else {
      if (!archivo) { msg.textContent = "carga un archivo de acelerograma (RENAC o dos columnas t, a)"; acel = null; dibujarAcel(); return null; }
      const d0 = parseFloat($<HTMLInputElement>("dT0").value) || 0, d1v = $<HTMLInputElement>("dT1").value.trim();
      const d1 = d1v ? parseFloat(d1v) : archivo.pares[archivo.pares.length - 2];
      a = d0 > 0 || d1 < archivo.pares[archivo.pares.length - 2] ? ventana(archivo, d0, d1) : archivo;
    }
    acel = a; const p = pico(a);
    msg.innerHTML = `${a.fuente}<br>pico <b>${(Math.abs(p.a) / G).toFixed(3)} g</b> (${p.a.toFixed(3)} m/s²) en t = ${p.t.toFixed(2)} s · duración ${a.pares[a.pares.length - 2].toFixed(2)} s${a.aviso ? `<br><span style="color:var(--oro)">${a.aviso}</span>` : ""}`;
    dibujarAcel(); return a;
  } catch (e) { msg.textContent = "✖ " + (e as Error).message; acel = null; dibujarAcel(); return null; }
}
function dibujarAcel() {
  const cv = $<HTMLCanvasElement>("dAccCv");
  if (!acel) { const c = cv.getContext("2d")!; c.fillStyle = "#0b0906"; c.fillRect(0, 0, cv.width, cv.height); return; }
  const t: number[] = [], y: number[] = []; for (let i = 0; i < acel.pares.length; i += 2) { t.push(acel.pares[i]); y.push(acel.pares[i + 1] / G); }
  grafica(cv, [{ t, y, color: "#d3a53c", nombre: "a_g" }], "a [g]", "acelerograma en la base");
}

/** Vs por suelo (del .hgeo `vs=`) editable: el dinámico usa E = 2(1+ν)(γ/g)Vs²; vacío = E del modelo. */
function tablaVs() {
  const m = ctx.modelo(), d = ctx.def(), el = $<HTMLDivElement>("dVs");
  if (!m) { el.innerHTML = ""; return; }
  const nombres = m.MATNAMES ?? m.MAT.map((_, i) => `SOIL_${i + 1}`);
  el.innerHTML = `<div style="margin-top:6px">módulo para el dinámico: con Vs, E = 2(1+ν)·(γ/g)·Vs²; vacío = el E del modelo</div>` +
    nombres.map((n, i) => { const vs = d?.soils[i]?.vs; return `<div class="sl"><span class="n" title="${n}">${n}</span><input id="dVs${i}" type="number" min="0" step="5" placeholder="E ${m.MAT[i][0]}" value="${vs ?? ""}" style="padding:2px 4px"><span class="v">m/s</span></div>`; }).join("");
}
const vsDe = (m: GeoModel) => m.MAT.map((_, i) => { const v = parseFloat($<HTMLInputElement>(`dVs${i}`)?.value ?? ""); return Number.isFinite(v) && v > 0 ? v : null; });

function calcular() {
  const m = ctx.modelo(); if (!m) { $<HTMLDivElement>("dMsg").textContent = "no hay modelo mallado"; return; }
  const a = leerAcel(); if (!a) return;
  const dt = parseFloat($<HTMLInputElement>("dDt").value) || 0.01, tEnd = a.pares[a.pares.length - 2];
  const nst = Math.round(tEnd / dt);
  const opts = {
    acc: a.pares, dt, tEnd, alpha: Math.min(0, Math.max(-1 / 3, parseFloat($<HTMLInputElement>("dAlpha").value) || 0)),
    xi: Math.max(0, (parseFloat($<HTMLInputElement>("dXi").value) || 0) / 100),
    modosRayleigh: [Math.max(1, parseInt($<HTMLInputElement>("dMi").value) || 1), Math.max(1, parseInt($<HTMLInputElement>("dMj").value) || 3)] as [number, number],
    vs: vsDe(m), watch: elegido !== null ? undefined : undefined, nsnap: 200,
  };
  if (elegido !== null) { const def = defaultsSinEleccion(m); (opts as { watch?: number[] }).watch = [...def, elegido]; }
  worker?.terminate();
  worker = new Worker(new URL("../geofem/worker.ts", import.meta.url), { type: "module" });
  const bar = $<HTMLDivElement>("dBar"), msg = $<HTMLDivElement>("dMsg");
  $<HTMLButtonElement>("dRun").disabled = true; $<HTMLButtonElement>("dCancel").disabled = false; bar.style.width = "0";
  msg.textContent = `calculando: ${m.X.length} nudos, ${nst} pasos de ${dt} s…` + (m.X.length > 4000 ? " (malla fina: puede tardar varios minutos; una malla más gruesa lo acorta)" : "");
  t0 = performance.now();
  worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const w = ev.data;
    if (w.type === "dynprog") { bar.style.width = `${(100 * w.frac).toFixed(1)}%`; msg.textContent = `${w.fase} · ${(100 * w.frac).toFixed(0)} % · ${((performance.now() - t0) / 1000).toFixed(1)} s`; }
    else if (w.type === "dyndone") { res = w.result; resModelo = m; fin(); msg.textContent = `✓ listo en ${((performance.now() - t0) / 1000).toFixed(1)} s (motor ${w.result.seconds.toFixed(1)} s) · ${w.result.nudos} nudos, ${w.result.gdl} gdl, ${w.result.t.length - 1} pasos`; mostrar(); }
    else if (w.type === "error") { fin(); msg.textContent = "✖ " + w.message; }
  };
  worker.postMessage({ type: "dyn", model: m, opts });
}
function defaultsSinEleccion(m: GeoModel): number[] {
  // la coronación (si hay muro) queda; el elegido sustituye al punto de la superficie
  const rig = m.ELE.some((_, e) => !!m.RIGID?.[m.EMAT[e] - 1]);
  if (!rig) return [];
  let c = -1; m.ELE.forEach((el, e) => { if (!m.RIGID?.[m.EMAT[e] - 1]) return; for (const n of el) if (c < 0 || m.Y[n] > m.Y[c] + 1e-9 || (Math.abs(m.Y[n] - m.Y[c]) < 1e-9 && m.X[n] < m.X[c])) c = n; });
  return c >= 0 ? [c] : [];
}
function fin() { $<HTMLButtonElement>("dRun").disabled = false; $<HTMLButtonElement>("dCancel").disabled = true; $<HTMLDivElement>("dBar").style.width = res ? "100%" : "0"; }

const COL = ["#f2cf5e", "#5ec8f2", "#e5382b", "#7ee08a"];
function mostrar() {
  if (!res) return;
  const r = res;
  $<HTMLDivElement>("dModos").innerHTML = `<table><tr><th>modo</th><th>f [Hz]</th><th>T [s]</th><th>M_ef,x [t]</th></tr>` +
    r.f.slice(0, 3).map((f, k) => `<tr><td>${k + 1}</td><td class="ok">${f.toFixed(4)}</td><td>${r.T[k].toFixed(4)}</td><td>${r.mefx[k].toFixed(2)} (${(100 * r.mefx[k] / r.masa).toFixed(1)} %)</td></tr>`).join("") +
    `</table><div class="mats">masa total ${r.masa.toFixed(2)} t${r.rayleigh ? ` · Rayleigh a = ${r.rayleigh[0].toPrecision(5)} 1/s, b = ${r.rayleigh[1].toPrecision(5)} s` : " · sin amortiguamiento"}</div>`;
  $<HTMLDivElement>("dinres").hidden = false;
  const sl = $<HTMLInputElement>("dT"); sl.max = String(r.snapT.length - 1);
  let im = 0; const w0 = r.watch[0]; for (let s = 0; s < w0.ux.length; s++) if (Math.abs(w0.ux[s]) > Math.abs(w0.ux[im])) im = s;
  let k = 0; for (let j = 0; j < r.snapT.length; j++) if (Math.abs(r.snapT[j] - r.t[im]) < Math.abs(r.snapT[k] - r.t[im])) k = j;
  sl.value = String(k);
  const lin: string[] = [];
  const pga = Math.max(...Array.from(r.ag, Math.abs));
  for (const w of r.watch) {
    let iu = 0, ia = 0; for (let s = 0; s < w.ux.length; s++) { if (Math.abs(w.ux[s]) > Math.abs(w.ux[iu])) iu = s; if (Math.abs(w.aabs[s]) > Math.abs(w.aabs[ia])) ia = s; }
    lin.push(`<b>${w.nombre}</b> (${w.x.toFixed(2)}, ${w.z.toFixed(2)}): u relativo máx <b>${(w.ux[iu] * 1e3).toFixed(2)} mm</b> en t = ${r.t[iu].toFixed(2)} s · a absoluta máx <b>${(Math.abs(w.aabs[ia]) / G).toFixed(3)} g</b> en t = ${r.t[ia].toFixed(2)} s (×${(Math.abs(w.aabs[ia]) / pga).toFixed(2)} la base)`);
  }
  if (r.empuje) {
    const e = r.empuje; let ie = 0; for (let s = 0; s < e.din.length; s++) if (Math.abs(e.peso + e.din[s]) > Math.abs(e.peso + e.din[ie])) ie = s;
    const mx = e.peso + e.din[ie];
    lin.push(`<b>empuje horizontal sobre el trasdós</b> (${e.nodos.length} nudos, ${e.elems.length} T6): antes del sismo <b>${e.peso.toFixed(2)} kN/m</b> (${(e.peso / TONF).toFixed(2)} tonf/m) · máximo <b>${mx.toFixed(2)} kN/m</b> (${(mx / TONF).toFixed(2)} tonf/m) en t = ${r.t[ie].toFixed(2)} s`);
  }
  lin.push(`base: pico ${(pga / G).toFixed(3)} g · ${r.nudos} nudos, ${r.T6} T6, ${r.gdl} gdl, banda ${r.banda} · motor ${r.seconds.toFixed(1)} s`);
  $<HTMLDivElement>("dRes").innerHTML = lin.join("<br>");
  (window as unknown as { __dyn: unknown }).__dyn = resumen();
  historias(); dibujar();
}
function resumen() {
  const r = res!; const e = r.empuje;
  let ie = 0; if (e) for (let s = 0; s < e.din.length; s++) if (Math.abs(e.peso + e.din[s]) > Math.abs(e.peso + e.din[ie])) ie = s;
  return {
    f: r.f, T: r.T, mefx: r.mefx, masa: r.masa, nudos: r.nudos, pasos: r.t.length - 1, segundos: r.seconds,
    watch: r.watch.map((w) => ({ nodo: w.nodo, nombre: w.nombre, uxMaxMm: Math.max(...Array.from(w.ux, (v) => Math.abs(v))) * 1e3, aMaxG: Math.max(...Array.from(w.aabs, (v) => Math.abs(v))) / G })),
    empuje: e ? { peso: e.peso, max: e.peso + e.din[ie], t: r.t[ie] } : null,
  };
}
function historias() {
  if (!res) return;
  const r = res, tm = r.snapT[parseInt($<HTMLInputElement>("dT").value) || 0];
  grafica($<HTMLCanvasElement>("dCvU"), r.watch.map((w, j) => ({ t: r.t, y: Array.from(w.ux, (v) => v * 1e3), color: COL[j % 4], nombre: w.nombre })), "u_x [mm]", "desplazamiento horizontal RELATIVO a la base", tm);
  grafica($<HTMLCanvasElement>("dCvA"), [{ t: r.t, y: Array.from(r.ag, (v) => v / G), color: "#7d7259", nombre: "base" }, ...r.watch.map((w, j) => ({ t: r.t, y: Array.from(w.aabs, (v) => v / G), color: COL[j % 4], nombre: w.nombre }))], "a [g]", "aceleración horizontal ABSOLUTA", tm);
  const cE = $<HTMLCanvasElement>("dCvE");
  if (r.empuje) { cE.style.display = ""; const e = r.empuje; grafica(cE, [{ t: r.t, y: Array.from(e.din, (v) => e.peso + v), color: "#e5382b", nombre: "peso + sismo" }, { t: [0, r.t[r.t.length - 1]], y: [e.peso, e.peso], color: "#7d7259", nombre: "antes del sismo" }], "E [kN/m]", "empuje horizontal sobre el trasdós del fuste (por metro de muro)", tm); }
  else cE.style.display = "none";
}
/** ¿la gráfica del modelo enseña el dinámico? */
export function dinActivo(): boolean { return !!res && !!resModelo && resModelo === ctx.modelo() && $<HTMLSelectElement>("dVista").value !== "no"; }
export function dibujar() {
  const p = ctx.plot(), m = resModelo; if (!res || !p || !m) return;
  if (!dinActivo()) { ctx.redibujarEstatico(); return; }
  const r = res, env = $<HTMLSelectElement>("dVista").value === "env";
  const k = parseInt($<HTMLInputElement>("dT").value) || 0, t = r.snapT[k] ?? 0;
  $<HTMLSpanElement>("dTv").textContent = env ? "envolvente" : `${t.toFixed(2)} s`;
  const n = m.X.length, vals = new Float64Array(n);
  const u = env ? new Float64Array(2 * n) : Float64Array.from(r.snapU[k]);
  for (let i = 0; i < n; i++) vals[i] = env ? r.envU[i] * 1e3 : Math.hypot(u[2 * i], u[2 * i + 1]) * 1e3;
  p.draw({ field: "d", vals, stage: 0, showMesh: false, title: env ? "Dinámico · envolvente max_t |u| relativo a la base [mm]" : `Dinámico · |u| relativo a la base [mm] en t = ${t.toFixed(2)} s`, deformScale: env ? 0 : parseFloat($<HTMLInputElement>("dEsc").value) || 0, u, uel: new Float64Array(2 * n) });
  // nudos vigilados y trasdós
  const mp = p.mapping(); if (!mp) return;
  (window as unknown as { __geoMap: unknown }).__geoMap = mp;   // para el arnés puppeteer
  const c = ctx.canvas.getContext("2d")!;
  r.watch.forEach((w, j) => { const [px, py] = mp.tf(m.X[w.nodo], m.Y[w.nodo]); c.fillStyle = COL[j % 4]; c.strokeStyle = "#000"; c.beginPath(); c.arc(px, py, 6, 0, 2 * Math.PI); c.fill(); c.stroke(); c.font = "bold 12px Segoe UI"; c.fillStyle = "#000"; c.textAlign = "left"; c.fillText(w.nombre, px + 8, py - 8); });
  if (r.empuje) { c.strokeStyle = "#e5382b"; c.lineWidth = 3; c.beginPath(); for (const nd of r.empuje.nodos) { const [px, py] = mp.tf(m.X[nd], m.Y[nd]); c.moveTo(px - 3, py); c.lineTo(px + 3, py); } c.stroke(); }
  if (!env) historias();
}

export function engancharDinamico(c: Ctx) {
  ctx = c;
  const acc = $<HTMLSelectElement>("dAcc");
  acc.addEventListener("change", () => { $<HTMLDivElement>("dPulso").hidden = acc.value !== "pulso"; $<HTMLDivElement>("dArch").hidden = acc.value === "pulso"; leerAcel(); });
  for (const id of ["dAmp", "dDur", "dTot", "dDt", "dT0", "dT1"]) $<HTMLInputElement>(id).addEventListener("change", () => leerAcel());
  $<HTMLSelectElement>("dUni").addEventListener("change", async () => { const f = $<HTMLInputElement>("dFile").files?.[0]; if (f) { archivo = leerAcelerograma(await f.text(), $<HTMLSelectElement>("dUni").value as Unidad, f.name); leerAcel(); } });
  $<HTMLInputElement>("dFile").addEventListener("change", async () => {
    const f = $<HTMLInputElement>("dFile").files?.[0]; if (!f) return;
    try {
      // RENAC viene en latin1; si no es UTF-8 válido se relee así
      const buf = await f.arrayBuffer(); let txt = new TextDecoder("utf-8").decode(buf); if (txt.includes("�")) txt = new TextDecoder("latin1").decode(buf);
      archivo = leerAcelerograma(txt, $<HTMLSelectElement>("dUni").value as Unidad, f.name);
      $<HTMLInputElement>("dDt").value = String(+archivo.dt.toPrecision(6));
    } catch (e) { archivo = null; $<HTMLDivElement>("dAccInfo").textContent = "✖ " + (e as Error).message; }
    leerAcel();
  });
  $<HTMLButtonElement>("dRun").addEventListener("click", calcular);
  $<HTMLButtonElement>("dCancel").addEventListener("click", () => { worker?.terminate(); worker = null; fin(); $<HTMLDivElement>("dMsg").textContent = `cancelado tras ${((performance.now() - t0) / 1000).toFixed(1)} s`; });
  $<HTMLInputElement>("dT").addEventListener("input", dibujar);
  $<HTMLSelectElement>("dVista").addEventListener("change", dibujar);
  $<HTMLInputElement>("dEsc").addEventListener("change", dibujar);
  ctx.canvas.addEventListener("click", (ev) => {
    if ($<HTMLSelectElement>("dPick").value !== "1") return;
    const m = ctx.modelo(), mp = ctx.plot()?.mapping(); if (!m || !mp) return;
    const r = ctx.canvas.getBoundingClientRect();
    const [x, z] = mp.inv((ev.clientX - r.left) * (ctx.canvas.width / r.width), (ev.clientY - r.top) * (ctx.canvas.height / r.height));
    let b = 0, d = Infinity; for (let i = 0; i < m.X.length; i++) { const q = Math.hypot(m.X[i] - x, m.Y[i] - z); if (q < d) { d = q; b = i; } }
    elegido = b; $<HTMLDivElement>("dMsg").textContent = `nudo elegido: ${b + 1} (${m.X[b].toFixed(2)}, ${m.Y[b].toFixed(2)}) · pulsa «calcular dinámico» para ver su historia`;
  });
  leerAcel();
  (window as unknown as { __dynPares: () => number[] | null }).__dynPares = () => acel?.pares ?? null;
}
/** Modelo nuevo: tabla de Vs, aviso de linealidad y resultados viejos fuera. */
export function actualizarDinamico() {
  tablaVs();
  const m = ctx.modelo(), plast = !!m && m.MAT.some((r, i) => !m.RIGID?.[i] && (r[2] > 0 || r[3] > 0));
  $<HTMLDivElement>("dinLineal").textContent = plast
    ? "El dinámico es LINEAL: este modelo tiene suelos con φ y c (plasticidad), pero aquí el suelo se trata como ELÁSTICO y el muro va pegado al terreno (sin deslizamiento ni despegue). Contorno: base fija, lados con v = 0."
    : "El dinámico es LINEAL (elástico). Contorno: base fija, lados con v = 0.";
  if (res && resModelo !== m) { res = null; resModelo = null; elegido = null; $<HTMLDivElement>("dinres").hidden = true; $<HTMLDivElement>("dModos").innerHTML = ""; }
}
