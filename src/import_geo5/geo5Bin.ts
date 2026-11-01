// Lector de `Output_File_Geo.bin` de GEO5 GeoFEM — formato leído del escritor del solver
// (FRGeoFEM write_standard_geo.cpp, FUN_004d8c30) y verificado contra un archivo real (14 788 B, 191 nudos).
//
//   "FEM DATA"                     8 B
//   int32 ×4   versión(1), 0, 99, 12
//   int32      n  (nº de nudos de salida)
//   int32 ×n   ids de nudo (1..n en el orden del InputFile; el nº de nudo GEO5 es el índice + 1)
//   int32      n  (cierre)   int32 n (marca que repite el escritor)
//   luego una secuencia de CAMPOS, cada uno:
//        int32 id, int32 ncomp(=2), int32 n, int32 flag(=1)       cabecera de 16 B
//        float64 × n                                               un valor por nudo
//        int32 cierre
//   ids vistos:  0x66 d_x · 0x67 d_z (m, ADisp − DDisp) · 0x7e 0x7f 0x80 deformaciones recuperadas a nudo ·
//                0x81/0x9c deformación plástica equivalente (según el tipo de elemento) · 0x82 0x83 plásticas ·
//                0x7c factor del paso de seguridad.
// Solo lo escribe el análisis de ESTABILIDAD (SRM / safety factor); el cálculo de tensiones por etapas guarda su estado en
// Restart_Step.bin, que NO tiene este formato.
export interface CampoGeo5 { id: number; hex: string; ncomp: number; valores: Float64Array }
export interface SalidaGeo5 { nudos: number; ids: Int32Array; campos: CampoGeo5[] }

export function leerOutputGeo(buf: ArrayBuffer): SalidaGeo5 {
  const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  const marca = String.fromCharCode(...u8.slice(0, 8));
  if (marca !== "FEM DATA") throw new Error("No es un Output_File_Geo.bin («FEM DATA» no está al principio)");
  let o = 8 + 16;
  const n = dv.getInt32(o, true); o += 4;
  const ids = new Int32Array(n); for (let i = 0; i < n; i++) ids[i] = dv.getInt32(o + 4 * i, true);
  o += 4 * n + 4 + 4;                               // ids + cierre (n) + marca (n otra vez: DAT_0062a768 = n)
  const campos: CampoGeo5[] = [];
  while (o + 16 <= buf.byteLength) {
    const id = dv.getInt32(o, true), nc = dv.getInt32(o + 4, true), nn = dv.getInt32(o + 8, true), fl = dv.getInt32(o + 12, true);
    if (nn !== n || fl !== 1 || nc < 1 || nc > 4) break;
    o += 16; const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = dv.getFloat64(o + 8 * i, true);
    o += 8 * n + 4;
    campos.push({ id, hex: "0x" + id.toString(16), ncomp: nc, valores: v });
  }
  return { nudos: n, ids, campos };
}
