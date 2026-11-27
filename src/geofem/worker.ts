// Web Worker: corre el solver fuera del hilo de la interfaz y manda el log línea a línea.
// Motor: WASM (C++) por defecto; TS puro si el WASM no carga o si se pide `engine: "ts"`.
// `stageIdx` = qué etapas calcular (cada etapa es independiente: arranca de cero con su carga total).
import { GeoFem, GeoModel, StageResult } from "./solver";
import { GeoFemWasm } from "./geofemWasm";
import { subModeloSrm, resultadoCompleto, type SubModelo } from "./submodelo";
import { correrDinamico, DynIn, DynOut } from "../dyn/dinamico";

export type WorkerIn = { type: "run"; model: GeoModel; stageIdx: number[]; engine?: "wasm" | "ts" } | { type: "dyn"; model: GeoModel; opts: DynIn };
export type WorkerOut =
  | { type: "dynprog"; frac: number; fase: string }
  | { type: "dyndone"; result: DynOut }
  | { type: "log"; line: string }
  | { type: "engine"; engine: "wasm" | "ts" }
  | { type: "stage"; index: number; result: { name: string; fs: number; alcanzada?: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; prog: string; seconds: number } }
  | { type: "done"; seconds: number }
  | { type: "error"; message: string };

let fem: GeoFem | GeoFemWasm | null = null;
let femKey = "";

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  const post = (m: WorkerOut, tr: Transferable[] = []) => (self as unknown as Worker).postMessage(m, tr);
  if (msg.type === "dyn") {   // DINÁMICO LINEAL (motor TS: el WASM no tiene dinámico). Cancelar = terminar el Worker.
    try {
      const r = correrDinamico(msg.model, msg.opts, (frac, fase) => post({ type: "dynprog", frac, fase }));
      post({ type: "dyndone", result: r }, [...r.snapU.map((a) => a.buffer), r.envU.buffer]);
    } catch (e) { post({ type: "error", message: (e as Error).message }); }
    return;
  }
  if (msg.type !== "run") return;
  const log = (line: string) => post({ type: "log", line });
  try {
    const t0 = performance.now();
    // cambio de material por etapa y SRM dentro de un modelo por etapas: solo en el motor TS (el WASM no los tiene)
    const soloTs = msg.model.stages.some((st) => st.emat || st.srm);
    const want = soloTs ? "ts" : msg.engine ?? "wasm";
    // la malla, B, detJ·w y la banda no cambian con los sliders de φ/c/q/ancla: se reutilizan (γ y E sí rehacen)
    const key = want + "|" + JSON.stringify(msg.model.MAT.map((r) => [r[0], r[1], r[4]])) + "|" + msg.model.X.length + "|" + msg.model.ELE.length;
    if (!fem || femKey !== key) {
      fem = null;
      if (want === "wasm") { try { fem = await GeoFemWasm.create(msg.model, log); } catch (e) { log(`(WASM no disponible: ${(e as Error).message}; usando el motor TS)`); } }
      if (!fem) fem = new GeoFem(msg.model, log);
      femKey = key;
    }
    post({ type: "engine", engine: fem instanceof GeoFemWasm ? "wasm" : "ts" });
    fem.setLog(log);
    // SRM de las etapas `srm=1` de un modelo por etapas: en el WASM con el submodelo de los elementos activos (3-4 veces más rápido)
    const subs: GeoFemWasm[] = [];
    if (fem instanceof GeoFem) fem.srmExterno = undefined;
    if (fem instanceof GeoFem && msg.model.staged && msg.engine !== "ts") {
      const m = msg.model, porEtapa = new Map<number, { w: GeoFemWasm; s: SubModelo }>();
      for (let si = 0; si < m.stages.length; si++) if (m.stages[si].srm) {
        try { const s = subModeloSrm(m, si); const w = await GeoFemWasm.create(s.model, log); subs.push(w); porEtapa.set(si, { w, s }); } catch (e) { log(`(SRM de la etapa en TS: ${(e as Error).message})`); }
      }
      fem.srmExterno = (si) => { const q = porEtapa.get(si); if (!q) return null; q.w.setLog(log); const r = q.w.run(q.s.model)[0]; return resultadoCompleto(r, q.s, m, si); };
    }
    fem.run(msg.model, msg.stageIdx, (r: StageResult, index: number) => post({ type: "stage", index, result: r }));
    for (const w of subs) w.destroy();
    post({ type: "done", seconds: (performance.now() - t0) / 1000 });
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
