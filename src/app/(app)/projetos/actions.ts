"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { STATUS_ABERTOS, STATUS_ASSUMIVEL } from "@/lib/configurador/fila";
import {
  assumirConfiguracaoSchema,
  formatarNumeroConfiguracao,
  responderConfiguracaoSchema,
} from "@/lib/contracts";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewProjetos } from "@/lib/rbac";
import { requestHeaders } from "@/lib/request";

// A resposta da equipe muda as DUAS telas: a fila (/projetos) e o
// acompanhamento do vendedor (/configurador).
function revalidarTelas(): void {
  revalidatePath("/projetos");
  revalidatePath("/configurador");
}

// Marca "estou olhando esta". Serve para o vendedor saber que o pedido saiu da
// pilha e para a equipe não trombar duas pessoas no mesmo desenho.
export async function assumirConfiguracao(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }

  const permissions = await getRolePermissionsMap();
  if (!canViewProjetos(session.user.role, permissions)) {
    return { status: "error", message: "Você não tem acesso à fila de Projetos." };
  }

  const parsed = assumirConfiguracaoSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { status: "error", message: "Configuração inválida." };
  }

  const configuracao = await prisma.configuracao.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, numero: true, status: true },
  });
  if (!configuracao) {
    return { status: "error", message: "Configuração não encontrada." };
  }

  // A condição de estado vive no WHERE, não num `if` antes do update: dois
  // membros da equipe clicando ao mesmo tempo não podem os dois "assumir".
  // count === 0 significa que alguém chegou primeiro.
  const assumidas = await prisma.configuracao.updateMany({
    where: { id: configuracao.id, status: STATUS_ASSUMIVEL },
    data: { status: "EM_ANALISE" },
  });
  if (assumidas.count === 0) {
    return { status: "error", message: "Esta configuração já foi assumida ou respondida." };
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "configuracao.assumir",
    entity: "Configuracao",
    entityId: configuracao.id,
    summary: `${formatarNumeroConfiguracao(configuracao.numero)} em análise`,
    before: { status: configuracao.status },
    after: { status: "EM_ANALISE" },
    req: await requestHeaders(),
  });

  revalidarTelas();
  return {
    status: "success",
    message: `${formatarNumeroConfiguracao(configuracao.numero)} marcada como em análise.`,
  };
}

// Fecha a configuração: atendida (com o número do projeto CAD, que é o que o
// vendedor precisa) ou recusada (com motivo, que é o que ele precisa para
// corrigir). Já respondida não é respondida de novo — corrigir vira uma
// configuração nova, para o histórico não virar areia movediça.
export async function responderConfiguracao(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }

  const permissions = await getRolePermissionsMap();
  if (!canViewProjetos(session.user.role, permissions)) {
    return { status: "error", message: "Você não tem acesso à fila de Projetos." };
  }

  const parsed = responderConfiguracaoSchema.safeParse({
    id: formData.get("id"),
    decisao: formData.get("decisao"),
    projetoCad: formData.get("projetoCad") ?? undefined,
    nota: formData.get("nota") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Confira os dados da resposta e tente de novo." };
  }

  const { id, decisao } = parsed.data;
  const projetoCad = parsed.data.projetoCad?.trim() ?? "";
  const nota = parsed.data.nota?.trim() ?? "";

  if (decisao === "ATENDER" && !projetoCad) {
    return { status: "error", message: "Informe o número do projeto para atender." };
  }
  if (decisao === "RECUSAR" && !nota) {
    return { status: "error", message: "Informe o motivo da recusa." };
  }

  const configuracao = await prisma.configuracao.findUnique({
    where: { id },
    select: { id: true, numero: true, status: true, codigo: true },
  });
  if (!configuracao) {
    return { status: "error", message: "Configuração não encontrada." };
  }

  // Mesma razão do assumir: a guarda de estado vai no WHERE. Sem isso, duas
  // pessoas respondendo a mesma configuração ao mesmo tempo passariam as duas
  // pela checagem e a segunda resposta sobrescreveria a primeira em silêncio.
  const status = decisao === "ATENDER" ? "ATENDIDA" : "RECUSADA";
  const respondidas = await prisma.configuracao.updateMany({
    where: { id: configuracao.id, status: { in: [...STATUS_ABERTOS] } },
    data: {
      status,
      projetoCad: decisao === "ATENDER" ? projetoCad : null,
      respostaNota: nota || null,
      respondidoPorId: session.user.id,
      respondidoEm: new Date(),
    },
  });
  if (respondidas.count === 0) {
    return { status: "error", message: "Esta configuração já foi respondida por outra pessoa." };
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: decisao === "ATENDER" ? "configuracao.atender" : "configuracao.recusar",
    entity: "Configuracao",
    entityId: configuracao.id,
    summary:
      decisao === "ATENDER"
        ? `${formatarNumeroConfiguracao(configuracao.numero)} atendida com o projeto ${projetoCad}`
        : `${formatarNumeroConfiguracao(configuracao.numero)} recusada: ${nota}`,
    before: { status: configuracao.status },
    after: { status, projetoCad: projetoCad || null, nota: nota || null },
    req: await requestHeaders(),
  });

  revalidarTelas();
  return {
    status: "success",
    message:
      decisao === "ATENDER"
        ? `${formatarNumeroConfiguracao(configuracao.numero)} atendida com o projeto ${projetoCad}.`
        : `${formatarNumeroConfiguracao(configuracao.numero)} recusada.`,
  };
}
