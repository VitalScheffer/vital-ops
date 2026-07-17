"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";

import { estornarBaixa } from "@/app/(app)/baixas/actions";

interface EstornarBaixaProps {
  importId: string;
}

// Botão de estornar uma baixa (devolve o estoque no Omie). Pede confirmação
// inline (não usa confirm() do navegador, que trava a extensão) porque é uma
// escrita no Omie. Idempotente no servidor.
export function EstornarBaixa({ importId }: EstornarBaixaProps) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function estornar() {
    startTransition(async () => {
      const r = await estornarBaixa(importId);
      setConfirmando(false);
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? "Estorno concluído.") : (r.erro ?? "Não consegui estornar.") });
    });
  }

  if (msg?.ok) {
    return <span className="text-xs text-primary">estornada ↺</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {confirmando ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={estornar}
            disabled={pending}
            className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Estornando…" : "Confirmar estorno"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={pending}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-card-foreground transition-colors hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-card-foreground transition-colors hover:bg-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Estornar
        </button>
      )}
      {msg && !msg.ok ? <span className="text-xs text-destructive">{msg.texto}</span> : null}
    </div>
  );
}
