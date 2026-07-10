"use server";

import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chamar } from "@/lib/omie";
import { orquestrarEnvio, type EnvioResultado, type OutcomeEnvio } from "@/lib/produtos/envioOmie";
import { normalizarNcm } from "@/lib/produtos/ncm";
import { requestHeaders } from "@/lib/request";

// Envio automático dos produtos da BOM ao Omie via API (REQUISITOS §6/§7).
// O cliente manda SÓ os itens "novo" (a tela já marca duplicados e não os envia);
// mesmo assim validamos e recusamos qualquer item que não seja "novo" aqui.

const familiaSchema = z.enum([
  "COM - COMPONENTES",
  "SBM - SUBMONTAGEM",
  "PCF - PEÇAS FABRICADAS",
  "PCA - PEÇAS ACABADAS",
]);

const parsedItemSchema = z.object({
  linha: z.number().int(),
  raw: z.string(),
  codigo: z.string().trim().min(1),
  descricaoProduto: z.string().trim().min(1),
  familia: familiaSchema.nullable(),
  status: z.enum(["novo", "duplicado", "erro"]),
  motivoErro: z.string().optional(),
});

const estruturaRelSchema = z.object({
  numeroPai: z.string(),
  numeroFilho: z.string(),
  codigoPai: z.string().trim().min(1),
  codigoFilho: z.string().trim().min(1),
  descricaoFilho: z.string(),
  quantidade: z.number().nullable(),
});

const enviarInputSchema = z.object({
  novos: z.array(parsedItemSchema),
  estrutura: z.array(estruturaRelSchema),
  localEstoque: z.string().optional(),
  montagemDestinoCodigo: z.string().trim().min(1).max(60).optional(),
  arquivoNome: z.string().optional(),
  ncm: z.string().optional(),
});

export type EnviarAoOmieInput = z.infer<typeof enviarInputSchema>;

export interface EnviarAoOmieResult {
  ok: boolean;
  erro?: string;
  importId?: string;
  resultado?: EnvioResultado;
}

const STATUS_PRODUTO: Record<OutcomeEnvio, string> = {
  enviado: "ENVIADO",
  ja_existia: "ENVIADO", // Upsert idempotente atualizou o registro existente
  falha: "FALHA",
  nao_enviado: "NOVO", // segue pendente para um novo envio
};

const STATUS_ESTRUTURA: Record<OutcomeEnvio, string> = {
  enviado: "ENVIADO",
  ja_existia: "ENVIADO",
  falha: "FALHA",
  nao_enviado: "PENDENTE",
};

function temCredenciaisOmie(): boolean {
  return Boolean(process.env.OMIE_APP_KEY && process.env.OMIE_APP_SECRET);
}

function nomeArquivoPadrao(): string {
  return `Envio ao Omie ${new Date().toISOString().slice(0, 10)}`;
}

function foiEnviado(outcome: OutcomeEnvio): boolean {
  return outcome === "enviado" || outcome === "ja_existia";
}

function houveFalha(resultado: EnvioResultado): boolean {
  if (resultado.interrompido) return true;
  return (
    resultado.familias.some((f) => f.outcome === "falha") ||
    resultado.produtos.some((p) => p.outcome === "falha") ||
    resultado.estrutura.some((e) => e.outcome === "falha")
  );
}

function chaveCodigo(codigo: string): string {
  return codigo.replace(/\s+/g, "");
}

/**
 * A montagem destino é sempre um cadastro preexistente: ela nunca deve entrar
 * no fluxo de Upsert. Validamos com a mesma busca em lote já usada pelo
 * orquestrador antes de criar o registro de import ou alterar qualquer produto.
 */
async function validarMontagemDestino(codigo: string): Promise<boolean> {
  const resposta = await chamar("geral/produtos/", "ListarProdutos", {
    pagina: 1,
    registros_por_pagina: 100,
    apenas_importado_api: "N",
    filtrar_apenas_omiepdv: "N",
    produtosPorCodigo: [{ codigo }],
  });
  const produtos = resposta?.produto_servico_cadastro;
  if (!Array.isArray(produtos)) return false;

  const chave = chaveCodigo(codigo);
  return produtos.some((produto) => {
    if (!produto || typeof produto !== "object") return false;
    const codigoEncontrado = (produto as Record<string, unknown>).codigo;
    return typeof codigoEncontrado === "string" && chaveCodigo(codigoEncontrado) === chave;
  });
}

export async function enviarAoOmie(input: EnviarAoOmieInput): Promise<EnviarAoOmieResult> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return { ok: false, erro: "Sessão expirada. Entre novamente para enviar ao Omie." };
  }

  if (!temCredenciaisOmie()) {
    return { ok: false, erro: "Configure a app_key/secret do Omie no ambiente." };
  }

  const parsed = enviarInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Dados inválidos para envio. Recarregue a página e tente de novo." };
  }

  const { estrutura, localEstoque, arquivoNome } = parsed.data;
  const montagemDestinoCodigo = parsed.data.montagemDestinoCodigo || null;
  const ncm = normalizarNcm(parsed.data.ncm);
  const novos = parsed.data.novos.filter((i) => i.status === "novo");
  if (novos.length === 0 && estrutura.length === 0) {
    return {
      ok: false,
      erro: "Não há produto novo nem relação de estrutura para enviar.",
    };
  }

  if (montagemDestinoCodigo) {
    try {
      const existe = await validarMontagemDestino(montagemDestinoCodigo);
      if (!existe) {
        return {
          ok: false,
          erro: `A montagem destino \"${montagemDestinoCodigo}\" não foi encontrada no Omie. Confira o código antes de enviar.`,
        };
      }
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      return {
        ok: false,
        erro: `Não foi possível validar a montagem destino no Omie: ${motivo}`,
      };
    }
  }

  const local = localEstoque?.trim() || null;

  // 1. Persiste o import + itens (status inicial) antes de tocar no Omie.
  const importRecord = await prisma.produtoImport.create({
    data: {
      autorId: session.user.id,
      arquivoNome: arquivoNome?.trim() || nomeArquivoPadrao(),
      status: "ENVIANDO",
      totalProdutos: novos.length,
      totalEstrutura: estrutura.length,
    },
  });

  await prisma.produtoItem.createMany({
    data: novos.map((item) => ({
      importId: importRecord.id,
      codigo: item.codigo,
      descricao: item.descricaoProduto,
      familia: item.familia,
      ncm,
      unidade: "UN",
      tipo: "04",
      localEstoque: local,
      controleLote: true,
      status: "NOVO",
    })),
  });

  if (estrutura.length > 0) {
    await prisma.estruturaItem.createMany({
      data: estrutura.map((rel) => ({
        importId: importRecord.id,
        numeroPai: rel.numeroPai,
        numeroFilho: rel.numeroFilho,
        codigoPai: rel.codigoPai,
        codigoFilho: rel.codigoFilho,
        quantidade: rel.quantidade ?? 1,
        status: "PENDENTE",
      })),
    });
  }

  // 2. Orquestra o envio sequencial (famílias → produtos → estrutura).
  let resultado: EnvioResultado;
  try {
    resultado = await orquestrarEnvio({ novos: parsed.data.novos, estrutura, ncm }, chamar);
  } catch (erro) {
    await prisma.produtoImport.update({ where: { id: importRecord.id }, data: { status: "FALHA" } });
    const motivo = erro instanceof Error ? erro.message : String(erro);
    // Falha inesperada (bug/queda de rede/banco): AUDITA para o admin ver na
    // /auditoria, senão o erro sumiria (só o usuário veria a mensagem na tela).
    await audit({
      actor: { id: session.user.id, email: session.user.email },
      action: "produto.enviar_omie.erro",
      entity: "ProdutoImport",
      entityId: importRecord.id,
      summary: `Falha inesperada no envio ao Omie: ${motivo}`,
      after: { erro: motivo, arquivo: importRecord.arquivoNome },
      req: await requestHeaders(),
    });
    return { ok: false, importId: importRecord.id, erro: `Falha inesperada no envio ao Omie: ${motivo}` };
  }

  // 3. Reflete o resultado no banco (status por item).
  await aplicarResultadoNoBanco(importRecord.id, resultado);

  const status = houveFalha(resultado) ? "FALHA" : "CONCLUIDO";
  await prisma.produtoImport.update({ where: { id: importRecord.id }, data: { status } });

  // 4. Auditoria (REQUISITOS §5) — contagens e se o lote parou.
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "produto.enviar_omie",
    entity: "ProdutoImport",
    entityId: importRecord.id,
    summary: resumoAuditoria(resultado),
    after: {
      totais: resultado.totais,
      interrompido: resultado.interrompido,
      bloqueado: resultado.bloqueado,
      motivoInterrupcao: resultado.motivoInterrupcao ?? null,
      montagemDestinoCodigo,
      familias: resultado.familias.map((f) => ({ familia: f.familia, outcome: f.outcome })),
      // Detalhe das falhas (o quê + porquê) para o admin auditar sem abrir o banco.
      falhas: falhasDetalhadas(resultado),
    },
    req: await requestHeaders(),
  });

  return { ok: true, importId: importRecord.id, resultado };
}

async function aplicarResultadoNoBanco(importId: string, resultado: EnvioResultado): Promise<void> {
  const itensDb = await prisma.produtoItem.findMany({
    where: { importId },
    select: { id: true, codigo: true },
  });
  const idPorCodigo = new Map(itensDb.map((i) => [i.codigo, i.id]));

  // Atualizações sequenciais (uma query por vez) — simples e previsível; o
  // volume por lote é baixo, não precisa de paralelismo nem de transação.
  for (const produto of resultado.produtos) {
    const id = idPorCodigo.get(produto.codigo);
    if (!id) continue;
    await prisma.produtoItem.update({
      where: { id },
      data: {
        status: STATUS_PRODUTO[produto.outcome],
        motivoErro: produto.motivo ?? null,
        omieCodigoProduto: produto.omieCodigoProduto ?? null,
        enviadoEm: foiEnviado(produto.outcome) ? new Date() : null,
      },
    });
  }

  if (resultado.estrutura.length === 0) return;

  const estruturaDb = await prisma.estruturaItem.findMany({
    where: { importId },
    select: { id: true, numeroFilho: true },
  });
  const idPorNumeroFilho = new Map(estruturaDb.map((e) => [e.numeroFilho, e.id]));

  for (const rel of resultado.estrutura) {
    const id = idPorNumeroFilho.get(rel.numeroFilho);
    if (!id) continue;
    await prisma.estruturaItem.update({
      where: { id },
      data: { status: STATUS_ESTRUTURA[rel.outcome], motivoErro: rel.motivo ?? null },
    });
  }
}

// Lista plana das falhas do lote (família/produto/estrutura) com o motivo do
// Omie — vai para o `after` da auditoria e alimenta o resumo abaixo.
interface FalhaDetalhada {
  tipo: "familia" | "produto" | "estrutura";
  ref: string;
  motivo: string | null;
}

function falhasDetalhadas(resultado: EnvioResultado): FalhaDetalhada[] {
  return [
    ...resultado.familias
      .filter((f) => f.outcome === "falha")
      .map((f): FalhaDetalhada => ({ tipo: "familia", ref: f.familia, motivo: f.motivo ?? null })),
    ...resultado.produtos
      .filter((p) => p.outcome === "falha")
      .map((p): FalhaDetalhada => ({ tipo: "produto", ref: p.codigo, motivo: p.motivo ?? null })),
    ...resultado.estrutura
      .filter((e) => e.outcome === "falha")
      .map((e): FalhaDetalhada => ({
        tipo: "estrutura",
        ref: `${e.codigoPai}→${e.codigoFilho}`,
        motivo: e.motivo ?? null,
      })),
  ];
}

function resumoAuditoria(resultado: EnvioResultado): string {
  const { enviados, jaExistiam, falhas, naoEnviados, recusados } = resultado.totais;
  const partes = [
    `${enviados} cadastrado(s)`,
    `${jaExistiam} já existia(m)`,
    `${falhas} falha(s)`,
  ];
  if (naoEnviados > 0) partes.push(`${naoEnviados} não alcançado(s)`);
  if (recusados > 0) partes.push(`${recusados} recusado(s) por não serem novos`);
  const estruturaEnviada = resultado.estrutura.filter((e) => foiEnviado(e.outcome)).length;
  let texto = `Envio ao Omie: ${partes.join(", ")}. Estrutura: ${estruturaEnviada}/${resultado.estrutura.length} relação(ões).`;
  if (resultado.interrompido) {
    texto += resultado.bloqueado
      ? " Lote interrompido: Omie bloqueou/breaker aberto."
      : " Lote interrompido por erro.";
  }
  // Nomeia o quê falhou direto no resumo (é a coluna que o admin lê na
  // /auditoria); os 3 primeiros, o resto fica no `after`.
  const falhasLista = falhasDetalhadas(resultado);
  if (falhasLista.length > 0) {
    const amostra = falhasLista
      .slice(0, 3)
      .map((f) => `${f.ref}${f.motivo ? ` (${f.motivo})` : ""}`)
      .join("; ");
    const resto = falhasLista.length > 3 ? ` e mais ${falhasLista.length - 3}` : "";
    texto += ` Erros: ${amostra}${resto}.`;
  }
  return texto;
}
