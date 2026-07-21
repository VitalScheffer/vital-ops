import { AlertTriangle, Info } from "lucide-react";

import { ConfiguradorForm } from "@/components/configurador/ConfiguradorForm";
import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { auth } from "@/lib/auth";
import { CATALOGO } from "@/lib/configurador/catalogo";
import { rotuloDaSelecao } from "@/lib/configurador/codigo";
import { classeStatus, mapaRespostas } from "@/lib/configurador/fila";
import { desviosDoSnapshot, montarHistorico } from "@/lib/configurador/historico";
import { formatarNumeroConfiguracao } from "@/lib/contracts";
import { formatarDataHora } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canManageUsers, canViewConfigurador } from "@/lib/rbac";

export const metadata = { title: "Configurador — Vital Ops" };

const STATUS_LABEL: Record<string, string> = {
  ENVIADA: "Enviada",
  EM_ANALISE: "Em análise",
  ATENDIDA: "Atendida",
  RECUSADA: "Recusada",
};

export default async function ConfiguradorPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!session?.user || !canViewConfigurador(session.user.role, permissions)) {
    return <Forbidden message="Você não tem acesso ao configurador de produtos." />;
  }

  // Quem administra usuários enxerga tudo que foi configurado; o comercial vê o
  // que ele mesmo enviou.
  const veTudo = canManageUsers(session.user.role, permissions);
  const produto = CATALOGO[0];

  // Duas leituras com propósitos diferentes: a LISTA é de acompanhamento (as
  // minhas), e o HISTÓRICO é de reaproveitamento — traz o que qualquer vendedor
  // já especificou daquele produto, porque repetir a maca que o colega já pediu
  // é justamente o caso de uso.
  const [configuracoes, registrosHistorico] = await Promise.all([
    prisma.configuracao.findMany({
      where: veTudo ? {} : { autorId: session.user.id },
      orderBy: { criadoEm: "desc" },
      take: 20,
      include: { respondidoPor: { select: { name: true } } },
    }),
    prisma.configuracao.findMany({
      where: { produtoSlug: produto.slug },
      orderBy: { criadoEm: "desc" },
      take: 60,
      select: {
        numero: true,
        codigo: true,
        produtoSlug: true,
        selecoes: true,
        observacoes: true,
        autorNome: true,
        criadoEm: true,
        status: true,
        projetoCad: true,
        respostaNota: true,
        respondidoEm: true,
        respondidoPor: { select: { name: true } },
      },
    }),
  ]);

  const historico = montarHistorico(produto, registrosHistorico);

  // Índice das combinações que a equipe de Projetos já respondeu. Vai inteiro
  // para o formulário: assim, no instante em que o vendedor monta uma combinação
  // já conhecida, ele vê o número do projeto e o recado de quem desenhou, sem
  // precisar enviar de novo nem perguntar a ninguém.
  const respostas = Object.fromEntries(
    mapaRespostas(
      registrosHistorico
        .filter((registro) => registro.respondidoEm !== null)
        .sort((a, b) => (b.respondidoEm?.getTime() ?? 0) - (a.respondidoEm?.getTime() ?? 0))
        .map((registro) => ({
          codigo: registro.codigo,
          numero: registro.numero,
          status: registro.status,
          projetoCad: registro.projetoCad,
          respostaNota: registro.respostaNota,
          respondidoPorNome: registro.respondidoPor?.name ?? null,
          respondidoQuando: registro.respondidoEm ? formatarDataHora(registro.respondidoEm) : "",
        })),
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-card-foreground">Configurador de produto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monte o produto opção por opção e envie a especificação para a equipe de Projetos.
        </p>
      </header>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          O que você enviar cai na fila da equipe de Projetos. Quando eles responderem, o número do
          projeto aparece aqui embaixo, na sua configuração.
        </span>
      </p>

      <ConfiguradorForm produto={produto} historico={historico} respostas={respostas} />

      <Panel
        title={veTudo ? "Configurações enviadas" : "Minhas configurações"}
        description="As 20 mais recentes, da mais nova para a mais antiga."
      >
        {configuracoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma configuração enviada ainda. Monte a primeira no formulário acima.
          </p>
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
                      {configuracao.respostaNota && (
                        <p className="mt-1">{configuracao.respostaNota}</p>
                      )}
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
    </div>
  );
}
