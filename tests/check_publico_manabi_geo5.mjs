// Muro de Manabí en modo GEO5 (srmContinua 115) con el WORKER y el WASM del sitio PÚBLICO: FS esperado 1.3624 (GEO5 1.362360).
//   node tests/check_publico_manabi_geo5.mjs [url] [outdir]
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const base = process.argv[2] || "https://giorgioburbanelli89.github.io/hekatan-geotechnic/", out = process.argv[3] || "tests/shots/pub_manabi"; mkdirSync(out, { recursive: true });
const model = JSON.parse(readFileSync("examples/geofem_muro_manabi_malla.json", "utf-8")); model.srmContinua = 115;
const browser = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1000, height: 500 });
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
const wasmCT = []; page.on("response", (r) => { if (r.url().endsWith(".wasm")) wasmCT.push(r.url().split("/").pop() + " " + r.headers()["content-type"]); });
await page.goto(base + "?v=" + Date.now(), { waitUntil: "networkidle0" });
const wk = await page.evaluate(async () => (await (await fetch(location.href, { cache: "no-store" })).text()).match(/assets\/index-[\w-]+\.js/)[0]);
const idx = await page.evaluate(async (u) => (await (await fetch(u, { cache: "no-store" })).text()).match(/assets\/worker-[\w-]+\.js/)[0], base + wk);
const r = await page.evaluate((url, model) => new Promise((res) => {
  const w = new Worker(url, { type: "module" }); const log = []; let eng = "", st = null;
  w.onmessage = (e) => { const m = e.data; if (m.type === "log") log.push(m.line); else if (m.type === "engine") eng = m.engine; else if (m.type === "stage") st = { fs: m.result.fs, name: m.result.name }; else if (m.type === "done" || m.type === "error") res({ eng, st, err: m.message, log: log.slice(-6) }); };
  w.postMessage({ type: "run", model, stageIdx: [0], engine: "wasm" });
}), base + idx, model);
console.log("worker:", idx, "| motor:", r.eng, "| FS:", r.st && r.st.fs, r.err || ""); console.log(r.log.join("\n"));
console.log("wasm:", wasmCT.join(" ; "));
await page.setContent(`<body style="font:28px monospace;background:#fff;padding:30px">Manabí modo GEO5 (115), sitio público<br>motor: ${r.eng}<br>FS = ${r.st && r.st.fs.toFixed(6)} (GEO5 1.362360)</body>`); await page.screenshot({ path: out + "/manabi_fs.png" });
let bad = 0; const ok = (c, t) => { console.log((c ? "  ✓ " : "  ✗ ") + t); if (!c) bad++; };
ok(r.eng === "wasm", "motor WASM"); ok(r.st && Math.abs(r.st.fs - 1.36236) < 5e-5, "FS = 1.3624 (GEO5 1.362360)"); ok(errs.length === 0, "sin errores de consola " + JSON.stringify(errs));
await browser.close(); process.exit(bad ? 1 : 0);
