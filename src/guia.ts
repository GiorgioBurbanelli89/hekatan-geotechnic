// GUÍA paso a paso para hacer un talud desde 0 (Jorge: "cuando es nuevo debe haber una guía qué hacer en cada paso;
// si uno quiere la cierra, pero debe salir"). Se abre con «Nuevo», avanza sola leyendo el modelo (.hgeo), y cada paso
// trae el comando de ejemplo con un botón «usar» que lo deja escrito en la línea de órdenes.
import type { SlopeDef } from "./model/dsl";

export type Paso = { id: string; titulo: string; que: string; ejemplo?: string; herramienta?: string; opcional?: boolean; hecho: (d: SlopeDef, txt: string) => boolean };

export const PASOS: Paso[] = [
  { id: "margenes", titulo: "Márgenes", que: "El rectángulo del modelo: x de izquierda a derecha y cota del fondo. Si no lo escribes vale 0…40 m y fondo −20 m.",
    ejemplo: "margenes xmin=0 xmax=60 fondo=-26", opcional: true, hecho: (_d, t) => /^\s*m[aá]rgenes\b/m.test(t) },
  { id: "terreno", titulo: "Terreno", que: "La superficie del talud, de margen a margen. Con la herramienta «interfaz» haz clic en cada vértice (snap a la rejilla) y Enter para terminar, o escríbelo.",
    ejemplo: "interfaz 0,-14 16,-14 24,-9 32,-9 40,-3 60,-3", herramienta: "interfaz", hecho: (d) => !!d.interfaces[0]?.length },
  { id: "suelo", titulo: "Primer suelo", que: "Un suelo con sus parámetros (E, ν, φ, c, γ). Con terreno + un suelo el modelo ya se malla y calcula el FS.",
    ejemplo: "suelo LIMO_ARENOSO E=20000 nu=0.30 phi=26 c=10 gamma=17.5", hecho: (d) => d.soils.length >= 1 },
  { id: "capas", titulo: "Capas (opcional)", que: "Cada capa es otra «interfaz» de margen a margen bajo el terreno, su «suelo», y un «asignar SUELO en x,y» con un punto dentro de la capa (o la herramienta asignar con el suelo activo).",
    ejemplo: "interfaz 0,-17 30,-16.5 60,-15", opcional: true, hecho: (d) => d.interfaces.length >= 2 && d.assign.length >= 1 },
  { id: "malla", titulo: "Malla", que: "Tamaño de los elementos T6 en metros. Más fino = más preciso y más lento (2 m va bien para un talud de 60 m).",
    ejemplo: "malla 2", opcional: true, hecho: (_d, t) => /^\s*malla\b/m.test(t) },
  { id: "etapas", titulo: "Etapas", que: "Peso propio ya es la etapa 1. Añade una etapa con sobrecarga (dos puntos sobre el terreno) o con ancla (cabeza, fuerza y ángulo); también con las herramientas «sobrecarga» y «ancla».",
    ejemplo: "etapa +sobrecarga q=40 en 44,-3 -> 56,-3", opcional: true, hecho: (d) => d.stages.length >= 2 },
  { id: "sliders", titulo: "Parámetros y guardar", que: "Mueve los sliders de PARÁMETROS (vértices del terreno, cota de cada capa, φ c γ): se remalla y recalcula la etapa visible. «Guardar» escribe el .hgeo.",
    hecho: () => false },
];

export class Guia {
  el: HTMLDivElement; cerrada = true; private saltados = new Set<string>();
  constructor(parent: HTMLElement, private usar: (cmd: string) => void, private tool: (t: string) => void) {
    this.el = document.createElement("div"); this.el.id = "guia"; this.el.hidden = true; parent.appendChild(this.el);
  }
  abrir(desdeCero = false) { this.cerrada = false; if (desdeCero) this.saltados.clear(); this.el.hidden = false; }
  cerrar() { this.cerrada = true; this.el.hidden = true; }
  /** Redibuja según el modelo actual (def) y el texto del editor. */
  actualizar(d: SlopeDef | null, txt: string) {
    if (this.cerrada || !d) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const estado = PASOS.map((p) => ({ p, ok: p.hecho(d, txt) || this.saltados.has(p.id) }));
    const idx = Math.max(0, estado.findIndex((e) => !e.ok));
    const cur = estado[idx]?.p ?? PASOS[PASOS.length - 1];
    const lista = estado.map((e, i) => `<li class="${e.ok ? "ok" : i === idx ? "cur" : ""}">${e.ok ? "✓" : i === idx ? "►" : "○"} ${e.p.titulo}</li>`).join("");
    this.el.innerHTML = `<div class="gh"><b>Guía · talud desde 0</b><span class="gn">paso ${idx + 1} de ${PASOS.length}</span><button class="gx" title="cerrar la guía">✕</button></div>
      <ol class="gl">${lista}</ol>
      <div class="gq"><b>${cur.titulo}.</b> ${cur.que}</div>
      ${cur.ejemplo ? `<div class="ge"><code>${cur.ejemplo}</code><button class="gu" title="lo deja escrito en la línea de órdenes; pulsa Enter">usar</button></div>` : ""}
      <div class="gb">${cur.herramienta ? `<button class="gt">herramienta ${cur.herramienta}</button>` : ""}${cur.opcional ? `<button class="gs">saltar</button>` : ""}</div>`;
    this.el.querySelector<HTMLButtonElement>(".gx")!.onclick = () => this.cerrar();
    this.el.querySelector<HTMLButtonElement>(".gu")?.addEventListener("click", () => this.usar(cur.ejemplo!));
    this.el.querySelector<HTMLButtonElement>(".gt")?.addEventListener("click", () => this.tool(cur.herramienta!));
    this.el.querySelector<HTMLButtonElement>(".gs")?.addEventListener("click", () => { this.saltados.add(cur.id); this.actualizar(d, txt); });
  }
}
