// INTERFAZ CON MENÚS (26-nov-2026, pedido de usuarios de Hekatan Engineers: «está cargadita la interfaz; reducir al mínimo los
// estímulos visuales y dejar todo en menús»). Estilo GEO5/PLAXIS:
//   · barra de menús arriba: Archivo · Geometría · Suelos · Etapas · Malla · Calcular · Resultados · Ayuda
//   · en pantalla solo el modelo grande; los datos van en UN panel «Datos» plegable (cerrado por defecto) con carpetas
//   · resultados en pestañas (Desplazamientos | Esfuerzos | Puntos plásticos | FS | Tabla) en vez de todo apilado
//   · textos largos (subtítulo, pie, notas) detrás de ⓘ o en Ayuda; paleta neutra, el dorado solo para lo activo
//   · celular: menú hamburguesa; teclado: Alt+letra abre un menú, F10 la barra, flechas, Enter, Esc
// NO se rehace la lógica: los controles de siempre (mismos id) se MUEVEN a su sitio y los menús los accionan.
// Menú MALLA (pedido «¿se puede editar la malla?»): tamaño global, zonas de refinamiento (rectángulo / punto / línea dibujados con
// su h), refinar cara y pie del talud, calidad (ángulo mínimo, nº de elementos y nudos, avisos), ver malla y numerar; remalla en vivo.
type Stats = { nodes: number; elements: number; minAngle: number; meanEdge: number; h: number; refinas: { tipo: string; pts: [number, number][]; h: number; r?: number }[] };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const clic = (id: string) => () => $(id)?.click();
const TOPE_ELEM = 1500;   // más elementos: el FS en el navegador suele pasar de ~15 s (medido: corte 2064 T6 → 25 s en Chrome; 841 T6 → 2 s)

type Item = { t: string; k?: string; f: () => void; sep?: boolean };
let menuAbierto: HTMLElement | null = null;

export function montarMenus(): void {
  estilos();
  const header = document.querySelector("header")!, main = document.querySelector("main")!, aside = main.querySelector("aside.panel") as HTMLElement;
  const centro = main.querySelector("section.panel") as HTMLElement;
  // ---- cabecera: subtítulo detrás de ⓘ ----
  const sub = header.querySelector(".sub") as HTMLElement | null;
  if (sub) { sub.hidden = true; const i = boton("ⓘ", "info", () => alerta("Hekatan Geotechnic", sub.textContent ?? "")); i.title = sub.textContent ?? ""; header.querySelector("div")!.appendChild(i); }
  // ---- panel «Datos»: el aside de siempre, plegable, con una carpeta por sección ----
  aside.id = "datos"; aside.classList.add("cerrado");
  carpetas(aside);
  // barra de dibujo (Geometría) dentro de su carpeta; la línea de órdenes sigue SIEMPRE visible bajo el modelo
  const tools = centro.querySelector(".tools") as HTMLElement;
  const fGeo = carpeta(aside, "Geometría · dibujo", "fGeom", 1); fGeo.querySelector(".cuerpo")!.appendChild(tools);
  // carpeta MALLA (nueva)
  const fMalla = carpeta(aside, "Malla", "fMalla", 2); fMalla.querySelector(".cuerpo")!.appendChild(panelMalla());
  // ---- barra de menús ----
  const nav = document.createElement("nav"); nav.id = "menubar"; nav.setAttribute("role", "menubar");
  const ham = boton("☰", "hamb", () => nav.classList.toggle("abierta")); ham.title = "menú"; ham.setAttribute("aria-label", "menú");
  const datosBtn = boton("◧ Datos", "datosBtn", () => alternarDatos()); datosBtn.title = "panel de datos (Alt+D)";
  nav.append(ham, datosBtn);
  const abrirCarpeta = (id: string) => () => { alternarDatos(true); const d = $(id) as HTMLDetailsElement | null; if (d) { d.open = true; d.scrollIntoView({ block: "start", behavior: "smooth" }); } };
  const herramienta = (t: string) => () => { abrirCarpeta("fGeom")(); (document.querySelector(`.tools [data-tool="${t}"]`) as HTMLButtonElement | null)?.click(); };
  const MENUS: [string, string, Item[]][] = [
    ["Archivo", "a", [{ t: "Nuevo", k: "Ctrl+N", f: clic("fNuevo") }, { t: "Abrir .hgeo…", f: clic("fAbrir") }, { t: "Guardar .hgeo", f: clic("fGuardar") },
      { t: "Exportar DXF para GEO5", f: clic("fDxf"), sep: true }, { t: "Importar DXF…", f: clic("fImpDxf") }, { t: "Importar resultados de GEO5…", f: clic("fImpG5") },
      { t: "Ejemplos y tipos de talud…", f: abrirCarpeta("fModelo"), sep: true }]],
    ["Geometría", "g", [{ t: "Ver (sin dibujar)", f: herramienta("ver") }, { t: "Interfaz / terreno", f: herramienta("interfaz") }, { t: "Asignar suelo", f: herramienta("asignar") },
      { t: "Sobrecarga", f: herramienta("sobrecarga") }, { t: "Ancla", f: herramienta("ancla") }, { t: "Muro", f: herramienta("muro") }, { t: "Mover vértice", f: herramienta("mover") },
      { t: "Borrar", f: herramienta("borrar") }, { t: "Deshacer", k: "Ctrl+Z", f: clic("undo"), sep: true }, { t: "Rejilla, osnap, orto…", f: abrirCarpeta("fGeom") }, { t: "Editor .hgeo (texto)", f: () => { abrirCarpeta("fModelo")(); const e = $("editor"); if (e) { e.hidden = false; document.body.classList.add("verHgeo"); } } }]],
    ["Suelos", "s", [{ t: "Materiales y parámetros (φ, c, γ, E)", f: abrirCarpeta("fParametros") }, { t: "Ley del suelo (Mohr-Coulomb / Drucker-Prager)", f: () => { abrirCarpeta("fModelo")(); $("modSuelo")?.focus(); } },
      { t: "Asignar suelo a una región", f: herramienta("asignar") }, { t: "Agua (freático / Ru / poros)", f: abrirCarpeta("fVista") }]],
    ["Etapas", "e", [{ t: "Etapas a calcular", f: () => { abrirCarpeta("fModelo")(); $("nstages")?.focus(); } }, { t: "Cargas de la etapa (q, F, ancla)", f: abrirCarpeta("fGeom") },
      { t: "Etapas y cargas por texto (.hgeo)", f: () => { abrirCarpeta("fModelo")(); const e = $("editor"); if (e) e.hidden = false; document.body.classList.add("verHgeo"); } }]],
    ["Malla", "m", [{ t: "Tamaño, refinamiento y calidad…", f: abrirCarpeta("fMalla") }, { t: "Ver / ocultar la malla", f: () => { const s = $<HTMLSelectElement>("meshmode")!; s.value = s.value === "edges" ? "none" : "edges"; s.dispatchEvent(new Event("change")); } },
      { t: "Numerar nudos y elementos", f: () => { const s = $<HTMLSelectElement>("numeros")!; s.value = s.value ? "" : "ambos"; s.dispatchEvent(new Event("change")); } }]],
    ["Calcular", "c", [{ t: "Recalcular todas las etapas", k: "F5", f: clic("run") }, { t: "Recalcular al mover (sí/no)", f: () => { const c = $<HTMLInputElement>("auto")!; c.click(); } },
      { t: "Método (GeoFEM / Bishop / Fellenius)", f: () => { abrirCarpeta("fModelo")(); $("metodo")?.focus(); } }, { t: "Dinámico (sismo en la base)…", f: abrirCarpeta("fDinamico") }]],
    ["Resultados", "r", [{ t: "Desplazamientos", f: () => pestana("desp") }, { t: "Esfuerzos", f: () => pestana("esf") }, { t: "Puntos plásticos", f: () => pestana("plas") },
      { t: "Factor de seguridad", f: () => pestana("fs") }, { t: "Tabla y registro", f: () => pestana("tabla") }, { t: "Vista (deformada, superficie, agua)…", f: abrirCarpeta("fVista"), sep: true }]],
    ["Ayuda", "y", [{ t: "Pasos (como GEO5)", f: clic("gAyuda") }, { t: "Atajos de teclado", f: () => alerta("Teclado", "Alt+A Archivo · Alt+G Geometría · Alt+S Suelos · Alt+E Etapas · Alt+M Malla · Alt+C Calcular · Alt+R Resultados · Alt+Y Ayuda · Alt+D panel de datos · F10 barra de menús · flechas para moverse · Enter elige · Esc cierra · F3 osnap · F8 orto · F9 rejilla · Ctrl+Z deshacer") },
      { t: "Acerca de", f: () => alerta("Acerca de", ($("pieTxt")?.textContent ?? "") + "\n\n" + (sub?.textContent ?? "") + "\n\nVersión " + ($("ver")?.textContent ?? "")) }]],
  ];
  for (const [nom, k, items] of MENUS) nav.appendChild(menu(nom, k, items));
  header.after(nav);
  // ---- pie: el texto largo va a Ayuda › Acerca de; queda la versión ----
  const pie = $("pieTxt"); if (pie) pie.hidden = true;
  // ---- pestañas de resultados sobre el modelo ----
  const tabs = document.createElement("div"); tabs.id = "rtabs"; tabs.setAttribute("role", "tablist");
  tabs.innerHTML = `<div class="fila">${[["desp", "Desplazamientos"], ["esf", "Esfuerzos"], ["plas", "Puntos plásticos"], ["fs", "FS"], ["tabla", "Tabla"]].map(([id, t]) => `<button role="tab" data-p="${id}">${t}</button>`).join("")}</div><div class="sub" id="rsub"></div>`;
  const etabs = $("etabs")!; etabs.before(tabs);
  tabs.querySelectorAll<HTMLButtonElement>("button[data-p]").forEach((b) => b.addEventListener("click", () => pestana(b.dataset.p!)));
  const bajo = document.createElement("div"); bajo.id = "rpanel"; bajo.hidden = true;
  const stack = centro.querySelector(".stack")!; const hover = $("hover")!;
  stack.after(hover); hover.after(bajo); bajo.append($("fs")!, $("log")!);
  pestana("desp", false);
  // ---- teclado ----
  document.addEventListener("keydown", (e) => {
    if (e.key === "F10") { e.preventDefault(); (nav.querySelector(".mb") as HTMLElement)?.focus(); return; }
    if (e.key === "Escape" && menuAbierto) { cerrarMenu(); return; }
    if (e.altKey && !e.ctrlKey) {
      const l = e.key.toLowerCase();
      if (l === "d") { e.preventDefault(); alternarDatos(); return; }
      const b = nav.querySelector<HTMLElement>(`.mb[data-k="${l}"]`); if (b) { e.preventDefault(); abrirMenu(b.parentElement!); }
    }
  });
  document.addEventListener("click", (e) => { if (menuAbierto && !menuAbierto.contains(e.target as Node)) cerrarMenu(); });
  (window as unknown as { __ui: unknown }).__ui = { pestana, alternarDatos, menus: MENUS.map((m) => [m[0], m[2].map((i) => i.t)]) };
}

function boton(t: string, cls: string, f: () => void): HTMLButtonElement { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = t; b.addEventListener("click", f); return b; }
function alerta(tit: string, txt: string) {
  let d = $("dlgInfo") as HTMLDialogElement | null;
  if (!d) { d = document.createElement("dialog"); d.id = "dlgInfo"; document.body.appendChild(d); }
  d.innerHTML = `<h3></h3><p></p><form method="dialog"><button>cerrar</button></form>`;
  d.querySelector("h3")!.textContent = tit; d.querySelector("p")!.textContent = txt; d.showModal();
}
function alternarDatos(abrir?: boolean) {
  const a = $("datos")!, ab = abrir ?? a.classList.contains("cerrado");
  a.classList.toggle("cerrado", !ab); document.body.classList.toggle("conDatos", ab);
  $("datosBtn")?.classList.toggle("on", ab);
}
/** convierte el aside (h2 + controles) en carpetas plegables <details> */
function carpetas(aside: HTMLElement) {
  const ids: Record<string, string> = { modelo: "fModelo", "parámetros": "fParametros", "dinámico": "fDinamico", vista: "fVista" };
  const nodos = Array.from(aside.childNodes); aside.innerHTML = "";
  const cab = document.createElement("div"); cab.className = "datosCab"; cab.innerHTML = `<b>DATOS</b>`; cab.appendChild(boton("✕", "cerrar", () => alternarDatos(false))); aside.appendChild(cab);
  let cur: HTMLElement | null = null;
  const nueva = (h2: HTMLElement) => { const t = (h2.childNodes[0]?.textContent ?? h2.textContent ?? "").trim(); const d = carpeta(aside, t, ids[t.toLowerCase()] ?? ""); const nota = h2.querySelector("span"); if (nota) d.querySelector("summary")!.title = nota.textContent ?? ""; return d.querySelector(".cuerpo") as HTMLElement; };
  for (const n of nodos) {
    if (n instanceof HTMLElement && n.tagName === "H2") { cur = nueva(n); continue; }
    if (n instanceof HTMLElement && n.id === "dinwrap") { const h2 = n.querySelector("h2") as HTMLElement; const c = nueva(h2); h2.remove(); c.appendChild(n); cur = null; continue; }
    (cur ?? aside).appendChild(n);
  }
  ($("fModelo") as HTMLDetailsElement | null)?.setAttribute("open", "");
}
function carpeta(aside: HTMLElement, titulo: string, id: string, pos?: number): HTMLDetailsElement {
  const d = document.createElement("details"); d.className = "carp"; if (id) d.id = id;
  d.innerHTML = `<summary>${titulo}</summary><div class="cuerpo"></div>`;
  const hs = aside.querySelectorAll(":scope > details.carp");
  if (pos !== undefined && hs[pos]) aside.insertBefore(d, hs[pos]); else aside.appendChild(d);
  return d;
}
function menu(nom: string, k: string, items: Item[]): HTMLElement {
  const w = document.createElement("div"); w.className = "mw";
  const b = document.createElement("button"); b.type = "button"; b.className = "mb"; b.dataset.k = k; b.setAttribute("aria-haspopup", "true");
  const i = nom.toLowerCase().indexOf(k); b.innerHTML = i >= 0 ? `${nom.slice(0, i)}<u>${nom[i]}</u>${nom.slice(i + 1)}` : nom;
  const ul = document.createElement("div"); ul.className = "md"; ul.setAttribute("role", "menu");
  for (const it of items) {
    if (it.sep) ul.appendChild(Object.assign(document.createElement("hr"), {}));
    const a = document.createElement("button"); a.type = "button"; a.setAttribute("role", "menuitem"); a.innerHTML = `<span>${it.t}</span>${it.k ? `<kbd>${it.k}</kbd>` : ""}`;
    a.addEventListener("click", (e) => { e.stopPropagation(); cerrarMenu(); document.getElementById("menubar")?.classList.remove("abierta"); it.f(); });
    ul.appendChild(a);
  }
  b.addEventListener("click", (e) => { e.stopPropagation(); if (menuAbierto === w) cerrarMenu(); else abrirMenu(w); });
  b.addEventListener("mouseenter", () => { if (menuAbierto && menuAbierto !== w) abrirMenu(w); });
  w.addEventListener("keydown", (e) => {
    const its = Array.from(ul.querySelectorAll<HTMLButtonElement>("button")), j = its.indexOf(document.activeElement as HTMLButtonElement);
    const vecino = (d: number) => { const ws = Array.from(document.querySelectorAll<HTMLElement>("#menubar .mw")), q = ws[(ws.indexOf(w) + d + ws.length) % ws.length]; abrirMenu(q); };
    if (e.key === "ArrowDown") { e.preventDefault(); if (!menuAbierto) abrirMenu(w); else its[(j + 1) % its.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); its[(j - 1 + its.length) % its.length]?.focus(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); vecino(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); vecino(-1); }
    else if (e.key === "Escape") { e.preventDefault(); cerrarMenu(); b.focus(); }
  });
  w.append(b, ul); return w;
}
function abrirMenu(w: HTMLElement) { cerrarMenu(); w.classList.add("open"); menuAbierto = w; (w.querySelector(".md button") as HTMLElement | null)?.focus(); }
function cerrarMenu() { menuAbierto?.classList.remove("open"); menuAbierto = null; }

/** pestañas de resultados: cada una elige el campo (selector #field de siempre) o muestra la tabla/registro bajo el modelo */
const GRUPOS: Record<string, [string, string][]> = {
  desp: [["dx", "d_x"], ["dz", "d_z"], ["d", "|d|"]],
  esf: [["sx", "σx,ef"], ["sz", "σz,ef"], ["sxt", "σx,tot"], ["szt", "σz,tot"], ["txz", "τxz"], ["J", "J"], ["u", "u poros"]],
  plas: [["Edpl", "E_d,pl (puntos plásticos)"], ["Ed", "E_d total"]],
};
function pestana(p: string, elegir = true) {
  document.querySelectorAll<HTMLButtonElement>("#rtabs button[data-p]").forEach((b) => { const on = b.dataset.p === p; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
  const sub = $("rsub")!, panel = $("rpanel")!, field = $<HTMLSelectElement>("field")!;
  const g = GRUPOS[p];
  if (g) {
    panel.hidden = true; $("fs")!.hidden = false; $("log")!.hidden = false;
    if (elegir && !g.some(([v]) => v === field.value)) { field.value = g[0][0]; field.dispatchEvent(new Event("change")); }
    sub.innerHTML = g.map(([v, t]) => `<button data-f="${v}" class="${v === field.value ? "on" : ""}">${t}</button>`).join("");
    sub.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => { field.value = b.dataset.f!; field.dispatchEvent(new Event("change")); sub.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); }));
  } else {
    sub.innerHTML = p === "fs" ? `<span class="nota">FS por etapa (pestañas de etapa arriba) · peldaño SRF:</span>` : `<span class="nota">FS por etapa y registro del cálculo (el mismo log que el driver de Python / GEO5)</span>`;
    if (p === "fs") { const st = $("step"); if (st) sub.appendChild(st); }
    panel.hidden = false; $("fs")!.hidden = false; $("log")!.hidden = p !== "tabla";
  }
}

// =============================== MENÚ MALLA ===============================
function panelMalla(): HTMLElement {
  const w = document.createElement("div"); w.id = "mallaPanel";
  w.innerHTML = `
    <div class="sl"><span class="n">tamaño global h [m]</span><input type="range" id="mH" min="0.1" max="5" step="0.05"><input id="mHv" type="number" min="0.05" step="0.05" style="padding:2px 4px"></div>
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="mVivo" checked style="width:auto"> remallar en vivo</label>
    <div class="mq" id="mCal">—</div>
    <div style="margin-top:6px;color:var(--mut);font-size:12px">Refinamiento local <span title="malla más fina en una zona; vuelve al tamaño global con pendiente 0.5 m por metro">ⓘ</span></div>
    <div class="row" style="align-items:center"><div><label>h de la zona [m]</label><input id="mZh" type="number" value="0.3" min="0.05" step="0.05"></div><div><label>radio (punto) [m]</label><input id="mZr" type="number" value="1" min="0" step="0.25"></div></div>
    <div class="row" style="gap:4px;margin-top:4px"><button class="tb" id="mRect" title="dos clics: esquinas del rectángulo">▭ rectángulo</button><button class="tb" id="mPunto" title="un clic: centro">• punto</button><button class="tb" id="mLinea" title="clics; doble clic o Enter termina">╱ línea</button></div>
    <button class="tb" id="mCara" style="margin-top:4px" title="refina las caras inclinadas del terreno (0.6·h) y sus pies (0.4·h, radio 1 m)">refinar cara y pie del talud</button>
    <div id="mZonas" class="mq"></div>
    <div class="row" style="margin-top:6px"><div><label>malla</label><select id="mVer"><option value="edges">ver</option><option value="none">ocultar</option></select></div><div><label>numerar</label><select id="mNum"><option value="">nada</option><option value="nudos">nudos</option><option value="elementos">elementos</option><option value="ambos">ambos</option></select></div></div>
    <div id="mMsg" class="mq"></div>`;
  setTimeout(() => cablearMalla(w), 0);
  return w;
}
const txtHgeo = () => $<HTMLTextAreaElement>("hgeo")!;
function aplicarTexto(t: string) { txtHgeo().value = t; ($("apply") as HTMLButtonElement | null)?.click(); }
function conMalla(f: (lineas: string[]) => string[]) {
  const L = txtHgeo().value.replace(/\s+$/, "").split("\n"); aplicarTexto(f(L).join("\n") + "\n");
}
function ponerRefina(linea: string) {
  conMalla((L) => { const i = L.findIndex((l) => /^\s*etapa\b/.test(l)); if (i < 0) L.push(linea); else L.splice(i, 0, linea); return L; });
}
function cablearMalla(w: HTMLElement) {
  const r = $<HTMLInputElement>("mH")!, v = $<HTMLInputElement>("mHv")!, vivo = $<HTMLInputElement>("mVivo")!;
  let t: number | undefined;
  const ponerH = (h: number) => { conMalla((L) => { const i = L.findIndex((l) => /^\s*malla\s/.test(l)); const s = `malla ${+h.toFixed(3)}`; if (i >= 0) L[i] = s; else { const j = L.findIndex((l) => /^\s*etapa\b/.test(l)); if (j < 0) L.push(s); else L.splice(j, 0, s); } return L; }); };
  r.addEventListener("input", () => { v.value = r.value; prever(+r.value); if (vivo.checked) { clearTimeout(t); t = window.setTimeout(() => ponerH(+r.value), 450); } });
  r.addEventListener("change", () => { if (!vivo.checked) ponerH(+r.value); });
  v.addEventListener("change", () => { const h = +v.value; if (h > 0) { r.value = String(Math.min(5, h)); ponerH(h); } });
  const ver = $<HTMLSelectElement>("mVer")!, num = $<HTMLSelectElement>("mNum")!;
  ver.addEventListener("change", () => { const s = $<HTMLSelectElement>("meshmode")!; s.value = ver.value; s.dispatchEvent(new Event("change")); });
  num.addEventListener("change", () => { const s = $<HTMLSelectElement>("numeros")!; s.value = num.value; s.dispatchEvent(new Event("change")); });
  $("mRect")!.addEventListener("click", () => dibujarZona("rect"));
  $("mPunto")!.addEventListener("click", () => dibujarZona("punto"));
  $("mLinea")!.addEventListener("click", () => dibujarZona("linea"));
  $("mCara")!.addEventListener("click", () => {
    const it = txtHgeo().value.split("\n").find((l) => /^\s*interfaz\s/.test(l)); const st = (window as unknown as { __malla?: Stats }).__malla;
    if (!it || !st) { msg("hace falta un terreno escrito como `interfaz` (no un `talud` paramétrico)"); return; }
    const T = it.trim().split(/\s+/).slice(1).map((q) => q.split(",").map(Number)); const out: string[] = []; const pies = new Set<string>();
    for (let i = 0; i + 1 < T.length; i++) { const a = T[i], b = T[i + 1]; if (Math.abs(b[1] - a[1]) < 1e-9) continue; out.push(`refina linea ${a.join(",")} ${b.join(",")} h=${+(0.6 * st.h).toFixed(3)}`); const p = a[1] < b[1] ? a : b; pies.add(p.join(",")); }
    for (const p of pies) out.push(`refina punto ${p} h=${+(0.4 * st.h).toFixed(3)} r=1`);
    if (!out.length) { msg("el terreno no tiene caras inclinadas"); return; }
    conMalla((L) => { const i = L.findIndex((l) => /^\s*etapa\b/.test(l)); L.splice(i < 0 ? L.length : i, 0, ...out); return L; });
  });
  const pinta = () => {
    const st = (window as unknown as { __malla?: Stats }).__malla, editable = $<HTMLSelectElement>("model")?.value === "hgeo";
    w.classList.toggle("fija", !editable);
    if (!st || !editable) { $("mCal")!.textContent = "Demo04 usa la MALLA EXACTA de GEO5 (no se edita: es la referencia 142/142). Para mallar a tu gusto: Ejemplo → Editor .hgeo o un Tipo de talud."; return; }
    r.value = String(Math.min(5, st.h)); v.value = String(st.h);
    const mala = st.minAngle < 20, grande = st.elements > TOPE_ELEM;
    $("mCal")!.innerHTML = `<b>${st.elements}</b> T6 · <b>${st.nodes}</b> nudos · ángulo mínimo <b style="color:${mala ? "#e5382b" : "inherit"}">${st.minAngle.toFixed(1)}°</b> · arista media ${st.meanEdge.toFixed(2)} m` +
      (mala ? `<br><span class="av">⚠ malla de mala calidad (ángulo &lt; 20°): sube h o revisa la geometría</span>` : "") +
      (grande ? `<br><span class="av">⚠ ${st.elements} elementos: en el navegador el FS puede tardar bastante más de 15 s</span>` : "");
    const Z = $("mZonas")!;
    Z.innerHTML = st.refinas.length ? st.refinas.map((z, i) => `<div class="zona"><span>${z.tipo} ${z.pts.map((p) => p.map((q) => +q.toFixed(2)).join(",")).join(" ")} · h ${z.h}${z.r ? ` · r ${z.r}` : ""}</span><button class="tb" data-i="${i}" title="quitar">✕</button></div>`).join("") : `<span style="opacity:.7">sin zonas de refinamiento</span>`;
    Z.querySelectorAll<HTMLButtonElement>("button[data-i]").forEach((b) => b.addEventListener("click", () => { let k = -1; const n = +b.dataset.i!; conMalla((L) => L.filter((l) => !(/^\s*refina/.test(l) && ++k === n))); }));
    ver.value = $<HTMLSelectElement>("meshmode")!.value; num.value = $<HTMLSelectElement>("numeros")!.value;
  };
  const prever = (h: number) => { const st = (window as unknown as { __malla?: Stats }).__malla; if (st) msg(`≈ ${Math.round(st.elements * (st.h / h) ** 2)} elementos con h = ${h} m (estimado)${st.elements * (st.h / h) ** 2 > TOPE_ELEM ? " · ⚠ pesado para el navegador" : ""}`); };
  window.addEventListener("malla", pinta); $("model")?.addEventListener("change", () => setTimeout(pinta, 50)); pinta();
}
function msg(t: string) { const m = $("mMsg"); if (m) m.textContent = t; }
/** dibuja una zona de refinamiento sobre el modelo (clics capturados antes que las herramientas de dibujo) */
function dibujarZona(tipo: "rect" | "punto" | "linea") {
  const cv = $<HTMLCanvasElement>("draw")!, tg = cv.parentElement!, pts: [number, number][] = [];   // los clics los recibe el contenedor (con «ver», #draw no captura el ratón)
  const need = tipo === "rect" ? 2 : tipo === "punto" ? 1 : Infinity;
  msg(tipo === "rect" ? "clic en una esquina y en la opuesta (Esc cancela)" : tipo === "punto" ? "clic en el centro (Esc cancela)" : "clics sobre la línea; doble clic o Enter termina (Esc cancela)");
  document.body.classList.add("zonaMalla");
  const mundo = (e: MouseEvent): [number, number] | null => { const mp = (window as unknown as { __geoMap?: { inv: (x: number, y: number) => [number, number] } }).__geoMap; if (!mp) return null; const b = cv.getBoundingClientRect(); const [x, z] = mp.inv((e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height); return [+x.toFixed(2), +z.toFixed(2)]; };
  const fin = (ok: boolean) => {
    tg.removeEventListener("mousedown", md, true); tg.removeEventListener("dblclick", dbl, true); document.removeEventListener("keydown", kd, true); document.body.classList.remove("zonaMalla");
    if (!ok || pts.length < Math.min(need, tipo === "linea" ? 2 : need)) { msg("zona cancelada"); return; }
    const h = +($<HTMLInputElement>("mZh")!.value) || 0.3, r = +($<HTMLInputElement>("mZr")!.value) || 0;
    ponerRefina(`refina ${tipo} ${pts.map((p) => p.join(",")).join(" ")} h=${h}${tipo === "punto" && r ? ` r=${r}` : ""}`); msg(`zona ${tipo} añadida (h = ${h} m): remallando…`);
  };
  const md = (e: MouseEvent) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); const p = mundo(e); if (!p) return; pts.push(p); if (pts.length >= need) fin(true); else msg(`${pts.length} punto(s)…`); };
  const dbl = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); if (tipo === "linea") fin(pts.length >= 2); };
  const kd = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fin(false); } else if (e.key === "Enter" && tipo === "linea") { e.stopPropagation(); fin(pts.length >= 2); } };
  tg.addEventListener("mousedown", md, true); tg.addEventListener("dblclick", dbl, true); document.addEventListener("keydown", kd, true);
}

function estilos() {
  const s = document.createElement("style");
  s.textContent = `
  :root { --oro: #d3a53c; --bg: #141414; --panel: #1c1c1c; --txt: #e9e6df; --mut: #9c988f; --lin: #303030; }
  body { background: var(--bg) !important; }
  header { padding: 6px 14px !important; border-bottom: 1px solid var(--lin) !important; background: #101010 !important; }
  header h1 { font-size: 17px !important; background: none !important; color: var(--txt) !important; -webkit-text-fill-color: var(--txt) !important; }
  header h1 span { -webkit-text-fill-color: var(--mut) !important; color: var(--mut) !important; }
  header > div { display: flex; align-items: center; gap: 8px; } header button.info { width: auto; padding: 0 6px; border: 0; background: none; color: var(--mut); cursor: pointer; font-size: 15px; }
  .panel { background: var(--panel) !important; border-color: var(--lin) !important; }
  .panel h2, .tools .tl { color: var(--mut) !important; }
  select, input, button { border-color: #3a3a3a !important; background: #111 !important; }
  button.run { background: #2a2a2a !important; color: var(--txt) !important; border: 1px solid #4a4a4a !important; font-weight: 600 !important; }
  button.run:hover, .tools .tb:hover, #menubar .mb:hover { border-color: var(--oro) !important; }
  .tools .tb.on, #rtabs button.on, #menubar .mw.open > .mb, #menubar button.on, #mallaPanel .tb.on { background: var(--oro) !important; color: #141008 !important; border-color: var(--oro) !important; }
  #menubar { display: flex; align-items: center; gap: 2px; padding: 2px 10px; background: #181818; border-bottom: 1px solid var(--lin); position: sticky; top: 0; z-index: 50; }
  #menubar button { width: auto; border: 0 !important; background: none !important; color: var(--txt); padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; }
  #menubar .mw { position: relative; } #menubar .mb u { text-decoration-color: var(--mut); }
  #menubar .md { display: none; position: absolute; left: 0; top: 100%; min-width: 250px; background: #1f1f1f; border: 1px solid #3a3a3a; border-radius: 6px; padding: 4px; box-shadow: 0 8px 24px #000a; z-index: 60; }
  #menubar .mw.open .md { display: block; }
  #menubar .md button { display: flex; justify-content: space-between; gap: 14px; width: 100%; text-align: left; padding: 6px 10px; }
  #menubar .md button:hover, #menubar .md button:focus { background: #2c2c2c !important; outline: none; }
  #menubar .md kbd { color: var(--mut); font: 11px Consolas, monospace; } #menubar hr { border: 0; border-top: 1px solid #333; margin: 3px 0; }
  #menubar .hamb { display: none; font-size: 18px; } #menubar .datosBtn { margin-right: 6px; color: var(--mut) !important; }
  main { grid-template-columns: 1fr !important; padding: 8px 12px !important; }
  body.conDatos main { grid-template-columns: 320px 1fr !important; }
  #datos.cerrado { display: none; }
  #datos { max-height: calc(100vh - 90px); overflow: auto; position: sticky; top: 40px; align-self: start; padding: 6px 8px !important; }
  .datosCab { display: flex; justify-content: space-between; align-items: center; color: var(--mut); font-size: 12px; letter-spacing: 1px; margin-bottom: 4px; }
  .datosCab .cerrar { width: auto; padding: 0 6px; border: 0 !important; background: none !important; color: var(--mut); cursor: pointer; }
  details.carp { border-top: 1px solid var(--lin); } details.carp > summary { cursor: pointer; padding: 6px 2px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--mut); list-style: none; }
  details.carp > summary::before { content: "▸ "; } details.carp[open] > summary::before { content: "▾ "; } details.carp[open] > summary { color: var(--txt); }
  details.carp .cuerpo { padding: 0 2px 8px; } details.carp .tools { flex-wrap: wrap; }
  #tipoBox { border-color: var(--lin) !important; background: transparent !important; }
  #rtabs { margin-bottom: 4px; } #rtabs .fila { display: flex; gap: 2px; border-bottom: 1px solid var(--lin); flex-wrap: wrap; }
  #rtabs .fila button { width: auto; border: 1px solid transparent !important; border-bottom: 0 !important; background: none !important; color: var(--mut); padding: 5px 12px; border-radius: 6px 6px 0 0; cursor: pointer; }
  #rtabs .sub { display: flex; gap: 4px; padding: 4px 0; flex-wrap: wrap; align-items: center; font-size: 12px; } #rtabs .sub button { width: auto; padding: 2px 8px; font-size: 12px; cursor: pointer; }
  #rtabs .sub select { width: auto; } #rtabs .nota { color: var(--mut); }
  #rtabs .fila button.on { background: var(--oro) !important; color: #141008 !important; }
  #etabs { display: flex; gap: 3px; flex-wrap: wrap; } #etabs button { width: auto !important; flex: 0 1 auto; padding: 3px 10px !important; background: #1a1a1a !important; color: var(--mut) !important; border: 1px solid #333 !important; }
  #etabs button.on { background: var(--oro) !important; color: #141008 !important; }
  #rpanel { margin-top: 6px; } #rpanel #log { max-height: 320px; overflow: auto; }
  #mallaPanel .mq { font-size: 12px; color: var(--mut); margin: 4px 0; line-height: 1.5; } #mallaPanel .av { color: #e5a04f; }
  #mallaPanel .tb { width: auto; padding: 3px 8px; font-size: 12px; cursor: pointer; } #mallaPanel .zona { display: flex; justify-content: space-between; align-items: center; gap: 4px; }
  #mallaPanel .sl { grid-template-columns: 96px 1fr 62px; } #mallaPanel.fija > :not(#mCal) { opacity: .35; pointer-events: none; }
  body.zonaMalla #draw { cursor: cell !important; outline: 2px dashed var(--oro); }
  footer { padding: 4px 14px !important; font-size: 11px; color: var(--mut); }
  dialog#dlgInfo { background: #1f1f1f; color: var(--txt); border: 1px solid #444; border-radius: 8px; max-width: 560px; white-space: pre-wrap; }
  dialog#dlgInfo button { width: auto; padding: 4px 12px; }
  @media (max-width: 760px) {
    #menubar { flex-wrap: wrap; } #menubar .hamb { display: block; } #menubar .mw { display: none; width: 100%; }
    #menubar.abierta .mw { display: block; } #menubar .md { position: static; box-shadow: none; }
    body.conDatos main { grid-template-columns: 1fr !important; } #datos { position: fixed; inset: 40px 0 0 0; z-index: 40; max-height: none; }
    .stack { min-width: 0 !important; max-width: 100% !important; } header .sub { display: none; }
  }`;
  document.head.appendChild(s);
}
