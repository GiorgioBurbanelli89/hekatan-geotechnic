// Web Worker: corre el solver fuera del hilo de la interfaz y manda el log línea a línea.
// Motor: WASM (C++) por defecto; TS puro si el WASM no carga o si se pide `engine: "ts"`.
// `stageIdx` = qué etapas calcular (cada etapa es independiente: arranca de cero con su carga total).
import { GeoFem, GeoModel, StageResult } from "./solver";
import { GeoFemWasm } from "./geofemWasm";

export type WorkerIn = { type: "run"; model: GeoModel; stageIdx: number[]; engine?: "wasm" | "ts" };
export type WorkerOut =
  | { type: "log"; line: string }
  | { type: "engine"; engine: "wasm" | "ts" }
  | { type: "stage"; index: number; result: { name: string; fs: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; prog: string; seconds: number } }
  | { type: "done"; seconds: number }
  | { type: "error"; message: string };

let fem: GeoFem | GeoFemWasm | null = null;
let femKey = "";

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type !== "run") return;
  const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);
  const log = (line: string) => post({ type: "log", line });
  try {
    const t0 = performance.now();
    const want = msg.engine ?? "wasm";
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
    fem.run(msg.model, msg.stageIdx, (r: StageResult, index: number) => post({ type: "stage", index, result: r }));
    post({ type: "done", seconds: (performance.now() - t0) / 1000 });
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
