"use client";

import { Check, ChevronDown, History, Loader2, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import {
  buscarProdutosBaixa,
  historicoBaixaItens,
  saldoProdutoBaixa,
  type HistoricoBaixaItem,
} from "@/app/(app)/baixas/actions";
import { ProdutoSkuField } from "@/components/requisicoes/ProdutoSkuField";
import type { BaixaLinha } from "@/lib/contracts";

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

interface LinhaManual {
  key: number;
  sku: string;
  descricao?: string;
  // Unidade de medida do cadastro do Omie (KG, M3, UN...), preenchida ao
  // escolher o produto na busca. Só informa em que unidade a baixa está sendo
  // lançada; não vai no payload — quem baixa é o Omie, com a unidade dele.
  unidade?: string;
  quantidade: string;
  pedido: string;
  notaFiscal: string;
  op: string;
  observacao: string;
  aberto: boolean; // mostra os campos opcionais (pedido/NF/OP/observação)
  saldo?: number | null; // saldo do Omie do produto escolhido (para avisar qtd > saldo)
}

function novaLinha(key: number, base?: Partial<LinhaManual>): LinhaManual {
  return {
    key,
    sku: "",
    descricao: undefined,
    unidade: undefined,
    quantidade: "",
    pedido: "",
    notaFiscal: "",
    op: "",
    observacao: "",
    aberto: false,
    ...base,
  };
}

// Converte as linhas do carrinho nas BaixaLinha válidas (só SKU + quantidade > 0
// são obrigatórios; o resto é opcional). É o que a tela confere/baixa.
function linhasValidas(linhas: LinhaManual[]): BaixaLinha[] {
  const saida: BaixaLinha[] = [];
  for (const l of linhas) {
    const sku = l.sku.trim();
    const quantidade = Number(l.quantidade);
    if (!sku || !Number.isFinite(quantidade) || quantidade <= 0) continue;
    saida.push({
      sku,
      quantidade,
      pedido: l.pedido.trim() || undefined,
      notaFiscal: l.notaFiscal.trim() || undefined,
      op: l.op.trim() || undefined,
      observacao: l.observacao.trim() || undefined,
    });
  }
  return saida;
}

interface BaixaManualCartProps {
  // Reporta as linhas válidas pra tela (que confere/baixa). Chamado a cada
  // mudança — a tela zera uma conferência antiga quando o carrinho muda.
  onLinhas: (linhas: BaixaLinha[]) => void;
  // Travado enquanto a conferência/baixa roda: impede editar o carrinho no meio
  // (o que invalidaria a operação em voo e deixaria o botão preso).
  disabled?: boolean;
}

export function BaixaManualCart({ onLinhas, disabled = false }: BaixaManualCartProps) {
  const [linhas, setLinhas] = useState<LinhaManual[]>([novaLinha(0)]);
  const proximaKey = useRef(1);
  const [historico, setHistorico] = useState<HistoricoBaixaItem[] | null>(null);
  const [carregandoHist, setCarregandoHist] = useState(false);
  const [histAberto, setHistAberto] = useState(false);
  const [filtroHist, setFiltroHist] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Atualiza o carrinho e reporta as linhas válidas pra tela.
  function aplicar(proximas: LinhaManual[]) {
    setLinhas(proximas);
    onLinhas(linhasValidas(proximas));
  }

  function atualizar(key: number, campo: keyof LinhaManual, valor: string | boolean) {
    aplicar(linhas.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }

  function escolherProduto(key: number, codigo: string, descricao: string, unidade?: string) {
    aplicar(linhas.map((l) => (l.key === key ? { ...l, sku: codigo, descricao, unidade } : l)));
  }

  // SKU digitado à mão perde a descrição e a unidade escolhidas (não batem mais
  // com o que está no campo).
  function digitarSku(key: number, valor: string) {
    aplicar(
      linhas.map((l) =>
        l.key === key ? { ...l, sku: valor, descricao: undefined, unidade: undefined } : l,
      ),
    );
  }

  // Só o saldo (para o aviso qtd > saldo) — NÃO passa por `aplicar`, pra não
  // zerar a conferência (o saldo não muda a linha que vai ser baixada).
  function atualizarSaldo(key: number, saldo: number | null) {
    setLinhas((atual) => atual.map((l) => (l.key === key ? { ...l, saldo } : l)));
  }

  function adicionarLinha() {
    aplicar([...linhas, novaLinha(proximaKey.current++)]);
  }

  function removerLinha(key: number) {
    aplicar(linhas.length > 1 ? linhas.filter((l) => l.key !== key) : [novaLinha(proximaKey.current++)]);
  }

  async function abrirHistorico() {
    setHistAberto((v) => !v);
    if (historico || carregandoHist) return;
    setCarregandoHist(true);
    try {
      setHistorico(await historicoBaixaItens());
    } catch {
      setHistorico([]); // erro na leitura vira "nenhuma baixa" em vez de rejeição solta
    } finally {
      setCarregandoHist(false);
    }
  }

  function alternarSelecao(sku: string) {
    setSelecionados((atual) => {
      const nova = new Set(atual);
      if (nova.has(sku)) nova.delete(sku);
      else nova.add(sku);
      return nova;
    });
  }

  // Adiciona ao carrinho SÓ os itens do histórico que a pessoa marcou (evita
  // trazer produto que ela não quer baixar).
  function adicionarSelecionados() {
    if (!historico) return;
    const escolhidos = historico.filter((h) => selecionados.has(h.sku));
    if (escolhidos.length === 0) return;
    const novas = escolhidos.map((h) =>
      novaLinha(proximaKey.current++, {
        sku: h.sku,
        descricao: h.descricao || undefined,
        quantidade: String(h.quantidade),
        pedido: h.pedido ?? "",
        notaFiscal: h.notaFiscal ?? "",
        op: h.op ?? "",
        observacao: h.observacao ?? "",
        aberto: Boolean(h.pedido || h.notaFiscal || h.op || h.observacao),
      }),
    );
    // Se o carrinho só tem a linha inicial vazia, substitui; senão, acrescenta.
    const base = linhas.length === 1 && !linhas[0].sku.trim() && !linhas[0].quantidade.trim() ? [] : linhas;
    aplicar([...base, ...novas]);
    setSelecionados(new Set());
    setHistAberto(false);
  }

  const historicoFiltrado = (historico ?? []).filter((h) => {
    const q = filtroHist.trim().toLowerCase();
    return !q || h.sku.toLowerCase().includes(q) || h.descricao.toLowerCase().includes(q);
  });

  const totalValidas = linhasValidas(linhas).length;

  return (
    <fieldset disabled={disabled} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 disabled:opacity-60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Lance os itens sem planilha. Obrigatório só o produto (código) e a quantidade; pedido, NF, OP e
          observação são opcionais (a observação vai para o movimento no Omie).
        </p>
        <button
          type="button"
          onClick={abrirHistorico}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted"
        >
          <History className="h-4 w-4" />
          Puxar do histórico
        </button>
      </div>

      {histAberto ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-card-foreground">
              Histórico de baixas — marque os que quer repetir
            </p>
            <input
              value={filtroHist}
              onChange={(e) => setFiltroHist(e.target.value)}
              placeholder="Filtrar por código ou descrição"
              className={`${inputClass} w-full max-w-xs`}
            />
          </div>
          {carregandoHist ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : historicoFiltrado.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {historico && historico.length === 0 ? "Nenhuma baixa no histórico ainda." : "Nada encontrado."}
            </p>
          ) : (
            <>
              <ul className="max-h-56 overflow-auto rounded-lg border border-border bg-card">
                {historicoFiltrado.map((h) => (
                  <li key={h.sku} className="border-b border-border/60 last:border-0">
                    <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={selecionados.has(h.sku)}
                        onChange={() => alternarSelecao(h.sku)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span className="flex flex-col">
                        <span className="font-mono text-xs text-card-foreground">{h.sku}</span>
                        <span className="text-sm text-card-foreground">{h.descricao}</span>
                        {h.observacao ? (
                          <span className="text-xs text-muted-foreground">obs.: {h.observacao}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={adicionarSelecionados}
                disabled={selecionados.size === 0}
                className="inline-flex items-center gap-1.5 self-start rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
                Adicionar selecionados ({selecionados.size})
              </button>
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {linhas.map((linha, index) => (
          <div key={linha.key} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-start gap-2">
              <ProdutoSkuField
                value={linha.sku}
                descricao={linha.descricao}
                onChange={(valor) => digitarSku(linha.key, valor)}
                onPick={(codigo, descricao, unidade) =>
                  escolherProduto(linha.key, codigo, descricao, unidade)
                }
                index={index}
                buscar={buscarProdutosBaixa}
                saldoDe={saldoProdutoBaixa}
                onSaldo={(saldo) => atualizarSaldo(linha.key, saldo)}
              />
              <input
                value={linha.quantidade}
                onChange={(e) => atualizar(linha.key, "quantidade", e.target.value)}
                type="number"
                min={0}
                step="any"
                placeholder="Qtd"
                aria-label={`Quantidade do item ${index + 1}`}
                className={`${inputClass} w-24`}
              />
              {/* Unidade do Omie: preenchida sozinha e TRAVADA — só informa se o
                  item é baixado em KG, M3, UN... Sem produto escolhido (ou sem
                  unidade no cadastro), fica vazia com um traço. */}
              <input
                value={linha.unidade ?? ""}
                readOnly
                disabled
                tabIndex={-1}
                placeholder="—"
                title="Unidade de medida do cadastro do Omie"
                aria-label={`Unidade de medida do item ${index + 1}`}
                className={`${inputClass} w-16 cursor-not-allowed bg-muted/50 text-center text-muted-foreground`}
              />
              <button
                type="button"
                onClick={() => removerLinha(linha.key)}
                aria-label={`Remover item ${index + 1}`}
                className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {linha.saldo != null && Number(linha.quantidade) > linha.saldo ? (
              <p className="text-xs text-warning">
                Quantidade ({Number(linha.quantidade).toLocaleString("pt-BR")}) maior que o saldo no Omie (
                {linha.saldo.toLocaleString("pt-BR")}). A conferência vai apontar.
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => atualizar(linha.key, "aberto", !linha.aberto)}
              className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground transition-colors hover:text-card-foreground"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${linha.aberto ? "rotate-180" : ""}`} />
              {linha.aberto ? "Menos campos" : "Pedido, NF, OP e observação (opcional)"}
            </button>

            {linha.aberto ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={linha.pedido}
                  onChange={(e) => atualizar(linha.key, "pedido", e.target.value)}
                  placeholder="Pedido"
                  className={inputClass}
                />
                <input
                  value={linha.notaFiscal}
                  onChange={(e) => atualizar(linha.key, "notaFiscal", e.target.value)}
                  placeholder="Nota Fiscal"
                  className={inputClass}
                />
                <input
                  value={linha.op}
                  onChange={(e) => atualizar(linha.key, "op", e.target.value)}
                  placeholder="OP"
                  className={inputClass}
                />
                <input
                  value={linha.observacao}
                  onChange={(e) => atualizar(linha.key, "observacao", e.target.value)}
                  placeholder="Observação (finalidade / motivo)"
                  maxLength={300}
                  className={inputClass}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={adicionarLinha}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          Adicionar item
        </button>
        <span className="text-xs text-muted-foreground">
          {totalValidas} item(ns) pronto(s) para conferir
        </span>
      </div>
    </fieldset>
  );
}
