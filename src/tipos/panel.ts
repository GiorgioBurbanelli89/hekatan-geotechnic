// Lista «Tipo de talud» (galería de plantillas, src/model/plantillas.ts) con POCOS controles. Al elegir un tipo o mover un control,
// se escribe el .hgeo del tipo y se abre por el camino de siempre (malla → SRM en el worker); aparte se calculan Bishop y
// Fellenius (con freático y sobrecarga) y se ponen en una tabla junto al FS de elementos finitos. Mientras hay un tipo activo se
// ocultan el editor .hgeo y los sliders generales (el botón «ver .hgeo» los devuelve). Elegir otro «Ejemplo» sale del tipo.
import { PLANTILLAS, plantilla, paramsPorDefecto, hgeoPlantilla, betaDeN, fsInfinito } from "../model/plantillas";
import { parseHgeo } from "../model/dsl";
import { criticalCircle, type LemOpts } from "../lem/slices";

type Api = { abrir: (texto: string) => void };
let actual = "", p: Record<string, number> = {}, api: Api | null = null, timer: number | undefined, fem: number[] = [];
const OPTS: LemOpts = { agua: true, cargas: true };
const $ = (id: string) => document.getElementById(id);
const f3 = (v?: number) => (v === undefined || !Number.isFinite(v) ? "…" : v.toFixed(3));

/** opciones del método analítico para la gráfica de main.ts: con un tipo activo cuentan el freático y la sobrecarga */
export const tipoLemOpts = (): LemOpts => (actual ? OPTS : {});
export const tipoActivo = () => actual;
/** FS de elementos finitos de la etapa i (lo llama main.ts al llegar cada etapa del worker) */
export function tipoFem(i: number, fs: number) { if (!actual) return; fem[i] = fs; tabla(); }

export function montarTipos(a: Api) {
  api = a;
  const sel0 = $("model") as HTMLSelectElement;
  const st = document.createElement("style");
  st.textContent = `body.tipoTalud #gsliders, body.tipoTalud #sliders, body.tipoTalud #editor { display: none !important; }
    body.tipoTalud.verHgeo #editor { display: block !important; }
    #tipoBox { border: 1px solid #6b5527; border-radius: 8px; padding: 6px 8px; margin: 8px 0; background: rgba(208,138,62,.06); }
    #tipoBox table { width: 100%; border-collapse: collapse; font-size: 12px; } #tipoBox td, #tipoBox th { padding: 1px 4px; text-align: left; }
    #tipoBox .gal { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 4px 0 6px; }
    #tipoBox .gal button { padding: 2px; font-size: 10.5px; line-height: 1.15; background: #0f0c07; color: var(--txt); border: 1px solid #4a3f28; border-radius: 6px; cursor: pointer; }
    #tipoBox .gal button.on { border-color: var(--oro); box-shadow: 0 0 0 1px var(--oro) inset; }
    #tipoBox .gal svg { display: block; width: 100%; height: 34px; }`;
  document.head.appendChild(st);
  const lab = document.createElement("label"); lab.textContent = "Tipo de talud"; lab.htmlFor = "tipoTaludSel";
  const sel = document.createElement("select"); sel.id = "tipoTaludSel"; sel.title = "galería de tipos de talud: cada uno con pocos controles; al elegir se genera y se calcula solo";
  sel.innerHTML = `<option value="">— elegir un tipo (o usar «Ejemplo») —</option>` + PLANTILLAS.map((t) => `<option value="${t.id}" title="${t.descripcion}">${t.nombre}</option>`).join("");
  const box = document.createElement("div"); box.id = "tipoBox";
  box.innerHTML = `<div class="gal">${PLANTILLAS.map((t) => `<button data-t="${t.id}" title="${t.descripcion}">${icono(t.id)}${t.nombre.split(" (")[0]}</button>`).join("")}</div><div id="tipoCtl"></div>`;
  sel0.after(lab, sel, box);
  sel.addEventListener("change", () => (sel.value ? elegir(sel.value) : salir()));
  box.querySelectorAll<HTMLButtonElement>(".gal button").forEach((b) => b.addEventListener("click", () => { sel.value = b.dataset.t!; elegir(b.dataset.t!); }));
  sel0.addEventListener("change", () => { if (actual) salir(); });   // otro «Ejemplo» → fuera del tipo
}
/** dibujito del perfil de cada tipo (para la galería) */
function icono(id: string): string {
  const P: Record<string, string> = {
    corte: "2,28 22,28 52,8 78,8", terraplen: "2,28 18,28 34,10 50,10 66,28 78,28", berma: "2,28 20,28 34,19 46,19 60,8 78,8",
    estratos: "2,28 22,28 52,8 78,8", muro: "2,28 24,28 24,18 34,18 56,6 78,6", ladera: "2,32 24,24 52,8 78,8",
  };
  const extra = id === "estratos" ? `<polyline points="37,18 78,18" stroke="#6aa3d8" stroke-width="1.5" fill="none" stroke-dasharray="3 2"/>`
    : id === "terraplen" ? `<polyline points="2,28 78,28" stroke="#6aa3d8" stroke-width="1" fill="none" stroke-dasharray="3 2"/>`
    : id === "muro" ? `<rect x="22" y="17" width="3" height="13" fill="#9a9a9a"/>` : "";
  return `<svg viewBox="0 0 80 36"><polygon points="${P[id]} 78,35 2,35" fill="rgba(208,138,62,.35)" stroke="#d08a3e" stroke-width="1.5"/>${extra}</svg>`;
}
function salir() {
  actual = ""; document.body.classList.remove("tipoTalud", "verHgeo"); const c = $("tipoCtl"); if (c) c.innerHTML = "";
  const s = $("tipoTaludSel") as HTMLSelectElement | null; if (s) s.value = "";
  document.querySelectorAll("#tipoBox .gal button").forEach((b) => b.classList.remove("on"));
}
export function elegir(id: string, dados: Record<string, number> = {}) {
  const t = plantilla(id); actual = id; p = { ...paramsPorDefecto(id), ...dados };
  document.body.classList.add("tipoTalud");
  document.querySelectorAll<HTMLButtonElement>("#tipoBox .gal button").forEach((b) => b.classList.toggle("on", b.dataset.t === id));
  const s = $("tipoTaludSel") as HTMLSelectElement | null; if (s) s.value = id;
  const c = $("tipoCtl")!;
  c.innerHTML = `<div class="mats" style="margin:2px 0 4px">${t.descripcion}</div>` + t.params.map((q) =>
    `<div class="sl"><span class="n">${q.label}${q.unit ? ` [${q.unit}]` : ""}</span><input type="range" id="tp_${q.key}" min="${q.min}" max="${q.max}" step="${q.step}" value="${p[q.key]}"><span class="v" id="tpv_${q.key}">${fmt(q.key, p[q.key])}</span></div>`).join("") +
    `<div id="tipoRes" class="mats" style="margin-top:4px"></div><button class="tb" id="tipoHgeo" style="width:100%;margin-top:4px">ver / editar el .hgeo generado</button>`;
  for (const q of t.params) {
    const inp = $("tp_" + q.key) as HTMLInputElement;
    inp.addEventListener("input", () => { p[q.key] = parseFloat(inp.value); $("tpv_" + q.key)!.textContent = fmt(q.key, p[q.key]); clearTimeout(timer); timer = window.setTimeout(generar, 400); });
  }
  $("tipoHgeo")!.addEventListener("click", () => document.body.classList.toggle("verHgeo"));
  generar();
}
const fmt = (k: string, v: number) => (k === "n" ? `1:${v} (β=${betaDeN(v).toFixed(1)}°)` : String(v));
let lem: { b?: number; f?: number } = {};
function generar() {
  if (!actual || !api) return;
  const txt = hgeoPlantilla(actual, p); fem = []; lem = {};
  api.abrir(txt); tabla();
  window.setTimeout(() => {   // equilibrio límite aparte (bloquea ~1–3 s): Bishop y Fellenius con freático y sobrecarga
    const id = actual, firma = txt;
    try {
      const d = parseHgeo(txt), b = criticalCircle(d, "bishop", 40, OPTS), f = criticalCircle(d, "fellenius", 40, OPTS);
      if (id !== actual || firma !== hgeoPlantilla(actual, p)) return;   // ya cambió
      lem = { b: b?.fs, f: f?.fs }; tabla();
    } catch (e) { const r = $("tipoRes"); if (r) r.textContent = "✖ " + (e as Error).message; }
  }, 60);
}
function tabla() {
  const r = $("tipoRes"); if (!r || !actual) return;
  const conQ = p.q > 0, inf = (p.c ?? 1) === 0 && !(p.hw > 0) && !conQ && actual === "corte" ? fsInfinito(p.phi, betaDeN(p.n)) : undefined;
  const femTxt = fem.length ? fem.map((v, i) => `${f3(v)}${fem.length > 1 || conQ ? (i === 0 ? " (peso propio)" : " (+ q)") : ""}`).join(" · ") : "calculando…";
  r.innerHTML = `<table><tr><th>Bishop</th><td id="tipoBishop">${f3(lem.b)}</td></tr><tr><th>Fellenius</th><td id="tipoFellenius">${f3(lem.f)}</td></tr>` +
    `<tr><th>SRM (elementos finitos)</th><td id="tipoSrm">${femTxt}</td></tr>` +
    (inf !== undefined ? `<tr><th>talud infinito tanφ/tanβ</th><td id="tipoInf">${f3(inf)}</td></tr>` : "") + `</table>` +
    `<div style="opacity:.8">β = ${betaDeN(p.n).toFixed(2)}°${p.hw > 0 ? " · con freático" : ""}${conQ ? ` · q = ${p.q} kPa` : ""}. Para ver el círculo crítico: Método → Bishop/Fellenius.</div>`;
  (window as unknown as { __tipo: unknown }).__tipo = { tipo: actual, p: { ...p }, bishop: lem.b, fellenius: lem.f, srm: [...fem], infinito: inf };
}
