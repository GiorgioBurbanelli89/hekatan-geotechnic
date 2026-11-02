# MCP de Hekatan Geotechnic

Conecta Claude con la app publicada: **ver**, **cambiar parámetros**, **recalcular** y **leer resultados** (FS por etapa).

| herramienta | qué hace |
|---|---|
| `abrir` | abre la app y espera el cálculo (`modelo`: demo04, muro, manabi, talud_gwt, talud_ru, hgeo…) |
| `controles` | lista sliders, listas, casillas y botones por `id` |
| `fijar` | cambia un control por `id` (slider, lista, casilla, texto) |
| `boton` / `calcular` | aprieta un botón por `id` / recalcula todas las etapas y devuelve el registro |
| `resultados` | FS de cada etapa + registro de cálculo |
| `captura`, `tecla`, `errores`, `cerrar` | utilidades |

⚠️ Los ids de los sliders empiezan en 0 y la pantalla en 1: `sl_phi0` = φ₁ (suelo 1), `sl_phi1` = φ₂ (suelo 2).

## Instalar
```bash
cd mcp && npm install
claude mcp add hekatan-geotechnic -- node /RUTA/A/hekatan-geotechnic/mcp/server.mjs
```
Variables: `HEKATAN_URL` (def. el sitio público), `HEKATAN_VISIBLE=1`.

## Seguridad
Solo abre `HEKATAN_URL`; los controles se nombran por `id` (letras, números y `_`); no ejecuta JavaScript arbitrario ni toca archivos del disco.

## Probar
`node probar.mjs <carpeta_PNG>`
