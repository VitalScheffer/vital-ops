"use client";

import { Check, X } from "lucide-react";
import { useActionState } from "react";

import { decidirRequisicao } from "@/app/(app)/requisicoes/actions";
import { FormFeedback } from "@/components/FormFeedback";
import { Select } from "@/components/ui/Select";
import { IDLE_FORM_STATE } from "@/lib/form";

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

export interface LocalOpcao {
  codigo: string;
  descricao: string;
  padrao: boolean;
}

interface DecidirRequisicaoProps {
  requisicaoId: string;
  // Locais de estoque da empresa (vem do servidor, cacheado). Vazio = seletor
  // escondido e a baixa sai do local padrão.
  locais: LocalOpcao[];
  // Local já usado numa tentativa anterior (interrompida) — vira o default.
  localAtualCodigo?: string;
}

// Botões de decisão do gestor num pedido pendente. O `decisao` vem do botão
// que submeteu (name/value do submitter entra no FormData). Confirmar dispara
// a baixa no Omie NO LOCAL ESCOLHIDO — pode demorar alguns segundos num pedido
// com muitos itens.
export function DecidirRequisicao({ requisicaoId, locais, localAtualCodigo }: DecidirRequisicaoProps) {
  const [state, formAction, pending] = useActionState(decidirRequisicao, IDLE_FORM_STATE);
  const padrao = locais.find((local) => local.padrao)?.codigo;
  const localDefault = localAtualCodigo ?? padrao ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={requisicaoId} />

      {locais.length > 0 ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
          Local de estoque da baixa
          <Select name="localCodigo" defaultValue={localDefault}>
            {locais.map((local) => (
              <option key={local.codigo} className="bg-card text-foreground" value={local.codigo}>
                {local.descricao}
                {local.padrao ? " (padrão)" : ""}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
        Motivo (obrigatório na recusa)
        <input name="motivo" maxLength={500} placeholder="Ex.: sem saldo, item errado…" className={inputClass} />
      </label>

      <FormFeedback state={state} />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decisao"
          value="CONFIRMAR"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          {pending ? "Processando…" : "Confirmar e baixar estoque"}
        </button>
        <button
          type="submit"
          name="decisao"
          value="RECUSAR"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          Recusar
        </button>
      </div>
    </form>
  );
}
