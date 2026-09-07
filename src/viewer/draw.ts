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
export type DrawState = { tool: Tool; grid: number; snap: boolean; osnap: boolean; ortho: boolean; soil: string; q: number; F: number; ang: number; stage: number };
type SnapKind = "extremo" | "medio" | "interseccion" | "perpendicular" | "cercano" | "rejilla" | "margen" | null;

type Map2 = { tf: (x: number, z: number) => [number, number]; inv: (px: number, py: number) => [number, number] };

export class DrawTools {
  state: DrawState = { tool: "ver", grid: 1, snap: true, osnap: true, ortho: false, soil: "", q: 35, F: 72, ang: -17, stage: 0 };
  /** escala de trazos/marcadores (2 = lienzo 2x para vídeo) */
  k = 1;
  private snapKind: SnapKind = null;         // qué snap atrapó el cursor (para el marcador y el estado)
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
      if (e.key === "F9") { e.preventDefault(); this.state.snap = !this.state.snap; this.status(`snap rejilla ${this.state.snap ? "ON" : "OFF"}`); }
      if (e.key === "F3") { e.preventDefault(); this.state.osnap = !this.state.osnap; this.status(`snap a objetos ${this.state.osnap ? "ON" : "OFF"}`); }
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
  /** tolerancia de snap en unidades del mundo = 10 px de pantalla */
  private tolWorld(): number { if (!this.map) return 0.3; const [a] = this.map.tf(0, 0), [b] = this.map.tf(1, 0); return 14 / Math.max(Math.abs(b - a), 1e-9); }
  /** segmentos de todas las interfaces (estiradas a los márgenes) */
  private segments(): [Pt, Pt, number][] {
    const out: [Pt, Pt, number][] = []; if (!this.def?.margins) return out;
    const m = this.def.margins;
    this.def.interfaces.forEach((it, k) => { const sp = spanInterface(it, m.xmin, m.xmax); for (let i = 0; i + 1 < sp.length; i++) out.push([sp[i], sp[i + 1], k]); });
    return out;
  }
  /** SNAP A OBJETOS como AutoCAD/Revit: extremo > intersección > punto medio > perpendicular > más cercano; luego rejilla; orto */
  private snapPt(p: Pt, ref?: Pt): Pt {
    let [x, y] = p; this.snapKind = null;
    const tol = this.tolWorld();
    if (this.state.osnap && this.def) {
      const segs = this.segments();
      // prioridad por NIVELES como AutoCAD: extremo/intersección > medio > perpendicular > cercano (el más
      // cercano siempre está más cerca que el extremo: si ganara por distancia nunca se atraparía un extremo)
      let best: { d: number; p: Pt; k: SnapKind; prio: number } | null = null;
      const cand = (q: Pt, k: SnapKind, prio: number) => { const d = Math.hypot(q[0] - x, q[1] - y); if (d < tol * (k === "cercano" ? 0.7 : 1) && (!best || prio < best.prio || (prio === best.prio && d < best.d))) best = { d, p: [q[0], q[1]], k, prio }; };
      for (const [a, b] of segs) { cand(a, "extremo", 0); cand(b, "extremo", 0); cand([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], "medio", 2); }
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (segs[i][2] !== segs[j][2]) { const q = segIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1]); if (q) cand(q, "interseccion", 1); }
      if (ref) for (const [a, b] of segs) { const q = footOnSegment(ref, a, b); if (q) cand(q, "perpendicular", 3); }
      for (const [a, b] of segs) { const q = footOnSegment([x, y], a, b); if (q) cand(q, "cercano", 4); }
      if (best) { this.snapKind = (best as { k: SnapKind }).k; return (best as { p: Pt }).p; }
    }
    if (this.def?.margins) {   // imán a los márgenes (GEO5 exige que la interfaz llegue de borde a borde)
      const m = this.def.margins;
      if (Math.abs(x - m.xmin) < tol) { x = m.xmin; this.snapKind = "margen"; } if (Math.abs(x - m.xmax) < tol) { x = m.xmax; this.snapKind = "margen"; }
    }
    if (this.state.snap && this.state.grid > 0) { x = Math.round(x / this.state.grid) * this.state.grid; y = Math.round(y / this.state.grid) * this.state.grid; if (!this.snapKind) this.snapKind = "rejilla"; }
    if (ref && (this.state.ortho || this.shift)) { if (Math.abs(x - ref[0]) > Math.abs(y - ref[1])) y = ref[1]; else x = ref[0]; }
    return [x, y];
  }
  private onMove(e: MouseEvent) {
    if (!this.map) return;
    const raw = this.world(e);
    this.mouse = this.active ? this.snapPt(raw, this.cur[this.cur.length - 1]) : raw;
    if (this.drag && this.def) { const it = this.def.interfaces[this.drag.it]; it[this.drag.k] = this.snapPt(raw); }
    this.render();
    if (this.mouse) this.status(`x = ${this.mouse[0].toFixed(2)}   z = ${this.mouse[1].toFixed(2)}${this.snapKind ? "   ◆ " + this.snapKind : ""}${this.state.snap ? "   [rejilla " + this.state.grid + " m]" : ""}${this.state.ortho || this.shift ? "   [orto]" : ""}`);
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
      case "mover": { const hit = this.hitVertex(p); if (hit) { this.push(); this.drag = hit; if (hit.it === 0) delete d.param; } break; }
      case "borrar": {
        const hit = this.hitVertex(p);
        if (hit) { this.push(); const it = d.interfaces[hit.it]; if (hit.it === 0) delete d.param; if (it.length > 2) it.splice(hit.k, 1); else if (hit.it > 0) d.interfaces.splice(hit.it, 1); this.commit("vértice borrado"); break; }
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
      for (let x = m.xmin; x <= m.xmax + 1e-9; x += g * step) for (let y = m.bottom; y <= ytop + 1e-9; y += g * step) { const [px, py] = tf(x, y); ctx.fillRect(px - 0.6 * this.k, py - 0.6 * this.k, 1.2 * this.k, 1.2 * this.k); }
      ctx.strokeStyle = "rgba(208,138,62,0.7)"; ctx.setLineDash([4 * this.k, 3 * this.k]); ctx.lineWidth = this.k;
      ctx.beginPath(); for (const x of [m.xmin, m.xmax]) { const [a, b] = tf(x, m.bottom), [c, e] = tf(x, ytop); ctx.moveTo(a, b); ctx.lineTo(c, e); } ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.active) {   // vértices de las interfaces (agarraderas)
      for (let i = 0; i < d.interfaces.length; i++) for (const v of d.interfaces[i]) { const [px, py] = tf(v[0], v[1]); ctx.fillStyle = i === 0 ? "#d08a3e" : "#2c7be5"; ctx.fillRect(px - 3 * this.k, py - 3 * this.k, 6 * this.k, 6 * this.k); }
      for (const a of d.assign) { const [px, py] = tf(a.p[0], a.p[1]); ctx.strokeStyle = "#0a6e3a"; ctx.lineWidth = 1.5 * this.k; ctx.beginPath(); ctx.arc(px, py, 5 * this.k, 0, 2 * Math.PI); ctx.stroke(); ctx.fillStyle = "#0a6e3a"; ctx.font = `${11 * this.k}px Segoe UI`; ctx.textAlign = "left"; ctx.fillText(a.soil, px + 7 * this.k, py - 6 * this.k); }
    }
    if (this.cur.length) {
      ctx.strokeStyle = "#e5382b"; ctx.lineWidth = 1.8 * this.k; ctx.beginPath();
      this.cur.forEach((p, k) => { const [px, py] = tf(p[0], p[1]); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      if (this.mouse) { const [px, py] = tf(this.mouse[0], this.mouse[1]); ctx.lineTo(px, py); }
      ctx.stroke();
      for (const p of this.cur) { const [px, py] = tf(p[0], p[1]); ctx.fillStyle = "#e5382b"; ctx.beginPath(); ctx.arc(px, py, 3.5 * this.k, 0, 2 * Math.PI); ctx.fill(); }
    }
    if (this.mouse && this.active) {   // cursor en cruz con el punto ya ajustado + marcador del snap (AutoCAD)
      const [px, py] = tf(this.mouse[0], this.mouse[1]);
      const s = this.k;
      ctx.strokeStyle = "#e5382b"; ctx.lineWidth = s; ctx.beginPath(); ctx.moveTo(px - 9 * s, py); ctx.lineTo(px + 9 * s, py); ctx.moveTo(px, py - 9 * s); ctx.lineTo(px, py + 9 * s); ctx.stroke();
      ctx.save(); ctx.translate(px, py); ctx.scale(s, s); ctx.translate(-px, -py);
      const k = this.snapKind; ctx.strokeStyle = "#ffb300"; ctx.lineWidth = 2; ctx.beginPath();
      if (k === "extremo") ctx.rect(px - 6, py - 6, 12, 12);
      else if (k === "medio") { ctx.moveTo(px, py - 7); ctx.lineTo(px + 7, py + 6); ctx.lineTo(px - 7, py + 6); ctx.closePath(); }
      else if (k === "interseccion") { ctx.moveTo(px - 6, py - 6); ctx.lineTo(px + 6, py + 6); ctx.moveTo(px - 6, py + 6); ctx.lineTo(px + 6, py - 6); }
      else if (k === "perpendicular") { ctx.moveTo(px - 6, py - 6); ctx.lineTo(px - 6, py + 6); ctx.lineTo(px + 6, py + 6); ctx.moveTo(px - 6, py); ctx.lineTo(px, py); ctx.lineTo(px, py + 6); }
      else if (k === "cercano") { ctx.moveTo(px - 6, py - 6); ctx.lineTo(px + 6, py - 6); ctx.lineTo(px - 6, py + 6); ctx.lineTo(px + 6, py + 6); ctx.closePath(); }
      else if (k === "margen") { ctx.moveTo(px, py - 8); ctx.lineTo(px, py + 8); ctx.moveTo(px - 4, py - 8); ctx.lineTo(px + 4, py - 8); ctx.moveTo(px - 4, py + 8); ctx.lineTo(px + 4, py + 8); }
      else ctx.rect(px - 3, py - 3, 6, 6);
      ctx.stroke();
      if (k && k !== "rejilla") { ctx.fillStyle = "#ffb300"; ctx.font = "11px Segoe UI"; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText(k, px + 10, py - 8); }
      ctx.restore();
    }
  }
}

function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}
/** pie de la perpendicular desde p al segmento ab (null si cae fuera) */
function footOnSegment(p: Pt, a: Pt, b: Pt): Pt | null {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-12) return null;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; if (t < 0 || t > 1) return null;
  return [a[0] + t * dx, a[1] + t * dy];
}
function terrainY(d: SlopeDef, x: number): number { const m = d.margins!; return interfaceY(spanInterface(d.interfaces[0], m.xmin, m.xmax), x); }
export function regionOf(d: SlopeDef, p: Pt): number {
  const m = d.margins!;
  return d.interfaces.reduce((n, it) => n + (interfaceY(spanInterface(it, m.xmin, m.xmax), p[0]) > p[1] + 1e-9 ? 1 : 0), 0);
}
