"""Plantilla Manim: reduccion de resistencia (SRM) de un talud, como lo hace Hekatan Geotechnic.

Render:  manim -pql escena_srm_talud.py SRMTalud      (rapido, 480p)
         manim -pqh escena_srm_talud.py SRMTalud      (1080p)

Para otra explicacion: copia la clase y cambia TITULO / PASOS / el dibujo.
MathTex necesita LaTeX (MiKTeX o TeX Live).
"""
from manim import *

TITULO = "Talud: factor de seguridad por reduccion de resistencia (SRM)"
PASOS = [
    ("1. Resistencia reducida", r"c_r=\dfrac{c}{F}"),
    ("", r"\tan\varphi_r=\dfrac{\tan\varphi}{F}"),
    ("2. Subir F por peldanos", r"F=1.0,\ 1.1,\ 1.2,\ \dots"),
    ("3. Falla (no converge)", r"FS=F_{\text{ultimo que converge}}"),
]


class SRMTalud(Scene):
    def construct(self):
        self.play(Write(Text(TITULO, font_size=26).to_edge(UP)))

        # Perfil del talud (suelo) y superficie de falla
        suelo = Polygon([-6.5, -2.2, 0], [-6.5, -0.2, 0], [-3.5, -0.2, 0], [-1.0, 1.2, 0], [0.5, 1.2, 0],
                        [0.5, -2.2, 0], color=GREY_B, fill_color=GOLD_E, fill_opacity=0.35)
        self.play(Create(suelo))
        falla = ArcBetweenPoints([-1.1, 1.2, 0], [-4.2, -0.2, 0], angle=-TAU / 3.2, color=RED)
        etiqueta_falla = Text("superficie de falla", font_size=18, color=RED).next_to(falla, DOWN, buff=0.1)

        # F como contador
        F = ValueTracker(1.0)
        texto_F = always_redraw(lambda: MathTex(rf"F={F.get_value():.2f}", font_size=34, color=YELLOW)
                                .move_to([-3.0, 2.2, 0]))
        self.add(texto_F)

        # Ecuaciones
        y = 1.7
        for nombre, tex in PASOS:
            e = MathTex(tex, font_size=28)
            if nombre:
                t = Text(nombre, font_size=20, color=ORANGE)
                b = VGroup(t, e).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
            else:
                b = VGroup(e)
            b.move_to(np.array([1.4, y, 0]), aligned_edge=LEFT)
            self.play(FadeIn(b, shift=RIGHT * 0.2), run_time=0.6)
            y -= 0.95 if nombre else 0.95

        # Peldanos de F hasta que la falla aparece
        self.play(F.animate.set_value(1.6), run_time=2.5, rate_func=linear)
        self.play(Create(falla), FadeIn(etiqueta_falla))
        self.play(suelo.animate.set_fill(RED, opacity=0.25), run_time=1)
        self.wait(1.5)
