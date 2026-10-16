# -*- coding: utf-8 -*-
"""Genera el ejemplo de Hekatan OpenSees «Talud con agua» (.tcl) con la MALLA EXACTA de GEO5 (tests/data/geo5_talud_malla.json: 744 nudos, 341 T6).

    python tools/generar_opensees_talud_agua.py [salida.tcl]

El .tcl calcula el agua él mismo (funciones Tcl con las reglas medidas en GEO5, ver registros/2026-10-15_rea_freatico_geofem.md):
  γw = 10 · freático por distancia PERPENDICULAR (cuña a inglete en quiebres entrantes) · isolíneas de presión lineales en z ·
  Ru = u/σv · elemento saturado si TODOS sus nudos tienen presión > 0.
Cada T6 se parte en 4 triángulos (como el ejemplo 08 Demo04); el agua entra como CARGA (peso γsat + ∫Bt m p dA, tensiones efectivas).
"""
import json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.path.join(AQUI, "..", "tests", "data", "geo5_talud_malla.json"), encoding="utf-8"))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "..", "hekatan-opensees", "wpf", "Examples", "11 - Talud con agua GWT Ru poros malla GEO5.tcl")

E, NU, PHI, C, GAM = M["MAT"][0][:5]
GSAT = 20.5   # γsat del ejemplo talud_gwt (γ = 18.5)
xy = " ".join("%d %.10g %.10g" % (i + 1, x, y) for i, (x, y) in enumerate(zip(M["X"], M["Y"])))
fijos = {}
for d in M["FIXED"]: fijos.setdefault(d // 2 + 1, [0, 0])[d % 2] = 1
apoyos = " ".join("%d %d %d" % (n, f[0], f[1]) for n, f in sorted(fijos.items()))
t6 = " ".join(" ".join(str(i + 1) for i in e) for e in M["ELE"])

TCL = r'''#title Talud con agua en Hekatan OpenSees: freático GWT, coeficiente Ru y presión de poros (malla de GEO5)
## Qué se calcula
# El talud de **GEO5 GeoFEM** (744 nudos y 341 elementos T6, la malla exacta de GEO5; cada T6 se parte en 4 triángulos) con suelo **Drucker-Prager** y **agua**.
# El agua entra como **carga** (tensiones efectivas): el peso con γsat más la presión de poros, y el factor de seguridad sale por **reducción de resistencia (SRM)**.
# Las reglas del agua son las **medidas en el solver de GEO5**: γw = 10, el freático mide la distancia **perpendicular**, las isolíneas de presión interpolan lineal en z,
# y un elemento está saturado solo si **todos sus nudos** tienen presión.
# GEO5 da **FS = 1.98** (seco), **1.76** (freático), **1.74** (isolíneas de presión) y **1.42** (Ru = 0.3).
#hide
set pi [expr {acos(-1.0)}]
set gw 10.0
set nsteps 60
set tol 1.0e-4
set nit 100
set mat {%(E)s %(NU)s %(PHI)s %(C)s %(GAM)s %(GSAT)s}
set xy {%(xy)s}
set apoyos {%(apoyos)s}
set t6 {%(t6)s}
# el agua de cada caso: freático (puntos x z), isolíneas de presión ({u {x z x z ...}}), Ru y la línea del terreno
set gwt {0 -10 12 -10 22 -6 40 -6}
set poros {{0 {0 -10 12 -10 22 -6 40 -6}} {137.34 {0 -24 12 -24 22 -20 40 -20}}}
set ru 0.3
set terreno {0 -9 12 -9 22.392305 -3 40 -3}

# ---- las reglas del agua (de GEO5) ----
# z de una polilínea {x0 z0 x1 z1 ...} en x (horizontal fuera de su rango)
proc zPol {pts x} {
    set n [expr {[llength $pts]/2}]
    if {$x <= [lindex $pts 0]} { return [lindex $pts 1] }
    for {set i 1} {$i < $n} {incr i} {
        set x1 [lindex $pts [expr {2*$i}]]
        if {$x <= $x1} {
            set x0 [lindex $pts [expr {2*$i-2}]]; set z0 [lindex $pts [expr {2*$i-1}]]; set z1 [lindex $pts [expr {2*$i+1}]]
            if {$x1 == $x0} { return $z1 }
            return [expr {$z0+($z1-$z0)*($x-$x0)/($x1-$x0)}]
        }
    }
    return [lindex $pts end]
}
# distancia (con signo, + si el punto está DEBAJO) a la recta del tramo k de la polilínea
proc distRecta {pts k x z} {
    set x0 [lindex $pts [expr {2*$k}]]; set z0 [lindex $pts [expr {2*$k+1}]]; set x1 [lindex $pts [expr {2*$k+2}]]; set z1 [lindex $pts [expr {2*$k+3}]]
    set L [expr {hypot($x1-$x0, $z1-$z0)}]
    return [expr {(($x-$x0)*($z1-$z0)-($z-$z0)*($x1-$x0))/$L}]
}
proc pendTramo {pts k} {
    set dx [expr {[lindex $pts [expr {2*$k+2}]]-[lindex $pts [expr {2*$k}]]}]
    if {$dx == 0} { set dx 1.0e-12 }
    return [expr {([lindex $pts [expr {2*$k+3}]]-[lindex $pts [expr {2*$k+1}]])/$dx}]
}
# freático: d = distancia PERPENDICULAR a la recta del tramo que queda encima del punto; en un quiebre ENTRANTE (la pendiente aumenta hacia la derecha) vale el máximo de las dos rectas
proc distGWT {pts x z} {
    if {$z >= [zPol $pts $x]} { return 0.0 }
    set n [expr {[llength $pts]/2-1}]
    set i 0
    while {$i < $n-1 && $x > [lindex $pts [expr {2*($i+1)}]]} { incr i }
    set d [distRecta $pts $i $x $z]
    if {$i > 0 && [pendTramo $pts $i] > [pendTramo $pts [expr {$i-1}]]+1.0e-12} { set d [expr {max($d, [distRecta $pts [expr {$i-1}] $x $z])}] }
    if {$i < $n-1 && [pendTramo $pts [expr {$i+1}]] > [pendTramo $pts $i]+1.0e-12} { set d [expr {max($d, [distRecta $pts [expr {$i+1}] $x $z])}] }
    return [expr {max(0.0, $d)}]
}
# presión de poros por isolíneas: lineal en z entre las isolíneas que corta la vertical; 0 sobre la más alta; el u de la más baja por debajo; con una sola, u constante
proc uPoros {iso x z} {
    if {[llength $iso] == 1} { return [lindex $iso 0 0] }
    set c {}
    foreach q $iso { lappend c [list [zPol [lindex $q 1] $x] [lindex $q 0]] }
    set c [lsort -real -decreasing -index 0 $c]
    if {$z > [lindex $c 0 0]} { return 0.0 }
    set n [llength $c]
    for {set i 1} {$i < $n} {incr i} {
        lassign [lindex $c [expr {$i-1}]] za ua
        lassign [lindex $c $i] zb ub
        if {$z > $zb || ($i == $n-1 && $z >= $zb)} {
            if {$zb == $za} { return $ub }
            return [expr {$ua+($ub-$ua)*($za-$z)/($za-$zb)}]
        }
    }
    return [lindex $c end 1]
}

# ---- cargas de un caso de agua: sin | gwt | poros | ru ----
# calcula la presión de poros de cada nudo, el peso de cada T6 (γsat si TODOS sus nudos tienen p>0) y las cargas nodales Fx, Fy
proc cargas {caso} {
    global xy t6 mat gw gwt poros ru terreno X Z P Fx Fy tri
    lassign $mat E nu phi c gam gsat
    foreach {n x z} $xy {
        set X($n) $x; set Z($n) $z; set Fx($n) 0.0; set Fy($n) 0.0
        switch $caso {
            gwt     { set P($n) [expr {$gw*[distGWT $gwt $x $z]}] }
            poros   { set P($n) [expr {max(0.0, [uPoros $poros $x $z])}] }
            ru      { set P($n) [expr {$ru*$gam*max(0.0, [zPol $terreno $x]-$z)}] }
            default { set P($n) 0.0 }
        }
    }
    set tri {}
    set nsat 0
    foreach {n1 n2 n3 n4 n5 n6} $t6 {
        set sat [expr {$caso ne "sin"}]
        foreach n [list $n1 $n2 $n3 $n4 $n5 $n6] { if {$P($n) <= 1.0e-9} { set sat 0 } }
        set g [expr {$sat ? $gsat : $gam}]
        incr nsat $sat
        foreach {a b d} [list $n1 $n4 $n6  $n4 $n2 $n5  $n6 $n5 $n3  $n4 $n5 $n6] {
            lappend tri $a $b $d
            set A [expr {0.5*(($X($b)-$X($a))*($Z($d)-$Z($a))-($X($d)-$X($a))*($Z($b)-$Z($a)))}]
            set pm [expr {($P($a)+$P($b)+$P($d))/3.0}]
            foreach {i j k} [list $a $b $d  $b $d $a  $d $a $b] {
                # peso (hacia abajo) y ∫Bt m p dA del triángulo lineal: Fx = (z_j - z_k) p/2 , Fz = (x_k - x_j) p/2
                set Fy($i) [expr {$Fy($i) - $g*$A/3.0 + ($X($k)-$X($j))*$pm/2.0}]
                set Fx($i) [expr {$Fx($i) + ($Z($j)-$Z($k))*$pm/2.0}]
            }
        }
    }
    return $nsat
}

# ---- el modelo para un factor de reducción F (se reconstruye en cada intento) ----
proc construir {F} {
    global mat apoyos xy tri Fx Fy pi nsteps tol nit
    wipe
    model basic -ndm 2 -ndf 2
    foreach {n x z} $xy { node $n $x $z }
    foreach {n fx fy} $apoyos { fix $n $fx $fy }
    lassign $mat E nu phi c gam gsat
    set s3 [expr {sqrt(3.0)}]
    set cf [expr {$c/$F}]
    set pf [expr {atan(tan($phi*$pi/180.0)/$F)}]
    set sn [expr {sin($pf)}]
    set al [expr {2.0*$sn/($s3*(3.0+$sn))}]
    set kk [expr {6.0*$cf*cos($pf)/($s3*(3.0+$sn))}]
    set K [expr {$E/(3.0*(1.0-2.0*$nu))}]
    set G [expr {$E/(2.0*(1.0+$nu))}]
    # Drucker-Prager de OpenSees: f = ||s|| + rho*I1 - sqrt(2/3)*sigmaY   (rho = sqrt2*alpha, sigmaY = sqrt3*k; psi = 0)
    nDMaterial DruckerPrager 1 $K $G [expr {$s3*$kk}] [expr {sqrt(2.0)*$al}] 0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0
    set e 0
    foreach {a b d} $tri { element tri31 [incr e] $a $b $d 1.0 PlaneStrain 1 }
    timeSeries Linear 1
    pattern Plain 1 1 {
        foreach n [array names Fx] { load $n $Fx($n) $Fy($n) }
    }
    system BandGeneral
    numberer RCM
    constraints Plain
    test NormDispIncr $tol $nit 0
    algorithm Newton
    integrator LoadControl [expr {1.0/$nsteps}]
    analysis Static
}
# 1 = el talud aguanta con la resistencia reducida entre F (las cargas convergen); 0 = no
proc aguanta {F} {
    global nsteps
    construir $F
    for {set i 0} {$i < $nsteps} {incr i} { if {[analyze 1] != 0} { return 0 } }
    return 1
}
proc factorSeguridad {} {
    set lo 1.0
    set hi 3.0
    if {![aguanta $lo]} { return 1.0 }
    while {$hi - $lo > 0.01} {
        set mid [expr {0.5*($lo+$hi)}]
        if {[aguanta $mid]} { set lo $mid } else { set hi $mid }
    }
    return [expr {0.5*($lo+$hi)}]
}

array set geo5 {sin 1.98 gwt 1.76 poros 1.74 ru 1.42}
foreach caso {sin gwt poros ru} {
    set nsat [cargas $caso]
    set pmax 0.0
    foreach n [array names P] { if {$P($n) > $pmax} { set pmax $P($n) } }
    set sumFy 0.0
    foreach n [array names Fy] { set sumFy [expr {$sumFy+$Fy($n)}] }
    set FSc($caso) [factorSeguridad]
    set nsatc($caso) $nsat; set pmaxc($caso) $pmax; set sumFyc($caso) $sumFy
}

#show
puts "HEKATAN:gamma_w=$gw"
puts "HEKATAN:FS_seco=$FSc(sin)"
puts "HEKATAN:FS_seco_GEO5=$geo5(sin)"
puts "HEKATAN:FS_freatico=$FSc(gwt)"
puts "HEKATAN:FS_freatico_GEO5=$geo5(gwt)"
puts "HEKATAN:FS_isolineas=$FSc(poros)"
puts "HEKATAN:FS_isolineas_GEO5=$geo5(poros)"
puts "HEKATAN:FS_Ru=$FSc(ru)"
puts "HEKATAN:FS_Ru_GEO5=$geo5(ru)"
puts "HEKATAN:u_max_freatico=$pmaxc(gwt)"
puts "HEKATAN:elementos_saturados_freatico=$nsatc(gwt)"
puts "HEKATAN:elementos_saturados_isolineas=$nsatc(poros)"
puts "HEKATAN:peso_total_seco=$sumFyc(sin)"
puts "HEKATAN:peso_total_freatico=$sumFyc(gwt)"
## Resultados
#values
'''

txt = TCL % dict(E=E, NU=NU, PHI=PHI, C=C, GAM=GAM, GSAT=GSAT, xy=xy, apoyos=apoyos, t6=t6)
open(OUT, "w", encoding="utf-8", newline="\n").write(txt)
print("escrito", os.path.normpath(OUT), len(txt), "bytes;", len(M["X"]), "nudos,", len(M["ELE"]), "T6,", len(fijos), "nudos con apoyo")
