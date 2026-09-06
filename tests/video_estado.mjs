// Vídeo para ESTADO de WhatsApp según hekatan-school/ESPECIFICACION_VIDEOS.md + WHATSAPP_ESTADO.md:
// ≤ 90 s, 720×1280 VERTICAL grabado en vertical (sin barras, sin recorte), 30 fps, luego narrar.py
// (voz + subtítulos), marca_agua.py (pórtico + logo) y codificación H.264 ~2 Mbps + faststart (< 16 MB).
//   node tests/video_estado.mjs [url]   → tests/video_estado/raw.mp4 + guion.txt
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = "tests/video_estado";
rmSync(out + "/frames", { recursive: true, force: true }); mkdirSync(out + "/frames", { recursive: true });   // solo los frames: la carpeta puede estar en uso
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 560, height: 996, deviceScaleFactor: 1 });   // 9:16; el ffmpeg final escala a 720×1280 SIN recorte: texto 1.29× más grande en el móvil
const K = 2.2;   // ritmo: la voz (2.54 palabras/s) necesita ~80 s; sin K la acción dura 35 s
const wait = (ms) => new Promise((r) => setTimeout(r, ms * K));
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.goto(url, { waitUntil: "networkidle0" });
// ---- modo vídeo: lienzo arriba, tabla de FS y sliders debajo, sin log ni editor ni pie ----
await page.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = `main{grid-template-columns:1fr!important;padding:8px!important;gap:8px!important} footer,#log,#hover,textarea#hgeo,#apply,#mats,.tools .sep{display:none!important}
    header{padding:8px 12px!important} header h1{font-size:22px!important} header .sub{font-size:11px!important}
    .panel{padding:8px!important} .tools{font-size:11px!important} .tools .tb{padding:3px 6px!important;font-size:11px!important}
    #vbox .sl{margin:2px 0!important;font-size:13px!important;grid-template-columns:104px 1fr 54px!important} #vbox .fs{margin-top:4px!important;font-size:14px!important}
    #vbox{display:grid;grid-template-columns:1fr 1fr;gap:8px} #edmsg{font-size:11px!important}`;
  document.head.appendChild(css);
  const sec = document.querySelector("section.panel"), aside = document.querySelector("aside.panel");
  sec.parentElement.insertBefore(sec, aside);                       // lienzo primero
  const box = document.createElement("div"); box.id = "vbox"; sec.appendChild(box);
  const col1 = document.createElement("div"), col2 = document.createElement("div"); box.append(col1, col2);
  col1.append(document.getElementById("fs"), document.getElementById("edmsg"));
  col2.append(document.getElementById("gsliders"), document.getElementById("sliders"));
  window.scrollTo(0, 0);
});
// ---- grabador (JPEG: rápido) con marca de tiempo ----
const T0 = Date.now(); const stamps = []; let rec = true; let nf = 0; const beats = [];
const recorder = (async () => { while (rec) { const t = Date.now() - T0; try { await page.screenshot({ path: `${out}/frames/f${String(nf).padStart(4, "0")}.jpg`, type: "jpeg", quality: 88 }); stamps.push(t); nf++; } catch { } await wait(40); } })();
const beat = async (id, txt) => { beats.push({ id, t: (Date.now() - T0) / 1000 }); await page.evaluate((txt) => {
  let b = document.getElementById("__banner");
  if (!b) { b = document.createElement("div"); b.id = "__banner"; b.style.cssText = "position:fixed;left:50%;top:8px;transform:translateX(-50%);background:rgba(20,17,10,.93);color:#f2cf5e;font:600 17px Segoe UI;padding:8px 14px;border-radius:10px;border:1px solid #c9972f;z-index:9999;pointer-events:none;max-width:680px;text-align:center"; document.body.appendChild(b); }
  b.textContent = txt; b.style.display = txt ? "block" : "none";
}, txt); };
const setSlider = async (id, v, settle) => { await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); }, v); await wait(settle); };
const worldPx = (x, z) => page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
const clickWorld = async (x, z) => { const { px, py } = await worldPx(x, z); await page.mouse.move(px, py, { steps: 8 }); await wait(350); await page.mouse.click(px, py); await wait(250); };
// ---- guion (≈ 80 s de acción) ----
await beat("intro", "Hekatan Geotechnic · GeoFEM en el navegador"); await waitTotal(); await wait(1800);
await page.select("#model", "hgeo"); await beat("editor", "Talud paramétrico: márgenes, interfaces y suelos (paradigma GEO5)"); await wait(300); await waitTotal(); await wait(1500);
await beat("H", "Slider: altura del talud H"); for (const v of [8, 9.5]) await setSlider("gs_H", v, 1500); await waitTotal(); await wait(600);
await beat("beta", "Slider: ángulo del talud β"); for (const v of [45, 30]) await setSlider("gs_beta", v, 1500); await waitTotal(); await wait(600);
await beat("corona", "Slider: ancho de corona"); await setSlider("gs_corona", 12, 1500); await waitTotal(); await wait(600);
await beat("dibujo", "Y también se dibuja con el ratón: interfaz con snaps (extremo, medio, intersección)");
await page.click('.tb[data-tool="interfaz"]'); await wait(300);
await clickWorld(0, -15); await clickWorld(16, -14); await clickWorld(30, -12); await clickWorld(40, -11.5); await page.keyboard.press("Enter"); await wait(300); await waitTotal(); await wait(1200);
await beat("asignar", "Asignar suelo: un clic dentro de la región"); await page.click('.tb[data-tool="asignar"]'); await page.select("#dsoil", "SOIL_2"); await wait(200); await clickWorld(20, -18); await wait(300); await waitTotal(); await wait(1200);
await beat("sobrecarga", "Sobrecarga: dos clics sobre la corona"); await page.click('.tb[data-tool="sobrecarga"]'); await page.select("#dstage", "1"); await wait(200);
const yc = await page.evaluate(() => { const t = document.getElementById("hgeo").value.match(/talud[^\n]*/)?.[0] || ""; return parseFloat(/zpie=(-?[\d.]+)/.exec(t)?.[1] || "-9") + parseFloat(/H=([\d.]+)/.exec(t)?.[1] || "6.5"); });
await clickWorld(26, yc); await clickWorld(32, yc); await wait(300); await page.select("#stage", "1"); await wait(300); await waitTotal(); await wait(1500);
await page.click('.tb[data-tool="ver"]'); await beat("phi", "Slider: ángulo de fricción φ del suelo 1"); for (const v of [20, 16]) await setSlider("sl_phi0", v, 1600); await waitTotal(); await wait(600);
await beat("dz", "Asiento d_z con la escala y la paleta de GEO5"); await page.select("#field", "dz"); await wait(1800);
await beat("fin", "Verificado contra GEO5 a 12 cifras · Hekatan Engineers"); await page.select("#field", "dx"); await page.select("#stage", "0"); await wait(300); await waitTotal(); await wait(2000);
beats.push({ id: "end", t: (Date.now() - T0) / 1000 });
rec = false; await recorder; await browser.close();
// ---- montaje en tiempo REAL a 30 fps (concat con duraciones) ----
const dur = stamps.map((t, i) => ((i + 1 < stamps.length ? stamps[i + 1] : t + 500) - t) / 1000);
writeFileSync(`${out}/list.txt`, stamps.map((_, i) => `file 'frames/f${String(i).padStart(4, "0")}.jpg'\nduration ${dur[i].toFixed(3)}`).join("\n") + `\nfile 'frames/f${String(stamps.length - 1).padStart(4, "0")}.jpg'\n`);
const total = (stamps[stamps.length - 1] + 500) / 1000;
console.log(`${stamps.length} fotogramas · ${total.toFixed(1)} s reales`);
const ffmpeg = "C:/Users/j-b-j/AppData/Roaming/Python/Python312/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
execFileSync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-vsync", "vfr", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "raw.mp4"], { cwd: out, stdio: "ignore" });
// ---- guion de narración: «segundo | frase» por beat (≤ 224 palabras en total) ----
const TXT = {
  intro: "Hekatan Geotechnic: elementos finitos geotécnicos corriendo en tu navegador.",
  editor: "El talud se define como en GEO5: márgenes, interfaces y un suelo por región.",
  H: "Con el slider cambias la altura del talud y el factor de seguridad se recalcula solo.",
  beta: "Ahora el ángulo: más empinado, menos seguro. Cada movimiento remalla y resuelve.",
  corona: "El ancho de corona, igual.",
  dibujo: "Y también se dibuja con el ratón, con snaps como AutoCAD: extremo, punto medio e intersección. Enter cierra la polilínea de borde a borde y el modelo se remalla solo.",
  asignar: "Un clic dentro de la región asigna el suelo, y el texto del modelo se escribe solo: dibujo y texto son lo mismo.",
  sobrecarga: "Dos clics sobre la corona ponen la sobrecarga de la etapa dos, y la etapa se recalcula al momento.",
  phi: "Y los parámetros del suelo también van con sliders: bajo la fricción y cae el factor de seguridad.",
  dz: "Los asientos, con la escala y la paleta de GEO5.",
  fin: "Todo verificado contra GEO5 a doce cifras. Hekatan Engineers.",
};
const guion = beats.filter((b) => TXT[b.id]).map((b) => `${(b.t + 0.3).toFixed(1)} | ${TXT[b.id]}`).join("\n") + "\n";
writeFileSync(`${out}/guion.txt`, guion, "utf-8");
writeFileSync(`${out}/beats.json`, JSON.stringify(beats));
console.log("palabras:", Object.values(TXT).join(" ").split(/\s+/).length, "→", (Object.values(TXT).join(" ").split(/\s+/).length / 2.54).toFixed(0), "s de voz");
console.log("raw.mp4 listo");
