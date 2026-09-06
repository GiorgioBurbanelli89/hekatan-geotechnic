// Hekatan Geotechnic · página principal. Como Hekatan Struct: calcula AL ABRIR y al mover cualquier slider,
// sin botón. Dos fuentes de modelo: la Demo04 con la MALLA EXACTA de GEO5 (referencia) y el editor .hgeo
// (geometría + suelos + capas + etapas → mallador propio T6). Cada etapa es independiente (arranca de
// cero con su carga total, como GEO5): un slider recalcula solo la etapa visible.
import type { GeoModel } from "./geofem/solver";
import type { WorkerOut } from "./geofem/worker";
import { SlopePlot } from "./viewer/plot";
import { FieldKind, nodalField } from "./viewer/geo5scale";
import { parseHgeo, DEMO04_HGEO, SlopeDef } from "./model/dsl";
import { meshSlope } from "./mesh/mesher";

type Stage = { name: string; fs: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; seconds: number; stale?: boolean };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const selModel = $<HTMLSelectElement>("model"), selN = $<HTMLSelectElement>("nstages"), btn = $<HTMLButtonElement>("run");
const selStage = $<HTMLSelectElement>("stage"), selField = $<HTMLSelectElement>("field"), selStep = $<HTMLSelectElement>("step");
const inpDef = $<HTMLInputElement>("defscale"), chkMesh = $<HTMLInputElement>("mesh"), chkAuto = $<HTMLInputElement>("auto");
const logEl = $<HTMLDivElement>("log"), fsEl = $<HTMLDivElement>("fs"), matsEl = $<HTMLDivElement>("mats"), hoverEl = $<HTMLDivElement>("hover");
const slidersEl = $<HTMLDivElement>("sliders");
const canvas = $<HTMLCanvasElement>("plot");
const edWrap = $<HTMLDivElement>("editor"), edText = $<HTMLTextAreaElement>("hgeo"), edApply = $<HTMLButtonElement>("apply"), edMsg = $<HTMLDivElement>("edmsg");

let base: GeoModel | null = null;      // modelo tal cual (fixture GEO5 o malla del DSL)
let model: GeoModel | null = null;     // base + sliders
let def: SlopeDef | null = null;       // definición del DSL (null si es la fixture)
let plot: SlopePlot | null = null;
let stages: (Stage | undefined)[] = [];
let worker: Worker | null = null;
let timer: number | undefined;
let busy = false;

// ---- sliders ----
type Slider = { id: string; label: string; min: number; max: number; step: number; value: number };
let sliders: Slider[] = [];
const sliderEl: Record<string, HTMLInputElement> = {};
const Q0 = 35, A0 = 72;   // sobrecarga y ancla de la Demo04 (kPa, kN): en la fixture las cargas nodales se escalan

function buildSliders(m: GeoModel) {
  const names = m.MATNAMES ?? m.MAT.map((_, i) => `SOIL_${i + 1}`);
  sliders = [];
  m.MAT.forEach((M, i) => {
    const sub = "₁₂₃₄₅₆₇₈₉"[i] ?? String(i + 1);
    sliders.push({ id: `phi${i}`, label: `φ${sub} [°]`, min: 5, max: 45, step: 0.1, value: M[2] });
    sliders.push({ id: `c${i}`, label: `c${sub} [kPa]`, min: 0, max: Math.max(60, 2 * M[3]), step: 0.5, value: M[3] });
    sliders.push({ id: `g${i}`, label: `γ${sub} [kN/m³]`, min: 14, max: 24, step: 0.1, value: M[4] });
  });
  if (!def) {   // solo la fixture: q y ancla escalan Fs/Fa. En el DSL las cargas se escriben en el texto.
    sliders.push({ id: "q", label: "q [kPa]", min: 0, max: 100, step: 1, value: Q0 });
    sliders.push({ id: "A", label: "ancla [kN]", min: 0, max: 200, step: 1, value: A0 });
  }
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
  matsEl.innerHTML = names.map((n, i) => `<b>${n}</b>: E=${m.MAT[i][0]} kPa · ν=${m.MAT[i][1]}`).join(" · ")
    + `<br>${m.X.length} nudos · ${m.ELE.length} T6 · ${m.FIXED.length} gdl fijos`;
}

const visibleStage = () => Math.min(parseInt(selStage.value || "0"), parseInt(selN.value) - 1, (base?.stages.length ?? 1) - 1);

/** Modelo con los sliders aplicados. Con todo en el valor base es el modelo exacto (gravedad de GEO5 en la fixture). */
function currentModel(): GeoModel {
  const v = (id: string) => parseFloat(sliderEl[id].value);
  const b = base!;
  const MAT = b.MAT.map((r, i) => { const r2 = r.slice(); r2[2] = v(`phi${i}`); r2[3] = v(`c${i}`); r2[4] = v(`g${i}`); return r2; });
  const gammaChanged = MAT.some((r, i) => r[4] !== b.MAT[i][4]);
  const isBase = sliders.every((s) => parseFloat(sliderEl[s.id].value) === s.value);
  const st = b.stages.map((x) => ({ ...x, geo5: isBase ? x.geo5 : undefined }));   // la referencia GEO5 solo vale con los valores del modelo
  const out: GeoModel = { ...b, MAT, stages: st, recomputeGravity: b.recomputeGravity || gammaChanged };
  if (!def) { const q = v("q") / Q0, A = v("A") / A0; out.Fs = b.Fs.map((x) => x * q); out.Fa = b.Fa.map((x) => x * A); }
  return out;
}

function setBase(m: GeoModel) {
  base = m; model = m;
  if (!plot) plot = new SlopePlot(canvas, m); else plot.setMesh(m);
  plot.hover = ({ x, z, v }) => { hoverEl.textContent = v === null ? "" : `x = ${x.toFixed(2)} m   z = ${z.toFixed(2)} m   valor = ${v.toFixed(2)} mm`; };
  buildSliders(m);
  stages = []; fsEl.innerHTML = "";
  selN.innerHTML = m.stages.map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).reverse().join("");
  selN.value = String(m.stages.length);
  selStage.innerHTML = m.stages.map((s, i) => `<option value="${i}">${s.name}</option>`).join("");
  selStage.value = "0"; selStep.innerHTML = "";
  plot.draw({ field: "dx", vals: new Float64Array(m.X.length), title: m.name || "", stage: 0, showMesh: true });
  run(m.stages.map((_, i) => i));   // como Struct: calcula al abrir / al aplicar
}

async function loadFixture(url: string) {
  const baseUrl = import.meta.env.BASE_URL || "./";
  const m = (await (await fetch(baseUrl + url)).json()) as GeoModel;
  def = null; edWrap.hidden = true;
  setBase(m);
}

function applyHgeo() {
  try {
    const t0 = performance.now();
    def = parseHgeo(edText.value);
    const { model: m, stats } = meshSlope(def);
    m.MATNAMES = def.soils.map((s) => s.name);
    m.name = `Talud .hgeo`;
    edMsg.textContent = `malla: ${stats.elements} T6 · ${stats.nodes} nudos · ángulo mín ${stats.minAngle.toFixed(1)}° · arista media ${stats.meanEdge.toFixed(2)} m · área ${stats.area.toFixed(1)} m² · ${((performance.now() - t0) / 1000).toFixed(2)} s`;
    edMsg.style.color = "";
    setBase(m);
  } catch (e) { edMsg.textContent = "✖ " + (e as Error).message; edMsg.style.color = "#e5382b"; }
}

function appendLog(line: string) {
  const cls = line.startsWith("    SRM") ? "srm" : line.includes(">>> FS=") ? "fsl" : line.includes("DIVERGE") ? "div" : "";
  const span = document.createElement("span"); if (cls) span.className = cls; span.textContent = line + "\n"; logEl.appendChild(span);
  if (logEl.childElementCount > 2000) logEl.removeChild(logEl.firstChild!);
  logEl.scrollTop = logEl.scrollHeight;
}

function fsTable() {
  const rows = stages.map((s) => s ? `<tr${s.stale ? ' style="opacity:.45"' : ""}><td>${s.name}${s.stale ? " ⟳" : ""}</td><td class="ok">${s.fs.toFixed(4)}</td><td>${s.geo5 ? s.geo5.toFixed(2) : "—"}</td><td>${s.seconds.toFixed(1)} s</td></tr>` : "").join("");
  fsEl.innerHTML = `<table><tr><th>etapa</th><th>FS</th><th>GEO5</th><th>t</th></tr>${rows}</table>` + (busy ? `<div style="color:var(--oro);margin-top:4px">calculando…</div>` : "");
}

/** cargas de la etapa sin gravedad (para dibujar sobrecargas y anclas) */
function stageLoads(si: number): Float64Array {
  const m = model!; const F = new Float64Array(2 * m.X.length);
  const LOADS: Record<string, number[]> = { ...(m.loads || {}), Fs: m.Fs, Fa: m.Fa };
  for (const nm of m.stages[si].loads) { const v = LOADS[nm]; if (!v || nm === "Fg") continue; for (let d = 0; d < F.length; d++) F[d] += v[d]; }
  return F;
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
    field: kind, vals, stage: si, Fst: stageLoads(si), showMesh: chkMesh.checked,
    title: `${model.name || "Talud"} · ${st.name} - ${lab} [mm]  SRF=${srf.toFixed(4)}  FS=${st.fs.toFixed(4)}` + (st.geo5 ? `  (GEO5 ${st.geo5.toFixed(2)})` : "") + (st.stale ? "  ⟳ desactualizada" : ""),
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
selModel.addEventListener("change", () => { if (selModel.value === "hgeo") { edWrap.hidden = false; if (!edText.value.trim()) edText.value = DEMO04_HGEO; applyHgeo(); } else loadFixture(selModel.value); });
edApply.addEventListener("click", applyHgeo);
edText.addEventListener("keydown", (ev) => { if (ev.ctrlKey && ev.key === "Enter") applyHgeo(); });
selStage.addEventListener("change", () => { const i = visibleStage(); if (!stages[i] || stages[i]!.stale) run([i]); else { fillStepSelect(); redraw(); } });
for (const el of [selField, selStep, chkMesh, inpDef]) el.addEventListener("change", redraw);
inpDef.addEventListener("input", redraw);
edText.value = DEMO04_HGEO;
loadFixture(selModel.value);
