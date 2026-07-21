import Link from "next/link";

import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import {
  ConfiguracaoCard,
  type ConfiguracaoDaFila,
} from "@/components/projetos/ConfiguracaoCard";
import { auth } from "@/lib/auth";
import type { SelecaoResolvida } from "@/lib/configurador/codigo";
import {
  classeStatus,
  estaAberta,
  mapaJaDesenhado,
  podeAssumir,
  STATUS_ABERTOS,
} from "@/lib/configurador/fila";
import { desviosDoSnapshot } from "@/lib/configurador/historico";
import { formatarNumeroConfiguracao } from "@/lib/contracts";
import { formatarDataHora } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewProjetos } from "@/lib/rbac";

export const metadata = { title: "Projetos — Vital Ops" };

// Rótulos do ponto de vista de QUEM DESENHA: para o vendedor a configuração foi
// "enviada"; para a equipe de Projetos ela é uma demanda "nova".
const STATUS_LABEL: Record<string, string> = {
  ENVIADA: "Nova",
  EM_ANALISE: "Em análise",
  ATENDIDA: "Atendida",
  RECUSADA: "Recusada",
};

const FILTROS = [
  { id: "abertas", label: "Em aberto" },
  { id: "atendidas", label: "Atendidas" },
  { id: "todas", label: "Todas" },
] as const;

type FiltroId = (typeof FILTROS)[number]["id"];

// Quantos itens a tela mostra por vez. Se houver mais, a tela DIZ que há mais —
// fila cortada em silêncio faz a equipe achar que zerou o trabalho.
const LIMITE = 50;

function filtroValido(valor: string | undefined): FiltroId {
  return FILTROS.some((filtro) => filtro.id === valor) ? (valor as FiltroId) : "abertas";
}

function whereDoFiltro(filtro: FiltroId) {
  if (filtro === "abertas") {
    return { status: { in: [...STATUS_ABERTOS] } };
  }
  if (filtro === "atendidas") {
    return { status: "ATENDIDA" };
  }
  return {};
}

// Fila da equipe de Projetos: as configurações que o comercial montou no
// Configurador, com o desvio do padrão em destaque e a resposta (número do
// projeto) fechando o ciclo na tela do vendedor.
export default async function ProjetosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!session?.user || !canViewProjetos(session.user.role, permissions)) {
    return <Forbidden message="Você não tem acesso à fila de Projetos." />;
  }

  const filtro = filtroValido((await searchParams).filtro);
  const where = whereDoFiltro(filtro);
  // A fila em aberto é FIFO (o mais antigo primeiro, ninguém fica para trás);
  // as listas de conclusão mostram o mais recente primeiro, senão quem acabou de
  // responder não encontra o próprio item.
  const ordem = filtro === "abertas" ? "asc" : "desc";

  const [registros, total, contagens] = await Promise.all([
    prisma.configuracao.findMany({
      where,
      orderBy: { criadoEm: ordem },
      take: LIMITE,
      include: { respondidoPor: { select: { name: true } } },
    }),
    prisma.configuracao.count({ where }),
    prisma.configuracao.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  // Índice "essa combinação já tem projeto?" restrito aos códigos DESTA página:
  // é exato (não depende de um teto de linhas) e lê menos do que varrer todas as
  // atendidas. Uma consulta para a página inteira, não uma por linha.
  const codigos = [...new Set(registros.map((registro) => registro.codigo))];
  const atendidas = codigos.length
    ? await prisma.configuracao.findMany({
        where: { codigo: { in: codigos }, status: "ATENDIDA", projetoCad: { not: null } },
        orderBy: { respondidoEm: "desc" },
        select: { codigo: true, numero: true, projetoCad: true },
      })
    : [];

  const jaDesenhado = mapaJaDesenhado(atendidas);
  const contagem = (status: string): number =>
    contagens.find((linha) => linha.status === status)?._count._all ?? 0;

  const itens: ConfiguracaoDaFila[] = registros.map((registro) => {
    const selecoes = Array.isArray(registro.selecoes)
      ? (registro.selecoes as unknown as SelecaoResolvida[])
      : [];
    const anterior = jaDesenhado.get(registro.codigo) ?? null;
    return {
      id: registro.id,
      rotulo: formatarNumeroConfiguracao(registro.numero),
      produtoNome: registro.produtoNome,
      codigo: registro.codigo,
      status: registro.status,
      statusLabel: STATUS_LABEL[registro.status] ?? registro.status,
      statusClass: classeStatus(registro.status),
      autorNome: registro.autorNome,
      quando: formatarDataHora(registro.criadoEm),
      observacoes: registro.observacoes,
      selecoes,
      desvios: desviosDoSnapshot(registro.selecoes),
      projetoCad: registro.projetoCad,
      respostaNota: registro.respostaNota,
      respondidoPorNome: registro.respondidoPor?.name ?? null,
      respondidoQuando: registro.respondidoEm ? formatarDataHora(registro.respondidoEm) : null,
      aberta: estaAberta(registro.status),
      podeAssumir: podeAssumir(registro.status),
      // Só faz sentido sugerir reuso no que ainda não foi respondido, e o
      // próprio registro não pode se apontar.
      jaDesenhado: anterior && anterior.numero !== registro.numero ? anterior : null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-card-foreground">Projetos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configurações enviadas pelo comercial. Responda com o número do projeto e o vendedor vê
          na tela dele.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador valor={contagem("ENVIADA")} label="Novas" />
        <Indicador valor={contagem("EM_ANALISE")} label="Em análise" />
        <Indicador valor={contagem("ATENDIDA")} label="Atendidas" />
        <Indicador valor={contagem("RECUSADA")} label="Recusadas" />
      </section>

      <nav className="flex flex-wrap gap-2">
        {FILTROS.map((opcao) => (
          <Link
            key={opcao.id}
            href={`/projetos?filtro=${opcao.id}`}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              filtro === opcao.id
                ? "bg-primary text-primary-foreground"
                : "border border-border text-card-foreground hover:bg-muted"
            }`}
          >
            {opcao.label}
          </Link>
        ))}
      </nav>

      <Panel
        title="Fila"
        description={
          total > itens.length
            ? `Mostrando ${itens.length} de ${total}. Responda as primeiras para as próximas aparecerem.`
            : filtro === "abertas"
              ? "Do pedido mais antigo para o mais novo, para ninguém ficar para trás."
              : "Da resposta mais recente para a mais antiga."
        }
      >
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtro === "abertas"
              ? "Nenhuma configuração aguardando resposta."
              : "Nenhuma configuração nesta lista."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {itens.map((item) => (
              <ConfiguracaoCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Indicador({ valor, label }: { valor: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-2xl font-semibold text-card-foreground">{valor}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
