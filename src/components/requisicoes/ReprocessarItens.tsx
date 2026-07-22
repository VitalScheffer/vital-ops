"use client";

import { RefreshCw, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import {
  reprocessarItensRequisicao,
  saldosPorLocalDosItens,
  type ResultadoSaldosPorLocal,
} from "@/app/(app)/requisicoes/actions";
import { FormFeedback } from "@/components/FormFeedback";
import type { LocalOpcao } from "@/components/requisicoes/DecidirRequisicao";
import { Select } from "@/components/ui/Select";
import { IDLE_FORM_STATE } from "@/lib/form";

export interface ItemComFalhaOpcao {
  id: string;
  sku: string;
  descricao: string;
  motivoErro: string | null;
}

interface ReprocessarItensProps {
  requisicaoId: string;
  // Locais de estoque da empresa (do servidor, cacheado). Vazio = Omie fora ou
  // sem credencial: sem seletor, a tentativa sai do local padrão.
  locais: LocalOpcao[];
  // Só os itens que ficaram em FALHA — são os únicos que o servidor reprocessa.
  itens: ItemComFalhaOpcao[];
  // Local usado na confirmação, só como ponto de partida do seletor.
  localAtualCodigo?: string;
}

function formatarQuantidade(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

// "Onde tem material hoje": uma linha por item com falha, uma coluna por local
// de estoque. O número fica destacado onde o saldo COBRE o que o pedido precisa
// — é exatamente a conta que o servidor refaz na hora de baixar, então o que
// aparece verde aqui é o que deve passar.
function SaldoPorLocal({
  saldos,
  carregando,
  onAtualizar,
}: {
  saldos: ResultadoSaldosPorLocal | null;
  carregando: boolean;
  onAtualizar: () => void;
}) {
  if (carregando && !saldos) {
    return <p className="text-xs text-muted-foreground">Lendo o saldo de cada local no Omie…</p>;
  }
  if (!saldos) return null;
  if (!saldos.ok) {
    return (
      <p className="text-xs text-muted-foreground">
        {saldos.erro ?? "Não consegui ler o saldo por local."} Dá para escolher o local mesmo assim.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-card-foreground">Saldo de hoje em cada local</span>
        <button
          type="button"
          onClick={onAtualizar}
          disabled={carregando}
          className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline disabled:opacity-60"
        >
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Item</th>
              <th className="px-3 py-1.5 font-medium">Precisa</th>
              {saldos.locais.map((local) => (
                <th key={local.codigo} className="px-3 py-1.5 text-right font-medium">
                  {local.descricao}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {saldos.itens.map((item) => (
              <tr key={item.sku} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-1.5 font-mono text-xs text-card-foreground">{item.sku}</td>
                <td className="px-3 py-1.5 text-card-foreground">{formatarQuantidade(item.quantidade)}</td>
                {saldos.locais.map((local) => {
                  const saldo = item.saldos[local.codigo] ?? 0;
                  const cobre = saldo >= item.quantidade;
                  return (
                    <td
                      key={local.codigo}
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        cobre ? "font-semibold text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {formatarQuantidade(saldo)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Em verde, os locais com saldo suficiente. Produto com controle de lote pode ter parte do
        saldo reservada em pedidos ou OPs, então a baixa ainda pode recusar.
      </p>
    </div>
  );
}

// Nova tentativa de baixa dos itens que falharam num pedido JÁ confirmado.
// O caso que motivou isto: "saldo insuficiente NESTE local de estoque" — o
// material existe, só está em outro estoque. O gestor troca o local (um pra
// todos ou um por item) e manda baixar de novo, sem refazer o pedido.
//
// Fica fechado por padrão pra não poluir o cartão: o botão abre o formulário.
export function ReprocessarItens({
  requisicaoId,
  locais,
  itens,
  localAtualCodigo,
}: ReprocessarItensProps) {
  const [state, formAction, pending] = useActionState(reprocessarItensRequisicao, IDLE_FORM_STATE);
  const [aberto, setAberto] = useState(false);
  const [porItem, setPorItem] = useState(false);
  // Saldo de cada item em cada local, lido do Omie ao abrir o form (e de novo no
  // botão "Atualizar"). É disparado no EVENTO, não num efeito: abrir o painel é
  // a ação do usuário, não uma sincronização com estado externo. Dentro de 60s o
  // client devolve o cache, então reabrir/atualizar não castiga a Omie.
  const [saldos, setSaldos] = useState<ResultadoSaldosPorLocal | null>(null);
  const [carregando, iniciarLeitura] = useTransition();
  const padrao = locais.find((local) => local.padrao)?.codigo;
  const localDefault = localAtualCodigo ?? padrao ?? "";

  function carregarSaldos() {
    iniciarLeitura(async () => {
      try {
        setSaldos(await saldosPorLocalDosItens(requisicaoId));
      } catch {
        setSaldos({ ok: false, erro: "Não consegui ler o saldo por local.", locais: [], itens: [] });
      }
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => {
          setAberto(true);
          carregarSaldos();
        }}
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:border-primary/60 hover:text-primary"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Tentar baixar de novo ({itens.length} {itens.length === 1 ? "item" : "itens"})
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <input type="hidden" name="id" value={requisicaoId} />

      <p className="text-xs text-muted-foreground">
        Só os itens abaixo (os que falharam) são baixados. Os que já saíram não são tocados de novo.
        Se faltou saldo, escolha o local de estoque que tem o material.
      </p>

      <SaldoPorLocal saldos={saldos} carregando={carregando} onAtualizar={carregarSaldos} />

      {locais.length > 0 ? (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
            Local de estoque desta tentativa
            <Select name="localCodigo" defaultValue={localDefault}>
              {locais.map((local) => (
                <option key={local.codigo} className="bg-card text-foreground" value={local.codigo}>
                  {local.descricao}
                  {local.padrao ? " (padrão)" : ""}
                </option>
              ))}
            </Select>
          </label>

          {itens.length > 1 ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-card-foreground">
              <input
                type="checkbox"
                checked={porItem}
                onChange={(e) => setPorItem(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Escolher o local por item (cada item sai de um estoque diferente)
            </label>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Não consegui listar os locais do Omie agora — esta tentativa sai do local padrão.
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        {itens.map((item) => (
          <div key={item.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-card-foreground">
                <span className="font-mono text-xs">{item.sku}</span> · {item.descricao}
              </span>
              {locais.length > 0 && porItem ? (
                <Select name={`localItem__${item.id}`} defaultValue="" containerClassName="w-56">
                  <option className="bg-card text-foreground" value="">
                    Usar o local desta tentativa
                  </option>
                  {locais.map((local) => (
                    <option key={local.codigo} className="bg-card text-foreground" value={local.codigo}>
                      {local.descricao}
                      {local.padrao ? " (padrão)" : ""}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
            {item.motivoErro ? (
              <span className="text-xs text-destructive">{item.motivoErro}</span>
            ) : null}
          </div>
        ))}
      </div>

      <FormFeedback state={state} />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Baixando…" : "Baixar de novo no Omie"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          Fechar
        </button>
      </div>
    </form>
  );
}
