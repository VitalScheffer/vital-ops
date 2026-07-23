"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, Move3d, X } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useMemo, useState } from "react";

import { VitalLogo } from "@/components/VitalLogo";
import type { ProdutoCatalogo } from "@/lib/configurador/catalogo";
import {
  escolhasPadrao,
  imagemDoProduto,
  textoDaSelecao,
  type EscolhasBrutas,
  type SelecaoResolvida,
} from "@/lib/configurador/codigo";
import { estado3d, mudancas } from "@/lib/configurador/modelo3d";
import type { Qualidade } from "@/lib/configurador/qualidade";

const Visualizador3D = dynamic(() => import("@/components/configurador/Visualizador3D"), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Carregando 3D
    </p>
  ),
});

const VisualizarAR = dynamic(
  () => import("@/components/configurador/VisualizarAR").then((m) => m.VisualizarAR),
  { ssr: false },
);

interface ConferenciaClienteProps {
  produto: ProdutoCatalogo;
  escolhas: EscolhasBrutas;
  selecoes: readonly SelecaoResolvida[];
  // Nível de qualidade que o vendedor escolheu ao gerar o link. O cliente pode
  // trocar na tela.
  qualidadeInicial: Qualidade;
}

// O que o cliente vê quando abre o link: o produto girando em 3D e, do lado, a
// lista do que foi especificado, com o que foge do modelo de série em destaque.
export function ConferenciaCliente({
  produto,
  escolhas,
  selecoes,
  qualidadeInicial,
}: ConferenciaClienteProps) {
  const [falhou, setFalhou] = useState(false);
  const [qualidade, setQualidade] = useState<Qualidade>(qualidadeInicial);
  // Pedido de foco de peça (clique num item), e a peça em foco agora (cartão).
  const [foco, setFoco] = useState<{ chave: string; nonce: number }>();
  const [pecaFocada, setPecaFocada] = useState<string | null>(null);
  const [arAberto, setArAberto] = useState(false);
  const modelo = falhou ? undefined : produto.modelo3d;

  const estado = useMemo(() => estado3d(produto, escolhas), [produto, escolhas]);
  // Comparado com o modelo de série: é o que a tela ampliada aponta peça a peça.
  const anotacoes = useMemo(
    () => mudancas(estado3d(produto, escolhasPadrao(produto)), estado),
    [produto, estado],
  );
  const foraDoPadrao = selecoes.filter((selecao) => !selecao.padrao);

  // Peça que cada grupo aponta no 3D, e se ela está à mostra (não faz sentido
  // focar o suporte de soro se a configuração não tem soro).
  const focoPorGrupo = useMemo(
    () => new Map(produto.grupos.map((grupo) => [grupo.codigo, grupo.foco3d])),
    [produto],
  );
  function pecaDoGrupo(grupoCodigo: string): string | undefined {
    const chave = focoPorGrupo.get(grupoCodigo);
    return chave && modelo && !estado.ocultas.has(chave) ? chave : undefined;
  }
  function focar(chave: string) {
    setFoco((atual) => ({ chave, nonce: (atual?.nonce ?? 0) + 1 }));
  }

  const infoFocada = pecaFocada ? modelo?.info?.[pecaFocada] : undefined;

  return (
    // No computador a tela inteira cabe na janela (`lg:h-dvh`): o 3D preenche a
    // altura e a lista rola por dentro, se precisar, sem rolar a página. No
    // celular vira uma coluna que rola normalmente (`min-h-dvh`).
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <VitalLogo className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-card-foreground">{produto.nome}</h1>
          <p className="truncate text-xs text-muted-foreground">
            Vital Scheffer · configuração para conferência
          </p>
        </div>
        {modelo && (
          <button
            type="button"
            onClick={() => setArAberto(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Move3d className="h-4 w-4" />
            <span className="hidden sm:inline">Ver no meu espaço</span>
            <span className="sm:hidden">AR</span>
          </button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6 lg:min-h-0 lg:flex-row">
        {/* Coluna do 3D: preenche a largura que sobra e a altura toda da tela
            no computador; no celular tem uma altura fixa e o resto rola. */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card lg:min-h-0 lg:flex-1">
          <div className="relative h-[46vh] min-h-0 lg:h-auto lg:flex-1">
            {modelo ? (
              <Visualizador3D
                arquivo={modelo.arquivo}
                estado={estado}
                anotacoes={anotacoes}
                anotarDeInicio
                qualidade={qualidade}
                aoMudarQualidade={setQualidade}
                foco={foco}
                aoFocar={setPecaFocada}
                onFalha={() => setFalhou(true)}
              />
            ) : (
              <Image
                src={imagemDoProduto(produto, escolhas)}
                alt={`Foto de referência: ${produto.nome}`}
                width={produto.imagemLargura}
                height={produto.imagemAltura}
                className="h-full w-full bg-white object-contain"
                preload
              />
            )}

            {/* Cartão da peça em foco (clique numa peça ou num item da lista). */}
            {infoFocada && (
              <div className="pointer-events-auto absolute left-2 top-2 max-w-[15rem] rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
                    {infoFocada.nome}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPecaFocada(null)}
                    aria-label="Fechar"
                    className="-mr-1 -mt-1 rounded p-0.5 text-muted-foreground hover:text-card-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{infoFocada.descricao}</p>
              </div>
            )}
          </div>
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            {modelo
              ? "Arraste para girar, aproxime com a roda e clique numa peça para ver o detalhe. Imagem ilustrativa do modelo configurado."
              : "Foto de referência do produto."}
          </p>
        </div>

        {/* A lista rola por dentro no computador (a tela não rola); largura
            fixa para o 3D ficar com o resto. */}
        <aside className="flex flex-col gap-4 lg:w-[340px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
              {foraDoPadrao.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" />
              )}
              O que este modelo tem de especial
            </h2>
            {foraDoPadrao.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Este é o modelo de série, sem alterações.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {foraDoPadrao.map((selecao) => (
                  <li key={selecao.grupoCodigo} className="text-xs text-card-foreground">
                    <span className="text-muted-foreground">{selecao.grupoRotulo}:</span>{" "}
                    {textoDaSelecao(selecao)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-card-foreground">Especificação completa</h2>
            {modelo && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Toque num item destacado para ver a peça no modelo.
              </p>
            )}
            <dl className="mt-2 flex flex-col gap-0.5">
              {selecoes.map((selecao) => {
                const chave = pecaDoGrupo(selecao.grupoCodigo);
                const conteudo = (
                  <>
                    <dt className="text-muted-foreground">{selecao.grupoRotulo}</dt>
                    <dd
                      className={`text-right ${
                        selecao.padrao ? "text-card-foreground" : "font-medium text-warning"
                      }`}
                    >
                      {textoDaSelecao(selecao)}
                    </dd>
                  </>
                );
                return chave ? (
                  <button
                    key={selecao.grupoCodigo}
                    type="button"
                    onClick={() => focar(chave)}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-muted"
                  >
                    {conteudo}
                  </button>
                ) : (
                  <div
                    key={selecao.grupoCodigo}
                    className="flex justify-between gap-3 px-2 py-1 text-xs"
                  >
                    {conteudo}
                  </div>
                );
              })}
            </dl>
          </section>

          {modelo && estado.avisos.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-card-foreground">
                O 3D não mostra estes itens
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Eles estão na especificação acima e serão detalhados no projeto.
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {estado.avisos.map((aviso) => (
                  <li key={aviso.grupoRotulo} className="text-xs text-muted-foreground">
                    <span className="text-card-foreground">{aviso.grupoRotulo}:</span> {aviso.texto}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </main>

      {arAberto && modelo && (
        <VisualizarAR
          arquivo={modelo.arquivoAr ?? modelo.arquivo}
          nome={produto.nome}
          onFechar={() => setArAberto(false)}
        />
      )}
    </div>
  );
}
