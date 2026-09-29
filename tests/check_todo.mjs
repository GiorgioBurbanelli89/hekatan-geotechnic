// PUPPETEER TOTAL: corre TODAS las pruebas de interfaz (check_*.mjs y las capturas shot*.mjs), una detrás de otra,
// contra una dirección, y deja un informe. Una a la vez: la máquina tiene poca memoria.
//   node tests/check_todo.mjs [url] [salida.md] [solo=texto]
//   node tests/check_todo.mjs https://giorgioburbanelli89.github.io/hekatan-geotechnic/ tests/out/check_todo_publico.md
// Veredicto de cada prueba:
//   ok        terminó con código 0 y sin «✖» ni «FALLA» en su salida
//   FALLA     código distinto de 0, o marcó «✖» / «FALLA», o dio errores de JavaScript en la página
//   COLGADO   pasó de su límite de tiempo y se mató
// Un «ok» de aquí NO sustituye mirar las capturas de tests/shots/: un lienzo en blanco no da error.
import { spawn } from "node:child_process";
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url)), RAIZ = join(AQUI, "..");
const url = process.argv[2] || "http://localhost:4700/";
const salida = process.argv[3] || "tests/out/check_todo.md";
const solo = (process.argv.find((a) => a.startsWith("solo=")) || "").slice(5);
const LIMITE = 15 * 60 * 1000;
// con argumentos propios: [script, ...args] (la url va donde la espera cada uno)
const CON_ARGS = {
  "shot_hgeo_file.mjs": (u) => ["examples/talud_nuevo.hgeo", "tests/shots/todo_nuevo", u],
  "shot.mjs": (u) => [u, "tests/shots/todo_demo04"],
  "shot_hgeo.mjs": (u) => [u, "tests/shots/todo_hgeo"],
};
const guiones = readdirSync(AQUI).filter((f) => /^(check_(?!todo).*|shot.*)\.mjs$/.test(f)).filter((f) => !solo || f.includes(solo)).sort();

function corre(f) {
  return new Promise((res) => {
    const args = [join("tests", f), ...(CON_ARGS[f] ? CON_ARGS[f](url) : [url])];
    const t0 = Date.now(); let texto = "", colgado = false;
    const h = spawn(process.execPath, args, { cwd: RAIZ, windowsHide: true });
    const junta = (b) => { texto += b.toString(); };
    h.stdout.on("data", junta); h.stderr.on("data", junta);
    const reloj = setTimeout(() => { colgado = true; try { spawn("taskkill", ["/PID", String(h.pid), "/T", "/F"]); } catch {} }, LIMITE);
    h.on("close", (codigo) => { clearTimeout(reloj); res({ f, codigo, colgado, texto, seg: (Date.now() - t0) / 1000 }); });
  });
}

const filas = [];
for (const f of guiones) {
  process.stdout.write(`${f} … `);
  const r = await corre(f);
  const marcas = (r.texto.match(/✖|FALLA|\bFAIL\b/g) || []).length;
  const buenas = (r.texto.match(/✓|✔/g) || []).length;
  const js = /errores JS:\s*\[\s*[^\]\s]/.test(r.texto) || /pageerror/i.test(r.texto);
  r.veredicto = r.colgado ? "COLGADO" : (r.codigo !== 0 || marcas > 0 || js) ? "FALLA" : "ok";
  r.marcas = marcas; r.buenas = buenas;
  r.ultimas = r.texto.trim().split(/\r?\n/).slice(-4).map((l) => l.slice(0, 200));
  r.malas = r.texto.split(/\r?\n/).filter((l) => /✖|FALLA|\bFAIL\b|Error|errores JS:\s*\[\s*[^\]\s]/.test(l)).slice(0, 6).map((l) => l.trim().slice(0, 220));
  filas.push(r);
  console.log(`${r.veredicto}  (${r.seg.toFixed(0)} s, ✓ ${buenas}, ✖ ${marcas}, código ${r.codigo})`);
}
const n = (v) => filas.filter((r) => r.veredicto === v).length;
let md = `# Puppeteer total de Hekatan Geotechnic\n\n- dirección: ${url}\n- fecha: ${new Date().toISOString().slice(0, 16)}\n`
  + `- pruebas: ${filas.length} · ok ${n("ok")} · FALLA ${n("FALLA")} · COLGADO ${n("COLGADO")}\n\n`
  + `| prueba | veredicto | s | ✓ | ✖ | código | lo que marcó mal |\n|---|---|---|---|---|---|---|\n`;
for (const r of filas) md += `| ${r.f} | ${r.veredicto} | ${r.seg.toFixed(0)} | ${r.buenas} | ${r.marcas} | ${r.codigo} | ${r.malas.join(" ⏎ ").replace(/\|/g, "/")} |\n`;
mkdirSync(dirname(join(RAIZ, salida)), { recursive: true });
writeFileSync(join(RAIZ, salida), md);
writeFileSync(join(RAIZ, salida.replace(/\.md$/, ".json")), JSON.stringify(filas.map(({ texto, ...r }) => ({ ...r, texto: texto.slice(-6000) })), null, 1));
console.log(`\n${filas.length} pruebas · ok ${n("ok")} · FALLA ${n("FALLA")} · COLGADO ${n("COLGADO")} → ${salida}`);
process.exit(n("FALLA") + n("COLGADO") ? 1 : 0);
