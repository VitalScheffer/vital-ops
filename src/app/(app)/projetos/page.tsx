import { Forbidden } from "@/components/Forbidden";
import { FilaProjetos } from "@/components/projetos/FilaProjetos";
import type { ConfiguracaoDaFila } from "@/components/projetos/ConfiguracaoCard";
import { auth } from "@/lib/auth";
import type { SelecaoResolvida } from "@/lib/configurador/codigo";
import {
  classeStatus,
  estaAberta,
  mapaRespostas,
  podeAssumir,
  STATUS_ABERTOS,
  temProjetoParaReusar,
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

// Quantos itens carregar de cada lado. As duas listas são buscadas separadamente
// para que um acúmulo de respondidas nunca empurre uma configuração em aberto
// para fora da tela — o que está esperando resposta é o que não pode sumir.
const LIMITE = 50;

const ABERTOS = [...STATUS_ABERTOS];

// Fila da equipe de Projetos: as configurações que o comercial montou no
// Configurador, com o desvio do padrão em destaque e a resposta (número do
// projeto e recado) fechando o ciclo na tela do vendedor.
export default async function ProjetosPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!session?.user || !canViewProjetos(session.user.role, permissions)) {
    return <Forbidden message="Você não tem acesso à fila de Projetos." />;
  }

  const incluirAutor = { respondidoPor: { select: { name: true } } };

  const [abertas, fechadas, contagens] = await Promise.all([
    prisma.configuracao.findMany({
      where: { status: { in: ABERTOS } },
      orderBy: { criadoEm: "asc" }, // FIFO: o pedido mais antigo primeiro
      take: LIMITE,
      include: incluirAutor,
    }),
    prisma.configuracao.findMany({
      where: { status: { notIn: ABERTOS } },
      orderBy: { respondidoEm: "desc" },
      take: LIMITE,
      include: incluirAutor,
    }),
    prisma.configuracao.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const registros = [...abertas, ...fechadas];

  // Índice "essa combinação já foi respondida?" restrito aos códigos desta
  // página: exato (não depende de um teto de linhas) e uma consulta só.
  const codigos = [...new Set(registros.map((registro) => registro.codigo))];
  const respondidas = codigos.length
    ? await prisma.configuracao.findMany({
        where: { codigo: { in: codigos }, status: { notIn: ABERTOS } },
        orderBy: { respondidoEm: "desc" },
        select: {
          codigo: true,
          numero: true,
          status: true,
          projetoCad: true,
          respostaNota: true,
          respondidoEm: true,
          respondidoPor: { select: { name: true } },
        },
      })
    : [];

  const respostas = mapaRespostas(
    respondidas.map((registro) => ({
      codigo: registro.codigo,
      numero: registro.numero,
      status: registro.status,
      projetoCad: registro.projetoCad,
      respostaNota: registro.respostaNota,
      respondidoPorNome: registro.respondidoPor?.name ?? null,
      respondidoQuando: registro.respondidoEm ? formatarDataHora(registro.respondidoEm) : "",
    })),
  );

  const contagem = (status: string): number =>
    contagens.find((linha) => linha.status === status)?._count._all ?? 0;

  const itens: ConfiguracaoDaFila[] = registros.map((registro) => {
    const selecoes = Array.isArray(registro.selecoes)
      ? (registro.selecoes as unknown as SelecaoResolvida[])
      : [];
    const anterior = respostas.get(registro.codigo);
    // Só é atalho se virou projeto de verdade e não é a própria linha.
    const reuso =
      temProjetoParaReusar(anterior) && anterior!.numero !== registro.numero ? anterior! : null;

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
      jaDesenhado: reuso,
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

      <FilaProjetos
        itens={itens}
        totalAbertas={contagem("ENVIADA") + contagem("EM_ANALISE")}
        totalFechadas={contagem("ATENDIDA") + contagem("RECUSADA")}
      />
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
