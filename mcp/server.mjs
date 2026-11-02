#!/usr/bin/env node
/**
 * MCP de Hekatan Geotechnic.
 *
 * Abre la app publicada en un Chrome controlado y deja que Claude:
 *   - VEA (captura) y sepa qué controles hay (sliders, listas, casillas, botones);
 *   - CAMBIE un parámetro (φ, c, γ, sobrecarga, modelo, método, etapa…) y RECALCULE;
 *   - LEA los resultados (el registro de cálculo: FS por etapa).
 *
 * Seguridad: solo abre HEKATAN_URL (o localhost); los controles se nombran por su `id`
 * (letras, números y _); no ejecuta JavaScript arbitrario ni toca archivos del disco.
 *
 *   HEKATAN_URL        def. https://giorgioburbanelli89.github.io/hekatan-geotechnic/
 *   HEKATAN_VISIBLE=1  ventana visible
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import puppeteer from "puppeteer";

const BASE = process.env.HEKATAN_URL || "https://giorgioburbanelli89.github.io/hekatan-geotechnic/";
const ORIGEN = new URL(BASE).origin;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ID = z.string().regex(/^[A-Za-z0-9_]{1,40}$/, "id: letras, números y _");

let nav = null, pag = null;
const consola = [];
const srv = new McpServer({ name: "hekatan-geotechnic", version: "0.1.0" });
const texto = (t) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t, null, 2) }] });
const falla = (t) => ({ isError: true, content: [{ type: "text", text: t }] });
const sinPagina = () => (pag && !pag.isClosed() ? null : falla("No hay app abierta. Llama primero a `abrir`."));

async function lanzar() {
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1500,1000"];
  const headless = process.env.HEKATAN_VISIBLE ? false : "new";
  try { return await puppeteer.launch({ headless, args, channel: "chrome" }); }
  catch { return await puppeteer.launch({ headless, args }); }
}
const totales = () => pag.evaluate(() => ((document.getElementById("log") || {}).textContent || "").split("TOTAL ").length - 1);
async function esperarCalculo(antes, ms = 150000) {
  await pag.waitForFunction((n) => {
    const t = (document.getElementById("log") || {}).textContent || "";
    return t.includes("TOTAL ") && (t.split("TOTAL ").length - 1 >= 1) && !document.body.classList.contains("calculando");
  }, { timeout: ms }).catch(() => {});
  await esperar(500);
}

srv.tool("abrir",
  "Abre Hekatan Geotechnic y espera a que calcule las etapas. `modelo` es el valor de la lista «model» (p. ej. demo04, muro, manabi, talud_gwt, talud_ru, hgeo).",
  { modelo: z.string().regex(/^[\w./-]{1,60}$/).optional() },
  async ({ modelo }) => {
    if (nav) { try { await nav.close(); } catch {} }
    nav = await lanzar(); pag = await nav.newPage();
    await pag.setViewport({ width: 1500, height: 1000 });
    consola.length = 0;
    pag.on("pageerror", (e) => consola.push("[error] " + e.message));
    pag.on("console", (m) => { if (m.type() === "error") consola.push("[console.error] " + m.text()); });
    if (new URL(BASE).origin !== ORIGEN) return falla("URL fuera de HEKATAN_URL.");
    await pag.goto(BASE, { waitUntil: "networkidle0", timeout: 120000 });
    await esperarCalculo();
    if (modelo) {
      const ok = await pag.evaluate((m) => {
        const s = document.getElementById("model"); if (!s) return false;
        const o = [...s.options].find((x) => x.value === m || x.value === `models/${m}.json`); if (!o) return false;
        s.value = o.value; s.dispatchEvent(new Event("change", { bubbles: true })); return true;
      }, modelo);
      if (!ok) return falla(`No existe el modelo «${modelo}». Mira \`controles\` (lista model).`);
      await esperar(1500); await esperarCalculo();
    }
    return texto("Abierto " + BASE + (modelo ? ` con modelo ${modelo}` : ""));
  });

srv.tool("cerrar", "Cierra el navegador.", {}, async () => { if (nav) { try { await nav.close(); } catch {} } nav = pag = null; return texto("Cerrado."); });

srv.tool("captura", "Captura de pantalla de la app.", {}, async () => {
  const e = sinPagina(); if (e) return e;
  return { content: [{ type: "image", data: await pag.screenshot({ type: "png", encoding: "base64" }), mimeType: "image/png" }] };
});

srv.tool("controles",
  "Lista los controles de la app por id: sliders (con rango y valor), listas (con sus opciones), casillas y botones. Úsala para saber qué se puede cambiar.",
  {},
  async () => {
    const e = sinPagina(); if (e) return e;
    return texto(await pag.evaluate(() => {
      const t = (x) => (x.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
      return {
        sliders: [...document.querySelectorAll("input[type=range]")].map((x) => ({ id: x.id, min: +x.min, max: +x.max, valor: +x.value })),
        listas: [...document.querySelectorAll("select")].map((x) => ({ id: x.id, valor: x.value, opciones: [...x.options].map((o) => `${o.value} = ${o.text.slice(0, 45)}`).slice(0, 14) })),
        casillas: [...document.querySelectorAll("input[type=checkbox]")].map((x) => ({ id: x.id, marcada: x.checked })),
        botones: [...document.querySelectorAll("button")].filter((x) => x.id).map((x) => ({ id: x.id, texto: t(x) })),
      };
    }));
  });

srv.tool("fijar",
  "Cambia un control por su id: slider (número), lista (valor de la opción), casilla (true/false) o campo de texto. No recalcula: llama a `calcular` si hace falta (con «auto» activo recalcula solo).",
  { id: ID, valor: z.union([z.number(), z.string().max(200), z.boolean()]) },
  async ({ id, valor }) => {
    const e = sinPagina(); if (e) return e;
    const r = await pag.evaluate((id, v) => {
      const x = document.getElementById(id); if (!x) return "no existe";
      if (x.type === "checkbox") { x.checked = !!v; x.dispatchEvent(new Event("change", { bubbles: true })); return "ok"; }
      if (x.tagName === "SELECT") {
        const o = [...x.options].find((o) => o.value === String(v)); if (!o) return "opción inválida: " + [...x.options].map((o) => o.value).join(", ");
        x.value = o.value; x.dispatchEvent(new Event("change", { bubbles: true })); return "ok";
      }
      if (x.tagName === "INPUT" || x.tagName === "TEXTAREA") { x.value = String(v); x.dispatchEvent(new Event("input", { bubbles: true })); x.dispatchEvent(new Event("change", { bubbles: true })); return "ok"; }
      return "tipo no admitido: " + x.tagName;
    }, id, valor);
    return r === "ok" ? texto(`${id} = ${valor}`) : falla(`${id}: ${r}`);
  });

srv.tool("boton", "Aprieta un botón por su id (p. ej. run, apply, undo, wSolido, dRun).",
  { id: ID },
  async ({ id }) => {
    const e = sinPagina(); if (e) return e;
    const ok = await pag.evaluate((id) => { const b = document.getElementById(id); if (!b || b.tagName !== "BUTTON") return false; b.click(); return true; }, id);
    await esperar(600);
    return ok ? texto("Apretado: " + id) : falla(`No hay un botón con id «${id}».`);
  });

srv.tool("calcular", "Aprieta «Recalcular todas las etapas» y espera a que termine. Devuelve el registro de cálculo.",
  {}, async () => {
    const e = sinPagina(); if (e) return e;
    await pag.evaluate(() => document.getElementById("run")?.click());
    await esperar(800); await esperarCalculo();
    return texto(await pag.evaluate(() => ((document.getElementById("log") || {}).textContent || "").slice(-3500)));
  });

srv.tool("resultados", "Lee el registro de cálculo (#log) y el factor de seguridad de cada etapa.", {},
  async () => {
    const e = sinPagina(); if (e) return e;
    return texto(await pag.evaluate(() => ({
      etapas: [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim().replace(/\s+/g, " ")).filter((t) => /^\d\.\s*etapa/i.test(t)),
      registro: ((document.getElementById("log") || {}).textContent || "").slice(-3500),
    })));
  });

srv.tool("tecla", "Pulsa una tecla (Escape, Enter, Control+z, Control+Enter…).",
  { tecla: z.string().min(1).max(30) },
  async ({ tecla }) => {
    const e = sinPagina(); if (e) return e;
    const p = tecla.split("+"); const k = p.pop();
    for (const m of p) await pag.keyboard.down(m);
    await pag.keyboard.press(k);
    for (const m of p.reverse()) await pag.keyboard.up(m);
    await esperar(300); return texto("Tecla: " + tecla);
  });

srv.tool("errores", "Errores de consola/página desde que se abrió.", {}, async () => texto(consola.length ? consola.join("\n") : "Sin errores."));

const salir = async () => { try { if (nav) await nav.close(); } catch {} process.exit(0); };
process.on("SIGINT", salir); process.on("SIGTERM", salir);
await srv.connect(new StdioServerTransport());
