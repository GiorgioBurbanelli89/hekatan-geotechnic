// «Importar resultados de GEO5»: dibujo RÁPIDO de lo que GEO5 exporta, con SU escala y SU paleta (geo5scale.ts).
// Acepta, en cualquier orden y de a varios archivos:
//   · DXF de GeoFEM (File → Export → «Data into CAD file…»)       → malla y regiones activas de la etapa
//   · InputFile.txt del solver (malla: nudos y T6)                 → malla con nudos y elementos reales de GEO5
//   · Output_File_Geo.bin (solo análisis de estabilidad)           → campos nodales; con el InputFile se pinta el mapa de color
// No hay capturas de pantalla como dato: todo sale de los números del archivo.
import { gridField, geo5Levels, geo5Cmap } from "../viewer/geo5scale";
import { leerDxfGeo5, type MallaGeo5Dxf } from "./geo5Dxf";
import { leerOutputGeo, type SalidaGeo5 } from "./geo5Bin";

export interface MallaInput { X: number[]; Y: number[]; ELE: number[][] }

/** Malla de un InputFile.txt de GEO5: `nodes` (id x= y=) y `elements` (n nodes=[a,b,c,d,e,f]); índices 0-based. */
export function leerInputFileGeo5(texto: string): MallaInput {
  const L = texto.replace(/\r/g, "").split("\n");
  const X: number[] = [], Y: number[] = [], ELE: number[][] = [];
  let modo = "";
  for (const l of L) {
    const t = l.trim();
    if (t === "nodes") { modo = "n"; continue; }
    if (t === "elements") { modo = "e"; continue; }
    if (modo && /^[a-z_]+$/.test(t) && t !== "nodes" && t !== "elements") { modo = ""; continue; }
    if (t === "end") { modo = ""; continue; }
    if (modo === "n") {
      const m = /^(\d+)\s+x=(\S+)\s+y=(\S+)/.exec(t); if (m) { X[+m[1] - 1] = parseFloat(m[2]); Y[+m[1] - 1] = parseFloat(m[3]); }
    } else if (modo === "e") {
      const m = /nodes=\[([\d,\s]+)\]/.exec(t); if (m) { const a = m[1].split(",").map((v) => parseInt(v, 10) - 1); if (a.length >= 3) ELE.push(a); }
    }
  }
  if (!X.length || !ELE.length) throw new Error("no encuentro `nodes` y `elements` en el InputFile");
  return { X, Y, ELE };
}

const NOMBRE_CAMPO: Record<number, [string, number, string]> = {   // id → [nombre, factor a unidad de pantalla, unidad]
  0x66: ["Desplazamiento d_x", 1000, "mm"], 0x67: ["Desplazamiento d_z", 1000, "mm"],
  0x7e: ["Deformación recuperada 1 (0x7e)", 1, "-"], 0x7f: ["Deformación recuperada 2 (0x7f)", 1, "-"], 0x80: ["Deformación recuperada 3 (0x80)", 1, "-"],
  0x81: ["Deformación plástica equivalente (0x81)", 100, "%"], 0x82: ["Campo 0x82", 1, "-"], 0x83: ["Campo 0x83", 100, "%"], 0x9c: ["Deformación plástica equivalente (0x9c)", 100, "%"],
};

function lienzoBase(cv: HTMLCanvasElement, x0: number, x1: number, y0: number, y1: number, titulo: string) {
  const W = cv.width, H = cv.height, mg = { l: 56, r: 150, t: 36, b: 34 };
  const g = cv.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  const s = Math.min((W - mg.l - mg.r) / (x1 - x0), (H - mg.t - mg.b) / (y1 - y0));
  const ox = mg.l, oy = mg.t + (H - mg.t - mg.b) - (y1 - y0) * s - ((H - mg.t - mg.b) - (y1 - y0) * s) / 2;
  const px = (x: number) => ox + (x - x0) * s, py = (y: number) => oy + (y1 - y) * s;
  g.fillStyle = "#222"; g.font = "bold 15px system-ui"; g.fillText(titulo, mg.l, 22);
  return { g, px, py, s, W, H, mg };
}

/** Malla y regiones activas del DXF de GEO5 (lados rectos entre esquinas). */
export function dibujarMallaDxf(cv: HTMLCanvasElement, m: MallaGeo5Dxf, titulo = "Malla de GEO5 (DXF de GeoFEM)") {
  const [x0, y0, x1, y1] = m.bbox; const { g, px, py } = lienzoBase(cv, x0, x1, y0, y1, titulo);
  g.strokeStyle = "#3b3bc4"; g.lineWidth = 0.6; g.beginPath();
  for (const [a, b, c, d] of m.lados) { g.moveTo(px(a), py(b)); g.lineTo(px(c), py(d)); } g.stroke();
  g.strokeStyle = "#c43b3b"; g.lineWidth = 1.4;
  for (const ar of m.areas) { g.beginPath(); ar.forEach((p, i) => (i ? g.lineTo(px(p.x), py(p.y)) : g.moveTo(px(p.x), py(p.y)))); g.closePath(); g.stroke(); }
  g.fillStyle = "#555"; g.font = "12px system-ui";
  g.fillText(`${m.lados.length} lados · ${m.nudos.length} nudos esquina · ${m.areas.length} regiones activas`, 56, cv.height - 10);
}

/** Mapa de color de GEO5: isosuperficie por bandas con su escala (paso máx−mín/11 al 0.5) y su paleta. `vals` por nudo (esquinas). */
export function dibujarMapaGeo5(cv: HTMLCanvasElement, m: MallaInput, vals: Float64Array | number[], titulo: string, unidad: string) {
  const gf = gridField(m.X, m.Y, m.ELE, vals, 560, 380);
  let vmin = Infinity, vmax = -Infinity;
  for (const e of m.ELE) for (const k of e.slice(0, 3)) { const v = vals[k]; if (Number.isFinite(v)) { if (v < vmin) vmin = v; if (v > vmax) vmax = v; } }   // extremos = esquinas
  const lv = geo5Levels(vmin, vmax), nb = Math.max(1, lv.length - 1), cm = geo5Cmap(nb);
  const { g, px, py, W, H, mg } = lienzoBase(cv, gf.xmin, gf.xmax, gf.zmin, gf.zmax, `${titulo} [${unidad}]`);
  const w = Math.abs(px(gf.xmax) - px(gf.xmin)), h = Math.abs(py(gf.zmin) - py(gf.zmax));
  const off = document.createElement("canvas"); off.width = gf.NX; off.height = gf.NZ; const og = off.getContext("2d")!, im = og.createImageData(gf.NX, gf.NZ);
  for (let j = 0; j < gf.NZ; j++) for (let i = 0; i < gf.NX; i++) {
    const v = gf.Z[j * gf.NX + i], o = ((gf.NZ - 1 - j) * gf.NX + i) * 4; if (!Number.isFinite(v)) { im.data[o + 3] = 0; continue; }
    let k = 0; while (k < nb - 1 && v >= lv[k + 1]) k++;
    const c = cm[k]; im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = 255;
  }
  og.putImageData(im, 0, 0); g.imageSmoothingEnabled = false;
  g.drawImage(off, px(gf.xmin), py(gf.zmax), w, h);
  // barra de colores con los niveles de GEO5
  const bx = W - mg.r + 24, bh = Math.min(260, H - mg.t - mg.b - 20), by = mg.t + 10, bw = 22;
  for (let k = 0; k < nb; k++) { g.fillStyle = `rgb(${cm[k].join(",")})`; g.fillRect(bx, by + bh - ((k + 1) * bh) / nb, bw, bh / nb + 0.5); }
  g.fillStyle = "#222"; g.font = "11px system-ui";
  lv.forEach((v, k) => g.fillText(v.toFixed(Math.abs(v) < 10 ? 2 : 1), bx + bw + 5, by + bh - (k * bh) / nb + 4));
  return { vmin, vmax, niveles: lv };
}

/** Conecta el botón: abre un cuadro con el dibujo y un selector de campo. `abrir` = elemento que dispara el selector de archivos. */
export function montarImportadorGeo5(boton: HTMLElement, entrada: HTMLInputElement, estado: HTMLElement) {
  boton.addEventListener("click", () => entrada.click());
  entrada.addEventListener("change", async () => {
    const fs = Array.from(entrada.files ?? []); entrada.value = ""; if (!fs.length) return;
    let dxf: MallaGeo5Dxf | null = null, inp: MallaInput | null = null, bin: SalidaGeo5 | null = null; const avisos: string[] = [];
    for (const f of fs) {
      try {
        if (/\.dxf$/i.test(f.name)) dxf = leerDxfGeo5(await f.text());
        else if (/\.bin$/i.test(f.name)) bin = leerOutputGeo(await f.arrayBuffer());
        else inp = leerInputFileGeo5(await f.text());
      } catch (e) { avisos.push(`${f.name}: ${(e as Error).message}`); }
    }
    if (!dxf && !inp && !bin) { estado.textContent = "✖ no pude leer nada: " + avisos.join(" · "); return; }
    document.getElementById("g5Dlg")?.remove();
    const box = document.createElement("div"); box.id = "g5Dlg";
    box.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:60;display:flex;align-items:center;justify-content:center";
    const campos = bin ? bin.campos.filter((c) => c.hex !== "0x7c") : [];
    box.innerHTML = `<div style="background:#1b1b1d;color:#eee;border:1px solid #d08a3e;border-radius:10px;padding:12px 14px;font:13px system-ui;max-width:96vw">
      <b style="font-size:15px">Resultados importados de GEO5</b> <span style="color:#aaa">${fs.map((f) => f.name).join(" · ")}</span>
      <div style="margin:8px 0">${campos.length ? `Campo: <select id="g5Campo">${campos.map((c, i) => `<option value="${i}">${(NOMBRE_CAMPO[c.id] ?? ["Campo " + c.hex])[0]}</option>`).join("")}</select> ` : ""}
      <span id="g5Msg" style="color:#d08a3e"></span></div>
      <canvas id="g5Cv" width="980" height="520" style="background:#fff;border-radius:6px;max-width:92vw"></canvas>
      <div style="text-align:right;margin-top:8px"><button id="g5X" class="tb">Cerrar</button></div></div>`;
    document.body.appendChild(box);
    const cv = box.querySelector<HTMLCanvasElement>("#g5Cv")!, msg = box.querySelector<HTMLSpanElement>("#g5Msg")!;
    const pintar = () => {
      const sel = box.querySelector<HTMLSelectElement>("#g5Campo");
      if (bin && inp && sel) {
        const c = campos[+sel.value], nom = NOMBRE_CAMPO[c.id] ?? ["Campo " + c.hex, 1, "-"];
        const v = new Float64Array(inp.X.length).fill(NaN); bin.ids.forEach((id, k) => { if (id - 1 < v.length) v[id - 1] = c.valores[k] * nom[1]; });
        const r = dibujarMapaGeo5(cv, inp, v, nom[0], nom[2]); msg.textContent = `rango ${r.vmin.toPrecision(5)} … ${r.vmax.toPrecision(5)} ${nom[2]} · ${bin.nudos} nudos de salida`;
      } else if (inp) { dibujarMapaGeo5(cv, inp, inp.Y.map((y) => y), "Malla del InputFile (color = cota y)", "m"); msg.textContent = `${inp.X.length} nudos · ${inp.ELE.length} elementos` + (bin ? " · para pintar el .bin hace falta el InputFile de la MISMA corrida" : ""); }
      else if (dxf) { dibujarMallaDxf(cv, dxf); msg.textContent = "el DXF de GEO5 solo trae malla y regiones (no resultados)"; }
      else { msg.textContent = `.bin leído (${bin!.nudos} nudos, ${bin!.campos.length} campos); sube también el InputFile.txt de la misma corrida para dibujarlo`; cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height); }
      if (avisos.length) msg.textContent += " · ⚠ " + avisos.join(" · ");
    };
    box.querySelector<HTMLSelectElement>("#g5Campo")?.addEventListener("change", pintar);
    box.querySelector<HTMLButtonElement>("#g5X")!.onclick = () => box.remove();
    pintar();
    estado.textContent = `GEO5: ${fs.length} archivo(s) importado(s)` + (avisos.length ? " con avisos" : "");
  });
}
