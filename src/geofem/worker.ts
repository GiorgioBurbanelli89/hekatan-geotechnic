// Web Worker: corre el solver fuera del hilo de la interfaz y manda el log línea a línea.
// `stageIdx` = qué etapas calcular (cada etapa es independiente: arranca de cero con su carga total,
// como GEO5), así un slider solo recalcula la etapa que se está viendo.
import { GeoFem, GeoModel, StageResult } from "./solver";

export type WorkerIn = { type: "run"; model: GeoModel; stageIdx: number[] };
export type WorkerOut =
  | { type: "log"; line: string }
  | { type: "stage"; index: number; result: { name: string; fs: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; prog: string; seconds: number } }
  | { type: "done"; seconds: number }
  | { type: "error"; message: string };

let fem: GeoFem | null = null;
let femKey = "";

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type !== "run") return;
  const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);
  try {
    const t0 = performance.now();
    // la malla, B, detJ·w y la banda no cambian con los sliders de φ/c/q/ancla: se reutilizan (γ y E sí rehacen)
    const key = JSON.stringify(msg.model.MAT.map((r) => [r[0], r[1], r[4]])) + "|" + msg.model.X.length + "|" + msg.model.ELE.length;
    if (!fem || femKey !== key) { fem = new GeoFem(msg.model, (line) => post({ type: "log", line })); femKey = key; }
    fem.setLog((line) => post({ type: "log", line }));
    fem.run(msg.model, msg.stageIdx, (r: StageResult, index: number) => post({ type: "stage", index, result: r }));
    post({ type: "done", seconds: (performance.now() - t0) / 1000 });
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
