// Publica dist/ en la rama gh-pages (GitHub Pages: https://giorgioburbanelli89.github.io/hekatan-geotechnic/).
//   npm run deploy   (hace el build con DEPLOY_BASE=/hekatan-geotechnic/ y empuja dist/ a gh-pages)
// Después: node tests/shot.mjs <url> tests/shots/deploy  y  node tests/shot_hgeo_file.mjs examples/talud_nuevo.hgeo tests/shots/deploy_nuevo <url>
import { execSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
const REPO = "https://github.com/GiorgioBurbanelli89/hekatan-geotechnic.git";
const run = (cmd, cwd) => { console.log("$", cmd); execSync(cmd, { stdio: "inherit", cwd, env: { ...process.env, DEPLOY_BASE: "/hekatan-geotechnic/" } }); };
run("npx vite build");
if (existsSync("dist/.git")) rmSync("dist/.git", { recursive: true, force: true });
run("git init -q -b gh-pages", "dist");
run("git add -A", "dist");
const who = (k) => execSync(`git config ${k}`).toString().trim();   // identidad del repo padre (no hay global)
run(`git -c user.name="${who("user.name")}" -c user.email="${who("user.email")}" commit -q -m "deploy ${new Date().toISOString().slice(0, 16)} ${execSync("git rev-parse --short HEAD").toString().trim()}"`, "dist");
run(`git push -f -q ${REPO} gh-pages:gh-pages`, "dist");
rmSync("dist/.git", { recursive: true, force: true });
console.log("publicado: https://giorgioburbanelli89.github.io/hekatan-geotechnic/  (Pages tarda ~30 s)");
