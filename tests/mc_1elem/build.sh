#!/usr/bin/env bash
# copia de src/geofem/cpp/geofem.cpp (vía ../x87/gen_x87.py, REAL=double) + parche.py + main_1e.cpp  ->  mc1e.exe
cd "$(dirname "$0")"; (cd ../x87 && python gen_x87.py >/dev/null)
python parche.py && cat _copia.cpp main_1e.cpp > _mc1e.cpp && g++ -O2 -std=c++17 -DREAL_T=double _mc1e.cpp -o mc1e.exe
