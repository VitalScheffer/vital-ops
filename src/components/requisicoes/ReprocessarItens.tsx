"use client";

import { RefreshCw, X } from "lucide-react";
import { useActionState, useState } from "react";

import { reprocessarItensRequisicao } from "@/app/(app)/requisicoes/actions";
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
  const padrao = locais.find((local) => local.padrao)?.codigo;
  const localDefault = localAtualCodigo ?? padrao ?? "";

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
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
