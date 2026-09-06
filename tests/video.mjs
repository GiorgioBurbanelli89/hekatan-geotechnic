// Vídeo MP4 (≤ 90 s) de Hekatan Geotechnic: parámetros con sliders (H, β, corona) + dibujo con el ratón
// (interfaz, asignar, sobrecarga) + slider de φ + campos. Graba fotogramas con tiempo real y los monta
// con ffmpeg (imageio) por lista concat con duraciones.   node tests/video.mjs [url]
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const url = process.argv[2] || "http://localhost:4700/", out = "tests/video";
rmSync(out, { recursive: true, force: true }); mkdirSync(out + "/frames", { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitTotal = async () => page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
// ---- grabador: fotogramas con marca de tiempo ----
const T0 = Date.now(); const stamps = []; let rec = true; let nf = 0;
const recorder = (async () => { while (rec) { const t = Date.now() - T0; try { await page.screenshot({ path: `${out}/frames/f${String(nf).padStart(4, "0")}.png` }); stamps.push(t); nf++; } catch { } await wait(60); } })();
const banner = (txt) => page.evaluate((txt) => {
  let b = document.getElementById("__banner");
  if (!b) { b = document.createElement("div"); b.id = "__banner"; b.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(20,17,10,.92);color:#f2cf5e;font:600 20px Segoe UI;padding:10px 22px;border-radius:10px;border:1px solid #c9972f;z-index:9999;pointer-events:none;white-space:nowrap"; document.body.appendChild(b); }
  b.textContent = txt; b.style.display = txt ? "block" : "none";
}, txt);
const setSlider = async (id, v, settle = 1400) => { await page.$eval("#" + id, (e, v) => { e.value = String(v); e.dispatchEvent(new Event("input", { bubbles: true })); }, v); await wait(settle); };
const clickWorld = async (x, z) => {
  const { px, py } = await page.evaluate((x, z) => { const [px, py] = window.__geoMap.tf(x, z); const c = document.getElementById("draw"); const r = c.getBoundingClientRect(); return { px: r.left + px * r.width / c.width, py: r.top + py * r.height / c.height }; }, x, z);
  await page.mouse.move(px, py, { steps: 6 }); await wait(250); await page.mouse.click(px, py); await wait(250);
};
// ---- guion (≈ 80 s) ----
await page.goto(url, { waitUntil: "networkidle0" });
await banner("Hekatan Geotechnic · GeoFEM en el navegador · réplica de GEO5 (Demo04, 3 etapas)"); await waitTotal(); await wait(2500);
await page.select("#model", "hgeo"); await banner("Editor .hgeo: márgenes + interfaces + suelos por punto (paradigma GEO5), malla propia"); await wait(300); await waitTotal(); await wait(2200);
await banner("Sliders GEOMÉTRICOS: altura H"); for (const v of [7.5, 8.5, 9.5]) await setSlider("gs_H", v, 1500); await waitTotal(); await wait(800);
await banner("Sliders geométricos: ángulo del talud β"); for (const v of [40, 48, 30]) await setSlider("gs_beta", v, 1500); await waitTotal(); await wait(800);
await banner("Sliders geométricos: ancho de corona"); for (const v of [4, 12]) await setSlider("gs_corona", v, 1500); await waitTotal(); await wait(800);
await banner("Y también se DIBUJA con el ratón: nueva interfaz (snap a rejilla, Enter termina)");
await page.click('.tb[data-tool="interfaz"]'); await wait(400);
await clickWorld(0, -14); await clickWorld(16, -13); await clickWorld(30, -10); await clickWorld(40, -9); await page.keyboard.press("Enter"); await wait(400); await waitTotal(); await wait(1500);
await banner("Asignar suelo: un clic dentro de la región"); await page.click('.tb[data-tool="asignar"]'); await page.select("#dsoil", "SOIL_2"); await wait(300); await clickWorld(20, -18); await wait(300); await waitTotal(); await wait(1500);
await banner("Sobrecarga: dos clics sobre el terreno (etapa 2)"); await page.click('.tb[data-tool="sobrecarga"]'); await page.select("#dstage", "1"); await wait(300);
const yc = await page.evaluate(() => { const t = document.getElementById("hgeo").value.match(/talud[^\n]*/)?.[0] || ""; const H = parseFloat(/H=([\d.]+)/.exec(t)?.[1] || "6.5"), z = parseFloat(/zpie=(-?[\d.]+)/.exec(t)?.[1] || "-9"); return z + H; });
await clickWorld(26, yc); await clickWorld(32, yc); await wait(300); await page.select("#stage", "1"); await wait(300); await waitTotal(); await wait(1800);
await page.click('.tb[data-tool="ver"]'); await banner("Parámetros del suelo: φ del suelo 1 (recalcula solo la etapa visible)"); for (const v of [20, 16]) await setSlider("sl_phi0", v, 1800); await waitTotal(); await wait(800);
await banner("Campo d_z (asiento) con la escala de GEO5"); await page.select("#field", "dz"); await wait(2000);
await banner("Etapa 3 con ancla · log iteración a iteración = GEO5"); await page.select("#stage", "2"); await wait(400); await waitTotal(); await wait(2500);
await banner(""); await wait(600);
rec = false; await recorder;
await browser.close();
// ---- ffmpeg: concat con duraciones reales ----
const dur = stamps.map((t, i) => ((i + 1 < stamps.length ? stamps[i + 1] : t + 600) - t) / 1000);
const list = stamps.map((_, i) => `file 'frames/f${String(i).padStart(4, "0")}.png'\nduration ${dur[i].toFixed(3)}`).join("\n") + `\nfile 'frames/f${String(stamps.length - 1).padStart(4, "0")}.png'\n`;
writeFileSync(`${out}/list.txt`, list);
const total = stamps[stamps.length - 1] / 1000 + 0.6;
console.log(`${stamps.length} fotogramas, ${total.toFixed(1)} s`);
const ffmpeg = "C:/Users/j-b-j/AppData/Roaming/Python/Python312/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
execFileSync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-vf", "scale=1280:800,fps=10,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-movflags", "+faststart", "hekatan_geotechnic.mp4"], { cwd: out, stdio: "ignore" });
console.log("MP4:", `${out}/hekatan_geotechnic.mp4`);
