"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import type { FotoProduto } from "@/lib/configurador/catalogo";

const INTERVALO_MS = 5000;

// Setas e legenda NÃO usam as cores do tema: a área da foto é branca no claro e
// no escuro (as fotos vêm do SolidWorks com fundo claro), então uma pílula
// `bg-card` sumiria no tema claro. Escuro translúcido lê bem sobre as duas.
const SETA_CLASS =
  "absolute top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

interface FotosProdutoProps {
  fotos: readonly FotoProduto[];
  // Nome do produto, para o texto alternativo da foto.
  produto: string;
}

// Fotos do produto no card da tela de escolha. Tendo mais de uma (o carro de
// emergência tem slim e grande), elas passam sozinhas a cada 5s e ganham setas.
//
// As setas são IRMÃS do link do card, nunca filhas: botão dentro de <a> é HTML
// inválido, e clicar na seta navegaria em vez de trocar a foto. Quem garante que
// elas recebem o clique é o z-20 aqui contra o z-10 do link que cobre o card.
export function FotosProduto({ fotos, produto }: FotosProdutoProps) {
  const [indice, setIndice] = useState(0);
  const varias = fotos.length > 1;

  // O timer é re-armado a cada troca (o efeito depende de `indice`), inclusive
  // nas manuais: clicar numa seta dá 5s cheios para olhar aquela foto, em vez do
  // troco do ciclo anterior.
  useEffect(() => {
    if (!varias) return;
    // Passar foto sozinho é movimento; com o sistema pedindo menos movimento, as
    // setas continuam lá e a troca só acontece a pedido.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setTimeout(() => {
      setIndice((atual) => (atual + 1) % fotos.length);
    }, INTERVALO_MS);
    return () => clearTimeout(timer);
  }, [indice, varias, fotos.length]);

  function passar(passo: number) {
    setIndice((atual) => (atual + passo + fotos.length) % fotos.length);
  }

  return (
    <div className="relative h-44 w-full bg-white">
      {/* Todas empilhadas e trocando por opacidade: a foto seguinte já está
          carregada quando entra, sem o pisca de trocar o src. */}
      {fotos.map((foto, posicao) => (
        <Image
          key={foto.src}
          src={foto.src}
          alt={posicao === indice ? `${produto}: ${foto.rotulo}` : ""}
          aria-hidden={posicao !== indice}
          fill
          sizes="(min-width: 640px) 50vw, 100vw"
          className={`object-contain transition-opacity duration-500 ${
            posicao === indice ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {varias && (
        <>
          <button
            type="button"
            onClick={() => passar(-1)}
            aria-label="Foto anterior"
            className={`${SETA_CLASS} left-2`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => passar(1)}
            aria-label="Próxima foto"
            className={`${SETA_CLASS} right-2`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {/* Sem isto, duas fotos parecidas passando não dizem qual é qual. */}
          <span className="absolute bottom-2 left-2 z-20 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
            {fotos[indice].rotulo}
          </span>
        </>
      )}
    </div>
  );
}
