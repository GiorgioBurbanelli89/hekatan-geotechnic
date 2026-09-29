# Construcción por etapas: GeoFEM contra Hekatan Geotechnic (29-sep-2026)

Muro de Manabí, geometría del vídeo 3, relleno en 4 capas. Etapas: 1 terreno · 2 muro y tierra de delante · 3 terreno
bajo el talón · 4-7 capas de 0.65 m. Tensiones por etapas (sin factor de seguridad).
- GeoFEM: `tools/muro_manabi_etapas_geofem.py` → `Documents/GEO5_Manabi/muro_manabi_fem_etapas.gmk` (6991 nudos).
  Números: monitores de punto leídos de pantalla → `examples/muro_manabi_etapas_geofem.json`.
- Geotechnic: `examples/muro_manabi_etapas.hgeo` + `npx tsx tools/etapas_muro_manabi.ts` (7186 nudos).

## Etapa final: las 12 variables de GeoFEM (mínimo .. máximo, convenio de GEO5)
| variable | GeoFEM | Geotechnic | |
|---|---|---|---|
| d_x [mm] | −4.5 .. 4.1 | −4.47 .. 5.05 | ✅ |
| d_z [mm] | 0.0 .. 27.1 | 0.00 .. 27.25 | ✅ 0.6 % |
| \|d\| [mm] | 0.0 .. 27.1 | 0.00 .. 27.29 | ✅ |
| σx,eff = σx,tot [kPa] | −2.11 .. 91.24 | 0.73 .. 96.14 | ✅ 5 % |
| σz,eff = σz,tot [kPa] | −1.22 .. 212.90 | 1.01 .. 211.37 | ✅ 0.7 % |
| τxz [kPa] | −1.48 .. 11.64 | −13.59 .. 1.31 | signo contrario; 11.6 frente a 13.6 |
| J [kPa] | 0.00 .. 70.24 | 0.37 .. 66.53 | ✅ 5 % |
| u_tot [kPa] | 0 .. 0 | 0 .. 0 | ✅ sin agua |
| E_d [%] | 0.00 .. 1.18 | 0.00 .. 0.69 | ⚠️ cociente 1.70 CONSTANTE (etapa 1: 0.87 / 0.512) → definición distinta, no mecánica |
| E_d,pl [%] | 0.00 .. 0.38 | 0.00 .. 0.25 | Mohr-Coulomb (GEO5) frente a Drucker-Prager (Geotechnic) |

## Por etapa: coronación del muro y σz bajo la zapata (x = 9.8 … 11.8, z = −3.10)
| etapa | d_x GEO5 / GT [mm] | d_z GEO5 / GT [mm] | σz: diferencia de GT |
|---|---|---|---|
| muro | 2.9 / 3.40 | 5.2 / 6.52 | −2 … +24 % |
| bajo el talón | 1.7 / 2.25 | 5.9 / 7.19 | −1 … +21 % |
| capa 1 | −0.8 / −0.43 | 8.4 / 9.81 | −1 … +14 % |
| capa 2 | −2.7 / −2.64 | 10.9 / 12.57 | 0 … +8 % |
| capa 3 | −3.9 / −4.05 | 13.6 / 15.44 | 0 … +9 % |
| capa 4 | −4.5 / −4.47 | 16.4 / 18.53 | +1 … +7 % |

## Lo que se aprendió (medido)
- GEO5 escribe d_x positivo hacia la IZQUIERDA y d_z positivo en ASIENTO (ya estaba en `geo5scale.ts`).
- GEO5 pone a cero los DESPLAZAMIENTOS tras la etapa 1 pero NO las deformaciones (E_d = 0.87 % en la etapa 1).
- Desde la etapa 2 GeoFEM añade el marco «Excavation» arriba: todos los marcos bajan 30 px. Los tabs de etapa van cada
  53.2 px desde [1] = 707 (no 62, como suponía `stage_tab`). En Windows `glob` no distingue mayúsculas (cogió capturas viejas).
- Motor: la ε de un elemento se acumula SOLO mientras está activo (con ε = B·Utot salía E_d 6.8 %).
## Pendiente
- ⏳ E_d: buscar la definición de GEO5 (ayuda o binario) antes de tocar la fórmula.
- ⏳ Asiento de la coronación: Geotechnic +13 a +25 % (Drucker-Prager frente a Mohr-Coulomb; causa no demostrada).
- ⏳ La etapa 6 de Geotechnic no cierra la tolerancia en 10 iteraciones. ⏳ Construcción por etapas en el motor TS.
