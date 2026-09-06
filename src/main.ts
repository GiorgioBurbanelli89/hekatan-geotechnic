// Hekatan Geotechnic · página principal. Como Hekatan Struct: calcula AL ABRIR y al mover cualquier slider,
// sin botón. Cada etapa es independiente (arranca de cero con su carga total, como GEO5), así que un slider
// recalcula solo la etapa visible; las demás quedan "desactualizadas" y se recalculan al seleccionarlas.
import type { GeoModel } from "./geofem/solver";
import type { WorkerOut } from "./geofem/worker";
import { SlopePlot } from "./viewer/plot";
import { FieldKind, nodalField } from "./viewer/geo5scale";

type Stage = { name: string; fs: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; seconds: number; stale?: boolean };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const selModel = $<HTMLSelectElement>("model"), selN = $<HTMLSelectElement>("nstages"), btn = $<HTMLButtonElement>("run");
const selStage = $<HTMLSelectElement>("stage"), selField = $<HTMLSelectElement>("field"), selStep = $<HTMLSelectElement>("step");
const inpDef = $<HTMLInputElement>("defscale"), chkMesh = $<HTMLInputElement>("mesh"), chkAuto = $<HTMLInputElement>("auto");
const logEl = $<HTMLDivElement>("log"), fsEl = $<HTMLDivElement>("fs"), matsEl = $<HTMLDivElement>("mats"), hoverEl = $<HTMLDivElement>("hover");
const slidersEl = $<HTMLDivElement>("sliders");
const canvas = $<HTMLCanvasElement>("plot");

let base: GeoModel | null = null;      // fixture tal cual (referencia GEO5)
let model: GeoModel | null = null;     // fixture + sliders
let plot: SlopePlot | null = null;
let stages: (Stage | undefined)[] = [];
let worker: Worker | null = null;
let timer: number | undefined;
let busy = false;

// ---- sliders ----
type Slider = { id: string; label: string; min: number; max: number; step: number; value: number };
let sliders: Slider[] = [];
const sliderEl: Record<string, HTMLInputElement> = {};
const Q0 = 35, A0 = 72;   // sobrecarga y ancla de la Demo04 (kPa, kN): las cargas nodales se escalan

function buildSliders(m: GeoModel) {
  sliders = [
    { id: "phi1", label: "φ₁ [°]", min: 5, max: 45, step: 0.1, value: m.MAT[0][2] },
    { id: "c1", label: "c₁ [kPa]", min: 0, max: 60, step: 0.5, value: m.MAT[0][3] },
    { id: "g1", label: "γ₁ [kN/m³]", min: 14, max: 24, step: 0.1, value: m.MAT[0][4] },
    { id: "phi2", label: "φ₂ [°]", min: 5, max: 45, step: 0.1, value: m.MAT[1][2] },
    { id: "c2", label: "c₂ [kPa]", min: 0, max: 200, step: 1, value: m.MAT[1][3] },
    { id: "g2", label: "γ₂ [kN/m³]", min: 14, max: 24, step: 0.1, value: m.MAT[1][4] },
    { id: "q", label: "q [kPa]", min: 0, max: 100, step: 1, value: Q0 },
    { id: "A", label: "ancla [kN]", min: 0, max: 200, step: 1, value: A0 },
  ];
  slidersEl.innerHTML = "";
  for (const s of sliders) {
    const row = document.createElement("div"); row.className = "sl";
    row.innerHTML = `<span class="n">${s.label}</span><input type="range" id="sl_${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}"><span class="v" id="sv_${s.id}">${s.value}</span>`;
    slidersEl.appendChild(row);
    const inp = row.querySelector("input") as HTMLInputElement; sliderEl[s.id] = inp;
    inp.addEventListener("input", () => {
      $<HTMLSpanElement>("sv_" + s.id).textContent = inp.value;
      for (const st of stages) if (st) st.stale = true;          // todo lo calculado ya no vale
      if (chkAuto.checked) { clearTimeout(timer); timer = window.setTimeout(() => run([visibleStage()]), 250); }
    });
  }
}

const visibleStage = () => Math.min(parseInt(selStage.value || "0"), parseInt(selN.value) - 1);

/** Modelo con los sliders aplicados. Con todo en el valor base es la fixture exacta (gravedad de GEO5). */
function currentModel(): GeoModel {
  const v = (id: string) => parseFloat(sliderEl[id].value);
  const b = base!;
  const MAT = b.MAT.map((r) => r.slice());
  MAT[0][2] = v("phi1"); MAT[0][3] = v("c1"); MAT[0][4] = v("g1");
  MAT[1][2] = v("phi2"); MAT[1][3] = v("c2"); MAT[1][4] = v("g2");
  const gammaChanged = MAT[0][4] !== b.MAT[0][4] || MAT[1][4] !== b.MAT[1][4];
  const q = v("q") / Q0, A = v("A") / A0;
  const isBase = sliders.every((s) => parseFloat(sliderEl[s.id].value) === s.value);
  const st = b.stages.map((x) => ({ ...x, geo5: isBase ? x.geo5 : undefined }));   // la referencia GEO5 solo vale con la Demo04
  return { ...b, MAT, stages: st, recomputeGravity: gammaChanged, Fs: b.Fs.map((x) => x * q), Fa: b.Fa.map((x) => x * A) };
}

async function loadModel(url: string) {
  const baseUrl = import.meta.env.BASE_URL || "./";
  base = (await (await fetch(baseUrl + url)).json()) as GeoModel;
  model = base;
  plot = new SlopePlot(canvas, base);
  plot.hover = ({ x, z, v }) => { hoverEl.textContent = v === null ? "" : `x = ${x.toFixed(2)} m   z = ${z.toFixed(2)} m   valor = ${v.toFixed(2)} mm`; };
  matsEl.innerHTML = base.MAT.map((M, i) => `<b>SOIL_${i + 1}</b>: E=${M[0]} kPa · ν=${M[1]}`).join(" · ")
    + `<br>${base.X.length} nudos · ${base.ELE.length} T6 · ${base.FIXED.length} gdl fijos`;
  buildSliders(base);
  stages = []; fsEl.innerHTML = "";
  selStage.innerHTML = base.stages.map((s, i) => `<option value="${i}">${s.name}</option>`).join("");
  selStage.value = "0"; selStep.innerHTML = "";
  plot.draw({ field: "dx", vals: new Float64Array(base.X.length), title: base.name || "", stage: 0, showMesh: true });
  run(base.stages.map((_, i) => i).slice(0, parseInt(selN.value)));   // como Struct: calcula al abrir
}

function appendLog(line: string) {
  const cls = line.startsWith("    SRM") ? "srm" : line.includes(">>> FS=") ? "fsl" : line.includes("DIVERGE") ? "div" : "";
  const span = document.createElement("span"); if (cls) span.className = cls; span.textContent = line + "\n"; logEl.appendChild(span);
  if (logEl.childElementCount > 2000) logEl.removeChild(logEl.firstChild!);
  logEl.scrollTop = logEl.scrollHeight;
}

function fsTable() {
  const rows = stages.map((s, i) => s ? `<tr${s.stale ? ' style="opacity:.45"' : ""}><td>${s.name}${s.stale ? " ⟳" : ""}</td><td class="ok">${s.fs.toFixed(4)}</td><td>${s.geo5 ? s.geo5.toFixed(2) : "—"}</td><td>${s.seconds.toFixed(1)} s</td></tr>` : "").join("");
  fsEl.innerHTML = `<table><tr><th>etapa</th><th>FS</th><th>GEO5</th><th>t</th></tr>${rows}</table>` + (busy ? `<div style="color:var(--oro);margin-top:4px">calculando…</div>` : "");
}

function redraw() {
  if (!model || !plot) return;
  const si = visibleStage(), st = stages[si];
  if (!st) return;
  const kind = selField.value as FieldKind;
  const stepIdx = parseInt(selStep.value || "-1");
  const u = stepIdx >= 0 && st.steps[stepIdx] ? st.steps[stepIdx].u : st.u;
  const srf = stepIdx >= 0 && st.steps[stepIdx] ? st.steps[stepIdx].srf : st.fs;
  const vals = nodalField(u, st.uel, model.X.length, kind);
  const lab = { dx: "d_x", dz: "d_z", d: "d" }[kind];
  plot.draw({
    field: kind, vals, stage: si, showMesh: chkMesh.checked,
    title: `Talud Demo04 ${st.name} - ${lab} [mm]  SRF=${srf.toFixed(4)}  FS=${st.fs.toFixed(4)}` + (st.geo5 ? `  (GEO5 ${st.geo5.toFixed(2)})` : "") + (st.stale ? "  ⟳ desactualizada" : ""),
    deformScale: parseFloat(inpDef.value) || 0, u, uel: st.uel,
  });
}

function fillStepSelect() {
  const st = stages[visibleStage()]; if (!st) { selStep.innerHTML = ""; return; }
  const keep = selStep.value;
  selStep.innerHTML = `<option value="-1">último convergido (FS=${st.fs.toFixed(4)})</option>` + st.steps.map((s, k) => `<option value="${k}">SRF ${s.srf.toFixed(4)}</option>`).join("");
  if (keep && parseInt(keep) < st.steps.length) selStep.value = keep;
}

function run(idx: number[]) {
  if (!base) return;
  model = currentModel();
  plot?.setModel(model);
  busy = true; logEl.textContent = ""; fsTable();
  worker?.terminate();
  worker = new Worker(new URL("./geofem/worker.ts", import.meta.url), { type: "module" });
  const t0 = performance.now();
  worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const m = ev.data;
    if (m.type === "log") appendLog(m.line);
    else if (m.type === "engine") appendLog(`(motor: ${m.engine === "wasm" ? "WASM · C++ compilado con emscripten" : "TypeScript"})`);
    else if (m.type === "stage") {
      stages[m.index] = { ...(m.result as Stage), stale: false };
      fsTable(); if (m.index === visibleStage()) { fillStepSelect(); redraw(); }
    } else if (m.type === "done") { busy = false; fsTable(); appendLog(`(navegador: ${m.seconds.toFixed(1)} s · ${((performance.now() - t0) / 1000).toFixed(1)} s con el render)`); }
    else if (m.type === "error") { busy = false; fsTable(); appendLog("ERROR: " + m.message); }
  };
  worker.postMessage({ type: "run", model, stageIdx: idx });
}

btn.addEventListener("click", () => run(base!.stages.map((_, i) => i).slice(0, parseInt(selN.value))));
selN.addEventListener("change", () => { const n = parseInt(selN.value); const falta = base!.stages.map((_, i) => i).slice(0, n).filter((i) => !stages[i] || stages[i]!.stale); if (falta.length) run(falta); });
selModel.addEventListener("change", () => loadModel(selModel.value));
selStage.addEventListener("change", () => { const i = visibleStage(); if (!stages[i] || stages[i]!.stale) run([i]); else { fillStepSelect(); redraw(); } });
for (const el of [selField, selStep, chkMesh, inpDef]) el.addEventListener("change", redraw);
inpDef.addEventListener("input", redraw);
loadModel(selModel.value);
