"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";

import { excluirPerfil } from "@/app/(app)/configuracoes/actions";

// Excluir um perfil customizado (com confirmação inline). Fica dentro da matriz,
// mas os botões são type="button" (não enviam o formulário da matriz). Se houver
// usuário com o perfil, a Server Action recusa com a mensagem.
export function ExcluirPerfil({ codigo, nome }: { codigo: string; nome: string }) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function excluir() {
    startTransition(async () => {
      const resultado = await excluirPerfil(codigo);
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui excluir.");
        setConfirmando(false);
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {confirmando ? (
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={excluir}
            disabled={pending}
            className="text-xs font-medium text-destructive hover:underline disabled:opacity-60"
          >
            {pending ? "excluindo…" : "excluir"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="text-xs text-muted-foreground hover:text-card-foreground"
          >
            não
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setErro(null);
            setConfirmando(true);
          }}
          aria-label={`Excluir o perfil ${nome}`}
          className="text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {erro ? <span className="max-w-[16rem] text-xs text-destructive">{erro}</span> : null}
    </span>
  );
}
