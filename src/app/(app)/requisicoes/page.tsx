import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { CriarRequisicaoForm } from "@/components/requisicoes/CriarRequisicaoForm";
import { DecidirRequisicao } from "@/components/requisicoes/DecidirRequisicao";
import { auth } from "@/lib/auth";
import { formatarNumeroRequisicao } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canDecideRequisicao, canViewRequisicoes } from "@/lib/rbac";

export const metadata = { title: "Requisições — Vital Ops" };

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Aguardando gestor",
  CONFIRMADA: "Confirmada",
  RECUSADA: "Recusada",
};

const STATUS_CLASS: Record<string, string> = {
  PENDENTE: "bg-muted text-muted-foreground",
  CONFIRMADA: "bg-primary/10 text-primary",
  RECUSADA: "bg-destructive/10 text-destructive",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "pendente",
  BAIXADO: "baixado ✓",
  FALHA: "falha",
};

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function formatarQuantidade(quantidade: unknown): string {
  return Number(quantidade).toLocaleString("pt-BR");
}

type RequisicaoComTudo = Awaited<ReturnType<typeof buscarRequisicoes>>[number];

function buscarRequisicoes(where: object, take: number) {
  return prisma.requisicao.findMany({
    where,
    include: {
      itens: { orderBy: { sku: "asc" } },
      setor: { select: { nome: true } },
      solicitante: { select: { name: true, email: true } },
      gestor: { select: { name: true } },
    },
    orderBy: { criadoEm: "desc" },
    take,
  });
}

function CartaoRequisicao({
  requisicao,
  mostrarSolicitante,
  acoes,
}: {
  requisicao: RequisicaoComTudo;
  mostrarSolicitante: boolean;
  acoes?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-card-foreground">
            {formatarNumeroRequisicao(requisicao.numero)}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[requisicao.status] ?? "bg-muted text-muted-foreground"}`}
          >
            {STATUS_LABEL[requisicao.status] ?? requisicao.status}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{formatarData(requisicao.criadoEm)}</span>
      </header>

      <p className="text-sm text-muted-foreground">
        {mostrarSolicitante ? (
          <>
            Pedido por <span className="text-card-foreground">{requisicao.solicitanteNome}</span>
            {requisicao.solicitante ? ` (conta ${requisicao.solicitante.email})` : null} — setor{" "}
            {requisicao.setor.nome}
          </>
        ) : (
          <>
            Solicitante: <span className="text-card-foreground">{requisicao.solicitanteNome}</span> — setor{" "}
            {requisicao.setor.nome}
          </>
        )}
        {requisicao.observacao ? <> · Obs.: {requisicao.observacao}</> : null}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Código</th>
              <th className="py-1.5 pr-3 font-medium">Descrição</th>
              <th className="py-1.5 pr-3 font-medium">Qtd</th>
              <th className="py-1.5 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {requisicao.itens.map((item) => (
              <tr key={item.id} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3 font-mono text-xs text-card-foreground">{item.sku}</td>
                <td className="py-1.5 pr-3 text-card-foreground">{item.descricao}</td>
                <td className="py-1.5 pr-3 text-card-foreground">{formatarQuantidade(item.quantidade)}</td>
                <td className="py-1.5">
                  <span
                    className={
                      item.status === "FALHA"
                        ? "text-destructive"
                        : item.status === "BAIXADO"
                          ? "text-primary"
                          : "text-muted-foreground"
                    }
                  >
                    {ITEM_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                  {item.motivoErro ? (
                    <span className="block text-xs text-muted-foreground">{item.motivoErro}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {requisicao.status !== "PENDENTE" ? (
        <p className="text-xs text-muted-foreground">
          {requisicao.status === "CONFIRMADA" ? "Confirmada" : "Recusada"}
          {requisicao.gestor ? ` por ${requisicao.gestor.name}` : null}
          {requisicao.decididaEm ? ` em ${formatarData(requisicao.decididaEm)}` : null}
          {requisicao.motivoDecisao ? ` — ${requisicao.motivoDecisao}` : null}
        </p>
      ) : null}

      {acoes}
    </article>
  );
}

// Requisições de fábrica (Fase 3): o solicitante monta o pedido (vários itens),
// o gestor confirma/recusa e a confirmação baixa o estoque no Omie.
export default async function RequisicoesPage() {
  const session = await auth();
  const role = session!.user.role;
  const permissions = await getRolePermissionsMap();

  if (!canViewRequisicoes(role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar Requisições." />;
  }

  const decide = canDecideRequisicao(role, permissions);
  const userId = session!.user.id;

  const [setores, minhas, pendentes, decididas] = await Promise.all([
    prisma.setor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    buscarRequisicoes({ solicitanteId: userId }, 30),
    decide ? buscarRequisicoes({ status: "PENDENTE" }, 100) : Promise.resolve([]),
    decide ? buscarRequisicoes({ status: { not: "PENDENTE" } }, 15) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Requisições</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Precisa de material do estoque? Monte o pedido com os itens e envie: o gestor confirma e a
          baixa no Omie acontece sozinha.
        </p>
      </header>

      {decide ? (
        <Panel
          title={`Aguardando decisão (${pendentes.length})`}
          description="Pedidos pendentes de todos os solicitantes. Confirmar dá baixa no estoque do Omie (local padrão)."
        >
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido aguardando decisão.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {pendentes.map((requisicao) => (
                <CartaoRequisicao
                  key={requisicao.id}
                  requisicao={requisicao}
                  mostrarSolicitante
                  acoes={<DecidirRequisicao requisicaoId={requisicao.id} />}
                />
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      <Panel title="Novo pedido" description="Informe o código do produto no Omie (SKU), a quantidade e quem está pedindo.">
        <CriarRequisicaoForm setores={setores} defaultNome={session!.user.name ?? ""} />
      </Panel>

      <Panel title="Meus pedidos" description="Acompanhe aqui o andamento do que você pediu.">
        {minhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {minhas.map((requisicao) => (
              <CartaoRequisicao key={requisicao.id} requisicao={requisicao} mostrarSolicitante={false} />
            ))}
          </div>
        )}
      </Panel>

      {decide && decididas.length > 0 ? (
        <Panel title="Decididas recentemente" description="Últimos pedidos confirmados ou recusados.">
          <div className="flex flex-col gap-4">
            {decididas.map((requisicao) => (
              <CartaoRequisicao key={requisicao.id} requisicao={requisicao} mostrarSolicitante />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
