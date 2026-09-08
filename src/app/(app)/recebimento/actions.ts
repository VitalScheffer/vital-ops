"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  adicionarItemRecebimentoSchema,
  criarNotaRecebimentoSchema,
  editarNotaRecebimentoSchema,
  marcarCheckRecebimentoSchema,
  marcarColunaRecebimentoSchema,
  removerItemRecebimentoSchema,
  removerNotaRecebimentoSchema,
  type AdicionarItemRecebimentoInput,
  type CriarNotaRecebimentoInput,
  type EditarNotaRecebimentoInput,
  type ItemRecebimentoDTO,
  type MarcarCheckRecebimentoInput,
  type MarcarColunaRecebimentoInput,
  type NotaRecebimentoDTO,
  type RemoverItemRecebimentoInput,
  type RemoverNotaRecebimentoInput,
} from "@/lib/contracts";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewRecebimento } from "@/lib/rbac";
import { requestHeaders } from "@/lib/request";

interface Guarda {
  userId: string;
  nome: string;
  email: string;
}

// Retorno de erro do guard: subtipo de FormState (sem "idle"), pra também
// servir de retorno de erro nas actions que devolvem um DTO em vez de FormState.
type ErroGuarda = { status: "error"; message: string };

function unauthenticated(): ErroGuarda {
  return { status: "error", message: "Sessão expirada. Entre novamente." };
}

async function guardar(): Promise<Guarda | ErroGuarda> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return unauthenticated();
  }
  const permissions = await getRolePermissionsMap();
  if (!canViewRecebimento(session.user.role, permissions)) {
    return { status: "error", message: "Você não tem permissão para acessar o Recebimento de NF." };
  }
  return { userId: session.user.id, nome: session.user.name ?? session.user.email, email: session.user.email };
}

function ehGuarda(g: Guarda | ErroGuarda): g is Guarda {
  return "userId" in g;
}

const REVALIDAR = "/recebimento";

export type CriarNotaRecebimentoResult = { status: "success"; nota: NotaRecebimentoDTO } | { status: "error"; message: string };

export async function criarNotaRecebimento(input: CriarNotaRecebimentoInput): Promise<CriarNotaRecebimentoResult> {
  const guarda = await guardar();
  if (!ehGuarda(guarda)) return guarda;

  const parsed = criarNotaRecebimentoSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Preencha número, fornecedor e data da NF." };
  }
  const dataEmissao = new Date(`${parsed.data.dataEmissao}T00:00:00`);
  if (Number.isNaN(dataEmissao.getTime())) {
    return { status: "error", message: "Data de emissão inválida." };
  }

  const nota = await prisma.recebimentoNota.create({
    data: {
      numero: parsed.data.numero,
      fornecedor: parsed.data.fornecedor,
      dataEmissao,
      criadoPorId: guarda.userId,
      criadoPorNome: guarda.nome,
    },
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "recebimento.criarNota",
    entity: "RecebimentoNota",
    entityId: nota.id,
    summary: `Criou a NF ${nota.numero} (${nota.fornecedor}) no checklist de Recebimento.`,
    after: nota,
    req: await requestHeaders(),
  });

  revalidatePath(REVALIDAR);
  return {
    status: "success",
    nota: { id: nota.id, numero: nota.numero, fornecedor: nota.fornecedor, dataEmissao: nota.dataEmissao.toISOString(), itens: [] },
  };
}

export async function editarNotaRecebimento(input: EditarNotaRecebimentoInput): Promise<FormState> {
  const guarda = await guardar();
  if (!ehGuarda(guarda)) return guarda;

  const parsed = editarNotaRecebimentoSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Preencha número, fornecedor e data da NF." };
  }
  const dataEmissao = new Date(`${parsed.data.dataEmissao}T00:00:00`);
  if (Number.isNaN(dataEmissao.getTime())) {
    return { status: "error", message: "Data de emissão inválida." };
  }

  const antes = await prisma.recebimentoNota.findUnique({ where: { id: parsed.data.id } });
  if (!antes) {
    return { status: "error", message: "Nota não encontrada." };
  }

  const nota = await prisma.recebimentoNota.update({
    where: { id: parsed.data.id },
    data: { numero: parsed.data.numero, fornecedor: parsed.data.fornecedor, dataEmissao },
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "recebimento.editarNota",
    entity: "RecebimentoNota",
    entityId: nota.id,
    summary: `Editou a NF ${nota.numero} (${nota.fornecedor}) no checklist de Recebimento.`,
    before: antes,
    after: nota,
    req: await requestHeaders(),
  });

  revalidatePath(REVALIDAR);
  return { status: "success" };
}

export async function removerNotaRecebimento(input: RemoverNotaRecebimentoInput): Promise<FormState> {
  const guarda = await guardar();
  if (!ehGuarda(guarda)) return guarda;

  const parsed = removerNotaRecebimentoSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Nota inválida." };
  }

  const nota = await prisma.recebimentoNota.findUnique({ where: { id: parsed.data.id } });
  if (!nota) {
    return { status: "error", message: "Nota não encontrada." };
  }

  await prisma.recebimentoNota.delete({ where: { id: parsed.data.id } });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "recebimento.removerNota",
    entity: "RecebimentoNota",
    entityId: nota.id,
    summary: `Removeu a NF ${nota.numero} (${nota.fornecedor}) do checklist de Recebimento.`,
    before: nota,
    req: await requestHeaders(),
  });

  revalidatePath(REVALIDAR);
  return { status: "success" };
}

export type AdicionarItemRecebimentoResult = { status: "success"; item: ItemRecebimentoDTO } | { status: "error"; message: string };

export async function adicionarItemRecebimento(input: AdicionarItemRecebimentoInput): Promise<AdicionarItemRecebimentoResult> {
  const guarda = await guardar();
  if (!ehGuarda(guarda)) return guarda;

  const parsed = adicionarItemRecebimentoSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Informe o nome do produto." };
  }

  const nota = await prisma.recebimentoNota.findUnique({
    where: { id: parsed.data.notaId },
    include: { _count: { select: { itens: true } } },
  });
  if (!nota) {
    return { status: "error", message: "Nota não encontrada." };
  }

  const item = await prisma.recebimentoItem.create({
    data: { notaId: parsed.data.notaId, produto: parsed.data.produto, ordem: nota._count.itens },
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "recebimento.adicionarItem",
    entity: "RecebimentoItem",
    entityId: item.id,
    summary: `Adicionou o produto "${item.produto}" à NF ${nota.numero}.`,
    after: item,
    req: await requestHeaders(),
  });

  revalidatePath(REVALIDAR);
  return {
    status: "success",
    item: {
      id: item.id,
      produto: item.produto,
      materialRecebido: item.materialRecebido,
      temOC: item.temOC,
      ocAprovado: item.ocAprovado,
      nfeLancada: item.nfeLancada,
    },
  };
}

export async function removerItemRecebimento(input: RemoverItemRecebimentoInput): Promise<FormState> {
  const guarda = await guardar();
  if (!ehGuarda(guarda)) return guarda;

  const parsed = removerItemRecebimentoSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Item inválido." };
  }

  const item = await prisma.recebimentoItem.findUnique({ where: { id: parsed.data.id } });
  if (!item) {
    return { status: "error", message: "Item não encontrado." };
  }

  await prisma.recebimentoItem.delete({ where: { id: parsed.data.id } });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "recebimento.removerItem",
    entity: "RecebimentoItem",
    entityId: item.id,
    summary: `Removeu o produto "${item.produto}" do checklist de Recebimento.`,
    before: item,
    req: await requestHeaders(),
  });

  revalidatePath(REVALIDAR);
  return { status: "success" };
}

export async function marcarCheckRecebimento(input: MarcarCheckRecebimentoInput): Promise<FormState> {
  const guarda = await guardar();
  if (!ehGuarda(guarda)) return guarda;

  const parsed = marcarCheckRecebimentoSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Marcação inválida." };
  }

  const item = await prisma.recebimentoItem.update({
    where: { id: parsed.data.itemId },
    data: { [parsed.data.evento]: parsed.data.marcado },
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "recebimento.marcarCheck",
    entity: "RecebimentoItem",
    entityId: item.id,
    summary: `${parsed.data.marcado ? "Marcou" : "Desmarcou"} "${parsed.data.evento}" em "${item.produto}".`,
    after: item,
    req: await requestHeaders(),
  });

  // Sem revalidatePath aqui: o checkbox já é otimista no cliente e revalidar a
  // cada clique reseta o scroll/foco no meio de uma sessão de marcação rápida.
  return { status: "success" };
}

export async function marcarColunaRecebimento(input: MarcarColunaRecebimentoInput): Promise<FormState> {
  const guarda = await guardar();
  if (!ehGuarda(guarda)) return guarda;

  const parsed = marcarColunaRecebimentoSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Marcação inválida." };
  }

  const { count } = await prisma.recebimentoItem.updateMany({
    where: { notaId: parsed.data.notaId },
    data: { [parsed.data.evento]: parsed.data.marcado },
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "recebimento.marcarColuna",
    entity: "RecebimentoNota",
    entityId: parsed.data.notaId,
    summary: `${parsed.data.marcado ? "Marcou" : "Desmarcou"} "${parsed.data.evento}" em ${count} produto(s).`,
    req: await requestHeaders(),
  });

  return { status: "success" };
}
