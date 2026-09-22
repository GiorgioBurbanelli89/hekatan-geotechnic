// src/model/dsl.ts
function terrainFromParam(pm, xmin, xmax) {
  const tb = Math.tan(pm.beta * Math.PI / 180), tb2 = Math.tan(pm.beta2 * Math.PI / 180);
  const xc = pm.xpie + pm.H / Math.max(tb, 1e-6), zc = pm.zpie + pm.H;
  const x2 = xc + pm.corona, drop = zc - pm.zfin;
  const pts2 = [[xmin, pm.zpie], [pm.xpie, pm.zpie], [xc, zc], [x2, zc]];
  if (Math.abs(drop) > 1e-9) pts2.push([x2 + Math.abs(drop) / Math.max(tb2, 1e-6), pm.zfin]);
  pts2.push([xmax, pts2[pts2.length - 1][1]]);
  return pts2.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-9);
}
var MURO_BAT = 0.06;
function wallDims(H) {
  const r = (v, p = 0.05) => Math.round(v / p) * p;
  const fuste = Math.max(0.3, r(H / 12)), zapata = Math.max(0.3, r(H / 12)), B = r(0.6 * H, 0.1);
  const dedo = Math.max(0.2, r(B / 4, 0.1)), talon = Math.max(0.3, r(B - dedo - fuste, 0.1));
  return { x: 0, H, fuste, zapata, talon, dedo, emp: r(zapata + 0.5, 0.1) };
}
function wallLevels(pm, z) {
  const emp = Math.max(pm.emp, pm.zapata + 0.2);
  return { z, zb: z - emp, ztf: z - emp + pm.zapata, ztop: z + pm.H, xb: pm.x + MURO_BAT };
}
function wallPolygon(pm, z) {
  const { zb, ztf, ztop, xb } = wallLevels(pm, z), x = pm.x, xf = x + pm.fuste;
  return [[x - pm.dedo, zb], [xf + pm.talon, zb], [xf + pm.talon, ztf], [xf, ztf], [xf, ztop], [xb, ztop], [x, z], [x, ztf], [x - pm.dedo, ztf]];
}
function simplify(P, tol = 1e-4) {
  const out = [];
  for (const p of P) {
    const q = out[out.length - 1];
    if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) continue;
    if (out.length >= 2) {
      const o = out[out.length - 2];
      if (Math.abs((q[0] - o[0]) * (p[1] - o[1]) - (q[1] - o[1]) * (p[0] - o[0])) < tol) out.pop();
    }
    out.push([p[0], p[1]]);
  }
  return out;
}
function effectiveTerrain(def) {
  const m = def.margins;
  if (!m || !def.interfaces[0]?.length) return def.interfaces[0] ?? [];
  let terr = spanInterface(def.interfaces[0], m.xmin, m.xmax);
  for (const w of (def.walls ?? []).slice().sort((a, b) => a.pm.x - b.pm.x)) {
    const pm = w.pm;
    if (!(pm.H > 0) || pm.x <= m.xmin || pm.x >= m.xmax) continue;
    const z = Number.isFinite(pm.z) ? pm.z : interfaceY(terr, pm.x);
    const { ztop, xb } = wallLevels(pm, z), xf = pm.x + pm.fuste;
    const out = [];
    let xExc = pm.x;
    for (let i = terr.length - 1; i > 0; i--) {
      const b = terr[i], a = terr[i - 1];
      if (a[0] >= pm.x - 1e-9) continue;
      const xb2 = Math.min(b[0], pm.x), zb2 = interfaceY(terr, xb2);
      if (zb2 <= z + 1e-9) {
        xExc = xb2;
        break;
      }
      if (a[1] <= z + 1e-9) {
        xExc = a[0] + (xb2 - a[0]) * (z - a[1]) / (zb2 - a[1] || 1);
        break;
      }
      xExc = a[0];
    }
    for (const p of terr) if (p[0] < xExc - 1e-9) out.push([p[0], p[1]]);
    if (xExc < pm.x - 1e-9) out.push([xExc, z]);
    out.push([pm.x, z], [xb, ztop], [xf, ztop]);
    let corte = -1;
    for (let i = 0; i + 1 < terr.length; i++) {
      const a = terr[i], b = terr[i + 1];
      if (b[0] <= xf + 1e-9) continue;
      const xa = Math.max(a[0], xf), za = interfaceY(terr, xa), zbb = b[1];
      if (za >= ztop - 1e-9) {
        corte = xa;
        break;
      }
      if (zbb >= ztop - 1e-9) {
        corte = xa + (b[0] - xa) * (ztop - za) / (zbb - za || 1);
        break;
      }
    }
    if (corte >= 0) {
      out.push([corte, ztop]);
      for (const p of terr) if (p[0] > corte + 1e-9) out.push([p[0], p[1]]);
    } else out.push([m.xmax, ztop]);
    terr = simplify(out);
  }
  return terr;
}
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function wallGround(def, w) {
  if (Number.isFinite(w.pm.z)) return w.pm.z;
  const m = def.margins;
  const antes = (def.walls ?? []).filter((o) => o.pm.x < w.pm.x);
  const terr = antes.length ? effectiveTerrain({ ...def, walls: antes }) : spanInterface(def.interfaces[0], m.xmin, m.xmax);
  return interfaceY(terr, w.pm.x);
}
var num = (s) => {
  const v = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(v)) throw new Error(`n\xFAmero inv\xE1lido: "${s}"`);
  return v;
};
var pts = (toks) => toks.map((t) => {
  const m = t.match(/^(-?[\d.]+),(-?[\d.]+)$/);
  if (!m) throw new Error(`punto inv\xE1lido: "${t}" (usa x,y)`);
  return [num(m[1]), num(m[2])];
});
var kv = (toks) => {
  const o = {};
  for (const t of toks) {
    const m = t.match(/^([A-Za-z_]+)=(.+)$/);
    if (m) o[m[1].toLowerCase()] = m[2];
  }
  return o;
};
function parseHgeo(text, opts = {}) {
  const def = { outline: [], soils: [], layers: [], h: 2.5, stages: [], interfaces: [], lines: [], assign: [], walls: [], comments: [] };
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, k) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      const c = raw.trim();
      if (c.startsWith("#") && k === 0) def.comments.push(c);
      return;
    }
    const toks = line.split(/\s+/);
    const cmd = toks[0].toLowerCase();
    const ln = `l\xEDnea ${k + 1}`;
    try {
      if (cmd === "contorno") def.outline = pts(toks.slice(1));
      else if (cmd === "margenes" || cmd === "m\xE1rgenes") {
        const o = kv(toks.slice(1));
        def.margins = { xmin: num(o.xmin ?? "0"), xmax: num(o.xmax ?? "40"), bottom: num(o.fondo ?? o.bottom ?? "-20") };
      } else if (cmd === "interfaz" || cmd === "interface") def.interfaces.push(pts(toks.slice(1)));
      else if (cmd === "linea" || cmd === "l\xEDnea" || cmd === "line" || cmd === "libre") def.lines.push(pts(toks.slice(1)));
      else if (cmd === "talud") {
        const o = kv(toks.slice(1));
        def.param = { xpie: num(o.xpie ?? "10"), zpie: num(o.zpie ?? "-10"), H: num(o.h ?? "6"), beta: num(o.beta ?? "33"), corona: num(o.corona ?? "8"), zfin: num(o.zfin ?? String(num(o.zpie ?? "-10") + num(o.h ?? "6"))), beta2: num(o.beta2 ?? "28.6") };
        def.interfaces.unshift([]);
      } else if (cmd === "suelo") {
        const o = kv(toks.slice(2));
        def.soils.push({ name: toks[1], E: num(o.e ?? "0"), nu: num(o.nu ?? "0.3"), phi: num(o.phi ?? "0"), c: num(o.c ?? "0"), gamma: num(o.gamma ?? "0"), psi: num(o.psi ?? "0"), rigido: /^(1|si|sí|true|yes)$/i.test(o.rigido ?? o.rigid ?? "") || void 0 });
      } else if (cmd === "asignar") {
        const en = toks.indexOf("en");
        def.assign.push({ soil: toks[1], p: pts([toks[en + 1]])[0] });
      } else if (cmd === "capa") {
        const side = toks[2].toLowerCase();
        def.layers.push({ soil: toks[1], side: side === "sobre" || side === "encima" ? "sobre" : "bajo", poly: pts(toks.slice(3)) });
      } else if (cmd === "muro" || cmd === "wall") {
        const o = kv(toks.slice(2)), H = num(o.h ?? "4"), d = wallDims(H);
        def.walls.push({ soil: toks[1], pm: { x: num(o.x ?? o.xpie ?? "10"), H, ...o.z ?? o.zpie ? { z: num(o.z ?? o.zpie) } : {}, fuste: num(o.fuste ?? String(d.fuste)), zapata: num(o.zapata ?? String(d.zapata)), talon: num(o.talon ?? o["tal\xF3n"] ?? String(d.talon)), dedo: num(o.dedo ?? String(d.dedo)), emp: num(o.emp ?? String(d.emp)) } });
      } else if (cmd === "malla") def.h = num(toks[1]);
      else if (cmd === "etapa") {
        let i = 1;
        const nm = [];
        while (i < toks.length && !toks[i].includes("=")) nm.push(toks[i++]);
        const st = { name: nm.join(" ") || `etapa${def.stages.length + 1}`, surcharges: [], anchors: [] };
        const rest = toks.slice(i);
        for (let j = 0; j < rest.length; j++) {
          const m = rest[j].match(/^([A-Za-z_0-9]+)=(.+)$/);
          if (!m) continue;
          const key = m[1].toLowerCase(), val = m[2];
          if (key === "geo5") st.geo5 = num(val);
          else if (key === "q") {
            const en = rest.indexOf("en", j);
            const p = pts([rest[en + 1], rest[en + 3]]);
            st.surcharges.push({ q: num(val), a: p[0], b: p[1] });
            j = en + 3;
          } else if (key === "f") {
            const en = rest.indexOf("en", j);
            const p = pts([rest[en + 1]])[0];
            const o = kv(rest.slice(en + 2, en + 4));
            st.anchors.push({ F: num(val), p, ang: num(o.ang ?? "0") });
            j = en + 2;
          }
        }
        def.stages.push(st);
      } else throw new Error(`orden desconocida "${toks[0]}"`);
    } catch (e) {
      throw new Error(`${ln}: ${e.message}`);
    }
  });
  if (def.param) {
    const m = def.margins ?? { xmin: 0, xmax: 40, bottom: def.param.zpie - 12 };
    def.margins = m;
    def.interfaces[0] = terrainFromParam(def.param, m.xmin, m.xmax);
  }
  for (const w of def.walls) {
    const s0 = def.soils.find((q) => q.name === w.soil);
    if (s0) s0.rigido = true;
  }
  if (def.interfaces.length) {
    if (!def.margins) {
      const xs = def.interfaces.flat().map((p) => p[0]), ys = def.interfaces.flat().map((p) => p[1]);
      def.margins = { xmin: Math.min(...xs), xmax: Math.max(...xs), bottom: Math.min(...ys) - 10 };
    }
    def.outline = outlineFromInterfaces(def);
  }
  if (!opts.draft) {
    if (def.outline.length < 3) throw new Error("falta el terreno: `interfaz x,y \u2026` (o un `contorno`)");
    if (!def.soils.length) throw new Error("falta al menos un suelo");
  }
  if (!def.stages.length) def.stages.push({ name: "peso propio", surcharges: [], anchors: [] });
  else if (def.stages[0].name.startsWith("+")) def.stages.unshift({ name: "peso propio", surcharges: [], anchors: [] });
  return def;
}
function spanInterface(poly, xmin, xmax) {
  const P = poly.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  if (P[0][0] > xmin + 1e-9) out.push([xmin, P[0][1]]);
  for (const p of P) if (p[0] >= xmin - 1e-9 && p[0] <= xmax + 1e-9) out.push([Math.min(Math.max(p[0], xmin), xmax), p[1]]);
  if (P[P.length - 1][0] < xmax - 1e-9) out.push([xmax, P[P.length - 1][1]]);
  return out;
}
function interfaceY(poly, x) {
  const P = poly.slice().sort((a, b) => a[0] - b[0]);
  if (x <= P[0][0]) return P[0][1];
  for (let i = 0; i + 1 < P.length; i++) if (x <= P[i + 1][0]) {
    const t = (x - P[i][0]) / (P[i + 1][0] - P[i][0] || 1);
    return P[i][1] + t * (P[i + 1][1] - P[i][1]);
  }
  return P[P.length - 1][1];
}
function outlineFromInterfaces(def) {
  const m = def.margins;
  const terr = effectiveTerrain(def);
  return [[m.xmin, m.bottom], [m.xmax, m.bottom], ...terr.slice().reverse()];
}
function regionAt(def, x, y) {
  const m = def.margins;
  return def.interfaces.reduce((n, it, k) => n + (interfaceY(k === 0 ? effectiveTerrain(def) : spanInterface(it, m.xmin, m.xmax), x) > y + 1e-9 ? 1 : 0), 0);
}

// src/lem/slices.ts
var soilAt = (def, x, y) => {
  for (const w of def.walls ?? []) if (pointInPolygon(x, y, wallPolygon(w.pm, wallGround(def, w)))) {
    const h = def.soils.find((s) => s.name === w.soil);
    if (h) return h;
  }
  const reg = regionAt(def, x, y);
  const a = def.assign.find((a2) => regionAt(def, a2.p[0], a2.p[1]) === reg);
  return def.soils.find((s) => s.name === (a?.soil ?? def.soils[0]?.name)) ?? def.soils[0];
};
function cortaMuro(def, yBot, x0, x1) {
  const ws = def.walls ?? [];
  if (!ws.length) return false;
  const polys = ws.map((w) => wallPolygon(w.pm, wallGround(def, w)));
  for (let i = 0; i <= 120; i++) {
    const x = x0 + (x1 - x0) * i / 120, y = yBot(x);
    for (const P of polys) if (pointInPolygon(x, y, P)) return true;
  }
  return false;
}
function columnWeight(def, spans, x, yb, yt) {
  if (yt <= yb) return { W: 0 };
  const zs = [yt, ...spans.map((sp) => interfaceY(sp, x)).filter((z) => z > yb + 1e-6 && z < yt - 1e-6).sort((a, b) => b - a), yb];
  let W = 0;
  for (let i = 0; i + 1 < zs.length; i++) {
    const zmid = (zs[i] + zs[i + 1]) / 2, s = soilAt(def, x, zmid);
    W += (s?.gamma ?? 18) * (zs[i] - zs[i + 1]);
  }
  return { W };
}
function sliceCircle(def, cir, n = 40) {
  const m = def.margins;
  const terr = effectiveTerrain(def);
  const spans = def.interfaces.map((it, k) => k === 0 ? terr : spanInterface(it, m.xmin, m.xmax));
  const f = (x) => {
    const dx = x - cir.cx, yt = interfaceY(terr, x);
    return dx * dx + (yt - cir.cy) ** 2 - cir.R * cir.R;
  };
  const xs = [];
  const N = 400;
  let prev = f(m.xmin);
  for (let i = 1; i <= N; i++) {
    const x = m.xmin + (m.xmax - m.xmin) * i / N, v = f(x);
    if (prev * v < 0) {
      let a = x - (m.xmax - m.xmin) / N, bb = x;
      for (let k = 0; k < 40; k++) {
        const mid = (a + bb) / 2;
        if (f(a) * f(mid) < 0) bb = mid;
        else a = mid;
      }
      xs.push((a + bb) / 2);
    }
    prev = v;
  }
  if (xs.length < 2) return null;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  if (x1 - x0 < 1e-3) return null;
  const yBot = (x) => cir.cy - Math.sqrt(Math.max(0, cir.R * cir.R - (x - cir.cx) ** 2));
  if (cortaMuro(def, yBot, x0, x1)) return null;
  const slices = [];
  for (let i = 0; i < n; i++) {
    const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n, xm = (xa + xb) / 2, b = xb - xa;
    const yb = yBot(xm), yt = interfaceY(terr, xm);
    if (yt <= yb) continue;
    const dyb = yBot(xb) - yBot(xa);
    const alpha = Math.atan2(dyb, b);
    const { W } = columnWeight(def, spans, xm, yb, yt);
    const s = soilAt(def, xm, yb + 1e-3);
    const u = 0;
    slices.push({ xm, b, alpha, W: W * b, c: s?.c ?? 0, phi: (s?.phi ?? 0) * Math.PI / 180, u, yb, yt });
  }
  return slices.length >= 3 ? { slices, x0, x1 } : null;
}
function fsCircle(def, cir, method, n = 40) {
  const cut = sliceCircle(def, cir, n);
  if (!cut) return null;
  const { slices, x0, x1 } = cut;
  const driving = slices.reduce((s, sl) => s + sl.W * Math.sin(sl.alpha), 0);
  if (driving <= 1e-6) return null;
  if (method === "fellenius") {
    const resist = slices.reduce((s, sl) => {
      const l = sl.b / Math.cos(sl.alpha);
      return s + sl.c * l + (sl.W * Math.cos(sl.alpha) - sl.u * l) * Math.tan(sl.phi);
    }, 0);
    return { fs: resist / driving, method, circle: cir, slices, x0, x1 };
  }
  let fs = 1, it = 0;
  for (; it < 100; it++) {
    let num2 = 0;
    for (const sl of slices) {
      const ma = Math.cos(sl.alpha) + Math.sin(sl.alpha) * Math.tan(sl.phi) / fs;
      if (Math.abs(ma) < 1e-6) return null;
      num2 += (sl.c * sl.b + (sl.W - sl.u * sl.b) * Math.tan(sl.phi)) / ma;
    }
    const nf = num2 / driving;
    if (!Number.isFinite(nf)) return null;
    if (Math.abs(nf - fs) < 1e-6) {
      fs = nf;
      break;
    }
    fs = nf;
  }
  return { fs, method, circle: cir, slices, x0, x1, iters: it };
}
function criticalCircle(def, method, n = 40) {
  const m = def.margins;
  const terr = effectiveTerrain(def);
  const xmin = m.xmin, xmax = m.xmax, ytopMax = Math.max(...terr.map((p) => p[1])), ybotMin = m.bottom;
  const H = ytopMax - ybotMin, W = xmax - xmin;
  let best = null;
  const NC = 12;
  for (let ix = 0; ix <= NC; ix++) for (let iy = 0; iy <= NC; iy++) {
    const cx = xmin + W * (0.2 + 0.6 * ix / NC), cy = ytopMax + H * (0.1 + 1.2 * iy / NC);
    for (let ir = 0; ir <= 14; ir++) {
      const R = H * (0.5 + 1.6 * ir / 14);
      const r = fsCircle(def, { cx, cy, R }, method, n);
      if (r && r.fs > 0.2 && r.fs < 50 && (!best || r.fs < best.fs)) best = r;
    }
  }
  if (!best) return null;
  const c0 = best.circle;
  const dc = W * 0.06, dr = H * 0.12;
  for (let ix = -3; ix <= 3; ix++) for (let iy = -3; iy <= 3; iy++) for (let ir = -3; ir <= 3; ir++) {
    const cir = { cx: c0.cx + dc * ix / 3, cy: c0.cy + dc * iy / 3, R: c0.R + dr * ir / 3 };
    const r = fsCircle(def, cir, method, n);
    if (r && r.fs > 0.2 && r.fs < 50 && r.fs < best.fs) best = r;
  }
  return best;
}
export {
  criticalCircle,
  fsCircle,
  parseHgeo
};
