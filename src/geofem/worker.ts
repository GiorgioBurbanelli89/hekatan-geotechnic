// Web Worker: corre el solver fuera del hilo de la interfaz y manda el log línea a línea.
import { GeoFem, GeoModel, StageResult } from "./solver";

export type WorkerIn = { type: "run"; model: GeoModel; nstages: number };
export type WorkerOut =
  | { type: "log"; line: string }
  | { type: "stage"; result: { name: string; fs: number; geo5?: number; u: Float64Array; uel: Float64Array; steps: { srf: number; u: Float64Array }[]; prog: string; seconds: number } }
  | { type: "done"; seconds: number }
  | { type: "error"; message: string };

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type !== "run") return;
  const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);
  try {
    const t0 = performance.now();
    const fem = new GeoFem(msg.model, (line) => post({ type: "log", line }));
    fem.run(msg.model, msg.nstages, (r: StageResult) => post({ type: "stage", result: r }));
    post({ type: "done", seconds: (performance.now() - t0) / 1000 });
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
