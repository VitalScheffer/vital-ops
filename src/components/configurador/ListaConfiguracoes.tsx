import { AlertTriangle } from "lucide-react";

import { Panel } from "@/components/Panel";
import { rotuloDaSelecao } from "@/lib/configurador/codigo";
import { classeStatus } from "@/lib/configurador/fila";
import { desviosDoSnapshot } from "@/lib/configurador/historico";
import { formatarNumeroConfiguracao } from "@/lib/contracts";
import { formatarDataHora } from "@/lib/datas";

const STATUS_LABEL: Record<string, string> = {
  ENVIADA: "Enviada",
  EM_ANALISE: "Em análise",
  ATENDIDA: "Atendida",
  RECUSADA: "Recusada",
};

// O que a lista precisa de cada configuração. Deliberadamente menor que o
// modelo do Prisma: é o mesmo bloco na tela do produto (só daquele produto) e na
// abertura do configurador (todos), então o tipo é o denominador comum.
export interface ConfiguracaoListada {
  id: string;
  numero: number;
  produtoNome: string;
  codigo: string;
  selecoes: unknown;
  observacoes: string | null;
  status: string;
  projetoCad: string | null;
  respostaNota: string | null;
  respondidoEm: Date | null;
  criadoEm: Date;
  autorNome: string;
  respondidoPor: { name: string | null } | null;
}

interface ListaConfiguracoesProps {
  configuracoes: readonly ConfiguracaoListada[];
  // Quem administra usuários vê de todo mundo, e aí o autor aparece na linha.
  veTudo: boolean;
  title: string;
  description: string;
  vazio: string;
}

export function ListaConfiguracoes({
  configuracoes,
  veTudo,
  title,
  description,
  vazio,
}: ListaConfiguracoesProps) {
  return (
    <Panel title={title} description={description}>
      {configuracoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {configuracoes.map((configuracao) => {
            const desvios = desviosDoSnapshot(configuracao.selecoes);
            return (
              <li
                key={configuracao.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-card-foreground">
                    {formatarNumeroConfiguracao(configuracao.numero)}
                  </span>
                  <span className="text-sm text-muted-foreground">{configuracao.produtoNome}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${classeStatus(configuracao.status)}`}
                  >
                    {STATUS_LABEL[configuracao.status] ?? configuracao.status}
                  </span>
                  {configuracao.projetoCad && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Projeto {configuracao.projetoCad}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatarDataHora(configuracao.criadoEm)}
                    {veTudo ? ` · ${configuracao.autorNome}` : ""}
                  </span>
                </div>

                <p className="break-all font-mono text-xs text-muted-foreground">
                  {configuracao.codigo}
                </p>

                {desvios.length > 0 ? (
                  <p className="flex items-start gap-1.5 text-xs text-card-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>{desvios.map(rotuloDaSelecao).join(" · ")}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Tudo no padrão.</p>
                )}

                {configuracao.observacoes && (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-card-foreground">
                    <span className="text-muted-foreground">Observações: </span>
                    {configuracao.observacoes}
                  </p>
                )}

                {/* A resposta da equipe de Projetos fecha o ciclo aqui: é onde
                    quem pediu descobre o número do projeto e lê o recado, sem
                    precisar perguntar. */}
                {configuracao.respondidoEm && (
                  <div
                    className={`rounded-lg px-3 py-2 text-xs ${
                      configuracao.status === "ATENDIDA"
                        ? "bg-success-dim text-success"
                        : "bg-danger-dim text-danger"
                    }`}
                  >
                    <p className="font-medium">
                      {configuracao.status === "ATENDIDA"
                        ? `Projetos respondeu: projeto ${configuracao.projetoCad}`
                        : "Projetos recusou esta configuração"}
                    </p>
                    {configuracao.respostaNota && <p className="mt-1">{configuracao.respostaNota}</p>}
                    <p className="mt-1 opacity-80">
                      {configuracao.respondidoPor?.name ?? "—"} ·{" "}
                      {formatarDataHora(configuracao.respondidoEm)}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
