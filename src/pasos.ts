// PASOS: la guía que sigue lo que el usuario está haciendo, calcada de los "frames" de GEO5 (cadenas del binario
// GeoFEM_5.dll: Interfaces → Soils → Assign → MeshGenerating → etapa: Activation/Surcharge/Anchors → Analysis) y
// de las fases del lienzo de Hekatan Lab (FASE 1 — TALUD: borde con clics de izquierda a derecha; FASE 2 — SUELOS:
// de arriba hacia abajo). Cada paso tiene su propio panel (formularios: márgenes, suelos, asignar, malla, etapas) y
// el paso actual cambia con la herramienta activa (interfaz → Terreno/Capas, asignar → Asignar, sobrecarga/ancla → Etapas).
// Jorge: "al dibujar el talud ya debe aparecer; en cada paso la guía a lo que voy haciendo; añadir suelos sin comandos".
import type { SlopeDef, Soil } from "./model/dsl";
import { regionOf } from "./viewer/draw";

export type PasoId = "terreno" | "suelos" | "asignar" | "malla" | "etapas" | "analisis";
type Estado = { soil: string; q: number; F: number; ang: number; stage: number };
export type PasosApi = {
  apply: (d: SlopeDef) => void;          // el modelo cambió desde un formulario → remallar + recalcular (escribe el .hgeo)
  tool: (t: string) => void;             // activar una herramienta de dibujo
  run: () => void;                       // recalcular todas las etapas
  usar: (cmd: string) => void;           // dejar un comando escrito en la línea de órdenes
  state: Estado;                         // estado de las herramientas (suelo activo, q, F, ang, etapa)
  syncBar: () => void;                   // reflejar `state` en la barra de herramientas
  info: () => string;                    // mensaje de malla (edmsg)
};

type Paso = { id: PasoId; n: string; geo5: string; hecho: (d: SlopeDef, p: Pasos) => boolean; opcional?: boolean };
const PASOS: Paso[] = [
  { id: "terreno", n: "Terreno y capas", geo5: "Interfaces", hecho: (d) => (d.interfaces[0]?.length ?? 0) >= 2 },
  { id: "suelos", n: "Suelos", geo5: "Soils", hecho: (d) => d.soils.length >= 1 },
  { id: "asignar", n: "Asignar", geo5: "Assign", hecho: (d) => d.soils.length >= 1 && (d.interfaces.length <= 1 || d.assign.length >= d.interfaces.length - 1) },
  { id: "malla", n: "Malla", geo5: "Mesh generation", hecho: (d) => (d.interfaces[0]?.length ?? 0) >= 2 && d.soils.length >= 1 },
  { id: "etapas", n: "Etapas y cargas", geo5: "Surcharge · Anchors", hecho: (d) => d.stages.some((s) => s.surcharges.length + s.anchors.length > 0), opcional: true },
  { id: "analisis", n: "Análisis", geo5: "Analysis", hecho: () => false },
];

const num = (v: string | number, k = 2) => (typeof v === "string" ? parseFloat(v) : v).toFixed(k).replace(/\.?0+$/, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export class Pasos {
  el: HTMLDivElement; cerrado = true; cur: PasoId = "terreno"; margOk = false;
  private d: SlopeDef | null = null; private hechoAntes = new Map<PasoId, boolean>(); private editSoil: string | null = null;
  constructor(parent: HTMLElement, private api: PasosApi) {
    this.el = document.createElement("div"); this.el.id = "pasos"; this.el.hidden = true; parent.prepend(this.el);
  }
  abrir(paso?: PasoId) { this.cerrado = false; if (paso) { this.cur = paso; this.hechoAntes.clear(); this.margOk = false; } this.el.hidden = false; this.render(); }
  cerrar() { this.cerrado = true; this.el.hidden = true; }
  /** la herramienta activa manda: el paso actual es el de esa herramienta */
  tool(t: string) {
    const map: Record<string, PasoId> = { interfaz: "terreno", asignar: "asignar", sobrecarga: "etapas", ancla: "etapas", mover: "terreno", borrar: "terreno", muro: "terreno" };
    if (map[t]) { this.cur = map[t]; this.abrir(); }
  }
  /** el modelo cambió: marca lo hecho y, si el paso actual acaba de completarse, salta al siguiente pendiente */
  actualizar(d: SlopeDef | null) {
    this.d = d;
    if (!d) { this.el.hidden = true; return; }
    const ahora = PASOS.find((p) => p.id === this.cur)!;
    const primera = this.hechoAntes.size === 0;   // primer modelo tras abrir: solo se anota lo hecho, no se salta
    const estaba = this.hechoAntes.get(this.cur) ?? false, esta = ahora.hecho(d, this);
    // (en Etapas se ponen varias cargas: no saltar solo)
    if (!primera && !estaba && esta && ahora.id !== "analisis" && ahora.id !== "etapas") { const i = PASOS.findIndex((p) => p.id === this.cur); const sig = PASOS.slice(i + 1).find((p) => !p.hecho(d, this)); if (sig) this.cur = sig.id; }
    for (const p of PASOS) this.hechoAntes.set(p.id, p.hecho(d, this));
    if (!this.cerrado) this.render();
  }
  private render() {
    const d = this.d; if (!d) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const idx = PASOS.findIndex((p) => p.id === this.cur);
    const lista = PASOS.map((p, i) => `<li class="${p.hecho(d, this) ? "ok" : ""}${i === idx ? " cur" : ""}" data-p="${p.id}"><span class="k">${p.hecho(d, this) ? "✓" : i + 1}</span>${p.n}<span class="g">${p.geo5}</span></li>`).join("");
    this.el.innerHTML = `<div class="ph"><b>Pasos</b><span class="pg">como GEO5 · ${idx + 1}/${PASOS.length}</span><button class="px" title="cerrar (vuelve con «? pasos» o al dibujar)">✕</button></div>
      <ol class="pl">${lista}</ol><div class="pp">${this.panel(d, this.cur)}</div>`;
    this.el.querySelector<HTMLButtonElement>(".px")!.onclick = () => this.cerrar();
    this.el.querySelectorAll<HTMLLIElement>(".pl li").forEach((li) => { li.onclick = () => { this.cur = li.dataset.p as PasoId; this.render(); }; });
    this.wire(d);
  }
  private panel(d: SlopeDef, id: PasoId): string {
    const m = d.margins ?? { xmin: 0, xmax: 40, bottom: -20 };
    const usar = (cmd: string) => `<div class="pe"><code>${esc(cmd)}</code><button class="pu" data-cmd="${esc(cmd)}" title="lo deja escrito en Orden:; pulsa Enter">usar</button></div>`;
    switch (id) {
      case "terreno": {
        const its = d.interfaces.map((it, i) => `<li>${i === 0 ? "terreno" : "capa " + i} · ${it.length} puntos <span class="mut">${it.map((p) => `${num(p[0], 1)},${num(p[1], 1)}`).join(" ")}</span><button class="pdel" data-it="${i}" title="borrar">✕</button></li>`).join("")
          + (d.lines ?? []).map((ln, i) => `<li><span style="color:#e879f9">línea libre ${i + 1}</span> · ${ln.length} puntos <span class="mut">${ln.map((p) => `${num(p[0], 1)},${num(p[1], 1)}`).join(" ")}</span><button class="pdel" data-ln="${i}" title="borrar">✕</button></li>`).join("");
        const fase = d.interfaces[0]?.length ? "FASE 2 — CAPAS: cada capa es otra interfaz de margen a margen, bajo el terreno. Los suelos van de ARRIBA hacia ABAJO." : "FASE 1 — TERRENO: traza el BORDE del terreno con clics de izquierda a derecha, de margen a margen (Enter termina · Esc cancela · Retroceso quita el último · rejilla F9 · snap F3 · orto F8).";
        return `<div class="pq"><b>Interfaces</b> (GEO5: <i>Interfaces</i>). ${fase} Al mover el ratón ves x, z, la longitud L y el ángulo β del tramo.${d.interfaces[0]?.length ? " <b>Línea libre</b> (GEO5: <i>Free line</i>): si la polilínea no va de margen a margen o vuelve atrás y toca el borde, el terreno u otra línea en sus dos extremos, cierra una región que recibe su propio suelo." : ""}</div>
        <details class="pr" ${d.interfaces.length ? "" : "open"}><summary>rango del modelo (GEO5: <i>Set ranges</i>): x de izquierda a derecha y profundidad</summary>
        <div class="pf"><label>x mín <input id="pm_xmin" type="number" step="1" value="${m.xmin}"></label><label>x máx <input id="pm_xmax" type="number" step="1" value="${m.xmax}"></label><label>fondo z <input id="pm_fondo" type="number" step="0.5" value="${m.bottom}"></label></div>
        <div class="pb"><button id="pm_ok">aplicar rango</button></div></details>
        <div class="pb"><button class="pt" data-tool="interfaz">✎ dibujar ${d.interfaces[0]?.length ? "otra capa" : "el terreno"}</button><button class="pt" data-tool="muro">▉ muro (2 clics)</button><button class="pt" data-tool="mover">✥ mover</button><button class="pt" data-tool="borrar">✕ borrar</button></div>
        ${d.interfaces[0]?.length ? `<div class="mut">MURO CANTILEVER (GEO5: <i>Rigid body</i>): clic en el pie de la cara vista y otro en la coronación. El hormigón es una región ELÁSTICA: la reducción de resistencia no le toca, retiene el relleno y cambia los desplazamientos y la superficie de falla. Los esfuerzos M/V/N del fuste son el otro modelo de GEO5 (<i>Beam</i>) y no salen de aquí.${(d.walls ?? []).length ? ` Puesto${d.walls.length > 1 ? "s" : ""}: ${d.walls.map((w) => `${w.soil} en x=${num(w.pm.x)} H=${num(w.pm.H)} m`).join(" · ")}` : ""}</div>` : ""}
        ${usar(d.interfaces[0]?.length ? "interfaz 0,-17 30,-16.5 60,-15" : "interfaz 0,-14 16,-14 24,-9 32,-9 40,-3 60,-3")}
        <ul class="pli">${its || "<li class='mut'>todavía no hay terreno</li>"}</ul>
        <div class="pb"><button class="pn" data-go="suelos">siguiente: suelos ▸</button></div>`;
      }
      case "suelos": {
        const s = this.editSoil ? d.soils.find((x) => x.name === this.editSoil) : null;
        const rows = d.soils.map((x) => `<li class="${x.name === this.editSoil ? "cur" : ""}" data-soil="${esc(x.name)}"><b>${esc(x.name)}</b> <span class="mut">E=${num(x.E)} ν=${num(x.nu)} φ=${num(x.phi, 1)}° c=${num(x.c, 1)} γ=${num(x.gamma, 1)}</span><button class="pdel" data-soil="${esc(x.name)}" title="borrar">✕</button></li>`).join("");
        return `<div class="pq"><b>Suelos</b> (GEO5: <i>Soils</i>). Escribe cada suelo con sus parámetros y pulsa añadir. Clic en uno de la lista para editarlo. Con terreno + un suelo el modelo ya se malla y calcula.</div>
        <div class="pf ps6"><label>nombre <input id="ps_name" value="${esc(s?.name ?? (d.soils.length ? "" : "LIMO_ARENOSO"))}" placeholder="ARCILLA"></label><label>E [kPa] <input id="ps_E" type="number" step="1000" value="${s?.E ?? 20000}"></label><label>ν <input id="ps_nu" type="number" step="0.05" min="0" max="0.49" value="${s?.nu ?? 0.3}"></label><label>φ [°] <input id="ps_phi" type="number" step="0.5" value="${s?.phi ?? 26}"></label><label>c [kPa] <input id="ps_c" type="number" step="0.5" value="${s?.c ?? 10}"></label><label>γ [kN/m³] <input id="ps_g" type="number" step="0.5" value="${s?.gamma ?? 17.5}"></label></div>
        <div class="pb"><button id="ps_add">${s ? "actualizar suelo" : "＋ añadir suelo"}</button>${s ? '<button id="ps_cancel">cancelar</button>' : ""}</div>
        <ul class="pli">${rows || "<li class='mut'>todavía no hay suelos</li>"}</ul>
        <div class="pb"><button class="pn" data-go="asignar">siguiente: asignar ▸</button></div>`;
      }
      case "asignar": {
        const opts = d.soils.map((x) => `<option value="${esc(x.name)}" ${x.name === this.api.state.soil ? "selected" : ""}>${esc(x.name)}</option>`).join("");
        const rows = d.assign.map((a, i) => `<li><b>${esc(a.soil)}</b> en ${num(a.p[0], 1)},${num(a.p[1], 1)} <span class="mut">región ${regionOf(d, a.p)}</span><button class="pdel" data-as="${i}" title="borrar">✕</button></li>`).join("");
        const auto = d.interfaces.length <= 1 ? "Con una sola región, el primer suelo se asigna solo." : `Hay ${d.interfaces.length} regiones (terreno + ${d.interfaces.length - 1} capas): la primera toma el primer suelo; a cada capa dale su suelo con un clic dentro.`;
        return `<div class="pq"><b>Asignar</b> (GEO5: <i>Assign</i>). ${auto} Elige el suelo y haz clic DENTRO de la región (o escribe el punto).</div>
        <div class="pf"><label>suelo <select id="pa_soil">${opts}</select></label></div>
        <div class="pb"><button class="pt" data-tool="asignar">◉ asignar con clic</button></div>
        ${usar(`asignar ${d.soils[1]?.name ?? d.soils[0]?.name ?? "ARCILLA"} en 30,-18`)}
        <ul class="pli">${rows || "<li class='mut'>sin asignaciones (la región 1 usa el primer suelo)</li>"}</ul>
        <div class="pb"><button class="pn" data-go="malla">siguiente: malla ▸</button></div>`;
      }
      case "malla": return `<div class="pq"><b>Malla</b> (GEO5: <i>Mesh generation</i>). Tamaño de los elementos T6 en metros: más fino = más preciso y más lento. Se genera sola (Delaunay + Ruppert) cada vez que cambia la geometría.</div>
        <div class="pf"><label>tamaño h [m] <input id="pml_h" type="number" step="0.5" min="0.3" value="${d.h}"></label></div>
        <div class="pb"><button id="pml_ok">remallar</button><button class="pn" data-go="etapas">siguiente: etapas ▸</button></div>
        <div class="mut">${esc(this.api.info())}</div>`;
      case "etapas": {
        const st = this.api.state;
        const rows = d.stages.map((s, i) => `<li class="${i === st.stage ? "cur" : ""}" data-st="${i}"><b>${i + 1}. ${esc(s.name)}</b> <span class="mut">${s.surcharges.length} sobrecarga${s.surcharges.length === 1 ? "" : "s"} · ${s.anchors.length} ancla${s.anchors.length === 1 ? "" : "s"}</span>${i > 0 ? `<button class="pdel" data-st="${i}" title="borrar etapa">✕</button>` : ""}</li>`).join("");
        return `<div class="pq"><b>Etapas y cargas</b> (GEO5: <i>Activation · Surcharge · Anchors</i>). La etapa 1 es peso propio. Añade una etapa y ponle su carga: <b>sobrecarga</b> = dos clics sobre el terreno; <b>ancla</b> = clic en la cabeza. Cada etapa hereda las cargas de la anterior.</div>
        <ul class="pli">${rows}</ul>
        <div class="pb"><button id="pe_add">＋ etapa</button><span class="mut">las cargas van a la etapa marcada (clic en la lista)</span></div>
        <div class="pf"><label>q [kPa] <input id="pe_q" type="number" step="5" value="${st.q}"></label><label>F ancla [kN] <input id="pe_F" type="number" step="10" value="${st.F}"></label><label>ángulo [°] <input id="pe_ang" type="number" step="1" value="${st.ang}"></label></div>
        <div class="pb"><button class="pt" data-tool="sobrecarga">⇊ sobrecarga (2 clics)</button><button class="pt" data-tool="ancla">⤤ ancla (1 clic)</button></div>
        ${usar("etapa +sobrecarga q=40 en 44,-3 -> 56,-3")}
        <div class="pb"><button class="pn" data-go="analisis">siguiente: análisis ▸</button></div>`;
      }
      case "analisis": return `<div class="pq"><b>Análisis</b> (GEO5: <i>Analysis</i>). FS por etapa por reducción de resistencia (SRM) en la tabla de abajo; la gráfica muestra la etapa elegida en VISTA. Los sliders de PARÁMETROS (β y H de cada cara, vértices, cotas de capas, φ c γ) remallan y recalculan solos. «Guardar» escribe el .hgeo.</div>
        <div class="pb"><button id="pan_run">⟳ recalcular todas las etapas</button></div>`;
    }
  }
  private wire(d: SlopeDef) {
    const $ = <T extends HTMLElement>(sel: string) => this.el.querySelector<T>(sel);
    const v = (id: string) => parseFloat(($<HTMLInputElement>("#" + id)!).value);
    this.el.querySelectorAll<HTMLButtonElement>(".pn").forEach((b) => { b.onclick = () => { this.cur = b.dataset.go as PasoId; this.render(); }; });
    this.el.querySelectorAll<HTMLButtonElement>(".pt").forEach((b) => { b.onclick = () => this.api.tool(b.dataset.tool!); });
    this.el.querySelectorAll<HTMLButtonElement>(".pu").forEach((b) => { b.onclick = () => this.api.usar(b.dataset.cmd!); });
    $("#pm_ok")?.addEventListener("click", () => { d.margins = { xmin: v("pm_xmin"), xmax: v("pm_xmax"), bottom: v("pm_fondo") }; this.margOk = true; this.api.apply(d); });
    this.el.querySelectorAll<HTMLButtonElement>(".pdel[data-it]").forEach((b) => { b.onclick = () => { d.interfaces.splice(parseInt(b.dataset.it!), 1); if (!d.interfaces.length) d.outline = []; this.api.apply(d); }; });
    this.el.querySelectorAll<HTMLButtonElement>(".pdel[data-ln]").forEach((b) => { b.onclick = () => { d.lines.splice(parseInt(b.dataset.ln!), 1); this.api.apply(d); }; });
    $("#ps_add")?.addEventListener("click", () => {
      const name = ($<HTMLInputElement>("#ps_name")!).value.trim().replace(/\s+/g, "_").toUpperCase(); if (!name) return;
      const s: Soil = { name, E: v("ps_E"), nu: v("ps_nu"), phi: v("ps_phi"), c: v("ps_c"), gamma: v("ps_g"), psi: 0 };
      const old = this.editSoil ?? name, i = d.soils.findIndex((x) => x.name === old);
      if (i >= 0) { d.soils[i] = s; for (const a of d.assign) if (a.soil === old) a.soil = name; } else d.soils.push(s);
      this.editSoil = null; if (!this.api.state.soil) this.api.state.soil = name; this.api.apply(d);
    });
    $("#ps_cancel")?.addEventListener("click", () => { this.editSoil = null; this.render(); });
    this.el.querySelectorAll<HTMLLIElement>(".pli li[data-soil]").forEach((li) => { li.onclick = (e) => { if ((e.target as HTMLElement).classList.contains("pdel")) return; this.editSoil = li.dataset.soil!; this.render(); }; });
    this.el.querySelectorAll<HTMLButtonElement>(".pdel[data-soil]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const n = b.dataset.soil!; d.soils = d.soils.filter((x) => x.name !== n); d.assign = d.assign.filter((a) => a.soil !== n); if (this.api.state.soil === n) this.api.state.soil = d.soils[0]?.name ?? ""; this.api.apply(d); }; });
    $("#pa_soil")?.addEventListener("change", () => { this.api.state.soil = ($<HTMLSelectElement>("#pa_soil")!).value; this.api.syncBar(); });
    this.el.querySelectorAll<HTMLButtonElement>(".pdel[data-as]").forEach((b) => { b.onclick = () => { d.assign.splice(parseInt(b.dataset.as!), 1); this.api.apply(d); }; });
    $("#pml_ok")?.addEventListener("click", () => { d.h = Math.max(0.3, v("pml_h")); this.api.apply(d); });
    $("#pe_add")?.addEventListener("click", () => { const n = d.stages.length + 1; d.stages.push({ name: `+etapa${n}`, surcharges: [], anchors: [] }); this.api.state.stage = n - 1; this.api.syncBar(); this.api.apply(d); });
    this.el.querySelectorAll<HTMLLIElement>(".pli li[data-st]").forEach((li) => { li.onclick = (e) => { if ((e.target as HTMLElement).classList.contains("pdel")) return; this.api.state.stage = parseInt(li.dataset.st!); this.api.syncBar(); this.render(); }; });
    this.el.querySelectorAll<HTMLButtonElement>(".pdel[data-st]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); d.stages.splice(parseInt(b.dataset.st!), 1); this.api.state.stage = Math.min(this.api.state.stage, d.stages.length - 1); this.api.syncBar(); this.api.apply(d); }; });
    for (const [id, k] of [["pe_q", "q"], ["pe_F", "F"], ["pe_ang", "ang"]] as const) $("#" + id)?.addEventListener("change", () => { (this.api.state as unknown as Record<string, number>)[k] = v(id); this.api.syncBar(); });
    $("#pan_run")?.addEventListener("click", () => this.api.run());
  }
}
