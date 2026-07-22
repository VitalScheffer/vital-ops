import { ArrowRight, Info } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { ListaConfiguracoes } from "@/components/configurador/ListaConfiguracoes";
import { Forbidden } from "@/components/Forbidden";
import { GradeInicio } from "@/components/GradeInicio";
import { auth } from "@/lib/auth";
import { CATALOGO } from "@/lib/configurador/catalogo";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canManageUsers, canViewConfigurador } from "@/lib/rbac";

export const metadata = { title: "Configurador — Vital Ops" };

// Abertura do configurador: escolher O QUE vai ser configurado. Mesma grade do
// Início (cards com cascata e inclinação no modo brilho), só que com a foto do
// produto no lugar do ícone — é a foto que faz o vendedor reconhecer o produto.
// Montar a configuração em si acontece em /configurador/[slug].
export default async function ConfiguradorPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!session?.user || !canViewConfigurador(session.user.role, permissions)) {
    return <Forbidden message="Você não tem acesso ao configurador de produtos." />;
  }

  // Quem administra usuários enxerga tudo que foi configurado; o comercial vê o
  // que ele mesmo enviou.
  const veTudo = canManageUsers(session.user.role, permissions);

  const configuracoes = await prisma.configuracao.findMany({
    where: veTudo ? {} : { autorId: session.user.id },
    orderBy: { criadoEm: "desc" },
    take: 20,
    include: { respondidoPor: { select: { name: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-card-foreground">Configurador de produto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o produto para montar opção por opção e enviar a especificação para a equipe de
          Projetos.
        </p>
      </header>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          O que você enviar cai na fila da equipe de Projetos. Quando eles responderem, o número do
          projeto aparece aqui embaixo, na sua configuração.
        </span>
      </p>

      <GradeInicio>
        {CATALOGO.map((produto, index) => (
          <Link
            key={produto.slug}
            href={`/configurador/${produto.slug}`}
            style={{ "--card-i": index } as CSSProperties}
            className="grade-card group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary"
          >
            <Image
              src={produto.imagem}
              alt={`Foto de referência: ${produto.nome}`}
              width={produto.imagemLargura}
              height={produto.imagemAltura}
              sizes="(min-width: 640px) 50vw, 100vw"
              className="h-44 w-full bg-white object-contain"
            />
            <div className="border-t border-border p-6">
              <h2 className="flex items-center gap-1 text-base font-semibold text-card-foreground">
                {produto.nome}
                <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{produto.resumo}</p>
            </div>
          </Link>
        ))}
      </GradeInicio>

      <ListaConfiguracoes
        configuracoes={configuracoes}
        veTudo={veTudo}
        title={veTudo ? "Configurações enviadas" : "Minhas configurações"}
        description="As 20 mais recentes, de todos os produtos, da mais nova para a mais antiga."
        vazio="Nenhuma configuração enviada ainda. Escolha um produto acima para montar a primeira."
      />
    </div>
  );
}
