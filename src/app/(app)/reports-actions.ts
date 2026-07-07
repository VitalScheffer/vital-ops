"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { requestHeaders } from "@/lib/request";

// Reports/feedback dentro do app. Usuário reporta problema/sugestão e vê o
// andamento; erros do sistema entram sozinhos (autor nulo); o admin trata e
// marca resolvido com uma resposta que o autor lê.

function isAdmin(role: string | undefined): boolean {
  return role === "ADMIN";
}

const criarSchema = z.object({
  tipo: z.enum(["PROBLEMA", "SUGESTAO"]),
  titulo: z.string().trim().min(3, "Escreva um título de ao menos 3 caracteres.").max(120),
  mensagem: z.string().trim().min(5, "Descreva um pouco mais (mín. 5 caracteres).").max(4000),
  rota: z.string().trim().max(200).optional(),
});

export async function criarReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }

  const parsed = criarSchema.safeParse({
    tipo: formData.get("tipo"),
    titulo: formData.get("titulo"),
    mensagem: formData.get("mensagem"),
    rota: formData.get("rota") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const headers = await requestHeaders();
  await prisma.report.create({
    data: {
      tipo: parsed.data.tipo,
      titulo: parsed.data.titulo,
      mensagem: parsed.data.mensagem,
      rota: parsed.data.rota ?? null,
      autorId: session.user.id ?? null,
      autorEmail: session.user.email,
      userAgent: headers.get("user-agent"),
    },
  });

  revalidatePath("/", "layout");
  return { status: "success", message: "Report enviado! Você acompanha o status por aqui." };
}

const resolverSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["ABERTO", "EM_ANALISE", "RESOLVIDO"]),
  resposta: z.string().trim().max(4000).optional(),
});

export async function resolverReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }
  if (!isAdmin(session.user.role)) {
    return { status: "error", message: "Só um administrador trata os reports." };
  }

  const parsed = resolverSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    resposta: formData.get("resposta") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Dados inválidos." };
  }

  const { id, status, resposta } = parsed.data;
  const resolvido = status === "RESOLVIDO";
  const alvo = await prisma.report.findUnique({ where: { id }, select: { titulo: true } });
  if (!alvo) {
    return { status: "error", message: "Report não encontrado." };
  }

  await prisma.report.update({
    where: { id },
    data: {
      status,
      resposta: resposta ?? null,
      resolvidoPorId: resolvido ? (session.user.id ?? null) : null,
      resolvidoEm: resolvido ? new Date() : null,
    },
  });

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "report.resolver",
    entity: "Report",
    entityId: id,
    summary: `Report "${alvo.titulo}" marcado como ${status}.`,
    req: await requestHeaders(),
  });

  revalidatePath("/", "layout");
  return { status: "success", message: "Report atualizado." };
}

export interface ReportView {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  status: string;
  autorEmail: string | null;
  rota: string | null;
  resposta: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
}

// Lista para o modal: admin vê TODOS; qualquer outro vê só os próprios. A regra
// é aplicada no servidor (não confia no cliente).
export async function listarReports(): Promise<{ isAdmin: boolean; reports: ReportView[] }> {
  const session = await auth();
  if (!session?.user?.email) {
    return { isAdmin: false, reports: [] };
  }

  const admin = isAdmin(session.user.role);
  const rows = await prisma.report.findMany({
    where: admin ? {} : { autorId: session.user.id ?? "__none__" },
    orderBy: { criadoEm: "desc" },
    take: 200,
  });

  return {
    isAdmin: admin,
    reports: rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      titulo: r.titulo,
      mensagem: r.mensagem,
      status: r.status,
      autorEmail: r.autorEmail,
      rota: r.rota,
      resposta: r.resposta,
      criadoEm: r.criadoEm.toISOString(),
      resolvidoEm: r.resolvidoEm ? r.resolvidoEm.toISOString() : null,
    })),
  };
}

// Registro automático de erro do sistema (chamado pelo error boundary). Best-effort:
// nunca lança para não piorar uma tela que já está em erro.
export async function registrarErroSistema(input: {
  mensagem: string;
  rota?: string;
  digest?: string;
}): Promise<void> {
  try {
    const session = await auth();
    const headers = await requestHeaders();
    await prisma.report.create({
      data: {
        tipo: "ERRO_SISTEMA",
        titulo: `Erro na tela ${input.rota ?? "?"}`,
        mensagem: input.mensagem.slice(0, 4000),
        status: "ABERTO",
        rota: input.rota ?? null,
        autorId: session?.user?.id ?? null,
        autorEmail: session?.user?.email ?? null,
        userAgent: headers.get("user-agent"),
        contexto: input.digest ? { digest: input.digest } : undefined,
      },
    });
  } catch {
    // silêncio proposital: capturar erro não pode gerar outro erro.
  }
}
