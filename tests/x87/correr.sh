#!/usr/bin/env bash
# compila las dos variantes (80 bits y 64 bits) del MISMO código y corre el SRM del muro de Manabí
cd "$(dirname "$0")"; python gen_x87.py
for t in "long double:ld" "double:d"; do T="${t%%:*}"; N="${t##*:}"
  cat geofem_x87.cpp main_x87.cpp > _un_$N.cpp
  g++ -O2 -std=c++17 "-DREAL_T=$T" _un_$N.cpp -o x87_$N.exe 2>&1 | head -5
  ( time ./x87_$N.exe 19 > log_$N.txt ) 2>&1 | grep real; tail -1 log_$N.txt
done
