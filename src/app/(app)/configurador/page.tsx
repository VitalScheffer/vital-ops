import { AlertTriangle, Info } from "lucide-react";

import { ConfiguradorForm } from "@/components/configurador/ConfiguradorForm";
import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { auth } from "@/lib/auth";
import { CATALOGO } from "@/lib/configurador/catalogo";
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

const STATUS_CLASS: Record<string, string> = {
  ENVIADA: "bg-muted text-muted-foreground",
  EM_ANALISE: "bg-warning-dim text-warning",
  ATENDIDA: "bg-success-dim text-success",
  RECUSADA: "bg-danger-dim text-danger",
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
      },
    }),
  ]);

  const historico = montarHistorico(produto, registrosHistorico);

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
          A entrega automática na tela da equipe de Projetos (no NextStep) entra na próxima fase.
          Por enquanto as configurações enviadas ficam registradas aqui, com número e código.
        </span>
      </p>

      <ConfiguradorForm produto={produto} historico={historico} />

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
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_CLASS[configuracao.status] ?? "bg-muted text-muted-foreground"
                      }`}
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
                      <span>
                        {desvios
                          .map((desvio) =>
                            desvio.texto
                              ? `${desvio.grupoRotulo}: ${desvio.opcaoRotulo} (${desvio.texto})`
                              : `${desvio.grupoRotulo}: ${desvio.opcaoRotulo}`,
                          )
                          .join(" · ")}
                      </span>
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
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
