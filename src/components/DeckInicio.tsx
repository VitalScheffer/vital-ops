"use client";

import { useRef, type ReactNode } from "react";

// Esteira de atalhos do Início (modo brilho, estilo Xbox 360). Este wrapper só
// cuida do ARRASTO com o mouse: segurar e puxar rola a esteira (o contêiner
// ganha overflow-x, com a barra escondida, no globals.css); um arrasto de
// verdade engole o clique que vem junto, pra soltar em cima de um atalho não
// navegar sem querer. Com o modo desligado (grade normal, sem overflow) tudo
// aqui vira no-op: mexer no scrollLeft de quem não rola não faz nada e o
// clique passa limpo.
export function DeckInicio({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  const drag = useRef<{ startX: number; scrollLeft: number; arrastou: boolean } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    // Só o botão principal do MOUSE: no touch o navegador rola sozinho, e
    // capturar o ponteiro aqui brigaria com o scroll nativo.
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    drag.current = { startX: e.clientX, scrollLeft: el.scrollLeft, arrastou: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    // Uns pixels de tremida ainda são um clique, não um arrasto.
    if (!d.arrastou && Math.abs(dx) < 6) return;
    if (!d.arrastou) {
      d.arrastou = true;
      // Segue o arrasto mesmo com o cursor saindo do contêiner.
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.scrollLeft - dx;
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    // `drag.current` fica até o click (que dispara logo após o pointerup) ser
    // engolido no onClickCapture.
  }

  function onClickCapture(e: React.MouseEvent<HTMLElement>) {
    if (drag.current?.arrastou) {
      e.preventDefault();
      e.stopPropagation();
    }
    drag.current = null;
  }

  return (
    <section
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onClickCapture={onClickCapture}
      // O arrasto nativo de <a> (fantasma do link) atropelaria o nosso.
      onDragStart={(e) => e.preventDefault()}
      className="deck grid gap-4 sm:grid-cols-2"
    >
      {children}
    </section>
  );
}
