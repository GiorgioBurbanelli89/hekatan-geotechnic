#!/usr/bin/env bash
# Tanda 12: corre la copia t12 en <dir> (scratchpad) desde el estado GEO5 160304 (semillagp), modo 19, D123 194, D2P 1.
# Uso: correr12.sh <dir> [VAR=valor ...]   (log en <dir>/log.txt)
X="$(cd "$(dirname "$0")/.." && pwd)"; D="$1"; shift; mkdir -p "$D"; cd "$D"; rm -f t12_*
export PATH="$HOME/Downloads/winlibs-x86_64-posix-seh-gcc-14.2.0-llvm-19.1.7-mingw-w64ucrt-12.0.0-r3/mingw64/bin:$PATH"
[ -f ../modelo.txt ] || cp "$X/modelo.txt" ../modelo.txt
export T10_SEED1="$(cygpath -w "$X/t9/semilla_gp.bin")" D123=${D123:-194} T10_D2P=${T10_D2P:-1}
env "$@" timeout 900 "$X/t12/t12.exe" ${MODE:-19} 0 semillagp > log.txt
grep -E "RS=|SRM rs|FS_FINAL" log.txt | head -${NL:-400} | tail -${NT:-400}
