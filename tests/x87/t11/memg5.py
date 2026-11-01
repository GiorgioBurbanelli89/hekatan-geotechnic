# -*- coding: utf-8 -*-
"""Lector de memoria del FRGeoFEM.exe vivo (ReadProcessMemory), sin Frida: el solver esta parado en cada aviso de progreso."""
import ctypes as C, ctypes.wintypes as W
k32 = C.WinDLL("kernel32", use_last_error=True)
k32.OpenProcess.restype = W.HANDLE
k32.ReadProcessMemory.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p, C.c_size_t, C.POINTER(C.c_size_t)]
k32.VirtualQueryEx.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p, C.c_size_t]
k32.VirtualQueryEx.restype = C.c_size_t
class MBI(C.Structure):
    _fields_ = [("BaseAddress", C.c_void_p), ("AllocationBase", C.c_void_p), ("AllocationProtect", W.DWORD),
                ("PartitionId", W.WORD), ("RegionSize", C.c_size_t), ("State", W.DWORD), ("Protect", W.DWORD), ("Type", W.DWORD)]
class Mem:
    def __init__(self, pid):
        self.h = k32.OpenProcess(0x0410, False, pid)   # QUERY_INFORMATION | VM_READ
        assert self.h, C.get_last_error()
    def read(self, addr, n):
        buf = C.create_string_buffer(n); got = C.c_size_t()
        ok = k32.ReadProcessMemory(self.h, C.c_void_p(addr), buf, n, C.byref(got))
        return buf.raw[:got.value] if ok else None
    def regiones(self):
        a = 0; m = MBI()
        while a < 0x7FFF0000:
            if not k32.VirtualQueryEx(self.h, C.c_void_p(a), C.byref(m), C.sizeof(m)): break
            base = m.BaseAddress or 0
            if m.State == 0x1000 and m.Protect in (0x04, 0x40, 0x08, 0x02, 0x20) and not (m.Protect & 0x100):
                yield base, m.RegionSize, m.Type
            a = base + m.RegionSize
    def buscar(self, patron, maxhits=50):
        hits = []
        for base, size, typ in self.regiones():
            b = self.read(base, size)
            if not b: continue
            i = b.find(patron)
            while i >= 0 and len(hits) < maxhits:
                hits.append(base + i); i = b.find(patron, i + 1)
        return hits
    def close(self):
        k32.CloseHandle(self.h)
