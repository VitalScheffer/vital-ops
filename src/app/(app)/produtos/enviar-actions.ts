"use server";

import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chamar } from "@/lib/omie";
import { orquestrarEnvio, type EnvioResultado, type OutcomeEnvio } from "@/lib/produtos/envioOmie";
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
  arquivoNome: z.string().optional(),
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
  const novos = parsed.data.novos.filter((i) => i.status === "novo");
  if (novos.length === 0) {
    return {
      ok: false,
      erro: "Nenhum produto novo para enviar — os duplicados não são reenviados.",
    };
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
      ncm: "9999.99.99",
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
    resultado = await orquestrarEnvio({ novos: parsed.data.novos, estrutura }, chamar);
  } catch (erro) {
    await prisma.produtoImport.update({ where: { id: importRecord.id }, data: { status: "FALHA" } });
    const motivo = erro instanceof Error ? erro.message : String(erro);
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
      familias: resultado.familias.map((f) => ({ familia: f.familia, outcome: f.outcome })),
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

  // Atualizações sequenciais: SQLite (better-sqlite3) serializa escritas.
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
  return texto;
}
