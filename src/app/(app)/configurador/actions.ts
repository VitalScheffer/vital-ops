"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { produtoPorSlug } from "@/lib/configurador/catalogo";
import {
  foraDoPadrao,
  montarCodigo,
  resolverSelecoes,
  resumoTexto,
  type EscolhaBruta,
} from "@/lib/configurador/codigo";
import { criarConfiguracaoSchema, formatarNumeroConfiguracao } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewConfigurador } from "@/lib/rbac";
import { requestHeaders } from "@/lib/request";

function parseEscolhas(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw) {
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function textoOpcional(raw: FormDataEntryValue | null): string | undefined {
  const texto = typeof raw === "string" ? raw.trim() : "";
  return texto ? texto : undefined;
}

// Registra a configuração montada pelo comercial. O formulário manda as siglas
// escolhidas; o servidor RE-RESOLVE tudo contra o catálogo (rótulos, padrão,
// obrigatoriedade de texto livre) e só então monta o código de identidade — o
// cliente não decide nada disso. O que vai para o banco é um snapshot completo,
// para a configuração continuar legível se o catálogo mudar depois.
export async function criarConfiguracao(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }

  const permissions = await getRolePermissionsMap();
  if (!canViewConfigurador(session.user.role, permissions)) {
    return { status: "error", message: "Você não tem permissão para usar o configurador." };
  }

  const parsed = criarConfiguracaoSchema.safeParse({
    produtoSlug: formData.get("produtoSlug"),
    escolhas: parseEscolhas(formData.get("escolhas")),
    observacoes: textoOpcional(formData.get("observacoes")),
  });
  if (!parsed.success) {
    return { status: "error", message: "Confira as opções escolhidas e tente de novo." };
  }

  const produto = produtoPorSlug(parsed.data.produtoSlug);
  if (!produto) {
    return { status: "error", message: "Produto não encontrado no catálogo." };
  }

  const escolhas: Record<string, EscolhaBruta> = {};
  for (const escolha of parsed.data.escolhas) {
    escolhas[escolha.grupo] = { opcao: escolha.opcao, texto: escolha.texto };
  }

  const resolucao = resolverSelecoes(produto, escolhas);
  if (!resolucao.ok) {
    return { status: "error", message: resolucao.erro };
  }

  const codigo = montarCodigo(produto, resolucao.selecoes);
  const desvios = foraDoPadrao(resolucao.selecoes);

  const criada = await prisma.configuracao.create({
    data: {
      produtoSlug: produto.slug,
      produtoNome: produto.nome,
      autorId: session.user.id,
      autorNome: session.user.name ?? session.user.email,
      autorEmail: session.user.email,
      codigo,
      // Snapshot: array de objetos simples. O cast é só para o Prisma aceitar um
      // tipo nomeado como JSON (mesmo motivo do toJson() em lib/audit.ts).
      selecoes: resolucao.selecoes as unknown as Prisma.InputJsonValue,
      foraDoPadrao: desvios.length,
      observacoes: parsed.data.observacoes ?? null,
    },
    select: { id: true, numero: true },
  });

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "configuracao.criar",
    entity: "Configuracao",
    entityId: criada.id,
    summary: `${formatarNumeroConfiguracao(criada.numero)} — ${produto.nome} (${codigo}), ${desvios.length} item(ns) fora do padrão`,
    after: { codigo, foraDoPadrao: desvios.length, resumo: resumoTexto(resolucao.selecoes) },
    req: await requestHeaders(),
  });

  revalidatePath("/configurador");

  const aviso =
    desvios.length === 0
      ? "Tudo no padrão."
      : `${desvios.length} item(ns) fora do padrão destacado(s) para a equipe de Projetos.`;
  return {
    status: "success",
    message: `${formatarNumeroConfiguracao(criada.numero)} registrada. ${aviso}`,
  };
}
