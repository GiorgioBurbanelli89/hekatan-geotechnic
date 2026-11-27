// Lista «Tipo de talud» (galería de plantillas, src/model/plantillas.ts) con POCOS controles. Al elegir un tipo o mover un control,
// se escribe el .hgeo del tipo y se abre por el camino de siempre (malla → SRM en el worker); aparte se calculan Bishop y
// Fellenius (con freático y sobrecarga) y se ponen en una tabla junto al FS de elementos finitos. Mientras hay un tipo activo se
// ocultan el editor .hgeo y los sliders generales (el botón «ver .hgeo» los devuelve). Elegir otro «Ejemplo» sale del tipo.
import { PLANTILLAS, plantilla, paramsPorDefecto, hgeoPlantilla, betaDeN, fsInfinito, muroExcavacion } from "../model/plantillas";
import { parseHgeo } from "../model/dsl";
import { criticalCircle, type LemOpts } from "../lem/slices";
import { Pane } from "tweakpane";
/** tipos que se calculan POR ETAPAS (excavación con `inactiva=`): el equilibrio límite no ve la excavación ni el muro → no se calcula */
const POR_ETAPAS = new Set(["excavacion_muro"]);
let pane: Pane | null = null;

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
    corte: "2,28 22,28 52,8 78,8", excavacion_muro: "2,28 22,28 52,8 78,8", terraplen: "2,28 18,28 34,10 50,10 66,28 78,28", berma: "2,28 20,28 34,19 46,19 60,8 78,8",
    estratos: "2,28 22,28 52,8 78,8", muro: "2,28 24,28 24,18 34,18 56,6 78,6", ladera: "2,32 24,24 52,8 78,8",
    compuesto: "2,28 20,28 32,14 62,6 78,6", blando: "2,28 22,28 52,8 78,8", zapata: "2,28 22,28 52,8 78,8",
  };
  const extra = id === "estratos" ? `<polyline points="37,18 78,18" stroke="#6aa3d8" stroke-width="1.5" fill="none" stroke-dasharray="3 2"/>`
    : id === "blando" ? `<polyline points="40,18 78,18" stroke="#c25b5b" stroke-width="3.5" fill="none" opacity=".85"/>`
    : id === "zapata" ? `<rect x="58" y="2" width="12" height="3" fill="#cfcfcf"/><path d="M60 5 V7.5 M64 5 V7.5 M68 5 V7.5" stroke="#cfcfcf" stroke-width="1.2" fill="none"/>`
    : id === "terraplen" ? `<polyline points="2,28 78,28" stroke="#6aa3d8" stroke-width="1" fill="none" stroke-dasharray="3 2"/>`
    : id === "muro" ? `<rect x="22" y="17" width="3" height="13" fill="#9a9a9a"/>`
    : id === "excavacion_muro" ? `<rect x="2" y="28" width="19" height="4" fill="#0f0c07" stroke="#b9ad8c" stroke-width=".6" stroke-dasharray="1.5 1"/><path d="M21 28 V33 H16 V34.4 H27 V35 H29 V33 H23 V28 Z" fill="#e5382b"/>` : "";
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
  pane?.dispose(); pane = null;
  if (t.params.some((q) => q.grupo)) { panelTweakpane(t, c); generar(); return; }
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
/** Controles en TWEAKPANE (como la zapata): una carpeta por `grupo`, fila etiqueta · slider · número; `muro` es casilla */
function panelTweakpane(t: ReturnType<typeof plantilla>, c: HTMLElement) {
  c.innerHTML = `<div class="mats" style="margin:2px 0 4px">${t.descripcion}</div><div id="tipoPane"></div>` +
    `<div id="tipoRes" class="mats" style="margin-top:4px"></div><button class="tb" id="tipoHgeo" style="width:100%;margin-top:4px">ver / editar el .hgeo generado</button>`;
  pane = new Pane({ container: $("tipoPane")! });
  const P: Record<string, number | boolean> = {}, dec = (s: number) => Math.max(0, -Math.floor(Math.log10(s) + 1e-9));
  const grupos = [...new Set(t.params.map((q) => q.grupo ?? "parámetros"))];
  for (const g of grupos) {
    const fo = pane.addFolder({ title: g.toUpperCase(), expanded: g !== "hormigón (elástico)" && g !== "malla" });
    for (const q of t.params.filter((q2) => (q2.grupo ?? "parámetros") === g)) {
      const label = q.unit ? `${q.label} [${q.unit}]` : q.label;
      if (q.key === "muro") {
        P.muro = p.muro >= 0.5;
        const b = fo.addBinding(P, "muro", { label: "con muro (sin marcar: la misma excavación sin muro)" });
        b.element.dataset.k = q.key;
        b.on("change", (ev) => { p.muro = ev.value ? 1 : 0; pedir(); });
        continue;
      }
      P[q.key] = p[q.key]; const nd = dec(q.step);
      const b = fo.addBinding(P as Record<string, number>, q.key, { label, min: Math.min(q.min, p[q.key]), max: Math.max(q.max, p[q.key]), step: q.step, format: (x: number) => x.toFixed(nd) });
      b.element.dataset.k = q.key; b.element.title = q.label;
      b.on("change", (ev) => { const v = +(ev.value as number).toFixed(nd); if (v === p[q.key]) return; p[q.key] = v; pedir(); });
    }
  }
  $("tipoHgeo")!.addEventListener("click", () => document.body.classList.toggle("verHgeo"));
}
const pedir = () => { clearTimeout(timer); timer = window.setTimeout(generar, 400); };
const fmt = (k: string, v: number) => (k === "n" ? `1:${v} (β=${betaDeN(v).toFixed(1)}°)` : String(v));
let lem: { b?: number; f?: number } = {};
function generar() {
  if (!actual || !api) return;
  const txt = hgeoPlantilla(actual, p); fem = []; lem = {};
  api.abrir(txt); tabla();
  if (POR_ETAPAS.has(actual)) return;   // el equilibrio límite no ve la excavación por etapas ni el muro
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
  if (POR_ETAPAS.has(actual)) {   // construcción por etapas: el FS es el de la última etapa (SRM del estado final)
    const nSt = (hgeoPlantilla(actual, p).match(/^etapa /gm) ?? []).length, fin = fem.length === nSt ? fem[nSt - 1] : undefined;
    const g = muroExcavacion(p), recorte = p.dexc > g.dexc + 1e-9;
    const cotas = `<div id="tipoCotas" style="margin:2px 0 4px">corona de la pantalla z = 0 · fondo excavado z = ${(-g.dexc).toFixed(2)} · techo de la zapata z = ${g.zz.toFixed(2)} · base z = ${g.zb.toFixed(2)}${g.dp > 0.01 ? ` · dentellón hasta z = ${g.zd.toFixed(2)}` : ""} → pantalla vista ${g.dexc.toFixed(2)} m, tierra sobre la puntera ${(g.zz + g.dexc < 0 ? -(g.zz + g.dexc) : 0).toFixed(2)} m` +
      (recorte ? `<br><span style="color:#e5a04f">⚠ la excavación pedida (${p.dexc} m) llegaba a la zapata: se limita a ${g.dexc.toFixed(2)} m (0.2 m de tierra sobre la puntera); baja la zapata con «altura de la pantalla»</span>` : "") + `</div>`;
    r.innerHTML = cotas + `<table><tr><th>FS final (SRM, elementos finitos)</th><td id="tipoSrm">${fin === undefined ? "calculando…" : Number.isFinite(fin) ? f3(fin) : "< 1 ✖"}</td></tr></table>` +
      `<div style="opacity:.8">Etapas: talud natural → ${p.muro >= 0.5 ? "muro (la región pasa de suelo a hormigón) → " : ""}excavación (se desactiva) → FS por reducción de resistencia del estado final. Muro unido al suelo (adherencia perfecta: sin interfaz). Bishop/Fellenius no ven la excavación por etapas: no se calculan.</div>`;
    (window as unknown as { __tipo: unknown }).__tipo = { tipo: actual, p: { ...p }, srm: [...fem] };
    return;
  }
  const femTxt = fem.length ? fem.map((v, i) => `${f3(v)}${fem.length > 1 || conQ ? (i === 0 ? " (peso propio)" : " (+ q)") : ""}`).join(" · ") : "calculando…";
  r.innerHTML = `<table><tr><th>Bishop</th><td id="tipoBishop">${f3(lem.b)}</td></tr><tr><th>Fellenius</th><td id="tipoFellenius">${f3(lem.f)}</td></tr>` +
    `<tr><th>SRM (elementos finitos)</th><td id="tipoSrm">${femTxt}</td></tr>` +
    (inf !== undefined ? `<tr><th>talud infinito tanφ/tanβ</th><td id="tipoInf">${f3(inf)}</td></tr>` : "") + `</table>` +
    `<div style="opacity:.8">β = ${betaDeN(p.n).toFixed(2)}°${p.hw > 0 ? " · con freático" : ""}${conQ ? ` · q = ${p.q} kPa` : ""}. Para ver el círculo crítico: Método → Bishop/Fellenius.</div>`;
  (window as unknown as { __tipo: unknown }).__tipo = { tipo: actual, p: { ...p }, bishop: lem.b, fellenius: lem.f, srm: [...fem], infinito: inf };
}
