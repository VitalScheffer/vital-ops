"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useState, useTransition } from "react";

import { arquivarRequisicao } from "@/app/(app)/requisicoes/actions";

interface ArquivarRequisicaoProps {
  requisicaoId: string;
  arquivada: boolean;
}

// Botão de arquivar/desarquivar um pedido decidido (gestor). Chama a Server
// Action numa transição; o revalidatePath dela atualiza a lista sozinho.
export function ArquivarRequisicao({ requisicaoId, arquivada }: ArquivarRequisicaoProps) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const resultado = await arquivarRequisicao(requisicaoId, !arquivada);
            setErro(resultado.status === "error" ? (resultado.message ?? "Não consegui arquivar.") : null);
          })
        }
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        {arquivada ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
        {pending ? "…" : arquivada ? "Desarquivar" : "Arquivar"}
      </button>
      {erro ? <span className="text-xs text-destructive">{erro}</span> : null}
    </div>
  );
}
