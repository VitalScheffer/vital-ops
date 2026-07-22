import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfiguradorForm } from "@/components/configurador/ConfiguradorForm";
import { ListaConfiguracoes } from "@/components/configurador/ListaConfiguracoes";
import { Forbidden } from "@/components/Forbidden";
import { auth } from "@/lib/auth";
import { produtoPorSlug } from "@/lib/configurador/catalogo";
import { mapaRespostas } from "@/lib/configurador/fila";
import { montarHistorico } from "@/lib/configurador/historico";
import { formatarDataHora } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canManageUsers, canViewConfigurador } from "@/lib/rbac";

interface ConfiguradorProdutoPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ConfiguradorProdutoPageProps) {
  const { slug } = await params;
  const produto = produtoPorSlug(slug);
  return { title: produto ? `${produto.nome} — Vital Ops` : "Configurador — Vital Ops" };
}

export default async function ConfiguradorProdutoPage({ params }: ConfiguradorProdutoPageProps) {
  const { slug } = await params;
  const produto = produtoPorSlug(slug);
  if (!produto) {
    notFound();
  }

  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!session?.user || !canViewConfigurador(session.user.role, permissions)) {
    return <Forbidden message="Você não tem acesso ao configurador de produtos." />;
  }

  const veTudo = canManageUsers(session.user.role, permissions);

  // Duas leituras com propósitos diferentes: a LISTA é de acompanhamento (as
  // minhas), e o HISTÓRICO é de reaproveitamento — traz o que qualquer vendedor
  // já especificou daquele produto, porque repetir a maca que o colega já pediu
  // é justamente o caso de uso. Ambas escopadas a este produto: quem está
  // montando um carro não quer o histórico das macas no meio.
  const [configuracoes, registrosHistorico] = await Promise.all([
    prisma.configuracao.findMany({
      where: veTudo
        ? { produtoSlug: produto.slug }
        : { produtoSlug: produto.slug, autorId: session.user.id },
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
        <Link
          href="/configurador"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-card-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Configurador
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-card-foreground">{produto.nome}</h1>
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

      <ListaConfiguracoes
        configuracoes={configuracoes}
        veTudo={veTudo}
        title={veTudo ? "Configurações enviadas" : "Minhas configurações"}
        description={`As 20 mais recentes de ${produto.nome}, da mais nova para a mais antiga.`}
        vazio="Nenhuma configuração enviada ainda para este produto. Monte a primeira no formulário acima."
      />
    </div>
  );
}
