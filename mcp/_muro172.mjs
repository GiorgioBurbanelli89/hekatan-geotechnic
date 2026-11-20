// Cliente del MCP de Geotechnic contra el servidor LOCAL (HEKATAN_URL=localhost): muro de Manabí de la hoja 172
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync } from "fs";
const OUT = process.argv[2]; const pasos = JSON.parse(process.argv[3] || "[]");
const t = new StdioClientTransport({ command: "node", args: ["server.mjs"], env: { ...process.env, HEKATAN_URL: "http://127.0.0.1:4700/" } });
const c = new Client({ name: "muro172", version: "1" }); await c.connect(t);
const L = async (n, a = {}, largo = 4000) => { const r = await c.callTool({ name: n, arguments: a });
  const tx = r.content.find((x) => x.type === "text"); const im = r.content.find((x) => x.type === "image");
  if (im) writeFileSync(`${OUT}/geo_${a.tag || n}.png`, Buffer.from(im.data, "base64"));
  console.log(`[${n}${a.id ? " " + a.id : ""}]`, r.isError ? "ERROR" : "ok", tx ? tx.text.slice(0, largo) : "(imagen)"); return r; };
for (const [n, a, largo] of pasos) await L(n, a || {}, largo);
await c.close();
