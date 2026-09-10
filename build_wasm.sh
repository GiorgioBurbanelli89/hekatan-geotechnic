#!/usr/bin/env bash
# WASM del solver (emcc via cmd, como hekatan-struct/hekatan-fem/build_wasm.sh)
set -e
cd "$(dirname "$0")"
EMCC="C:\Users\j-b-j\emsdk\upstream\emscripten\emcc.bat"
cmd //c "$EMCC src/geofem/cpp/geofem.cpp -o src/geofem/built/geofem.js -O3 -s ALLOW_MEMORY_GROWTH -s STACK_SIZE=2097152 -s MODULARIZE -s EXPORT_ES6 -s ENVIRONMENT=web,worker,node -s EXPORTED_FUNCTIONS=_malloc,_free,_geofem_create,_geofem_set_mat,_geofem_set_rigid,_geofem_band,_geofem_nfree,_geofem_gravity,_geofem_nsteps,_geofem_ngp,_geofem_state1,_geofem_run_stage,_geofem_destroy,_geofem_alloc,_geofem_alloc_i,_geofem_free -s EXPORTED_RUNTIME_METHODS=HEAPF64,HEAP32,UTF8ToString"
ls -la src/geofem/built/
