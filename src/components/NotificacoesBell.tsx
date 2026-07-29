"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { Notificacao } from "@/lib/notificacoes";
import {
  ativarNotificacoesPush,
  assinaturaAtual,
  desativarNotificacoesPush,
  suportaPushNotifications,
} from "@/lib/pushClient";

// Sininho de notificações no topo: mostra o que precisa de atenção (pedidos
// aguardando decisão, requisições recém-decididas). Dropdown fecha no blur.
// O rodapé do dropdown liga o "toast" nativo do Windows (Web Push): o mesmo
// aviso desta lista passa a aparecer mesmo com a aba fora de foco/fechada.
export function NotificacoesBell({ notificacoes }: { notificacoes: Notificacao[] }) {
  const [aberto, setAberto] = useState(false);
  const total = notificacoes.length;

  // Lazy initializer (não é um efeito): computado uma vez, no mount, sem
  // disparar um segundo render — `suportaPushNotifications()` só olha para
  // APIs do navegador (window/navigator), nunca muda depois disso.
  const [suportado] = useState(() => suportaPushNotifications());
  const [inscrito, setInscrito] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Só verifica o estado atual (sem pedir permissão nenhuma) — pedir
  // permissão sem gesto do usuário é penalizado pelo navegador. O setState
  // acontece dentro do `.then` (assíncrono), nunca síncrono no corpo do
  // efeito.
  useEffect(() => {
    if (!suportado) return;
    assinaturaAtual()
      .then((sub) => setInscrito(sub !== null))
      .catch(() => {
        // best-effort: se não der para checar, o botão some do jeito que a
        // permissão realmente está (fica "Ativar", sem travar a tela).
      });
  }, [suportado]);

  async function alternarPush() {
    setCarregando(true);
    setErro(null);
    try {
      if (inscrito) {
        await desativarNotificacoesPush();
        setInscrito(false);
      } else {
        await ativarNotificacoesPush();
        setInscrito(true);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui alterar as notificações agora.");
    } finally {
      setCarregando(false);
    }
  }

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
          {suportado ? (
            <button
              type="button"
              disabled={carregando}
              onClick={alternarPush}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {inscrito ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
              {inscrito ? "Desativar notificações do Windows" : "Ativar notificações do Windows"}
            </button>
          ) : null}
          {erro ? <p className="border-t border-border px-3 py-2 text-xs text-destructive">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
