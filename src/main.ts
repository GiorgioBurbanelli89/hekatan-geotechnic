// Hekatan Geotechnic · página principal. Como Hekatan Struct: calcula AL ABRIR y al mover cualquier slider,
// sin botón. Dos fuentes de modelo: la Demo04 con la MALLA EXACTA de GEO5 (referencia) y el editor .hgeo
// (márgenes + interfaces + asignación por punto, paradigma GEO5) con herramientas de dibujo sobre el
// lienzo (draw.ts) que reescriben el texto y remallan. Cada etapa es independiente (arranca de cero con
// su carga total, como GEO5): un slider recalcula solo la etapa visible.
import type { GeoModel } from "./geofem/solver";
import type { WorkerOut } from "./geofem/worker";
import { SlopePlot } from "./viewer/plot";
import { FieldKind, nodalField } from "./viewer/geo5scale";
import { parseHgeo, serializeHgeo, terrainFromParam, DEMO04_HGEO, SlopeDef, interfaceY, spanInterface } from "./model/dsl";
import { meshSlope } from "./mesh/mesher";
import { DrawTools, Tool, regionOf } from "./viewer/draw";

type Stage = { name: string; fs: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; seconds: number; stale?: boolean };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const selModel = $<HTMLSelectElement>("model"), selN = $<HTMLSelectElement>("nstages"), btn = $<HTMLButtonElement>("run");
const selStage = $<HTMLSelectElement>("stage"), selField = $<HTMLSelectElement>("field"), selStep = $<HTMLSelectElement>("step");
const inpDef = $<HTMLInputElement>("defscale"), chkMesh = $<HTMLInputElement>("mesh"), chkAuto = $<HTMLInputElement>("auto");
const logEl = $<HTMLDivElement>("log"), fsEl = $<HTMLDivElement>("fs"), matsEl = $<HTMLDivElement>("mats"), hoverEl = $<HTMLDivElement>("hover");
const slidersEl = $<HTMLDivElement>("sliders");
const canvas = $<HTMLCanvasElement>("plot"), drawCanvas = $<HTMLCanvasElement>("draw");
const edWrap = $<HTMLDivElement>("editor"), edText = $<HTMLTextAreaElement>("hgeo"), edApply = $<HTMLButtonElement>("apply"), edMsg = $<HTMLDivElement>("edmsg");
const dStatus = $<HTMLDivElement>("dstatus"), dSoil = $<HTMLSelectElement>("dsoil"), dStage = $<HTMLSelectElement>("dstage");
const cmdIn = $<HTMLInputElement>("cmdin"), cmdHist = $<HTMLDivElement>("cmdhist"), cmdPrompt = $<HTMLSpanElement>("cmdprompt");

let base: GeoModel | null = null;      // modelo tal cual (fixture GEO5 o malla del DSL)
let model: GeoModel | null = null;     // base + sliders
let def: SlopeDef | null = null;       // definición del DSL (null si es la fixture)
let plot: SlopePlot | null = null;
let stages: (Stage | undefined)[] = [];
let worker: Worker | null = null;
let timer: number | undefined;
let busy = false;
const draw = new DrawTools(drawCanvas);

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
  if (!def) {   // solo la fixture: q y ancla escalan Fs/Fa. En el DSL las cargas se dibujan/escriben.
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
  buildGeomSliders();
}

// ---- sliders GEOMÉTRICOS (terreno paramétrico `talud …`): cambian la geometría → remallan → recalculan ----
let gtimer: number | undefined;
let geomSliding = false;   // mientras se arrastra un slider geométrico no se reconstruye el panel (el elemento bajo el ratón no se sustituye)
function buildGeomSliders() {
  const g = $<HTMLDivElement>("gsliders");
  if (geomSliding && g.children.length) return;
  g.innerHTML = "";
  if (!def) return;
  if (!def.param) { buildDrawnSliders(g); return; }
  const pm = def.param;
  const rows: { key: keyof typeof pm; label: string; min: number; max: number; step: number }[] = [
    { key: "H", label: "altura H [m]", min: 1, max: 15, step: 0.1 },
    { key: "beta", label: "talud β [°]", min: 10, max: 75, step: 0.5 },
    { key: "corona", label: "corona [m]", min: 0, max: 20, step: 0.5 },
    { key: "xpie", label: "x pie [m]", min: 2, max: 25, step: 0.5 },
  ];
  for (const r of rows) {
    const row = document.createElement("div"); row.className = "sl";
    row.innerHTML = `<span class="n">${r.label}</span><input type="range" id="gs_${r.key}" min="${r.min}" max="${r.max}" step="${r.step}" value="${pm[r.key]}"><span class="v" id="gv_${r.key}">${pm[r.key]}</span>`;
    g.appendChild(row);
    const inp = row.querySelector("input") as HTMLInputElement;
    inp.addEventListener("input", () => {
      $<HTMLSpanElement>("gv_" + r.key).textContent = inp.value;
      if (!def?.param) return;
      def.param[r.key] = parseFloat(inp.value);
      def.interfaces[0] = terrainFromParam(def.param, def.margins!.xmin, def.margins!.xmax);
      for (const st of def.stages) delete st.geo5;   // geometría distinta de la escrita: la referencia GEO5 ya no vale
      draw.render();
      clearTimeout(gtimer); gtimer = window.setTimeout(() => applyDef(def!, false, [visibleStage()]), 300);
    });
  }
}
/** Talud DIBUJADO (sin `talud …`): también tiene parámetros. Un slider por coordenada de cada vértice del terreno
 *  (x acotada entre sus vecinos, z entre el fondo y el techo) y uno de subir/bajar cada capa. Mueven la geometría
 *  → reescriben el .hgeo → remallan → recalculan la etapa visible, igual que los sliders del talud paramétrico. */
function buildDrawnSliders(g: HTMLDivElement) {
  if (!def?.margins || !def.interfaces[0]?.length) return;
  const d = def, m = def.margins, ter = d.interfaces[0];
  const zTop = Math.max(...ter.map((p) => p[1])) + 6, zBot = m.bottom + 0.5;
  const head = (t: string) => { const h = document.createElement("div"); h.className = "sl"; h.style.display = "block"; h.style.color = "var(--oro)"; h.style.fontWeight = "600"; h.style.marginTop = "6px"; h.textContent = t; g.appendChild(h); };
  const push = (key: string, label: string, min: number, max: number, step: number, val: number, onInput: (v: number) => void) => {
    const row = document.createElement("div"); row.className = "sl";
    row.innerHTML = `<span class="n">${label}</span><input type="range" id="gs_${key}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="v" id="gv_${key}">${val}</span>`;
    g.appendChild(row);
    const inp = row.querySelector("input") as HTMLInputElement;
    inp.addEventListener("input", () => {
      geomSliding = true; $<HTMLSpanElement>("gv_" + key).textContent = inp.value; onInput(parseFloat(inp.value));
      for (const st of d.stages) delete st.geo5;
      draw.render();
      clearTimeout(gtimer); gtimer = window.setTimeout(() => applyDef(d, false, [visibleStage()]), 300);
    });
    inp.addEventListener("change", () => { geomSliding = false; window.setTimeout(buildGeomSliders, 350); });   // suelto el ratón: cotas nuevas
  };
  head("terreno (puntos)");
  ter.forEach((p, k) => {
    if (k > 0 && k < ter.length - 1) push(`x${k}`, `P${k + 1} x [m]`, ter[k - 1][0], ter[k + 1][0], 0.1, p[0], (v) => { ter[k][0] = v; });
    push(`z${k}`, `P${k + 1} z [m]`, zBot, zTop, 0.1, p[1], (v) => { ter[k][1] = v; });
  });
  if (d.interfaces.length > 1) head("capas (cota del techo en el centro)");
  const xmid = (m.xmin + m.xmax) / 2;
  const yAt = (it: number, x: number) => interfaceY(spanInterface(d.interfaces[it], m.xmin, m.xmax), x);
  for (let i = 1; i < d.interfaces.length; i++) {
    const base = d.interfaces[i].map((p) => [p[0], p[1]] as [number, number]);
    const z0 = yAt(i, xmid);
    // los puntos de asignación que están en la región de ESTA capa (bajo la interfaz i y sobre la i+1) la acompañan
    const mine = d.assign.filter((a) => regionOf(d, a.p) === i + 1).map((a) => ({ a, z: a.p[1] }));
    push(`dz${i}`, `${d.soils[i]?.name ?? "capa " + (i + 1)} techo z [m]`, zBot, zTop, 0.1, Math.round(z0 * 10) / 10, (v) => {
      const dz = v - z0;
      d.interfaces[i].forEach((p, k) => { p[1] = base[k][1] + dz; });
      for (const { a, z } of mine) {   // sigue a la capa, pero siempre dentro de ella
        const top = yAt(i, a.p[0]), bot = i + 1 < d.interfaces.length ? yAt(i + 1, a.p[0]) : m.bottom;
        a.p[1] = Math.min(top - 0.3, Math.max(bot + 0.3, z + dz));
      }
    });
  }
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

function setBase(m: GeoModel, only?: number[]) {
  base = m; model = m;
  if (!plot) {
    plot = new SlopePlot(canvas, m);
    plot.dark = new URLSearchParams(location.search).get("tema") === "oscuro";   // ?tema=oscuro → gráfica fondo negro (vídeos)
    if (plot.dark) { plot.k = 3; draw.k = 3; for (const c of [canvas, drawCanvas]) { c.width = 2360; c.height = 1400; } }   // lienzo 2x y textos 3x (=1.5x relativos): en el vídeo la gráfica baja a ~700 px de ancho
  } else plot.setMesh(m);
  plot.hover = ({ x, z, v }) => { if (!draw.active) hoverEl.textContent = v === null ? "" : `x = ${x.toFixed(2)} m   z = ${z.toFixed(2)} m   valor = ${v.toFixed(2)} mm`; };
  buildSliders(m);
  stages = []; fsEl.innerHTML = "";
  selN.innerHTML = m.stages.map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).reverse().join("");
  selN.value = String(m.stages.length);
  selStage.innerHTML = m.stages.map((s, i) => `<option value="${i}">${s.name}</option>`).join("");
  if (!only) selStage.value = "0"; selStep.innerHTML = "";
  dStage.innerHTML = m.stages.map((s, i) => `<option value="${i}">${s.name}</option>`).join("");
  plot.draw({ field: "dx", vals: new Float64Array(m.X.length), title: m.name || "", stage: 0, showMesh: true });
  draw.setMap(plot.mapping());
  if (only) { selStage.value = String(only[0]); for (const i of m.stages.keys()) if (!only.includes(i)) stages[i] = undefined; }
  run(only ?? m.stages.map((_, i) => i));   // como Struct: calcula al abrir / al aplicar (un slider geométrico: solo la etapa visible)
}

async function loadFixture(url: string) {
  const baseUrl = import.meta.env.BASE_URL || "./";
  const m = (await (await fetch(baseUrl + url)).json()) as GeoModel;
  def = null; edWrap.hidden = true; setTool("ver"); draw.setDef({ outline: [], soils: [], layers: [], h: 1, stages: [], interfaces: [], assign: [], comments: [] });
  setBase(m);
}

function applyDef(d: SlopeDef, fromText: boolean, only?: number[]) {
  try {
    const t0 = performance.now();
    def = d;
    const hayTerreno = !!def.interfaces[0]?.length || def.outline.length >= 3;   // `interfaz` (GEO5) o `contorno` (DSL viejo)
    if (!hayTerreno || !def.soils.length) {   // BORRADOR: todavía no se puede mallar → hoja en blanco para dibujar
      if (!def.margins) def.margins = { xmin: 0, xmax: 40, bottom: -20 };
      const mg = def.margins, top = mg.bottom + Math.max(10, 0.6 * (mg.xmax - mg.xmin));
      if (!fromText) edText.value = serializeHgeo(def);
      dSoil.innerHTML = def.soils.map((s) => `<option value="${s.name}">${s.name}</option>`).join("");
      if (!draw.state.soil || !def.soils.some((s) => s.name === draw.state.soil)) draw.state.soil = def.soils[0]?.name ?? "";
      model = null; stages = []; fsEl.innerHTML = ""; matsEl.innerHTML = ""; $<HTMLDivElement>("sliders").innerHTML = ""; buildGeomSliders();   // sin malla no hay sliders de suelo; sí los de geometría
      plot!.blank(mg, top, !def.interfaces[0]?.length ? "borrador · dibuja el terreno: interfaz de margen a margen" : "borrador · falta un suelo: suelo NOMBRE E= nu= phi= c= gamma=");
      draw.sheetTop = top; draw.setDef(def); draw.setMap(plot!.mapping());
      (window as unknown as { __geoMap: unknown }).__geoMap = plot!.mapping();
      edMsg.textContent = !def.interfaces[0]?.length ? "borrador: falta el terreno (dibújalo con «interfaz» o escríbelo)" : "borrador: falta al menos un suelo"; edMsg.style.color = "var(--oro)";
      draw.prompt(); return;
    }
    const { model: m, stats } = meshSlope(def);
    m.MATNAMES = def.soils.map((s) => s.name);
    m.name = `Talud .hgeo`;
    edMsg.textContent = `malla: ${stats.elements} T6 · ${stats.nodes} nudos · ángulo mín ${stats.minAngle.toFixed(1)}° · arista media ${stats.meanEdge.toFixed(2)} m · área ${stats.area.toFixed(1)} m² · ${((performance.now() - t0) / 1000).toFixed(2)} s`;
    edMsg.style.color = "";
    if (!fromText) edText.value = serializeHgeo(def);   // el dibujo escribe el texto
    dSoil.innerHTML = def.soils.map((s) => `<option value="${s.name}">${s.name}</option>`).join("");
    if (!draw.state.soil || !def.soils.some((s) => s.name === draw.state.soil)) draw.state.soil = def.soils[0]?.name ?? "";
    dSoil.value = draw.state.soil;
    draw.setDef(def);
    setBase(m, only);
  } catch (e) { edMsg.textContent = "✖ " + (e as Error).message; edMsg.style.color = "#e5382b"; }
}
function applyHgeo() { try { applyDef(parseHgeo(edText.value, { draft: true }), true); } catch (e) { edMsg.textContent = "✖ " + (e as Error).message; edMsg.style.color = "#e5382b"; } }

function appendLog(line: string) {
  const cls = line.startsWith("    SRM") ? "srm" : line.includes(">>> FS=") ? "fsl" : line.includes("DIVERGE") ? "div" : "";
  const span = document.createElement("span"); if (cls) span.className = cls; span.textContent = line + "\n"; logEl.appendChild(span);
  if (logEl.childElementCount > 2000) logEl.removeChild(logEl.firstChild!);
  logEl.scrollTop = logEl.scrollHeight;
}

function fsTable() {
  const rows = stages.map((s) => s ? `<tr${s.stale ? ' style="opacity:.45"' : ""}><td>${s.name}${s.stale ? " ⟳" : ""}</td><td class="ok"${s.steps.length ? "" : ' style="color:#e5382b"'}>${s.steps.length ? s.fs.toFixed(4) : "< 1 ✖ falla"}</td><td>${s.geo5 ? s.geo5.toFixed(2) : "—"}</td><td>${s.seconds.toFixed(1)} s</td></tr>` : "").join("");
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
  if (!st) { draw.setMap(plot.mapping()); return; }
  const kind = selField.value as FieldKind;
  const stepIdx = parseInt(selStep.value || "-1");
  const u = stepIdx >= 0 && st.steps[stepIdx] ? st.steps[stepIdx].u : st.u;
  const srf = stepIdx >= 0 && st.steps[stepIdx] ? st.steps[stepIdx].srf : st.fs;
  const vals = nodalField(u, st.uel, model.X.length, kind);
  const lab = { dx: "d_x", dz: "d_z", d: "d" }[kind];
  plot.draw({
    field: kind, vals, stage: si, Fst: stageLoads(si), showMesh: chkMesh.checked,
    title: `${model.name || "Talud"} · ${st.name} - ${lab} [mm]  ${st.steps.length ? `SRF=${srf.toFixed(4)}  FS=${st.fs.toFixed(4)}` : "FALLA con los parámetros reales (FS < 1)"}` + (st.geo5 ? `  (GEO5 ${st.geo5.toFixed(2)})` : "") + (st.stale ? "  ⟳ desactualizada" : ""),
    deformScale: parseFloat(inpDef.value) || 0, u, uel: st.uel,
  });
  draw.setMap(plot.mapping());
  (window as unknown as { __geoMap: unknown }).__geoMap = plot.mapping();   // para el arnés puppeteer (clics en coordenadas del mundo)
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

// ---- herramientas de dibujo ----
function setTool(t: Tool) {
  draw.state.tool = t;
  document.querySelectorAll<HTMLButtonElement>(".tb[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
  drawCanvas.style.pointerEvents = t === "ver" ? "none" : "auto";
  if (t !== "ver" && selModel.value !== "hgeo") { selModel.value = "hgeo"; edWrap.hidden = false; if (!edText.value.trim()) edText.value = DEMO04_HGEO; applyHgeo(); }
  draw.prompt();
  dStatus.textContent = { ver: "", interfaz: "interfaz: clic a clic de margen a margen; Enter o doble clic termina, Esc cancela, Retroceso quita el último", asignar: "asignar: clic dentro de una región", sobrecarga: "sobrecarga: dos clics sobre el terreno", ancla: "ancla: clic en la cabeza", mover: "mover: arrastra un vértice", borrar: "borrar: clic en un vértice o en una interfaz" }[t];
  draw.render();
}
document.querySelectorAll<HTMLButtonElement>(".tb[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool as Tool)));
$<HTMLButtonElement>("undo").addEventListener("click", () => draw.undo());
$<HTMLInputElement>("grid").addEventListener("change", (e) => { draw.state.grid = parseFloat((e.target as HTMLInputElement).value) || 1; draw.render(); });
$<HTMLInputElement>("snap").addEventListener("change", (e) => { draw.state.snap = (e.target as HTMLInputElement).checked; });
$<HTMLInputElement>("osnap").addEventListener("change", (e) => { draw.state.osnap = (e.target as HTMLInputElement).checked; });
$<HTMLInputElement>("ortho").addEventListener("change", (e) => { draw.state.ortho = (e.target as HTMLInputElement).checked; });
dSoil.addEventListener("change", () => { draw.state.soil = dSoil.value; });
$<HTMLInputElement>("dq").addEventListener("change", (e) => { draw.state.q = parseFloat((e.target as HTMLInputElement).value) || 0; });
$<HTMLInputElement>("dF").addEventListener("change", (e) => { draw.state.F = parseFloat((e.target as HTMLInputElement).value) || 0; });
$<HTMLInputElement>("dang").addEventListener("change", (e) => { draw.state.ang = parseFloat((e.target as HTMLInputElement).value) || 0; });
dStage.addEventListener("change", () => { draw.state.stage = parseInt(dStage.value) || 0; });
draw.onStatus = (m) => { dStatus.textContent = m; };
// ---- línea de órdenes (AutoCAD): historial + prompt + entrada; teclear sobre el lienzo va a la entrada ----
draw.onEcho = (l) => { if (!l) return; const e = document.createElement("div"); e.textContent = l; cmdHist.appendChild(e); while (cmdHist.children.length > 4) cmdHist.firstChild!.remove(); };
draw.onPrompt = (p) => {   // tras cada orden: prompt + la barra refleja lo escrito (etapa 3, q=30, F=150, suelo …)
  cmdPrompt.textContent = p;
  const st = draw.state; if (dStage.options.length) dStage.value = String(Math.min(st.stage, dStage.options.length - 1)); if (st.soil) dSoil.value = st.soil;
  $<HTMLInputElement>("dq").value = String(st.q); $<HTMLInputElement>("dF").value = String(st.F); $<HTMLInputElement>("dang").value = String(st.ang); $<HTMLInputElement>("grid").value = String(st.grid);
  $<HTMLInputElement>("snap").checked = st.snap; $<HTMLInputElement>("osnap").checked = st.osnap; $<HTMLInputElement>("ortho").checked = st.ortho;
};
draw.onTool = (t) => setTool(t);
// ---- ARCHIVO: nuevo / abrir / guardar (.hgeo). Un modelo = un fichero de texto. ----
function nuevoModelo() { selModel.value = "hgeo"; edWrap.hidden = false; edText.value = "# modelo nuevo"; draw.state.soil = ""; applyHgeo(); draw.command("interfaz"); }
$<HTMLButtonElement>("fNuevo").addEventListener("click", nuevoModelo);
$<HTMLButtonElement>("fAbrir").addEventListener("click", () => $<HTMLInputElement>("fFile").click());
$<HTMLInputElement>("fFile").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  selModel.value = "hgeo"; edWrap.hidden = false; edText.value = await f.text(); applyHgeo(); (e.target as HTMLInputElement).value = "";
});
$<HTMLButtonElement>("fGuardar").addEventListener("click", () => {
  const txt = edText.value.trim() ? edText.value : (def ? serializeHgeo(def) : "");
  const nombre = (txt.match(/^#\s*([^\n]+)/)?.[1] ?? "talud").trim().replace(/[^\w\-]+/g, "_").slice(0, 40) || "talud";
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); a.download = nombre + ".hgeo"; a.click(); URL.revokeObjectURL(a.href);
});
draw.onDsl = (line) => {
  if (line.toLowerCase() === "nuevo" || line.toLowerCase() === "new") { nuevoModelo(); return; }
  if (selModel.value !== "hgeo") { selModel.value = "hgeo"; edWrap.hidden = false; }
  edText.value = (edText.value.trimEnd() + "\n" + line).replace(/^\n/, "");
  applyHgeo();
};
cmdIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const v = cmdIn.value; cmdIn.value = ""; draw.command(v); }
  else if (e.key === "Escape") { cmdIn.value = ""; draw.cancel(); }
  else if (e.key === "F3" || e.key === "F8" || e.key === "F9") { e.preventDefault(); draw.command(e.key.toLowerCase()); }
});
window.addEventListener("keydown", (e) => {   // entrada dinámica: si escribes con el ratón sobre el lienzo, va a la línea de órdenes
  const tag = (e.target as HTMLElement)?.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { cmdIn.focus(); }
});
draw.onChange = (d) => {
  for (const st of d.stages) delete st.geo5; $<HTMLInputElement>("snap").checked = draw.state.snap; $<HTMLInputElement>("osnap").checked = draw.state.osnap; $<HTMLInputElement>("ortho").checked = draw.state.ortho; applyDef(d, false);
  // una carga dibujada en la etapa N → se muestra la etapa N (si no, el ancla "no aparece")
  // (solo se cambia la etapa VISIBLE; el recálculo de todas ya lo lanzó applyDef y redraw la pinta al llegar)
  const t = draw.state.tool; if ((t === "sobrecarga" || t === "ancla") && model && draw.state.stage < model.stages.length && String(draw.state.stage) !== selStage.value) { selStage.value = String(draw.state.stage); fillStepSelect(); redraw(); }
};

btn.addEventListener("click", () => run(base!.stages.map((_, i) => i).slice(0, parseInt(selN.value))));
selN.addEventListener("change", () => { const n = parseInt(selN.value); const falta = base!.stages.map((_, i) => i).slice(0, n).filter((i) => !stages[i] || stages[i]!.stale); if (falta.length) run(falta); });
selModel.addEventListener("change", () => { if (selModel.value === "hgeo") { edWrap.hidden = false; if (!edText.value.trim()) edText.value = DEMO04_HGEO; applyHgeo(); } else loadFixture(selModel.value); });
edApply.addEventListener("click", applyHgeo);
edText.addEventListener("keydown", (ev) => { if (ev.ctrlKey && ev.key === "Enter") applyHgeo(); });
selStage.addEventListener("change", () => { const i = visibleStage(); if (!stages[i] || stages[i]!.stale) run([i]); else { fillStepSelect(); redraw(); } });
for (const el of [selField, selStep, chkMesh, inpDef]) el.addEventListener("change", redraw);
inpDef.addEventListener("input", redraw);
edText.value = DEMO04_HGEO;
setTool("ver");
loadFixture(selModel.value);
