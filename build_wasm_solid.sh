#!/usr/bin/env bash
# WASM del SOLIDO H8 (muro de contención en 3D). El .cpp es el MISMO de Hekatan Struct
# (hekatan-struct/hekatan-fem/src/cpp/hex8_wasm.cpp), copiado tal cual para no tocar los números:
# ese motor está verificado NUDO A NUDO al 0.000 % contra SAP2000 (muro de contención 612 nudos /
# 330 hexaedros, bloque de suelo de Serquen 4851 nudos a 2.5e-12 %) y su opción de modos
# incompatibles es el «Incompatible Bending Modes» que SAP2000 trae activado por defecto
# (= C3D8I de Abaqus; sin ellos = C3D8 de integración completa).
# Aquí se compila SOLO (no el paquete entero de Struct) y sale su propio módulo, para que
# Hekatan Geotechnic siga siendo autónomo. Eigen va en src/solid/cpp/eigen (solo cabeceras).
set -e
cd "$(dirname "$0")"
EMCC="C:\Users\j-b-j\emsdk\upstream\emscripten\emcc.bat"
cmd //c "$EMCC src/solid/cpp/hex8_wasm.cpp -o src/solid/built/hex8.js -O3 -s ALLOW_MEMORY_GROWTH -s MAXIMUM_MEMORY=2147483648 -fexceptions -s STACK_SIZE=2097152 -s MODULARIZE -s EXPORT_ES6 -s ENVIRONMENT=web,worker,node -s EXPORTED_FUNCTIONS=_malloc,_free,_hex8_solve,_hex8_stress -s EXPORTED_RUNTIME_METHODS=HEAPF64,HEAPU32,HEAPU8 -I src/solid/cpp/eigen/"
ls -la src/solid/built/
