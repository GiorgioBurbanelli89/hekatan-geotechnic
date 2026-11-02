// Campo Ru de la interfaz: cambiar Ru recalcula (FS baja al subir Ru).  node tests/shot_ru_campo.mjs [url]
import { createRequire } from "node:module";
const require = createRequire((process.env.USERPROFILE ?? "") + "/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 1000 });
const err = []; page.on("pageerror", (e) => err.push(e.message)); page.on("console", (m) => m.type() === "error" && err.push(m.text()));
await page.goto(process.argv[2] || "http://127.0.0.1:4702/", { waitUntil: "networkidle0" });
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
await page.select("#model", "talud_ru");
let prev = "";
const fs = async () => { await page.waitForFunction((p) => { const t = document.getElementById("fs").textContent; return /\d\.\d{2}/.test(t) && !/calculando/.test(t) && t !== p; }, { timeout: 120000 }, prev); await esp(600); prev = (await page.$eval("#fs", (e) => e.textContent)).replace(/\s+/g, " ").trim(); return prev; };
console.log("Ru=0.3:", await fs(), "| etiqueta:", await page.$eval("#aguaTxt", (e) => e.textContent), "| caja Ru visible:", await page.$eval("#ruBox", (e) => !e.hidden));
await page.$eval("#aguaRu", (e) => { e.value = "0.2"; e.dispatchEvent(new Event("change")); });
console.log("Ru=0.2:", await fs());
await page.select("#model", "talud_poros"); console.log("poros:", await page.$eval("#aguaTxt", (e) => e.textContent), "| caja Ru visible:", await page.$eval("#ruBox", (e) => !e.hidden));
console.log("errores:", err.length, err.slice(0, 3));
await browser.close();
