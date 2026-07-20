"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Notificacao } from "@/lib/notificacoes";

// Sininho de notificações no topo: mostra o que precisa de atenção (pedidos
// aguardando decisão, requisições recém-decididas). Dropdown fecha no blur.
export function NotificacoesBell({ notificacoes }: { notificacoes: Notificacao[] }) {
  const [aberto, setAberto] = useState(false);
  const total = notificacoes.length;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
        aria-label={`Notificações${total > 0 ? ` (${total})` : ""}`}
        title="Notificações"
      >
        <Bell className="h-4 w-4" />
        {total > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {total > 9 ? "9+" : total}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notificações
          </p>
          {total === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nada novo por aqui.</p>
          ) : (
            <ul className="max-h-80 overflow-auto">
              {notificacoes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => setAberto(false)}
                    className="block border-b border-border/60 px-3 py-2.5 text-sm text-card-foreground transition-colors last:border-0 hover:bg-muted"
                  >
                    {n.texto}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
