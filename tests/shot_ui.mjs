// Captura de la interfaz (antes/después del rediseño con menús): node tests/shot_ui.mjs <url> <out.png> [ancho alto] [tipo]
import { createRequire } from "node:module";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const [url, out, w = "1600", h = "1000", tipo = "corte"] = process.argv.slice(2);
const b = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(url + (url.includes("?") ? "&" : "?") + "tipo=" + tipo + "&v=" + Date.now(), { waitUntil: "networkidle0" });
await p.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL ") || document.getElementById("log").textContent.includes("navegador:"), { timeout: 240000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: out });
console.log("errores:", errs.length ? errs.join(" | ") : "ninguno");
await b.close();
