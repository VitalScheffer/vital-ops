"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { EXTENSOES_ACEITAS, mimeDeAnexoPermitido } from "@/lib/anexos";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { requestHeaders } from "@/lib/request";
import {
  contextoErroInicial,
  contextoErroRepetido,
  lerContextoErro,
  JANELA_CAP_MS,
  JANELA_DEDUPE_MS,
  MAX_ERROS_POR_JANELA,
} from "@/lib/reports";

// Reports/feedback dentro do app. Usuário reporta problema/sugestão e vê o
// andamento; erros do sistema entram sozinhos (autor nulo); o admin trata e
// marca resolvido com uma resposta que o autor lê.

function isAdmin(role: string | undefined): boolean {
  return role === "ADMIN";
}

// Anexos ficam como bytea no banco. Limite por arquivo pensado para caber na
// resposta do serverless da Vercel (~4,5 MB) ao servir de volta.
const MAX_ANEXOS = 5;
const MAX_TAMANHO_ANEXO = 4 * 1024 * 1024; // 4 MB

function arquivosDoForm(formData: FormData): File[] {
  return formData
    .getAll("anexos")
    .filter((f): f is File => f instanceof File && f.size > 0);
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

  const arquivos = arquivosDoForm(formData);
  if (arquivos.length > MAX_ANEXOS) {
    return { status: "error", message: `Máximo de ${MAX_ANEXOS} anexos por report.` };
  }
  const grande = arquivos.find((f) => f.size > MAX_TAMANHO_ANEXO);
  if (grande) {
    return {
      status: "error",
      message: `O anexo "${grande.name}" passa de 4 MB. Reduza/comprima e tente de novo.`,
    };
  }
  // O tipo é recusado JÁ NA ENTRADA, não só na hora de devolver: anexo que não
  // deveria existir é melhor não guardar.
  const tipoRecusado = arquivos.find((f) => !mimeDeAnexoPermitido(f.type || "application/octet-stream"));
  if (tipoRecusado) {
    return {
      status: "error",
      message: `O anexo "${tipoRecusado.name}" é de um tipo que não aceitamos. Vale ${EXTENSOES_ACEITAS}.`,
    };
  }

  const headers = await requestHeaders();
  const report = await prisma.report.create({
    data: {
      tipo: parsed.data.tipo,
      titulo: parsed.data.titulo,
      mensagem: parsed.data.mensagem,
      rota: parsed.data.rota ?? null,
      autorId: session.user.id ?? null,
      autorEmail: session.user.email,
      userAgent: headers.get("user-agent"),
    },
    select: { id: true },
  });

  for (const arquivo of arquivos) {
    const dados = Buffer.from(await arquivo.arrayBuffer());
    await prisma.reportAnexo.create({
      data: {
        reportId: report.id,
        nome: arquivo.name.slice(0, 200),
        mime: arquivo.type || "application/octet-stream",
        tamanho: dados.length,
        dados,
      },
    });
  }

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

export interface ReportAnexoView {
  id: string;
  nome: string;
  mime: string;
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
  anexos: ReportAnexoView[];
  // Só em ERRO_SISTEMA: quantas vezes o mesmo erro caiu na mesma tela.
  ocorrencias: number | null;
  // Stack do erro. Só vai para o admin: é detalhe interno do código e não ajuda
  // em nada quem só quer saber se o problema foi resolvido.
  stack: string | null;
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
    include: { anexos: { select: { id: true, nome: true, mime: true } } },
  });

  return {
    isAdmin: admin,
    reports: rows.map((r) => {
      const contexto = r.tipo === "ERRO_SISTEMA" ? lerContextoErro(r.contexto) : null;
      return {
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
        anexos: r.anexos.map((a) => ({ id: a.id, nome: a.nome, mime: a.mime })),
        ocorrencias: contexto?.ocorrencias ?? null,
        stack: admin ? (contexto?.stack ?? null) : null,
      };
    }),
  };
}

// Registro automático de erro do sistema (chamado pelo error boundary). Best-effort:
// nunca lança para não piorar uma tela que já está em erro.
export async function registrarErroSistema(input: {
  mensagem: string;
  rota?: string;
  digest?: string;
  stack?: string;
}): Promise<void> {
  try {
    const mensagem = input.mensagem.slice(0, 4000);
    const rota = input.rota ?? null;

    // Teto de volume. Esta ação grava SEM exigir sessão de propósito (erro em
    // tela pública também tem que ser registrado), e Server Action é endereço
    // alcançável de fora: sem teto, dá para encher a tabela variando a mensagem
    // para escapar do dedupe abaixo. Passou do teto, o erro é descartado.
    const recentes = await prisma.report.count({
      where: { tipo: "ERRO_SISTEMA", criadoEm: { gte: new Date(Date.now() - JANELA_CAP_MS) } },
    });
    if (recentes >= MAX_ERROS_POR_JANELA) {
      return;
    }

    // Mesmo erro, mesma tela, poucos minutos: é o mesmo episódio se repetindo
    // (o boundary remonta e registra de novo). Vira contador no report que já
    // está aberto, senão a fila enche de cards idênticos.
    const aberto = await prisma.report.findFirst({
      where: {
        tipo: "ERRO_SISTEMA",
        status: "ABERTO",
        rota,
        mensagem,
        criadoEm: { gte: new Date(Date.now() - JANELA_DEDUPE_MS) },
      },
      orderBy: { criadoEm: "desc" },
      select: { id: true, contexto: true },
    });

    if (aberto) {
      await prisma.report.update({
        where: { id: aberto.id },
        data: {
          contexto: contextoErroRepetido(aberto.contexto, { stack: input.stack }, new Date()),
        },
      });
      return;
    }

    const session = await auth();
    const headers = await requestHeaders();
    await prisma.report.create({
      data: {
        tipo: "ERRO_SISTEMA",
        titulo: `Erro na tela ${input.rota ?? "?"}`,
        mensagem,
        status: "ABERTO",
        rota,
        autorId: session?.user?.id ?? null,
        autorEmail: session?.user?.email ?? null,
        userAgent: headers.get("user-agent"),
        contexto: contextoErroInicial({ digest: input.digest, stack: input.stack }),
      },
    });
  } catch {
    // silêncio proposital: capturar erro não pode gerar outro erro.
  }
}
