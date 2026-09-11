// PANEL DEL MURO DE CONTENCIÓN: la verificación analítica (módulo Cantilever Wall de GEO5) y el mismo
// muro resuelto con SÓLIDOS H8 en 3D (el motor de Hekatan Struct, verificado nudo a nudo contra SAP2000).
//
// Las dos preguntas, una al lado de la otra, que es de lo que se trata:
//   ¿vuelca, desliza, aplasta el terreno?  → cuerpo rígido + empuje de Coulomb (esta verificación)
//   ¿cuánto flexa, qué tensión hay dentro? → sólidos H8 (y el GeoFEM del talud, que ya está en la gráfica)
import type { SlopeDef, Wall } from "../model/dsl";
import { wallLevels, wallGround } from "../model/dsl";
import { verificarMuro, type TeoriaEmpuje, type VerifResult } from "./verify";
import { mallaMuroSolido, type MuroSolidoParams } from "../solid/muroMalla";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** los dos parámetros que son SOLO del modelo en sólidos: el tamaño de elemento y la longitud en y */
function opcSolido() {
  return {
    ms: Math.max(0.05, parseFloat($<HTMLInputElement>("wMs").value) || 0.2),
    L: Math.max(0.5, parseFloat($<HTMLInputElement>("wL").value) || 1),
  };
}
function opciones() {
  const d = $<HTMLInputElement>("wDelta").value.trim().toLowerCase();
  return {
    teoria: $<HTMLSelectElement>("wTeoria").value as TeoriaEmpuje,
    delta: (d === "auto" || d === "" ? "auto" : parseFloat(d.replace(",", "."))) as number | "auto",
    beta: parseFloat($<HTMLInputElement>("wBeta").value) || 0,
    pasivo: $<HTMLInputElement>("wPasivo").checked,
    Rd: parseFloat($<HTMLInputElement>("wRd").value) || 0,
    sfVuelco: parseFloat($<HTMLInputElement>("wSfV").value) || 1.5,
    sfDesliz: parseFloat($<HTMLInputElement>("wSfS").value) || 1.5,
  };
}

function tabla(r: VerifResult): string {
  const filas = r.chequeos.map((c) => {
    const op = c.sentido === "min" ? (c.ok ? "≥" : "&lt;") : (c.ok ? "≤" : "&gt;");
    const col = c.ok ? "var(--ok, #0a6e3a)" : "#e5382b";
    return `<tr title="${c.formula}&#10;${c.detalle}"><td>${c.nombre}</td><td style="color:${col};font-weight:600;text-align:right">${c.valor.toFixed(3)}${c.unidad ? (c.unidad.startsWith("·") ? "" : " ") + c.unidad : ""}</td><td style="text-align:center">${op}</td><td style="text-align:right">${c.limite.toFixed(3)}${c.unidad ? (c.unidad.startsWith("·") ? "" : " ") + c.unidad : ""}</td><td style="color:${col}">${c.ok ? "cumple" : "NO cumple"}</td></tr>`;
  }).join("");
  const fz = r.fuerzas.map((f) => `<tr><td>${f.nombre}</td><td style="text-align:right">${f.H.toFixed(2)}</td><td style="text-align:right">${f.V.toFixed(2)}</td></tr>`).join("");
  return `<div style="margin:4px 0"><b>B = ${n3(r.geom.B)} m</b> · fuste libre ${n3(r.geom.Hf)} m · plano ficticio ${n3(r.geom.Htot)} m<br>
    relleno <b>${r.suelos.relleno.name}</b> (φ=${r.suelos.relleno.phi}° γ=${r.suelos.relleno.gamma}) · apoyo <b>${r.suelos.base.name}</b> (φ=${r.suelos.base.phi}° c=${r.suelos.base.c})<br>
    K<sub>a</sub> = <b>${r.K.Ka.toFixed(4)}</b> con δ = ${r.K.delta.toFixed(1)}°${r.K.Kp ? ` · K<sub>p</sub> = ${r.K.Kp.toFixed(3)}` : ""}</div>
    <table><tr><th>verificación</th><th>valor</th><th></th><th>límite</th><th></th></tr>${filas}</table>
    <details style="margin-top:4px"><summary>fuerzas [kN/m] · N = ${r.N.toFixed(2)} · H = ${r.Hd.toFixed(2)} · σ = ${r.sigma.min.toFixed(1)}…${r.sigma.max.toFixed(1)} kPa (${r.sigma.reparto})</summary>
    <table><tr><th></th><th>H</th><th>V</th></tr>${fz}</table>
    <div style="margin-top:3px">ΣM estabilizadores ${r.Mest.toFixed(2)} · ΣM de vuelco ${r.Mdes.toFixed(2)} kN·m/m · e = ${n3(r.e)} m</div></details>
    ${r.avisos.map((a) => `<div style="color:var(--oro)">· ${a}</div>`).join("")}`;
}

/** El muro del .hgeo pasado a la malla de sólidos: TODO sale del modelo, nada clavado en el código.
 *  geometría (fuste, zapata, talón, puntera y el alto libre) → de la orden `muro` y sus sliders
 *  E y ν y el peso del hormigón            → del `suelo` del muro
 *  K_a, γ del relleno y la sobrecarga q    → de la verificación (teoría, δ, β y la etapa visible)
 *  tamaño de elemento y longitud en y      → del panel (son propios del modelo en 3D) */
export function muroASolido(def: SlopeDef, w: Wall, etapa = 0): MuroSolidoParams {
  const pm = w.pm, z = wallGround(def, w), lv = wallLevels(pm, z);
  const r = verificarMuro(def, w, opcionesSeguras(), etapa);
  const hormigon = def.soils.find((s) => s.name === w.soil);
  const { ms, L } = opcSolido();
  return {
    H: lv.ztop - lv.ztf,               // fuste libre sobre la zapata
    t: pm.fuste, toe: pm.dedo, heel: pm.talon, tf: pm.zapata, L, ms,
    E: hormigon?.E ?? 3e7,
    nu: hormigon?.nu ?? 0.2,
    Ka: r.K.Ka, gamma: r.suelos.relleno.gamma,
    q0: r.q,                           // la MISMA sobrecarga que usa la verificación (antes iba 0)
    gammaC: hormigon?.gamma ?? 24,     // el peso del hormigón del .hgeo (antes 24 fijo)
    relleno: 1,
    ajustada: true,                    // la rejilla respeta la sección: el fuste se malla de 0.35, no de 0.408
  };
}
function opcionesSeguras() { try { return opciones(); } catch { return {}; } }

let ultimo: { def: SlopeDef; w: Wall; etapa: number } | null = null;
let solidoHecho = false;   // ya se resolvió una vez → a partir de ahí se recalcula solo, como el resto de la app

/** Rehace el panel con el modelo actual. Se llama cada vez que el modelo cambia (applyDef). */
export function actualizarMuro(def: SlopeDef | null, etapa = 0): void {
  const wrap = $<HTMLDivElement>("murowrap");
  if (!def?.walls?.length) { wrap.hidden = true; ultimo = null; solidoHecho = false; $<HTMLDivElement>("wsolout").innerHTML = ""; return; }
  wrap.hidden = false;
  const out = $<HTMLDivElement>("wout");
  try {
    const html = def.walls.map((w, i) => {
      const r = verificarMuro(def, w, opciones(), etapa);
      return `${def.walls.length > 1 ? `<div style="color:var(--oro);font-weight:600;margin-top:6px">muro ${i + 1} · ${w.soil} en x = ${n3(w.pm.x)} m</div>` : ""}${tabla(r)}`;
    }).join("");
    out.innerHTML = html;
    ultimo = { def, w: def.walls[0], etapa };
    // si el sólido ya está resuelto, se vuelve a resolver con la geometría nueva (tarda ~0.2 s)
    if (solidoHecho) void resolverSolido();
  } catch (e) { out.innerHTML = `<span style="color:#e5382b">✖ ${(e as Error).message}</span>`; }
}

/** El mismo muro resuelto en SÓLIDOS H8 (3D). Carga el WASM la primera vez. */
export async function resolverSolido(): Promise<void> {
  const out = $<HTMLDivElement>("wsolout");
  if (!ultimo) { out.textContent = "no hay muro en el modelo"; return; }
  out.innerHTML = "<span style='color:var(--oro)'>⏳ cargando el sólido H8 (WASM)…</span>";
  try {
    const { initHex8, hex8Solve } = await import("../solid/hex8");
    await initHex8();
    const p = muroASolido(ultimo.def, ultimo.w, ultimo.etapa);
    const m = mallaMuroSolido(p);
    const t0 = performance.now();
    const r = hex8Solve({ nodes: m.nodes, elements: m.elements, E: p.E, nu: p.nu, supports: m.supports, loads: m.loads, incompatible: true });
    const ux = (r.displacements.get(m.nudoCoronacion) ?? [0, 0, 0])[0] * 1000;
    let vm = 0; for (const v of r.vonMisesPerElement.values()) for (const g of v) vm = Math.max(vm, g);
    solidoHecho = true;
    out.innerHTML = `<b>coronación u_x = ${ux.toFixed(4)} mm</b> · von Mises máx ${vm.toFixed(0)} kPa<br>
      ${m.nodes.length} nudos · ${m.elements.length} hexaedros (${m.info.nx}×${m.info.ny}×${m.info.nz}, malla ${p.ms} m, largo ${p.L} m) · ${r.elapsedMs.toFixed(0)} ms en el WASM (${((performance.now() - t0) / 1000).toFixed(2)} s en total)<br>
      fuste ${p.t} × alto ${p.H.toFixed(2)} m · zapata ${p.tf} × (${p.toe} + ${p.t} + ${p.heel}) m · E=${(p.E / 1000).toFixed(0)} MPa · γ=${p.gammaC} kN/m³<br>
      empuje ${m.info.empujeTotal.toFixed(1)} kN (K<sub>a</sub>=${p.Ka.toFixed(4)}, γ=${p.gamma}, q=${p.q0} kPa) · peso propio ${m.info.pesoPropio.toFixed(1)} kN · relleno sobre el talón ${m.info.pesoRelleno.toFixed(1)} kN<br>
      <span style="color:var(--oro)">todo esto sale del modelo: mueve un slider del muro y se vuelve a resolver solo.</span><br>
      <span style="color:var(--mut)">la rejilla RESPETA la sección (puntera, fuste, talón, zapata y alzado con su propio número
      entero de divisiones): el fuste se malla de ${p.t} m exactos y al refinar el resultado converge — con la rejilla uniforme
      se construía de 0.408 m y u_x cambiaba un 160 % con la malla (tests/muro_solido_malla.ts).</span><br>
      <span style="color:var(--mut)">H8 con modos incompatibles = Solid de SAP2000 por defecto = C3D8I de Abaqus. Este motor da lo MISMO
      que SAP2000 nudo a nudo (4e-9 %, tests/muro_solido_sap.ts). Aquí el muro se apoya EMPOTRADO en la base de
      la zapata: es el muro como pieza, no el conjunto con el suelo (eso es el GeoFEM de la gráfica).</span>`;
  } catch (e) { out.innerHTML = `<span style="color:#e5382b">✖ ${(e as Error).message}</span>`; }
}

/** Engancha los controles del panel. `onCambio` se llama cuando hay que recalcular la verificación. */
export function engancharMuro(onCambio: () => void): void {
  for (const id of ["wTeoria", "wDelta", "wBeta", "wRd", "wSfV", "wSfS", "wPasivo", "wMs", "wL"]) {
    const el = document.getElementById(id)!;
    el.addEventListener("change", onCambio);
    el.addEventListener("input", onCambio);
  }
  $<HTMLButtonElement>("wSolido").addEventListener("click", () => void resolverSolido());
}
