"use client";

import { RefreshCw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { VERSAO_ATUAL, type ChangelogEntry } from "@/lib/changelog";
import { BUILD_ATUAL, type EstadoAtualizacao, type VersaoResponse } from "@/lib/versao";

// Aviso de atualização. Ver src/lib/versao.ts para o porquê de existirem dois
// sinais (changelog x build).
//
// Como a detecção funciona: VERSAO_ATUAL e BUILD_ATUAL são constantes do bundle,
// então o navegador carrega os valores do build dele. A rota /api/versao roda no
// servidor, que já está no deploy novo. Se diferem, esta aba está com código
// velho.
//
// O modal NÃO prende o usuário: recarregar no meio de um formulário do
// Configurador (que não tem rascunho) ou com a pasta de desenhos carregada no
// Pranchas jogaria o trabalho fora. Por isso existe "Agora não" — e por isso o
// botão do cabeçalho continua ali depois, como saída.

const INTERVALO_MS = 3 * 60 * 1000;
// A primeira checagem sai com folga para não disputar rede com o carregamento
// da tela. Quem acabou de abrir a página está, quase sempre, na versão nova.
const PRIMEIRA_CHECAGEM_MS = 10 * 1000;

/**
 * Limpa o que poderia servir conteúdo velho e recarrega.
 *
 * Não existe "Ctrl+Shift+R" programático: `location.reload(true)` foi
 * descontinuado e é ignorado pelos navegadores. O que dá para fazer é tirar do
 * caminho service worker e Cache Storage antes de recarregar. Como os assets do
 * Next já têm hash no nome, na prática o efeito é equivalente.
 */
export async function recarregarLimpo(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((registro) => registro.unregister()));
    }
    if ("caches" in window) {
      const chaves = await caches.keys();
      await Promise.all(chaves.map((chave) => caches.delete(chave)));
    }
  } catch {
    // Limpeza é best-effort: falhando, o reload abaixo ainda traz o bundle novo.
  }
  window.location.reload();
}

export function useNovaVersao() {
  const [estado, setEstado] = useState<EstadoAtualizacao>({ tipo: "atual" });
  // Versão de changelog cujo modal a pessoa mandou esperar. O botão do cabeçalho
  // continua aparecendo; some só o modal, e só até vir coisa ainda mais nova.
  const [modalAdiado, setModalAdiado] = useState<string | null>(null);
  // Evita duas verificações simultâneas (o timer e a volta do foco na aba).
  const verificando = useRef(false);

  const verificar = useCallback(async () => {
    if (verificando.current) return;
    verificando.current = true;
    try {
      const resposta = await fetch(`/api/versao?desde=${encodeURIComponent(VERSAO_ATUAL)}`, {
        cache: "no-store",
      });
      if (!resposta.ok) return; // sessão expirada ou servidor fora: tenta depois
      const dados: VersaoResponse = await resposta.json();

      const buildMudou = Boolean(dados.build) && dados.build !== BUILD_ATUAL;
      const versaoMudou = Boolean(dados.versao) && dados.versao !== VERSAO_ATUAL;

      if (versaoMudou) {
        setEstado({
          tipo: "novidade",
          build: dados.build,
          versao: dados.versao,
          novidades: dados.novidades ?? [],
        });
      } else if (buildMudou) {
        setEstado({ tipo: "silenciosa", build: dados.build });
      } else {
        setEstado({ tipo: "atual" });
      }
    } catch {
      // Rede oscilou. Silencioso de propósito: é uma verificação de fundo, não
      // pode virar erro na cara de quem está trabalhando.
    } finally {
      verificando.current = false;
    }
  }, []);

  useEffect(() => {
    const inicial = setTimeout(verificar, PRIMEIRA_CHECAGEM_MS);
    const timer = setInterval(verificar, INTERVALO_MS);
    // Quem volta para a aba depois de horas é justamente quem mais precisa do
    // aviso, e não vale esperar o próximo tique.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") verificar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearTimeout(inicial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [verificar]);

  const modalAberto = estado.tipo === "novidade" && estado.versao !== modalAdiado;

  return {
    /** Há build novo no ar (com ou sem novidade escrita). */
    temAtualizacao: estado.tipo !== "atual",
    modalAberto,
    novidades: estado.tipo === "novidade" ? estado.novidades : [],
    adiarModal: () => {
      if (estado.tipo === "novidade") setModalAdiado(estado.versao);
    },
  };
}

/**
 * Botão discreto no cabeçalho, ao lado do sino. Só aparece quando há versão
 * nova no ar. É a saída de quem fechou o modal e de quem pegou um deploy sem
 * novidade escrita.
 */
export function BotaoAtualizar({ visivel }: { visivel: boolean }) {
  const [recarregando, setRecarregando] = useState(false);

  if (!visivel) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setRecarregando(true);
        void recarregarLimpo();
      }}
      disabled={recarregando}
      aria-label="Atualizar para a versão mais recente"
      title="Tem versão nova. Clique para atualizar."
      className="relative flex items-center justify-center rounded-lg border border-border p-2 text-primary transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCw className={`h-5 w-5 ${recarregando ? "animate-spin" : ""}`} />
      {!recarregando && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary"
        />
      )}
    </button>
  );
}

interface NovaVersaoModalProps {
  aberto: boolean;
  novidades: ChangelogEntry[];
  onAdiar: () => void;
}

export function NovaVersaoModal({ aberto, novidades, onAdiar }: NovaVersaoModalProps) {
  const [recarregando, setRecarregando] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAdiar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, onAdiar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Ver depois"
        onClick={onAdiar}
        className="absolute inset-0 cursor-default bg-black/50"
        tabIndex={-1}
      />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Atualização disponível
              </p>
              <h2 id={titleId} className="text-base font-semibold text-card-foreground">
                Chegou versão nova do Vital Ops
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onAdiar}
            aria-label="Ver depois"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {novidades.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Recarregue a página para usar a versão mais recente.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {novidades.map((entrada) => (
                <section key={`${entrada.date}-${entrada.title}`}>
                  <h3 className="text-sm font-semibold text-card-foreground">{entrada.title}</h3>
                  <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                    {entrada.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Pode continuar: o botão de atualizar fica ao lado do sino.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAdiar}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={() => {
                setRecarregando(true);
                void recarregarLimpo();
              }}
              disabled={recarregando}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${recarregando ? "animate-spin" : ""}`} />
              {recarregando ? "Recarregando..." : "Recarregar agora"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
