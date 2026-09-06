// Herramientas de DIBUJO sobre el lienzo (paradigma GEO5, manejo AutoCAD/Revit):
//   interfaz   clic a clic una polilínea de margen a margen (la 1ª es el terreno); Enter/doble clic termina,
//              Esc cancela, Retroceso quita el último punto. Rejilla con snap (F9) y orto con Shift (F8).
//   asignar    clic dentro de una región → suelo elegido en el desplegable
//   sobrecarga dos clics sobre el terreno → q [kPa]
//   ancla      un clic (cabeza) → F [kN] y ángulo
//   mover      arrastra un vértice de interfaz (snap)
//   borrar     clic en un vértice (lo quita) o en una interfaz (la borra si no es el terreno)
//   Ctrl+Z deshace. Cada cambio reescribe el .hgeo y remalla (como los sliders: sin botón).
import type { Pt, SlopeDef } from "../model/dsl";
import { interfaceY, spanInterface } from "../model/dsl";

export type Tool = "ver" | "interfaz" | "asignar" | "sobrecarga" | "ancla" | "mover" | "borrar";
export type DrawState = { tool: Tool; grid: number; snap: boolean; ortho: boolean; soil: string; q: number; F: number; ang: number; stage: number };

type Map2 = { tf: (x: number, z: number) => [number, number]; inv: (px: number, py: number) => [number, number] };

export class DrawTools {
  state: DrawState = { tool: "ver", grid: 1, snap: true, ortho: false, soil: "", q: 35, F: 72, ang: -17, stage: 0 };
  onChange: ((def: SlopeDef) => void) | null = null;     // el modelo cambió (remallar + recalcular)
  onStatus: ((msg: string) => void) | null = null;
  private ctx: CanvasRenderingContext2D;
  private map: Map2 | null = null;
  private def: SlopeDef | null = null;
  private cur: Pt[] = [];               // polilínea en curso
  private mouse: Pt | null = null;
  private drag: { it: number; k: number } | null = null;
  private history: string[] = [];
  private shift = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    canvas.addEventListener("mousemove", (e) => this.onMove(e));
    canvas.addEventListener("mousedown", (e) => this.onDown(e));
    canvas.addEventListener("mouseup", () => this.onUp());
    canvas.addEventListener("dblclick", (e) => { e.preventDefault(); this.finish(); });
    canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); this.finish(); });
    canvas.addEventListener("mouseleave", () => { this.mouse = null; this.render(); });
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Shift") { this.shift = true; this.render(); }
      if (e.key === "Enter") this.finish();
      if (e.key === "Escape") { this.cur = []; this.render(); this.status("cancelado"); }
      if (e.key === "Backspace" && this.cur.length) { this.cur.pop(); this.render(); }
      if (e.key === "F9") { e.preventDefault(); this.state.snap = !this.state.snap; this.status(`snap ${this.state.snap ? "ON" : "OFF"}`); }
      if (e.key === "F8") { e.preventDefault(); this.state.ortho = !this.state.ortho; this.status(`orto ${this.state.ortho ? "ON" : "OFF"}`); }
      if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); this.undo(); }
    });
    window.addEventListener("keyup", (e) => { if (e.key === "Shift") { this.shift = false; this.render(); } });
  }

  setMap(map: Map2 | null) { this.map = map; this.render(); }
  setDef(def: SlopeDef) { this.def = def; this.cur = []; this.render(); }
  get active() { return this.state.tool !== "ver"; }

  private status(m: string) { this.onStatus?.(m); }
  private world(e: MouseEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (this.canvas.width / r.width), py = (e.clientY - r.top) * (this.canvas.height / r.height);
    return this.map ? this.map.inv(px, py) : [0, 0];
  }
  /** snap a rejilla + orto respecto al último punto + imán a vértices/márgenes */
  private snapPt(p: Pt, ref?: Pt): Pt {
    let [x, y] = p;
    if (this.def?.margins) {   // imán a los márgenes (GEO5 exige que la interfaz llegue de borde a borde)
      const m = this.def.margins, tol = this.state.grid * 0.6;
      if (Math.abs(x - m.xmin) < tol) x = m.xmin; if (Math.abs(x - m.xmax) < tol) x = m.xmax;
    }
    if (this.state.snap && this.state.grid > 0) { x = Math.round(x / this.state.grid) * this.state.grid; y = Math.round(y / this.state.grid) * this.state.grid; }
    if (ref && (this.state.ortho || this.shift)) { if (Math.abs(x - ref[0]) > Math.abs(y - ref[1])) y = ref[1]; else x = ref[0]; }
    // imán a vértices existentes
    if (this.def) for (const it of this.def.interfaces) for (const v of it) if (Math.hypot(v[0] - x, v[1] - y) < this.state.grid * 0.35) return [v[0], v[1]];
    return [x, y];
  }
  private onMove(e: MouseEvent) {
    if (!this.map) return;
    const raw = this.world(e);
    this.mouse = this.active ? this.snapPt(raw, this.cur[this.cur.length - 1]) : raw;
    if (this.drag && this.def) { const it = this.def.interfaces[this.drag.it]; it[this.drag.k] = this.snapPt(raw); }
    this.render();
    if (this.mouse) this.status(`x = ${this.mouse[0].toFixed(2)}   z = ${this.mouse[1].toFixed(2)}${this.state.snap ? "   [snap " + this.state.grid + " m]" : ""}${this.state.ortho || this.shift ? "   [orto]" : ""}`);
  }
  private onDown(e: MouseEvent) {
    if (!this.map || !this.def || !this.active || e.button !== 0) return;
    const p = this.snapPt(this.world(e), this.cur[this.cur.length - 1]);
    const d = this.def;
    switch (this.state.tool) {
      case "interfaz": this.cur.push(p); this.render(); this.status(`punto ${this.cur.length}: ${p[0]},${p[1]}  (Enter o doble clic para terminar)`); break;
      case "asignar": {
        if (!this.state.soil) { this.status("elige un suelo en el desplegable"); return; }
        this.push(); d.assign = d.assign.filter((a) => regionOf(d, a.p) !== regionOf(d, p)); d.assign.push({ soil: this.state.soil, p }); this.commit(`${this.state.soil} asignado en ${p[0]},${p[1]}`); break;
      }
      case "sobrecarga": {
        const pt: Pt = [p[0], terrainY(d, p[0])];
        this.cur.push(pt); this.render();
        if (this.cur.length === 2) { this.push(); const st = d.stages[this.state.stage] ?? d.stages[d.stages.length - 1]; st.surcharges.push({ q: this.state.q, a: this.cur[0], b: this.cur[1] }); this.cur = []; this.commit(`sobrecarga ${this.state.q} kPa en la etapa ${this.state.stage + 1}`); }
        else this.status("segundo punto de la sobrecarga");
        break;
      }
      case "ancla": { this.push(); const st = d.stages[this.state.stage] ?? d.stages[d.stages.length - 1]; st.anchors.push({ F: this.state.F, p: [p[0], p[1]], ang: this.state.ang }); this.commit(`ancla ${this.state.F} kN en ${p[0]},${p[1]}`); break; }
      case "mover": { const hit = this.hitVertex(p); if (hit) { this.push(); this.drag = hit; } break; }
      case "borrar": {
        const hit = this.hitVertex(p);
        if (hit) { this.push(); const it = d.interfaces[hit.it]; if (it.length > 2) it.splice(hit.k, 1); else if (hit.it > 0) d.interfaces.splice(hit.it, 1); this.commit("vértice borrado"); break; }
        const k = this.hitInterface(p); if (k > 0) { this.push(); d.interfaces.splice(k, 1); this.commit("interfaz borrada"); }
        break;
      }
    }
  }
  private onUp() { if (this.drag) { this.drag = null; this.commit("vértice movido"); } }
  private finish() {
    if (!this.def) return;
    if (this.state.tool === "interfaz" && this.cur.length >= 2) {
      this.push();
      const m = this.def.margins!;
      const poly = spanInterface(this.cur, m.xmin, m.xmax);
      this.def.interfaces.push(poly); this.cur = [];
      this.commit(`interfaz ${this.def.interfaces.length} (${poly.length} puntos)`);
    } else { this.cur = []; this.render(); }
  }
  private hitVertex(p: Pt): { it: number; k: number } | null {
    if (!this.def) return null; const tol = this.state.grid * 0.45;
    for (let i = 0; i < this.def.interfaces.length; i++) for (let k = 0; k < this.def.interfaces[i].length; k++) { const v = this.def.interfaces[i][k]; if (Math.hypot(v[0] - p[0], v[1] - p[1]) < tol) return { it: i, k }; }
    return null;
  }
  private hitInterface(p: Pt): number {
    if (!this.def) return -1;
    for (let i = 0; i < this.def.interfaces.length; i++) if (Math.abs(interfaceY(this.def.interfaces[i], p[0]) - p[1]) < this.state.grid * 0.45) return i;
    return -1;
  }
  private push() { if (this.def) this.history.push(JSON.stringify(this.def)); if (this.history.length > 50) this.history.shift(); }
  undo() { if (!this.history.length || !this.def) { this.status("nada que deshacer"); return; } const s = this.history.pop()!; Object.assign(this.def, JSON.parse(s)); this.cur = []; this.commit("deshecho"); }
  private commit(msg: string) { this.status(msg); this.render(); if (this.def) this.onChange?.(this.def); }

  /** capa de dibujo: rejilla, márgenes, polilínea en curso, cursor con snap */
  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!this.map || !this.def) return;
    const tf = this.map.tf, d = this.def;
    if (this.active && d.margins && this.state.grid > 0) {
      const m = d.margins, g = this.state.grid;
      const ytop = Math.max(...d.interfaces[0].map((p) => p[1])) + 2 * g;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      const nx = (m.xmax - m.xmin) / g, ny = (ytop - m.bottom) / g;
      const step = nx * ny > 6000 ? Math.ceil(Math.sqrt(nx * ny / 6000)) : 1;
      for (let x = m.xmin; x <= m.xmax + 1e-9; x += g * step) for (let y = m.bottom; y <= ytop + 1e-9; y += g * step) { const [px, py] = tf(x, y); ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2); }
      ctx.strokeStyle = "rgba(208,138,62,0.7)"; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); for (const x of [m.xmin, m.xmax]) { const [a, b] = tf(x, m.bottom), [c, e] = tf(x, ytop); ctx.moveTo(a, b); ctx.lineTo(c, e); } ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.active) {   // vértices de las interfaces (agarraderas)
      for (let i = 0; i < d.interfaces.length; i++) for (const v of d.interfaces[i]) { const [px, py] = tf(v[0], v[1]); ctx.fillStyle = i === 0 ? "#d08a3e" : "#2c7be5"; ctx.fillRect(px - 3, py - 3, 6, 6); }
      for (const a of d.assign) { const [px, py] = tf(a.p[0], a.p[1]); ctx.strokeStyle = "#0a6e3a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, 5, 0, 2 * Math.PI); ctx.stroke(); ctx.fillStyle = "#0a6e3a"; ctx.font = "11px Segoe UI"; ctx.textAlign = "left"; ctx.fillText(a.soil, px + 7, py - 6); }
    }
    if (this.cur.length) {
      ctx.strokeStyle = "#e5382b"; ctx.lineWidth = 1.8; ctx.beginPath();
      this.cur.forEach((p, k) => { const [px, py] = tf(p[0], p[1]); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      if (this.mouse) { const [px, py] = tf(this.mouse[0], this.mouse[1]); ctx.lineTo(px, py); }
      ctx.stroke();
      for (const p of this.cur) { const [px, py] = tf(p[0], p[1]); ctx.fillStyle = "#e5382b"; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 2 * Math.PI); ctx.fill(); }
    }
    if (this.mouse && this.active) {   // cursor en cruz con el punto ya ajustado
      const [px, py] = tf(this.mouse[0], this.mouse[1]);
      ctx.strokeStyle = "#e5382b"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - 9, py); ctx.lineTo(px + 9, py); ctx.moveTo(px, py - 9); ctx.lineTo(px, py + 9); ctx.stroke();
      ctx.strokeRect(px - 4, py - 4, 8, 8);
    }
  }
}

function terrainY(d: SlopeDef, x: number): number { const m = d.margins!; return interfaceY(spanInterface(d.interfaces[0], m.xmin, m.xmax), x); }
export function regionOf(d: SlopeDef, p: Pt): number {
  const m = d.margins!;
  return d.interfaces.reduce((n, it) => n + (interfaceY(spanInterface(it, m.xmin, m.xmax), p[0]) > p[1] + 1e-9 ? 1 : 0), 0);
}
