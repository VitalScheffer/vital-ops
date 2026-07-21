"use client";

import { AlertTriangle, CheckCircle2, Copy, Eye, Hand } from "lucide-react";
import { useActionState, useState } from "react";

import { assumirConfiguracao, responderConfiguracao } from "@/app/(app)/projetos/actions";
import { FormFeedback } from "@/components/FormFeedback";
import { textoDaSelecao, type SelecaoResolvida } from "@/lib/configurador/codigo";
import type { AtendidaAnterior } from "@/lib/configurador/fila";
import { IDLE_FORM_STATE } from "@/lib/form";

const inputClass =
  "w-full rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

export interface ConfiguracaoDaFila {
  id: string;
  rotulo: string; // "CFG-0001"
  produtoNome: string;
  codigo: string;
  status: string;
  statusLabel: string;
  statusClass: string;
  autorNome: string;
  quando: string;
  observacoes: string | null;
  selecoes: SelecaoResolvida[];
  desvios: SelecaoResolvida[];
  projetoCad: string | null;
  respostaNota: string | null;
  respondidoPorNome: string | null;
  respondidoQuando: string | null;
  aberta: boolean;
  podeAssumir: boolean;
  jaDesenhado: AtendidaAnterior | null;
}

// Um item da fila. O que a equipe precisa ver primeiro vem primeiro: se a
// combinação JÁ FOI DESENHADA (não redesenhe) e o que fugiu do padrão. A
// especificação completa fica recolhida, porque na maioria dos casos ela é o
// modelo da foto e só atrapalharia a leitura.
export function ConfiguracaoCard({ item }: { item: ConfiguracaoDaFila }) {
  const [assumirState, assumirAction, assumindo] = useActionState(
    assumirConfiguracao,
    IDLE_FORM_STATE,
  );
  const [responderState, responderAction, respondendo] = useActionState(
    responderConfiguracao,
    IDLE_FORM_STATE,
  );
  const [aberto, setAberto] = useState(false);
  const [decisao, setDecisao] = useState<"ATENDER" | "RECUSAR" | null>(null);

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-card-foreground">{item.rotulo}</span>
        <span className="text-sm text-muted-foreground">{item.produtoNome}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.statusClass}`}>
          {item.statusLabel}
        </span>
        {item.projetoCad && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Projeto {item.projetoCad}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {item.autorNome} · {item.quando}
        </span>
      </div>

      {item.aberta && item.jaDesenhado && (
        <p className="flex items-center gap-2 rounded-lg bg-success-dim px-3 py-2 text-sm font-medium text-success">
          <Copy className="h-4 w-4 shrink-0" />
          Esta combinação já foi desenhada: projeto {item.jaDesenhado.projetoCad}
        </p>
      )}

      {item.desvios.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          Modelo padrão, sem alterações.
        </p>
      ) : (
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Fora do padrão ({item.desvios.length})
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {item.desvios.map((desvio) => (
              <li key={desvio.grupoCodigo} className="text-sm text-card-foreground">
                <span className="text-muted-foreground">{desvio.grupoRotulo}:</span>{" "}
                <strong className="font-semibold">{textoDaSelecao(desvio)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.observacoes && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-card-foreground">
          <span className="text-muted-foreground">Observações: </span>
          {item.observacoes}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => setAberto((valor) => !valor)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          <Eye className="h-3.5 w-3.5" />
          {aberto ? "Ocultar especificação completa" : "Ver especificação completa"}
        </button>

        {aberto && (
          <div className="mt-2 border-t border-border pt-2">
            <ul className="flex flex-col gap-1">
              {item.selecoes.map((selecao) => (
                <li key={selecao.grupoCodigo} className="text-sm">
                  <span className="text-muted-foreground">{selecao.grupoRotulo}:</span>{" "}
                  {textoDaSelecao(selecao)}
                  {!selecao.padrao && (
                    <span className="text-xs text-warning"> (fora do padrão)</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{item.codigo}</p>
          </div>
        )}
      </div>

      {!item.aberta ? (
        <p className="text-xs text-muted-foreground">
          {item.status === "ATENDIDA" ? "Atendida" : "Recusada"} por{" "}
          {item.respondidoPorNome ?? "—"}
          {item.respondidoQuando ? ` em ${item.respondidoQuando}` : ""}
          {item.respostaNota ? ` · ${item.respostaNota}` : ""}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {item.podeAssumir && (
              <form action={assumirAction}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  disabled={assumindo}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Hand className="h-4 w-4" />
                  {assumindo ? "Assumindo..." : "Assumir"}
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => setDecisao(decisao === "ATENDER" ? null : "ATENDER")}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Atender
            </button>
            <button
              type="button"
              onClick={() => setDecisao(decisao === "RECUSAR" ? null : "RECUSAR")}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted"
            >
              Recusar
            </button>
          </div>

          {decisao && (
            <form action={responderAction} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="decisao" value={decisao} />
              {decisao === "ATENDER" ? (
                <input
                  name="projetoCad"
                  required
                  maxLength={60}
                  autoFocus
                  defaultValue={item.jaDesenhado?.projetoCad ?? ""}
                  placeholder="Número do projeto"
                  className={inputClass}
                />
              ) : (
                <input
                  name="nota"
                  required
                  maxLength={1000}
                  autoFocus
                  placeholder="Motivo da recusa"
                  className={inputClass}
                />
              )}
              <button
                type="submit"
                disabled={respondendo}
                className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {respondendo ? "Enviando..." : "Confirmar"}
              </button>
            </form>
          )}

          <FormFeedback state={assumirState} />
          <FormFeedback state={responderState} />
        </div>
      )}
    </li>
  );
}
