# Hekatan Geotechnic

GeoFEM en el navegador: estabilidad de taludes por **reducción de resistencia** (SRM) con elementos T6 en
deformación plana y Drucker-Prager. Es un port fiel del driver de Hekatan Python que reproduce a GEO5 2024
(GeoFEM) a 12 cifras por punto de Gauss en la Demo04 (3 etapas: peso propio, sobrecarga, ancla).

- `src/geofem/solver.ts` — el solver (todo extraído de GEO5 o medido en su *course of analysis*, nada de libro).
- `src/geofem/band.ts` — LU en banda no simétrica con Cuthill-McKee inverso (como el skyline de GEO5).
- `src/viewer/` — visor Canvas con la escala y paleta de GEO5 medidas en sus capturas.
- `public/models/demo04.json` — malla exacta del InputFile de GEO5 (628 nudos, 287 T6).

```
npm install
npm run dev        # http://localhost:4700
npm test           # corre la Demo04 en Node y deja tests/out/demo04_ts.log (mismo formato que Hekatan Python)
npm run build      # dist/ para GitHub Pages (DEPLOY_BASE=/hekatan-geotechnic/)
```
Verificación: `cmp_iterlogs_key.py matlab_exact_3et.log tests/out/demo04_ts.log` → 142/142 iteraciones a 0.0e+00.
