"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { parteDescritiva, type ItemMat } from "@/lib/produtos/materiaPrima";
import { semAcento } from "@/lib/texto";

// Escolha da matéria-prima de uma peça. Um `<select>` nativo não serve aqui: são
// ~90 cadastros MAT, todos começando por "MAT...", e achar um tubo específico
// numa lista rolante sem busca é o que travava a revisão. Aqui o campo abre com
// um filtro por texto (código ou descrição) sobre a lista que já vem em ordem
// alfabética do `indexarCatalogo`.
//
// O painel vai num PORTAL com posição fixa porque a tabela de matéria-prima rola
// na horizontal (`overflow-x-auto`): dentro desse contêiner, uma lista absoluta
// seria recortada nas linhas de baixo.

const LARGURA_MINIMA = 300;
const ALTURA_MAXIMA = 320;
const MARGEM = 8;
// Abaixo disso não cabe nem o campo de busca com duas opções: vale mais abrir
// para cima.
const ESPACO_MINIMO_ABAIXO = 200;

interface Posicao {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function calcularPosicao(gatilho: HTMLElement): Posicao {
  const r = gatilho.getBoundingClientRect();
  const width = Math.min(Math.max(r.width, LARGURA_MINIMA), window.innerWidth - 2 * MARGEM);
  const left = Math.min(Math.max(MARGEM, r.left), window.innerWidth - width - MARGEM);
  const abaixo = window.innerHeight - r.bottom - MARGEM;
  const acima = r.top - MARGEM;
  const paraCima = abaixo < ESPACO_MINIMO_ABAIXO && acima > abaixo;
  const maxHeight = Math.max(120, Math.min(ALTURA_MAXIMA, paraCima ? acima : abaixo));
  return { top: paraCima ? r.top - maxHeight - 4 : r.bottom + 4, left, width, maxHeight };
}

// Chave de comparação da busca: sem acento, minúscula e sem separador decimal,
// para "15,88", "15.88" e "1588" acharem o mesmo tubo.
function chaveBusca(texto: string): string {
  return semAcento(texto).replace(/[.,]/g, "");
}

interface MateriaPrimaSelectProps {
  /** Código MAT escolhido (`""` = nenhum). */
  value: string;
  catalogo: readonly ItemMat[];
  onChange: (codigoMat: string) => void;
  ariaLabel: string;
  invalido?: boolean;
}

export function MateriaPrimaSelect({ value, catalogo, onChange, ariaLabel, invalido }: MateriaPrimaSelectProps) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [posicao, setPosicao] = useState<Posicao | null>(null);

  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const selecionado = useMemo(() => catalogo.find((m) => m.codigo === value) ?? null, [catalogo, value]);

  const opcoes = useMemo(() => {
    const termos = chaveBusca(termo).split(/\s+/).filter(Boolean);
    if (termos.length === 0) return catalogo;
    return catalogo.filter((mat) => {
      const alvo = chaveBusca(`${mat.codigo} ${mat.descricao} ${mat.unidade}`);
      return termos.every((t) => alvo.includes(t));
    });
  }, [catalogo, termo]);

  useEffect(() => {
    if (!aberto) return;

    function cliqueFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (gatilhoRef.current?.contains(alvo) || painelRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    function reposicionar() {
      if (gatilhoRef.current) setPosicao(calcularPosicao(gatilhoRef.current));
    }

    document.addEventListener("mousedown", cliqueFora);
    // Fase de CAPTURA: a tabela rola dentro do próprio contêiner e esse scroll
    // não borbulha até a janela.
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      document.removeEventListener("mousedown", cliqueFora);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
  }, [aberto]);

  // Mantém a opção destacada visível ao navegar pelo teclado.
  useEffect(() => {
    if (!aberto) return;
    listaRef.current?.querySelector('[data-ativo="true"]')?.scrollIntoView({ block: "nearest" });
  }, [aberto, ativo]);

  function abrir() {
    if (!gatilhoRef.current) return;
    setTermo("");
    // Abre já com o item atual destacado (a lista inteira está visível quando
    // não há busca, então o índice é o do próprio catálogo).
    const atual = catalogo.findIndex((m) => m.codigo === value);
    setAtivo(atual >= 0 ? atual + 1 : 0);
    setPosicao(calcularPosicao(gatilhoRef.current));
    setAberto(true);
  }

  function fechar(devolverFoco: boolean) {
    setAberto(false);
    if (devolverFoco) gatilhoRef.current?.focus();
  }

  function escolher(codigoMat: string) {
    onChange(codigoMat);
    fechar(true);
  }

  // Índice 0 é a opção "nenhuma"; o resto segue `opcoes`.
  const total = opcoes.length + 1;

  function escolherAtivo() {
    if (ativo === 0) escolher("");
    else if (opcoes[ativo - 1]) escolher(opcoes[ativo - 1].codigo);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((a) => (a + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => (a <= 0 ? total - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolherAtivo();
    } else if (e.key === "Escape") {
      e.preventDefault();
      fechar(true);
    } else if (e.key === "Tab") {
      fechar(false);
    }
  }

  return (
    <>
      <button
        type="button"
        ref={gatilhoRef}
        onClick={() => (aberto ? fechar(true) : abrir())}
        // `combobox` (e não o papel implícito de botão) porque o campo tem valor
        // e pode estar inválido, que é o papel aceitando `aria-invalid`.
        role="combobox"
        aria-haspopup="listbox"
        aria-controls={idLista}
        aria-expanded={aberto}
        aria-invalid={invalido ? true : undefined}
        aria-label={ariaLabel}
        className={`flex w-full max-w-[26rem] items-center gap-2 rounded-lg border bg-field px-2.5 py-1.5 text-left text-xs outline-none transition-colors hover:border-primary/60 focus-visible:border-primary ${
          invalido ? "border-danger" : "border-border"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selecionado ? (
            <>
              <span className="font-mono text-foreground">{selecionado.codigo}</span>
              <span className="ml-1.5 text-muted-foreground">
                {parteDescritiva(selecionado.codigo, selecionado.descricao)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Escolher a matéria-prima...</span>
          )}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {aberto && posicao
        ? createPortal(
            <div
              ref={painelRef}
              style={{ top: posicao.top, left: posicao.left, width: posicao.width, maxHeight: posicao.maxHeight }}
              className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  // Foco no campo assim que o painel abre: a busca é o motivo
                  // de ele existir.
                  ref={(el) => {
                    el?.focus();
                  }}
                  value={termo}
                  onChange={(e) => {
                    setTermo(e.target.value);
                    setAtivo(0);
                  }}
                  onKeyDown={teclado}
                  placeholder="Buscar por código ou descrição (ex.: tubo 15,88)"
                  aria-label="Buscar matéria-prima"
                  aria-controls={idLista}
                  aria-activedescendant={`${idLista}-${ativo}`}
                  autoComplete="off"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>

              <ul ref={listaRef} id={idLista} role="listbox" className="flex-1 overflow-y-auto py-1">
                <li>
                  <button
                    type="button"
                    id={`${idLista}-0`}
                    role="option"
                    aria-selected={value === ""}
                    data-ativo={ativo === 0}
                    onMouseEnter={() => setAtivo(0)}
                    onClick={() => escolher("")}
                    className={`w-full px-3 py-2 text-left text-xs text-muted-foreground ${
                      ativo === 0 ? "bg-muted" : ""
                    }`}
                  >
                    Nenhuma (deixar em branco)
                  </button>
                </li>

                {opcoes.length === 0 ? (
                  <li className="px-3 py-3 text-xs text-muted-foreground">
                    Nada encontrado para “{termo.trim()}”. Se a matéria-prima existe no Omie mas não aparece aqui,
                    confira se o código começa com “MAT”.
                  </li>
                ) : (
                  opcoes.map((mat, i) => {
                    const indice = i + 1;
                    const escolhido = mat.codigo === value;
                    return (
                      <li key={mat.codigo}>
                        <button
                          type="button"
                          id={`${idLista}-${indice}`}
                          role="option"
                          aria-selected={escolhido}
                          data-ativo={ativo === indice}
                          onMouseEnter={() => setAtivo(indice)}
                          onClick={() => escolher(mat.codigo)}
                          className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
                            ativo === indice ? "bg-muted" : ""
                          }`}
                        >
                          <Check
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-primary ${escolhido ? "" : "invisible"}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-xs text-foreground">
                              {mat.codigo}
                              {mat.unidade ? (
                                <span className="ml-1.5 font-sans text-muted-foreground">({mat.unidade})</span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {parteDescritiva(mat.codigo, mat.descricao)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>

              <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                {opcoes.length} de {catalogo.length} matéria(s)-prima(s) do Omie
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
