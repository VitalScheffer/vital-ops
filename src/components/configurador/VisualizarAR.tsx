"use client";

import { Maximize, Ruler, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// O <model-viewer> traz estes métodos para reenquadrar o produto. Só o que a
// gente usa — o elemento em si é um custom element sem tipos.
interface Visor extends HTMLElement {
  resetTurntableRotation?: (radianos?: number) => void;
  updateFraming?: () => Promise<void>;
  cameraOrbit?: string;
}

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
  // Medidas externas em mm, para o cliente conferir o tamanho.
  dimensoesMm?: { altura: number; largura: number; profundidade: number };
  onFechar: () => void;
}

export function VisualizarAR({ arquivo, nome, dimensoesMm, onFechar }: VisualizarARProps) {
  const [pronto, setPronto] = useState(false);
  const [medidas, setMedidas] = useState(false);
  const visorRef = useRef<Visor>(null);

  const cm = (mm: number) => Math.round(mm / 10);

  // Devolve o produto ao enquadramento de origem: desfaz o giro e a aproximação
  // e reenquadra na escala real do CAD.
  async function tamanhoOriginal() {
    const visor = visorRef.current;
    if (!visor) return;
    visor.resetTurntableRotation?.(0);
    visor.cameraOrbit = "0deg 75deg auto";
    await visor.updateFraming?.();
  }

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
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/25"
        >
          <X className="h-4 w-4" />
          Fechar
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {pronto ? (
          // Os controles são FILHOS do <model-viewer> de propósito: no modo
          // WebXR (Android Chrome) ele usa o próprio elemento como DOM overlay,
          // então o que está aqui dentro continua na tela durante a projeção no
          // ambiente. Fora dele, sumiriam ao entrar no AR.
          <model-viewer
            ref={visorRef}
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
              className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0a5560] shadow-lg"
            >
              Ver no meu espaço
            </button>

            {medidas && dimensoesMm && (
              <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-xl bg-white/95 px-4 py-2 text-center text-[#13262b] shadow-lg">
                <p className="text-xs font-semibold">
                  {cm(dimensoesMm.altura)} × {cm(dimensoesMm.largura)} ×{" "}
                  {cm(dimensoesMm.profundidade)} cm
                </p>
                <p className="text-[11px] text-[#5b6b72]">altura × largura × profundidade</p>
              </div>
            )}

            {/* Barra de controle: medidas e voltar ao tamanho real. */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 p-1 backdrop-blur">
              {dimensoesMm && (
                <button
                  type="button"
                  onClick={() => setMedidas((valor) => !valor)}
                  aria-pressed={medidas}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    medidas ? "bg-white text-[#0a5560]" : "text-white hover:bg-white/15"
                  }`}
                >
                  <Ruler className="h-4 w-4" />
                  Medidas
                </button>
              )}
              <button
                type="button"
                onClick={tamanhoOriginal}
                title="Voltar ao tamanho e ao ângulo originais"
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/15"
              >
                <Maximize className="h-4 w-4" />
                Tamanho real
              </button>
            </div>
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
