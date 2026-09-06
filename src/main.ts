// Hekatan Geotechnic · página principal: carga el modelo, sliders de parámetros (recalculan solos),
// lanza el worker, pinta el campo con la escala de GEO5.
import type { GeoModel } from "./geofem/solver";
import type { WorkerOut } from "./geofem/worker";
import { SlopePlot } from "./viewer/plot";
import { FieldKind, nodalField } from "./viewer/geo5scale";

type Stage = { name: string; fs: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; seconds: number };

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
let stages: Stage[] = [];
let worker: Worker | null = null;
let timer: number | undefined;

// ---- sliders: [id, rótulo, min, max, paso, valor base, unidad] ----
type Slider = { id: string; label: string; min: number; max: number; step: number; value: number; unit: string };
let sliders: Slider[] = [];
const sliderEl: Record<string, HTMLInputElement> = {};
const Q0 = 35, A0 = 72;   // sobrecarga y ancla de la Demo04 (kPa, kN): las cargas nodales se escalan

function buildSliders(m: GeoModel) {
  sliders = [
    { id: "phi1", label: "φ₁ [°]", min: 5, max: 45, step: 0.1, value: m.MAT[0][2], unit: "°" },
    { id: "c1", label: "c₁ [kPa]", min: 0, max: 60, step: 0.5, value: m.MAT[0][3], unit: "" },
    { id: "g1", label: "γ₁ [kN/m³]", min: 14, max: 24, step: 0.1, value: m.MAT[0][4], unit: "" },
    { id: "phi2", label: "φ₂ [°]", min: 5, max: 45, step: 0.1, value: m.MAT[1][2], unit: "°" },
    { id: "c2", label: "c₂ [kPa]", min: 0, max: 200, step: 1, value: m.MAT[1][3], unit: "" },
    { id: "g2", label: "γ₂ [kN/m³]", min: 14, max: 24, step: 0.1, value: m.MAT[1][4], unit: "" },
    { id: "q", label: "q [kPa]", min: 0, max: 100, step: 1, value: Q0, unit: "" },
    { id: "A", label: "ancla [kN]", min: 0, max: 200, step: 1, value: A0, unit: "" },
  ];
  slidersEl.innerHTML = "";
  for (const s of sliders) {
    const row = document.createElement("div"); row.className = "sl";
    row.innerHTML = `<span class="n">${s.label}</span><input type="range" id="sl_${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}"><span class="v" id="sv_${s.id}">${s.value}</span>`;
    slidersEl.appendChild(row);
    const inp = row.querySelector("input") as HTMLInputElement; sliderEl[s.id] = inp;
    inp.addEventListener("input", () => {
      $<HTMLSpanElement>("sv_" + s.id).textContent = inp.value;
      if (chkAuto.checked) { clearTimeout(timer); timer = window.setTimeout(run, 350); }
    });
  }
}

/** Modelo con los sliders aplicados. Si todo está en el valor base, es la fixture exacta (gravedad de GEO5). */
function currentModel(): GeoModel {
  const v = (id: string) => parseFloat(sliderEl[id].value);
  const b = base!;
  const MAT = b.MAT.map((r) => r.slice());
  MAT[0][2] = v("phi1"); MAT[0][3] = v("c1"); MAT[0][4] = v("g1");
  MAT[1][2] = v("phi2"); MAT[1][3] = v("c2"); MAT[1][4] = v("g2");
  const gammaChanged = MAT[0][4] !== b.MAT[0][4] || MAT[1][4] !== b.MAT[1][4];
  const q = v("q") / Q0, A = v("A") / A0;
  const isBase = sliders.every((s) => parseFloat(sliderEl[s.id].value) === s.value);
  // la referencia de GEO5 (1.69/1.48/1.69) solo vale con los parámetros de la Demo04
  const stages = b.stages.map((st) => ({ ...st, geo5: isBase ? st.geo5 : undefined }));
  return { ...b, MAT, stages, recomputeGravity: gammaChanged, Fs: b.Fs.map((x) => x * q), Fa: b.Fa.map((x) => x * A) };
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
  stages = []; fsEl.innerHTML = ""; selStage.innerHTML = ""; selStep.innerHTML = "";
  plot.draw({ field: "dx", vals: new Float64Array(base.X.length), title: base.name || "", stage: 0, showMesh: true });
}

function appendLog(line: string) {
  const cls = line.startsWith("    SRM") ? "srm" : line.includes(">>> FS=") ? "fsl" : line.includes("DIVERGE") ? "div" : "";
  const span = document.createElement("span"); if (cls) span.className = cls; span.textContent = line + "\n"; logEl.appendChild(span);
  if (logEl.childElementCount > 2000) logEl.removeChild(logEl.firstChild!);
  logEl.scrollTop = logEl.scrollHeight;
}

function redraw() {
  if (!model || !plot || !stages.length) return;
  const si = Math.min(parseInt(selStage.value || "0"), stages.length - 1), st = stages[si];
  const kind = selField.value as FieldKind;
  const stepIdx = parseInt(selStep.value || "-1");
  const u = stepIdx >= 0 && st.steps[stepIdx] ? st.steps[stepIdx].u : st.u;
  const srf = stepIdx >= 0 && st.steps[stepIdx] ? st.steps[stepIdx].srf : st.fs;
  const vals = nodalField(u, st.uel, model.X.length, kind);
  const lab = { dx: "d_x", dz: "d_z", d: "d" }[kind];
  plot.draw({
    field: kind, vals, stage: si, showMesh: chkMesh.checked,
    title: `Talud Demo04 ${st.name} - ${lab} [mm]  SRF=${srf.toFixed(4)}  FS=${st.fs.toFixed(4)}` + (st.geo5 ? `  (GEO5 ${st.geo5.toFixed(2)})` : ""),
    deformScale: parseFloat(inpDef.value) || 0, u, uel: st.uel,
  });
}

function fillStepSelect() {
  const si = Math.min(parseInt(selStage.value || "0"), stages.length - 1), st = stages[si]; if (!st) return;
  selStep.innerHTML = `<option value="-1">último convergido (FS=${st.fs.toFixed(4)})</option>` + st.steps.map((s, k) => `<option value="${k}">SRF ${s.srf.toFixed(4)}</option>`).join("");
}

function run() {
  if (!base) return;
  model = currentModel();
  plot?.setModel(model);
  const keepStage = selStage.value;
  btn.disabled = true; logEl.textContent = ""; stages = [];
  worker?.terminate();
  worker = new Worker(new URL("./geofem/worker.ts", import.meta.url), { type: "module" });
  const t0 = performance.now();
  worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const m = ev.data;
    if (m.type === "log") appendLog(m.line);
    else if (m.type === "stage") {
      stages.push(m.result as Stage);
      selStage.innerHTML = stages.map((s, i) => `<option value="${i}">${s.name}</option>`).join("");
      selStage.value = keepStage && parseInt(keepStage) < stages.length ? keepStage : String(stages.length - 1);
      fillStepSelect(); redraw();
      fsEl.innerHTML = `<table><tr><th>etapa</th><th>FS</th><th>GEO5</th><th>t</th></tr>` + stages.map((s) => `<tr><td>${s.name}</td><td class="ok">${s.fs.toFixed(4)}</td><td>${s.geo5 ? s.geo5.toFixed(2) : "—"}</td><td>${s.seconds.toFixed(1)} s</td></tr>`).join("") + `</table>`;
    } else if (m.type === "done") { btn.disabled = false; appendLog(`(navegador: ${m.seconds.toFixed(1)} s · ${((performance.now() - t0) / 1000).toFixed(1)} s con el render)`); }
    else if (m.type === "error") { btn.disabled = false; appendLog("ERROR: " + m.message); }
  };
  worker.postMessage({ type: "run", model, nstages: parseInt(selN.value) });
}

btn.addEventListener("click", run);
selModel.addEventListener("change", () => loadModel(selModel.value));
selStage.addEventListener("change", () => { fillStepSelect(); redraw(); });
for (const el of [selField, selStep, chkMesh, inpDef]) el.addEventListener("change", redraw);
inpDef.addEventListener("input", redraw);
loadModel(selModel.value);
