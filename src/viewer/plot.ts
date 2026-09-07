// Visor 2D (Canvas) del talud: campo por bandas con la ESCALA DE GEO5, malla T6, contorno, interfaz
// de suelos, rótulos de suelo, cargas de la etapa y barra de color. Calca talud_plot_lib.plot_stage.
import { FIELD_LABEL, FieldKind, geo5Cmap, geo5Levels, gridField } from "./geo5scale";

export type PlotModel = { X: number[]; Y: number[]; ELE: number[][]; EMAT: number[]; MAT: number[][]; Fs: number[]; Fa: number[]; MATNAMES?: string[] };

export type PlotOptions = {
  field: FieldKind;
  vals: Float64Array;       // campo nodal en mm (nodalField)
  title: string;
  stage: number;            // índice de etapa
  Fst?: Float64Array;       // cargas de la etapa SIN gravedad (sobrecargas y anclas) para dibujarlas
  showMesh: boolean;
  deformScale?: number;     // 0 = sin deformada
  u?: Float64Array; uel?: Float64Array;
};

type Edge = { a: number; b: number; count: number; mats: Set<number> };

export class SlopePlot {
  /** tema oscuro (vídeos de Hekatan School: fondo negro de borde a borde, texto claro, sin recuadro) */
  dark = false;
  /** factor de escala de fuentes/márgenes/trazos (2 = lienzo 2x para vídeo) */
  k = 1;
  private edges: Edge[] = [];
  private ctx: CanvasRenderingContext2D;
  private cache: { key: string; img: ImageData; lv: number[]; cmap: [number, number, number][] } | null = null;
  hover: ((info: { x: number; z: number; v: number | null }) => void) | null = null;
  private last: { grid: ReturnType<typeof gridField>; tf: (x: number, z: number) => [number, number]; inv: (px: number, py: number) => [number, number] } | null = null;

  constructor(private canvas: HTMLCanvasElement, private m: PlotModel) {
    this.ctx = canvas.getContext("2d")!;
    this.setMesh(m);
    canvas.addEventListener("mousemove", (ev) => {
      if (!this.last || !this.hover) return;
      const r = canvas.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (canvas.width / r.width), py = (ev.clientY - r.top) * (canvas.height / r.height);
      const [x, z] = this.last.inv(px, py);
      const g = this.last.grid;
      const i = Math.round((x - g.xmin) / (g.xmax - g.xmin) * (g.NX - 1)), j = Math.round((z - g.zmin) / (g.zmax - g.zmin) * (g.NZ - 1));
      const v = i >= 0 && i < g.NX && j >= 0 && j < g.NZ ? g.Z[j * g.NX + i] : NaN;
      this.hover({ x, z, v: Number.isNaN(v) ? null : v });
    });
    canvas.addEventListener("mouseleave", () => this.hover?.({ x: 0, z: 0, v: null }));
  }

  /** Malla nueva (otro modelo del DSL): rehace las aristas. */
  setMesh(m: PlotModel): void {
    this.m = m;
    const map = new Map<string, Edge>();
    for (let e = 0; e < m.ELE.length; e++) {
      const c = m.ELE[e];
      for (const [p, q] of [[0, 1], [1, 2], [2, 0]]) {
        const a = Math.min(c[p], c[q]), b = Math.max(c[p], c[q]), k = a + "," + b;
        let ed = map.get(k); if (!ed) { ed = { a, b, count: 0, mats: new Set() }; map.set(k, ed); }
        ed.count++; ed.mats.add(m.EMAT[e]);
      }
    }
    this.edges = Array.from(map.values());
  }

  /** Transformación mundo↔píxel del último dibujo (para la capa de herramientas). */
  mapping() { return this.last ? { tf: this.last.tf, inv: this.last.inv } : null; }

  /** Sliders: materiales y cargas nuevas sin rehacer las aristas (misma malla). */
  setModel(m: PlotModel): void { this.m = m; }

  draw(o: PlotOptions): { lv: number[]; vmin: number; vmax: number } {
    const { X, Y, ELE, EMAT, MAT, Fs, Fa } = this.m;
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const FG = this.dark ? "#f3ead0" : "#000", BG = this.dark ? "#000" : "#fff";
    const k = this.k;   // 2 en modo vídeo: fuentes, márgenes y trazos al doble sobre un lienzo 2x (nitidez)
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    // extremos de la barra = nudos ESQUINA
    let vmin = Infinity, vmax = -Infinity;
    for (const el of ELE) for (let k = 0; k < 3; k++) { const v = o.vals[el[k]]; if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
    const flat = !(vmax - vmin > 1e-9);                 // sin campo (vista inicial): solo geometría
    const lv = flat ? [0, 1] : geo5Levels(vmin, vmax), cmap = geo5Cmap(lv.length - 1);
    const grid = gridField(X, Y, ELE, o.vals);
    // marco: ejes con aspecto 1:1
    const mL = 62 * k, mR = 118 * k, mT = 40 * k, mB = 48 * k;
    const xr = grid.xmax - grid.xmin + 2, zr = grid.zmax - grid.zmin + 4;
    const sc = Math.min((W - mL - mR) / xr, (H - mT - mB) / zr);
    const pw = xr * sc, ph = zr * sc, x0 = mL + (W - mL - mR - pw) / 2, y0 = mT + (H - mT - mB - ph) / 2;
    const tf = (x: number, z: number): [number, number] => [x0 + (x - (grid.xmin - 1)) * sc, y0 + ph - (z - (grid.zmin - 1)) * sc];
    const inv = (px: number, py: number): [number, number] => [(px - x0) / sc + grid.xmin - 1, (y0 + ph - py) / sc + grid.zmin - 1];
    this.last = { grid, tf, inv };
    // relleno por bandas (rejilla → píxeles)
    const [ax0, az0] = tf(grid.xmin, grid.zmax), [ax1, az1] = tf(grid.xmax, grid.zmin);
    const iw = Math.max(1, Math.round(ax1 - ax0)), ih = Math.max(1, Math.round(az1 - az0));
    if (!flat) {
      // relleno por píxel con interpolación BILINEAL de la rejilla (como el contourf: bandas lisas, no
      // escalones de celda); una celda con NaN parcial se interpola con las esquinas válidas.
      const img = ctx.createImageData(iw, ih);
      const d = img.data, NX = grid.NX, NZ = grid.NZ, Zg = grid.Z;
      const bgR = this.dark ? 0 : 255, bgG = bgR, bgB = bgR;
      for (let py = 0; py < ih; py++) {
        const gz = (grid.zmax - (py + 0.5) / ih * (grid.zmax - grid.zmin) - grid.zmin) / (grid.zmax - grid.zmin) * (NZ - 1);
        const j = Math.min(NZ - 2, Math.max(0, Math.floor(gz))), tz = Math.min(1, Math.max(0, gz - j));
        for (let px = 0; px < iw; px++) {
          const gx = (px + 0.5) / iw * (NX - 1);
          const i = Math.min(NX - 2, Math.max(0, Math.floor(gx))), tx = Math.min(1, Math.max(0, gx - i));
          const z00 = Zg[j * NX + i], z01 = Zg[j * NX + i + 1], z10 = Zg[(j + 1) * NX + i], z11 = Zg[(j + 1) * NX + i + 1];
          let vs = 0, ws = 0;
          const w00 = (1 - tx) * (1 - tz), w01 = tx * (1 - tz), w10 = (1 - tx) * tz, w11 = tx * tz;
          if (!Number.isNaN(z00)) { vs += w00 * z00; ws += w00; }
          if (!Number.isNaN(z01)) { vs += w01 * z01; ws += w01; }
          if (!Number.isNaN(z10)) { vs += w10 * z10; ws += w10; }
          if (!Number.isNaN(z11)) { vs += w11 * z11; ws += w11; }
          const q = (py * iw + px) * 4;
          if (ws <= 1e-12) { d[q] = bgR; d[q + 1] = bgG; d[q + 2] = bgB; d[q + 3] = 255; continue; }   // fuera del talud: color de fondo del tema (alpha 0 dejaba ver el CSS blanco del canvas)
          const v = vs / ws;
          const vc = Math.min(Math.max(v, lv[0]), lv[lv.length - 1]);
          let b = 0; while (b < lv.length - 2 && vc >= lv[b + 1]) b++;
          const c = cmap[b]; d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
        }
      }
      ctx.putImageData(img, Math.round(ax0), Math.round(az0));
    }
    // líneas de nivel finas (bordes de banda): se marcan cambiando de banda entre píxeles vecinos
    ctx.strokeStyle = "rgba(50,50,50,0.35)"; ctx.lineWidth = 0.5;
    // malla T6, interfaz, contorno
    const line = (a: number, b: number) => { const [p, q] = tf(X[a], Y[a]), [r, s] = tf(X[b], Y[b]); ctx.moveTo(p, q); ctx.lineTo(r, s); };
    if (o.showMesh) { ctx.beginPath(); ctx.strokeStyle = this.dark ? "rgba(255,255,255,0.35)" : "rgba(60,60,60,0.45)"; ctx.lineWidth = 0.5 * k; for (const e of this.edges) line(e.a, e.b); ctx.stroke(); }
    ctx.beginPath(); ctx.strokeStyle = FG; ctx.lineWidth = 1.6 * k; ctx.setLineDash([6 * k, 4 * k]); for (const e of this.edges) if (e.mats.size === 2) line(e.a, e.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.strokeStyle = FG; ctx.lineWidth = 1.4 * k; for (const e of this.edges) if (e.count === 1) line(e.a, e.b); ctx.stroke();
    // deformada (opcional): contorno desplazado
    if (o.deformScale && o.u && o.uel) {
      ctx.beginPath(); ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.2 * k;
      for (const e of this.edges) if (e.count === 1) {
        const f = o.deformScale;
        const [p, q] = tf(X[e.a] + f * (o.u[2 * e.a] - o.uel[2 * e.a]), Y[e.a] + f * (o.u[2 * e.a + 1] - o.uel[2 * e.a + 1]));
        const [r, s] = tf(X[e.b] + f * (o.u[2 * e.b] - o.uel[2 * e.b]), Y[e.b] + f * (o.u[2 * e.b + 1] - o.uel[2 * e.b + 1]));
        ctx.moveTo(p, q); ctx.lineTo(r, s);
      }
      ctx.stroke();
    }
    // rótulos de suelo en el centroide de cada material
    const cen = (mat: number) => { let sx = 0, sy = 0, n = 0; for (let e = 0; e < ELE.length; e++) if (EMAT[e] === mat) { const c = ELE[e]; sx += (X[c[0]] + X[c[1]] + X[c[2]]) / 3; sy += (Y[c[0]] + Y[c[1]] + Y[c[2]]) / 3; n++; } return [sx / n, sy / n]; };
    const box = (x: number, z: number, lines: string[]) => {
      const [px, py] = tf(x, z); ctx.font = `${11 * k}px Segoe UI, Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12 * k, h = lines.length * 14 * k + 6 * k;
      ctx.fillStyle = this.dark ? "rgba(20,17,10,0.88)" : "rgba(255,255,255,0.88)"; ctx.strokeStyle = FG; ctx.lineWidth = 0.8 * k;
      ctx.fillRect(px - w / 2, py - h / 2, w, h); ctx.strokeRect(px - w / 2, py - h / 2, w, h);
      ctx.fillStyle = FG; lines.forEach((l, i) => ctx.fillText(l, px, py - h / 2 + (10 + i * 14) * k));
    };
    for (let mi = 0; mi < MAT.length; mi++) {
      if (!EMAT.includes(mi + 1)) continue;
      const [cxm, cym] = cen(mi + 1);
      const nm = this.m.MATNAMES?.[mi] ?? `SUELO ${mi + 1}`;
      // capas finas: cajas alternadas en x para que no se pisen
      box(cxm + [0, -8, 8, -16, 16][mi % 5], cym - (mi === 1 ? 2.5 : 0), [nm, `φ=${MAT[mi][2].toFixed(1)}°  c=${MAT[mi][3].toFixed(0)} kPa`, `γ=${MAT[mi][4].toFixed(0)} kN/m³`]);
    }
    // cargas de la etapa
    const arrow = (xa: number, za: number, xb: number, zb: number, lw: number) => {
      const [p, q] = tf(xa, za), [r, s] = tf(xb, zb); const ang = Math.atan2(s - q, r - p), hl = 7 * k;
      ctx.beginPath(); ctx.strokeStyle = FG; ctx.lineWidth = lw * k; ctx.moveTo(p, q); ctx.lineTo(r, s);
      ctx.moveTo(r, s); ctx.lineTo(r - hl * Math.cos(ang - 0.45), s - hl * Math.sin(ang - 0.45));
      ctx.moveTo(r, s); ctx.lineTo(r - hl * Math.cos(ang + 0.45), s - hl * Math.sin(ang + 0.45)); ctx.stroke();
    };
    ctx.fillStyle = FG; ctx.font = `${11 * k}px Segoe UI, Arial`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    // cargas de la etapa (sin gravedad): verticales puras = sobrecarga (flechas hacia abajo); con Fx = ancla
    const Fst = o.Fst ?? (() => { const f = new Float64Array(2 * X.length); if (o.stage >= 1) for (let d = 0; d < f.length; d++) f[d] += Fs[d]; if (o.stage >= 2) for (let d = 0; d < f.length; d++) f[d] += Fa[d]; return f; })();
    const xs: number[] = []; let zq = 0, sumQ = 0, fx = 0, fy = 0, ia = -1, best = 0;
    for (let i = 0; i < X.length; i++) {
      const px = Fst[2 * i], py = Fst[2 * i + 1];
      if (Math.abs(px) < 1e-9 && Math.abs(py) > 1e-9) { sumQ += py; if (py < 0) { arrow(X[i], Y[i] + 1.6, X[i], Y[i], 0.9); xs.push(X[i]); zq = Y[i]; } }   // el neto incluye los extremos positivos del reparto de GEO5
      else if (Math.abs(px) > 1e-9) { fx += px; fy += py; const v = Math.hypot(px, py); if (v > best) { best = v; ia = i; } }
    }
    if (xs.length) { const [p, q] = tf(xs.reduce((a, b) => a + b, 0) / xs.length, zq + 2.0); ctx.fillText(`q · L = ${(-sumQ).toFixed(0)} kN`, p, q); }
    if (ia >= 0) {
      const L = 4 / Math.hypot(fx, fy);
      arrow(X[ia], Y[ia], X[ia] + fx * L, Y[ia] + fy * L, 1.6);
      const [p, q] = tf(X[ia] - 0.4, Y[ia] + 0.6); ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(`ancla ${Math.hypot(fx, fy).toFixed(0)} kN`, p, q);
    }
    // ejes
    ctx.strokeStyle = FG; ctx.lineWidth = 1 * k; ctx.strokeRect(x0, y0, pw, ph);
    ctx.fillStyle = FG; ctx.font = `${11 * k}px Segoe UI, Arial`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    const xt0 = Math.ceil((grid.xmin - 1) / 5) * 5;
    for (let x = xt0; x <= grid.xmax + 1; x += 5) { const [p] = tf(x, 0); ctx.fillText(String(x), p, y0 + ph + 4 * k); ctx.beginPath(); ctx.moveTo(p, y0 + ph); ctx.lineTo(p, y0 + ph - 4 * k); ctx.stroke(); }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const zt0 = Math.ceil((grid.zmin - 1) / 5) * 5;
    for (let z = zt0; z <= grid.zmax + 3; z += 5) { const [, q] = tf(0, z); ctx.fillText(String(z), x0 - 6 * k, q); ctx.beginPath(); ctx.moveTo(x0, q); ctx.lineTo(x0 + 4 * k, q); ctx.stroke(); }
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText("x [m]", x0 + pw / 2, H - 4 * k);
    ctx.save(); ctx.translate(14 * k, y0 + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = "top"; ctx.fillText("z [m]", 0, 0); ctx.restore();
    ctx.font = `bold ${13 * k}px Segoe UI, Arial`; ctx.textBaseline = "bottom"; ctx.fillText(o.title, x0 + pw / 2, mT - 8 * k);
    // barra de color (mínimo abajo, como la GUI de GEO5 muestra su rango)
    if (flat) return { lv, vmin, vmax };
    const bx = x0 + pw + 22 * k, by = y0, bh = ph, bw = 18 * k, nb = lv.length - 1;
    for (let b = 0; b < nb; b++) {
      const t0 = (lv[b] - lv[0]) / (lv[nb] - lv[0]), t1 = (lv[b + 1] - lv[0]) / (lv[nb] - lv[0]);
      const c = cmap[b]; ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(bx, by + bh - t1 * bh, bw, (t1 - t0) * bh);
    }
    ctx.strokeStyle = FG; ctx.lineWidth = 0.8 * k; ctx.strokeRect(bx, by, bw, bh);
    ctx.font = `${10 * k}px Segoe UI, Arial`; ctx.fillStyle = FG; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    let lastY = -1e9;
    for (let b = 0; b <= nb; b++) {
      const t = (lv[b] - lv[0]) / (lv[nb] - lv[0]); const y = by + bh - t * bh;
      ctx.beginPath(); ctx.moveTo(bx + bw, y); ctx.lineTo(bx + bw + 3 * k, y); ctx.stroke();
      if (Math.abs(y - lastY) < 10 * k && b < nb) continue;                 // rótulos que se pisan: el extremo manda
      if (b === nb && Math.abs(y - lastY) < 10 * k) { ctx.fillStyle = BG; ctx.fillRect(bx + bw + 4 * k, lastY - 6 * k, 40 * k, 12 * k); ctx.fillStyle = FG; }
      ctx.fillText(lv[b].toFixed(1), bx + bw + 5 * k, y); lastY = y;
    }
    ctx.save(); ctx.translate(bx + bw + 46 * k, by + bh / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.font = `${11 * k}px Segoe UI, Arial`; ctx.fillText(`${FIELD_LABEL[o.field]} [mm]`, 0, 0); ctx.restore();
    return { lv, vmin, vmax };
  }
}
