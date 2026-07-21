"use client";

import { AlertTriangle, CheckCircle2, Copy, Hand } from "lucide-react";
import { useActionState, useState } from "react";

import { assumirConfiguracao, responderConfiguracao } from "@/app/(app)/projetos/actions";
import { FormFeedback } from "@/components/FormFeedback";
import { textoDaSelecao, type SelecaoResolvida } from "@/lib/configurador/codigo";
import type { RespostaConhecida } from "@/lib/configurador/fila";
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
  jaDesenhado: RespostaConhecida | null;
}

// Um item da fila. O que a equipe precisa ver primeiro vem primeiro: se a
// combinação JÁ FOI DESENHADA (não redesenhe) e o que fugiu do padrão. Logo
// abaixo vem a especificação COMPLETA, sempre aberta: quem desenha precisa
// saber como a peça é construída (estrutura soldada ou desmontável, material,
// leito) mesmo quando isso está no padrão. Enquanto ficava recolhida, o card de
// uma configuração padrão dizia só "Modelo padrão, sem alterações" e a equipe
// concluía que faltavam campos no formulário.
export function ConfiguracaoCard({ item }: { item: ConfiguracaoDaFila }) {
  const [assumirState, assumirAction, assumindo] = useActionState(
    assumirConfiguracao,
    IDLE_FORM_STATE,
  );
  const [responderState, responderAction, respondendo] = useActionState(
    responderConfiguracao,
    IDLE_FORM_STATE,
  );
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
        <div className="rounded-lg bg-success-dim px-3 py-2 text-sm text-success">
          <p className="flex items-center gap-2 font-medium">
            <Copy className="h-4 w-4 shrink-0" />
            Esta combinação já foi desenhada: projeto {item.jaDesenhado.projetoCad}
          </p>
          {item.jaDesenhado.nota && <p className="mt-1 pl-6">{item.jaDesenhado.nota}</p>}
        </div>
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

      <div className="border-t border-border pt-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Especificação completa
        </p>
        <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
          {item.selecoes.map((selecao) => (
            <li key={selecao.grupoCodigo} className="text-sm">
              <span className="text-muted-foreground">{selecao.grupoRotulo}:</span>{" "}
              <strong className="font-medium text-card-foreground">
                {textoDaSelecao(selecao)}
              </strong>
              {!selecao.padrao && <span className="text-xs text-warning"> (fora do padrão)</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{item.codigo}</p>
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
            <form action={responderAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="decisao" value={decisao} />

              {decisao === "ATENDER" ? (
                <>
                  <input
                    name="projetoCad"
                    required
                    maxLength={60}
                    autoFocus
                    defaultValue={item.jaDesenhado?.projetoCad ?? ""}
                    placeholder="Número do projeto"
                    className={inputClass}
                  />
                  <textarea
                    name="nota"
                    rows={2}
                    maxLength={1000}
                    placeholder="Observação para o vendedor (opcional): prazo, ressalva, o que mudou..."
                    className={inputClass}
                  />
                </>
              ) : (
                <textarea
                  name="nota"
                  required
                  rows={2}
                  maxLength={1000}
                  autoFocus
                  placeholder="Motivo da recusa (o vendedor vê este texto)"
                  className={inputClass}
                />
              )}

              <button
                type="submit"
                disabled={respondendo}
                className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
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
