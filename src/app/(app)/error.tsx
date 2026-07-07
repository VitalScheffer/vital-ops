"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { registrarErroSistema } from "@/app/(app)/reports-actions";

// Error boundary do grupo (app): além de mostrar uma tela amigável, registra o
// erro automaticamente como report ERRO_SISTEMA para o admin ver (best-effort).
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    void registrarErroSistema({
      mensagem: error.message || "Erro sem mensagem.",
      rota: pathname,
      digest: error.digest,
    });
  }, [error, pathname]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-dim text-danger">
        <TriangleAlert className="h-6 w-6" />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Algo deu errado nesta tela</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Já registramos o erro automaticamente para o time olhar. Você pode tentar de novo.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <RotateCcw className="h-4 w-4" />
        Tentar de novo
      </button>
    </div>
  );
}
