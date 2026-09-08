// Vuelca el log del solver de la WEB para un .hgeo (para comparar con Node): node tests/weblog_hgeo.mjs modelo.hgeo [url]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire("C:/Users/j-b-j/Documents/Hekatan Calc 1.0.0/hekatan-struct/package.json");
const puppeteer = require("puppeteer");
const [file, url = "http://localhost:4700/"] = process.argv.slice(2);
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url + (url.includes("?") ? "&" : "?") + "v=" + Date.now(), { waitUntil: "networkidle0" }); await page.waitForFunction(() => document.getElementById("log").textContent.includes("TOTAL "), { timeout: 120000 });
await page.select("#model", "hgeo"); await wait(300); await page.$eval("#log", (e) => { e.textContent = ""; });
await page.$eval("#hgeo", (e, v) => { e.value = v; }, readFileSync(file, "utf8")); await page.click("#apply"); await wait(500);
await page.waitForFunction(() => !document.getElementById("fs").textContent.includes("calculando"), { timeout: 120000 }); await wait(300);
const log = await page.$eval("#log", (e) => e.textContent);
console.log(log.split("\n").filter((l) => /MALLA|MAT |SRM rs|>>> FS|elementos/.test(l)).join("\n"));
console.log("hgeo tras aplicar:\n" + (await page.$eval("#hgeo", (e) => e.value)));
await browser.close();
