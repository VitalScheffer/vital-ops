"use client";

import { AlertTriangle, CheckCircle2, PackageMinus, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  baixarOp,
  estornarOp,
  type EstadoConsumo,
  type ItemReservado,
  type ResultadoConsumo,
} from "@/app/(app)/movimentacoes/actions";
import { Select } from "@/components/ui/Select";
import type { LocalSelecionavel } from "@/lib/estoque/locais";

const ESTADO_LABEL: Record<EstadoConsumo, string> = {
  reservado: "reservado",
  baixado: "baixado ✓",
  // O estorno devolveu o material ao local: a linha está disponível de novo, e
  // o rótulo precisa dizer isso — "estornado" sozinho parece fim de linha.
  estornado: "estornado ↺ (dá para baixar de novo)",
  falha: "falha ✗",
};

function estadoClass(estado: EstadoConsumo): string {
  if (estado === "baixado") return "text-primary";
  if (estado === "estornado") return "text-warning";
  if (estado === "falha") return "text-danger";
  return "text-warning";
}

// Estados em que o item ainda está no estoque e pode receber baixa. O estornado
// entra: o material voltou.
const AGUARDANDO_BAIXA: readonly EstadoConsumo[] = ["reservado", "falha", "estornado"];

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

// Valor do seletor global que significa "cada item sai de onde foi reservado".
// É o padrão de propósito: forçar um local único para todo mundo seria a forma
// mais fácil de baixar material de um lugar onde ele não está.
const POR_ITEM = "";

interface Props {
  numeroOp: string;
  itens: ItemReservado[];
  locais: LocalSelecionavel[];
  onAtualizar: (itens: ItemReservado[]) => void;
}

/**
 * Painel de consumo: mostra o que está reservado para a OP e deixa dar baixa
 * ou voltar atrás.
 *
 * Reservar e baixar são passos do mesmo item, então a tabelinha mostra os dois
 * estados na mesma linha: o que ainda está parado no local de produção e o que
 * já foi consumido.
 */
export function ConsumoOpPanel({ numeroOp, itens, locais, onAtualizar }: Props) {
  const [localGlobal, setLocalGlobal] = useState(POR_ITEM);
  const [localPorItem, setLocalPorItem] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [processando, setProcessando] = useState<"baixa" | "estorno" | null>(null);
  const [resultado, setResultado] = useState<ResultadoConsumo | null>(null);

  const reservados = useMemo(() => itens.filter((i) => AGUARDANDO_BAIXA.includes(i.estado)), [itens]);
  const baixados = useMemo(() => itens.filter((i) => i.estado === "baixado"), [itens]);

  const selecionadosParaBaixa = reservados.filter((i) => marcados.has(i.id));
  const selecionadosParaEstorno = baixados.filter((i) => marcados.has(i.id));

  function alternar(id: string) {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function localDoItem(item: ItemReservado): string {
    return localPorItem[item.id] || localGlobal || item.localCodigo;
  }

  async function darBaixa() {
    if (selecionadosParaBaixa.length === 0) return;
    setProcessando("baixa");
    setResultado(null);
    try {
      const saida = await baixarOp({
        numeroOp,
        itens: selecionadosParaBaixa.map((item) => ({ itemId: item.id, localCodigo: localDoItem(item) })),
      });
      setResultado(saida);
      if (saida.ok) {
        onAtualizar(saida.itens);
        setMarcados(new Set());
      }
    } finally {
      setProcessando(null);
    }
  }

  async function reverter() {
    if (selecionadosParaEstorno.length === 0) return;
    setProcessando("estorno");
    setResultado(null);
    try {
      const saida = await estornarOp({ itemIds: selecionadosParaEstorno.map((item) => item.id) });
      setResultado(saida);
      if (saida.ok) {
        onAtualizar(saida.itens);
        setMarcados(new Set());
      }
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
          <PackageMinus className="h-4 w-4" />
          Reservado para a OP {numeroOp}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Este material já saiu do estoque de origem e está guardado no local de produção. Quando a produção
          começar, dê baixa aqui: a saída é lançada no Omie e o material sai do saldo de vez. Se der errado,
          &quot;Reverter baixa&quot; devolve o material ao mesmo local e aos mesmos lotes de onde saiu, e a linha
          fica disponível para você baixar de novo, no local certo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Baixar de qual local</span>
          <Select
            value={localGlobal}
            onChange={(e) => setLocalGlobal(e.target.value)}
            containerClassName="min-w-[16rem]"
          >
            <option value={POR_ITEM} className="bg-card text-foreground">
              Cada item de onde foi reservado
            </option>
            {locais.map((local) => (
              <option key={local.codigo} value={local.codigo} className="bg-card text-foreground">
                Todos de: {local.descricao}
              </option>
            ))}
          </Select>
        </label>

        <button
          type="button"
          onClick={() => void darBaixa()}
          disabled={processando !== null || selecionadosParaBaixa.length === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <PackageMinus className="h-4 w-4" />
          {processando === "baixa" ? "Baixando…" : `Dar baixa (${selecionadosParaBaixa.length})`}
        </button>

        <button
          type="button"
          onClick={() => void reverter()}
          disabled={processando !== null || selecionadosParaEstorno.length === 0}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-card-foreground disabled:opacity-60"
        >
          <Undo2 className="h-4 w-4" />
          {processando === "estorno" ? "Revertendo…" : `Reverter baixa (${selecionadosParaEstorno.length})`}
        </button>
      </div>

      {resultado && !resultado.ok ? (
        <p className="flex items-center gap-2 rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {resultado.erro}
        </p>
      ) : null}

      {resultado?.ok ? (
        <p
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            (resultado.falhas ?? 0) > 0 ? "bg-warning-dim text-warning" : "bg-success-dim text-success"
          }`}
        >
          {(resultado.falhas ?? 0) > 0 ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {resultado.baixados ?? 0} item(ns) processado(s), {resultado.falhas ?? 0} com falha.
          {resultado.motivoInterrupcao ? ` ${resultado.motivoInterrupcao}` : ""}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2 text-right">Quantidade</th>
              <th className="px-3 py-2">Local</th>
              <th className="px-3 py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const aguardando = AGUARDANDO_BAIXA.includes(item.estado);
              const podeMarcar = aguardando || item.estado === "baixado";
              return (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={marcados.has(item.id)}
                      onChange={() => alternar(item.id)}
                      disabled={!podeMarcar}
                      className="h-4 w-4 accent-[var(--primary)] disabled:opacity-40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-card-foreground">{item.sku}</span>
                    {item.descricao ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{item.descricao}</span>
                    ) : null}
                    {item.substituiSku ? (
                      <span className="mt-0.5 block text-xs text-warning">
                        movido no lugar de <b className="font-mono">{item.substituiSku}</b>
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {numero(item.quantidade)} {item.unidade ?? ""}
                  </td>
                  <td className="px-3 py-2">
                    {aguardando ? (
                      <Select
                        value={localPorItem[item.id] ?? ""}
                        onChange={(e) => setLocalPorItem((atual) => ({ ...atual, [item.id]: e.target.value }))}
                        containerClassName="min-w-[12rem]"
                        className="py-1 text-xs"
                      >
                        <option value="" className="bg-card text-foreground">
                          {localGlobal
                            ? locais.find((l) => l.codigo === localGlobal)?.descricao ?? item.localNome
                            : item.localNome}
                        </option>
                        {locais.map((local) => (
                          <option key={local.codigo} value={local.codigo} className="bg-card text-foreground">
                            {local.descricao}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">{item.baixaLocalNome ?? item.localNome}</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-xs ${estadoClass(item.estado)}`}>
                    {ESTADO_LABEL[item.estado]}
                    {item.motivoErro ? (
                      <span className="mt-1 block text-muted-foreground">{item.motivoErro}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
