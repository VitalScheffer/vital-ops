"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { cancelarRequisicao } from "@/app/(app)/requisicoes/actions";

interface ExcluirRequisicaoProps {
  requisicaoId: string;
  // Quantos itens já baixaram estoque no Omie. > 0 muda o aviso: excluir aqui
  // NÃO estorna nada lá.
  itensBaixados: number;
}

// Excluir (cancelar) um pedido — só para quem decide requisições. Abre um
// confirmar inline com o motivo obrigatório (nada de window.confirm: diálogo
// nativo trava a página e não coleta o motivo). A exclusão é soft delete: o
// pedido sai das listas, mas continua no relatório e em "Meus pedidos".
export function ExcluirRequisicao({ requisicaoId, itensBaixados }: ExcluirRequisicaoProps) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const motivoValido = motivo.trim().length >= 3;

  function excluir() {
    setErro(null);
    startTransition(async () => {
      const resultado = await cancelarRequisicao(requisicaoId, motivo.trim());
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui excluir.");
        return;
      }
      // Sucesso: o revalidatePath da action tira o cartão da lista sozinho.
      setConfirmando(false);
      setMotivo("");
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-danger/60 hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Excluir
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger-dim p-3">
      <p className="flex items-start gap-2 text-xs text-card-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <span>
          Excluir tira o pedido das listas, mas ele continua no relatório e em &quot;Meus pedidos&quot;, com
          seu nome e o motivo.
          {itensBaixados > 0 ? (
            <strong className="mt-1 block text-danger">
              Atenção: {itensBaixados} item(ns) já baixaram estoque no Omie e NÃO serão estornados —
              o estorno, se precisar, é feito no Omie.
            </strong>
          ) : null}
        </span>
      </p>

      <label className="flex flex-col gap-1 text-xs text-card-foreground">
        Motivo da exclusão
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          maxLength={500}
          autoFocus
          placeholder="Ex.: pedido duplicado, lançado no setor errado…"
          className="rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-danger"
        />
      </label>

      {erro ? <span className="text-xs text-danger">{erro}</span> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={excluir}
          disabled={pending || !motivoValido}
          className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {pending ? "Excluindo…" : "Confirmar exclusão"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmando(false);
            setMotivo("");
            setErro(null);
          }}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
