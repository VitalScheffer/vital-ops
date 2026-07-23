"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// "Ver no meu espaço": abre o produto em realidade aumentada, em tamanho real,
// pela câmera do celular. Usa o <model-viewer> do Google (element web), que no
// Android abre o Scene Viewer com o próprio GLB. O componente pesado só é
// baixado quando o cliente aperta o botão — por isso o import dinâmico.
//
// O GLB está em metros (tamanho real do CAD), então o carro aparece na escala
// certa no chão do ambiente.

interface VisualizarARProps {
  arquivo: string;
  nome: string;
  onFechar: () => void;
}

export function VisualizarAR({ arquivo, nome, onFechar }: VisualizarARProps) {
  const [pronto, setPronto] = useState(false);

  // Registra o custom element uma vez (o import tem efeito colateral de
  // `customElements.define`). Só no cliente.
  useEffect(() => {
    let vivo = true;
    import("@google/model-viewer")
      .then(() => {
        if (vivo) setPronto(true);
      })
      .catch(() => {
        if (vivo) setPronto(true); // mostra o 3D mesmo sem o AR
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Esc fecha.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate text-sm font-medium">{nome} · ver no meu espaço</p>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/25"
        >
          <X className="h-4 w-4" />
          Fechar
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {pronto ? (
          <model-viewer
            src={arquivo}
            alt={nome}
            ar
            ar-modes="webxr scene-viewer quick-look"
            camera-controls
            auto-rotate
            shadow-intensity="1"
            exposure="1"
            environment-image="neutral"
            touch-action="pan-y"
            style={{ width: "100%", height: "100%", backgroundColor: "#0c1418" }}
          >
            <button
              slot="ar-button"
              className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0a5560] shadow-lg"
            >
              Ver no meu espaço
            </button>
          </model-viewer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-white/70">
            Carregando…
          </p>
        )}
      </div>

      <p className="px-4 py-3 text-center text-[11px] text-white/60">
        Aponte a câmera para o chão e toque em “Ver no meu espaço”. Funciona melhor no celular.
      </p>
    </div>,
    document.body,
  );
}
