"use client";

import { useRef, type ReactNode } from "react";

// Grade "viva" do Início (modo brilho): o card sob o mouse inclina seguindo a
// posição do cursor, como uma carta apertada naquele canto. O levantar/brilho
// do hover fica no CSS; aqui só se calculam os ângulos (--tx/--ty) por card.
// Com o modo desligado ninguém lê essas vars e isto vira no-op.
export function GradeInicio({ children }: { children: ReactNode }) {
  const atual = useRef<HTMLElement | null>(null);

  function limpar() {
    atual.current?.style.removeProperty("--tx");
    atual.current?.style.removeProperty("--ty");
    atual.current = null;
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse") return; // touch não tem hover
    const card = (e.target as HTMLElement).closest<HTMLElement>(".grade-card");
    if (card !== atual.current) {
      limpar();
    }
    if (!card) return;
    atual.current = card;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0,5 (borda esq.) a +0,5
    const py = (e.clientY - r.top) / r.height - 0.5;
    // O canto sob o cursor "afunda": mouse à direita gira o lado direito pra
    // trás (rotateY positivo); mouse embaixo, a base pra trás (rotateX
    // negativo). Ângulos pequenos — é uma carta, não uma porta.
    card.style.setProperty("--ty", `${(px * 8).toFixed(2)}deg`);
    card.style.setProperty("--tx", `${(-py * 6).toFixed(2)}deg`);
  }

  return (
    <section
      className="grade grid gap-4 sm:grid-cols-2"
      onPointerMove={onPointerMove}
      onPointerLeave={limpar}
    >
      {children}
    </section>
  );
}
