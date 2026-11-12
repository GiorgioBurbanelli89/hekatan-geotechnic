# Algoritmos de Hekatan Geotechnic (GeoFEM) — dónde está cada uno

Índice para leer el código y para que un asistente (Claude móvil/web) ubique rápido cada parte.
Rutas desde la raíz del repo. Buscar en `src/geofem/solver.ts` por el texto del comentario (los números de línea cambian).

| Tema | Qué es | Archivo |
|---|---|---|
| Elemento **T6** | Triángulo de 6 nudos, deformación plana, 7 puntos de Gauss (`GP`, `GW`), funciones `t6()` | `src/geofem/solver.ts` |
| **Drucker-Prager** (return-map) | Retorno de tensiones + tangente algorítmica (no simétrica) | `solver.ts`, comentarios «Return-map D-P de GEO5» y «K en banda: elástica o tangente» |
| **Mohr-Coulomb** (tangente) | Tangente MC usada en dinámico no lineal | `solver.ts`, comentario «Tangente de Mohr-Coulomb de GEO5» |
| **SRM**, reducción de resistencia | Escalera de peldaños SRF, Newton con line-search; `GEO5_SRM` = modo GEO5 | `solver.ts`, «Escalera SRM de GEO5», «Un peldaño de la escalera» |
| **Etapas de construcción** | Activar regiones, peso propio, SRF = 1, desplazamiento inicial de regiones nuevas | `solver.ts`, «Una etapa de CONSTRUCCIÓN», «Construcción por etapas» |
| Sistema lineal en **banda** | LU en banda no simétrica + Cuthill-McKee inverso | `src/geofem/band.ts` |
| **Dinámico** lineal / no lineal | Masa consistente, modos por iteración en subespacio, Newmark / HHT-α, Rayleigh | `solver.ts` (`modes`, `dynamic`, `rayleighCoef`, `historyFn`) |
| Agua / presión de poros | Nivel freático, poros | `src/geofem/agua.ts` |
| Versión WASM | Mismo solver en C++/WASM | `src/geofem/geofemWasm.ts`, `build_wasm.sh` |
| Visor | Canvas con escala y paleta de GEO5 | `src/viewer/` |
| Modelos de entrada | `.hgeo` y mallas | `examples/`, `public/models/` |

## Teoría que usa
- **SRM** (Zienkiewicz et al. 1975; Griffiths & Lane 1999): c_r = c/F, tan φ_r = tan φ / F; FS = último F que converge.
- **Drucker-Prager / Mohr-Coulomb** con retorno de tensiones (return-map).
- Dinámica: Newmark / HHT-α, amortiguamiento de Rayleigh, modos por iteración en subespacio (Bathe).

## Validación
`docs/VALIDACION.md` (matriz de validez: qué juez, qué sí y qué no está validado) y `docs/TALUDES_PARAMETRIZADOS.md`.
Demo04 de GEO5 reproducida punto de Gauss a punto de Gauss (ver README).

## Avisos
- El muro de hormigón es una **región elástica** (como el «Rigid body» de GEO5): la SRM no le toca.
- Contacto suelo-muro **pegado** (nudos compartidos): al límite puede divergir el peldaño SRF = 1.
- Antes de citar un número de validación, **córrelo** (`tests/`) y usa ese valor.
