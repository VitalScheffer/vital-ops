import { ShieldAlert } from "lucide-react";
import Link from "next/link";

// Painel de "acesso negado" (guard de papel na própria página, não só no menu).
export function Forbidden({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-dim text-danger">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-card-foreground">Acesso negado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {message ?? "Você não tem permissão para ver esta página."}
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
