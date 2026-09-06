// Hekatan Geotechnic · página principal: carga el modelo, lanza el worker, pinta el campo con la escala de GEO5.
import type { GeoModel } from "./geofem/solver";
import type { WorkerOut } from "./geofem/worker";
import { SlopePlot } from "./viewer/plot";
import { FieldKind, nodalField } from "./viewer/geo5scale";

type Stage = { name: string; fs: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; seconds: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const selModel = $<HTMLSelectElement>("model"), selN = $<HTMLSelectElement>("nstages"), btn = $<HTMLButtonElement>("run");
const selStage = $<HTMLSelectElement>("stage"), selField = $<HTMLSelectElement>("field"), selStep = $<HTMLSelectElement>("step");
const inpDef = $<HTMLInputElement>("defscale"), chkMesh = $<HTMLInputElement>("mesh");
const logEl = $<HTMLDivElement>("log"), fsEl = $<HTMLDivElement>("fs"), matsEl = $<HTMLDivElement>("mats"), hoverEl = $<HTMLDivElement>("hover");
const canvas = $<HTMLCanvasElement>("plot");

let model: GeoModel | null = null;
let plot: SlopePlot | null = null;
let stages: Stage[] = [];
let worker: Worker | null = null;

async function loadModel(url: string) {
  const base = import.meta.env.BASE_URL || "./";
  model = (await (await fetch(base + url)).json()) as GeoModel;
  plot = new SlopePlot(canvas, model);
  plot.hover = ({ x, z, v }) => { hoverEl.textContent = v === null ? "" : `x = ${x.toFixed(2)} m   z = ${z.toFixed(2)} m   valor = ${v.toFixed(2)} mm`; };
  matsEl.innerHTML = model.MAT.map((M, i) => `<b>SOIL_${i + 1}</b>: E=${M[0]} kPa · ν=${M[1]} · φ=${M[2]}° · c=${M[3]} kPa · γ=${M[4]} kN/m³`).join("<br>")
    + `<br>${model.X.length} nudos · ${model.ELE.length} T6 · ${model.FIXED.length} gdl fijos`;
  stages = []; fsEl.innerHTML = ""; selStage.innerHTML = ""; selStep.innerHTML = "";
  // vista inicial: malla sin campo
  const zero = new Float64Array(model.X.length);
  plot.draw({ field: "dx", vals: zero, title: model.name || "", stage: 0, showMesh: true });
}

function appendLog(line: string) {
  const cls = line.startsWith("    SRM") ? "srm" : line.includes(">>> FS=") ? "fsl" : line.includes("DIVERGE") ? "div" : "";
  const span = document.createElement("span"); if (cls) span.className = cls; span.textContent = line + "\n"; logEl.appendChild(span);
  if (logEl.childElementCount > 2000) logEl.removeChild(logEl.firstChild!);
  logEl.scrollTop = logEl.scrollHeight;
}

function redraw() {
  if (!model || !plot || !stages.length) return;
  const si = parseInt(selStage.value || "0"), st = stages[si];
  const kind = selField.value as FieldKind;
  const stepIdx = parseInt(selStep.value || "-1");
  const u = stepIdx >= 0 && st.steps[stepIdx] ? st.steps[stepIdx].u : st.u;
  const srf = stepIdx >= 0 && st.steps[stepIdx] ? st.steps[stepIdx].srf : st.fs;
  const vals = nodalField(u, st.uel, model.X.length, kind);
  const lab = { dx: "d_x", dz: "d_z", d: "d" }[kind];
  plot.draw({
    field: kind, vals, stage: si, showMesh: chkMesh.checked,
    title: `Talud Demo04 ${st.name} - ${lab} [mm]  SRF=${srf.toFixed(4)}  FS=${st.fs.toFixed(4)}  (GEO5 ${(st.geo5 ?? 0).toFixed(2)})`,
    deformScale: parseFloat(inpDef.value) || 0, u, uel: st.uel,
  });
}

function fillStepSelect() {
  const si = parseInt(selStage.value || "0"), st = stages[si]; if (!st) return;
  selStep.innerHTML = `<option value="-1">último convergido (FS=${st.fs.toFixed(4)})</option>` + st.steps.map((s, k) => `<option value="${k}">SRF ${s.srf.toFixed(4)}</option>`).join("");
}

function run() {
  if (!model) return;
  btn.disabled = true; logEl.textContent = ""; fsEl.innerHTML = ""; stages = []; selStage.innerHTML = ""; selStep.innerHTML = "";
  worker?.terminate();
  worker = new Worker(new URL("./geofem/worker.ts", import.meta.url), { type: "module" });
  const t0 = performance.now();
  worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const m = ev.data;
    if (m.type === "log") appendLog(m.line);
    else if (m.type === "stage") {
      stages.push(m.result as Stage);
      selStage.innerHTML = stages.map((s, i) => `<option value="${i}">${s.name}</option>`).join("");
      selStage.value = String(stages.length - 1); fillStepSelect(); redraw();
      fsEl.innerHTML = `<table><tr><th>etapa</th><th>FS</th><th>GEO5</th><th>t</th></tr>` + stages.map((s) => `<tr><td>${s.name}</td><td class="ok">${s.fs.toFixed(4)}</td><td>${(s.geo5 ?? 0).toFixed(2)}</td><td>${s.seconds.toFixed(1)} s</td></tr>`).join("") + `</table>`;
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
