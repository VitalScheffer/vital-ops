"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { conferirBaixaSchema, executarBaixaSchema, type BaixaLinha } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import {
  baixarEstoque,
  buscarProdutosPorCodigo,
  dataOmieHoje,
  saldosPorCodigo,
  type ItemBaixa,
  type ProdutoEstoque,
  type SaldoEstoque,
} from "@/lib/estoque/omieEstoque";
import { chamar } from "@/lib/omie";
import { OmieBlocked } from "@/lib/omie/errors";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewBaixas } from "@/lib/rbac";
import { requestHeaders } from "@/lib/request";

interface Guarda {
  userId: string;
  email: string;
}

async function guardarBaixas(): Promise<Guarda | { erro: string }> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return { erro: "Sessão expirada. Entre novamente." };
  }
  const permissions = await getRolePermissionsMap();
  if (!canViewBaixas(session.user.role, permissions)) {
    return { erro: "Você não tem permissão para dar baixa de estoque." };
  }
  if (!process.env.OMIE_APP_KEY || !process.env.OMIE_APP_SECRET) {
    return { erro: "Integração com o Omie não configurada no servidor (OMIE_APP_KEY/OMIE_APP_SECRET)." };
  }
  return { userId: session.user.id, email: session.user.email };
}

function mensagemOmieIndisponivel(erro: unknown): string {
  if (erro instanceof OmieBlocked) {
    return "O Omie está temporariamente indisponível (bloqueio de consumo). Tente de novo em alguns minutos.";
  }
  return "Não consegui consultar o Omie agora. Tente novamente.";
}

export interface ConferenciaItem {
  sku: string;
  quantidade: number;
  descricao?: string;
  saldo?: number;
  ok: boolean;
  motivo?: string;
}

export interface ResultadoConferencia {
  ok: boolean;
  erro?: string;
  itens: ConferenciaItem[];
}

function conferirItens(
  itens: readonly BaixaLinha[],
  produtos: Map<string, ProdutoEstoque>,
  saldos: Map<string, SaldoEstoque>,
): ConferenciaItem[] {
  // Mais de uma linha do mesmo SKU consome do MESMO saldo — a conferência soma
  // na ordem da planilha pra apontar a linha que estoura.
  const consumido = new Map<string, number>();
  return itens.map((item) => {
    const produto = produtos.get(item.sku);
    if (!produto) {
      return { sku: item.sku, quantidade: item.quantidade, ok: false, motivo: "Código não encontrado no Omie." };
    }
    const saldo = saldos.get(item.sku)?.saldo ?? 0;
    const usado = consumido.get(item.sku) ?? 0;
    const disponivel = saldo - usado;
    if (disponivel < item.quantidade) {
      return {
        sku: item.sku,
        quantidade: item.quantidade,
        descricao: produto.descricao,
        saldo,
        ok: false,
        motivo: `Saldo insuficiente no local padrão: disponível ${disponivel}, pedido ${item.quantidade}.`,
      };
    }
    consumido.set(item.sku, usado + item.quantidade);
    return { sku: item.sku, quantidade: item.quantidade, descricao: produto.descricao, saldo, ok: true };
  });
}

// Conferência (SÓ LEITURA, cacheada): valida códigos e saldos antes de o
// usuário confirmar. Nenhuma escrita no Omie acontece aqui.
export async function conferirBaixa(input: unknown): Promise<ResultadoConferencia> {
  const guarda = await guardarBaixas();
  if ("erro" in guarda) {
    return { ok: false, erro: guarda.erro, itens: [] };
  }

  const parsed = conferirBaixaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Planilha inválida: confira código e quantidade de cada linha.", itens: [] };
  }
  const { itens } = parsed.data;

  try {
    const skus = itens.map((item) => item.sku);
    const produtos = await buscarProdutosPorCodigo(skus, chamar);
    const saldos = await saldosPorCodigo(skus, dataOmieHoje(), chamar);
    return { ok: true, itens: conferirItens(itens, produtos, saldos) };
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), itens: [] };
  }
}

export interface ExecucaoItem {
  sku: string;
  quantidade: number;
  descricao?: string;
  outcome: "baixado" | "ja_baixado" | "falha" | "nao_baixado";
  motivo?: string;
}

export interface ResultadoExecucao {
  ok: boolean;
  erro?: string;
  importId?: string;
  itens: ExecucaoItem[];
  interrompido: boolean;
  bloqueado: boolean;
  motivoInterrupcao?: string;
  totais: { baixados: number; falhas: number; naoBaixados: number };
}

function obsDoItem(arquivoNome: string, solicitante: string, item: BaixaLinha): string {
  const partes = [`Baixa por planilha ${arquivoNome}`, `solicitante: ${item.solicitante ?? solicitante}`];
  if (item.pedido) partes.push(`pedido ${item.pedido}`);
  if (item.notaFiscal) partes.push(`NF ${item.notaFiscal}`);
  if (item.op) partes.push(`OP ${item.op}`);
  return partes.join(" — ");
}

interface ItemPersistido {
  id: string;
  sku: string;
  quantidade: number;
  descricao: string | null;
  obs: string;
}

// Núcleo compartilhado entre executar (import novo) e continuar (import
// interrompido): baixa os itens no Omie e reflete o resultado no banco.
async function processarBaixa(
  importId: string,
  itens: ItemPersistido[],
  actor: Guarda,
): Promise<ResultadoExecucao> {
  let produtos: Map<string, ProdutoEstoque>;
  let saldos: Map<string, SaldoEstoque>;
  try {
    const skus = itens.map((item) => item.sku);
    produtos = await buscarProdutosPorCodigo(skus, chamar);
    saldos = await saldosPorCodigo(skus, dataOmieHoje(), chamar);
  } catch (erro) {
    return {
      ok: false,
      erro: mensagemOmieIndisponivel(erro),
      importId,
      itens: [],
      interrompido: false,
      bloqueado: erro instanceof OmieBlocked,
      totais: { baixados: 0, falhas: 0, naoBaixados: 0 },
    };
  }

  const itensBaixa: ItemBaixa[] = itens.map((item) => ({
    chave: item.id,
    sku: item.sku,
    quantidade: item.quantidade,
    obs: item.obs,
  }));

  const resultado = await baixarEstoque(itensBaixa, { data: dataOmieHoje(), produtos, saldos }, chamar);

  const agora = new Date();
  const porChave = new Map(itens.map((item) => [item.id, item]));
  const saida: ExecucaoItem[] = [];
  for (const item of resultado.itens) {
    const original = porChave.get(item.chave);
    saida.push({
      sku: item.sku,
      quantidade: original?.quantidade ?? 0,
      descricao: original?.descricao ?? produtos.get(item.sku)?.descricao,
      outcome: item.outcome,
      motivo: item.motivo,
    });
    if (item.outcome === "baixado" || item.outcome === "ja_baixado") {
      await prisma.baixaItem.update({
        where: { id: item.chave },
        data: { status: "BAIXADO", motivoErro: null, omieRef: item.omieRef, baixadoEm: agora },
      });
      if (item.outcome === "baixado" && original) {
        await prisma.movimentoEstoque.create({
          data: {
            tipo: "SAIDA",
            sku: item.sku,
            quantidade: original.quantidade,
            omieRef: item.omieRef,
            baixaItemId: item.chave,
          },
        });
      }
      continue;
    }
    if (item.outcome === "falha") {
      await prisma.baixaItem.update({
        where: { id: item.chave },
        data: { status: "FALHA", motivoErro: item.motivo ?? "Falha na baixa." },
      });
    }
    // "nao_baixado" fica PENDENTE — o botão "Continuar baixa" retoma daqui.
  }

  const baixados = saida.filter((i) => i.outcome === "baixado" || i.outcome === "ja_baixado").length;
  const falhas = saida.filter((i) => i.outcome === "falha").length;
  const naoBaixados = saida.filter((i) => i.outcome === "nao_baixado").length;

  const statusImport = resultado.interrompido ? "ENVIANDO" : falhas > 0 ? "FALHA" : "CONCLUIDO";
  await prisma.baixaImport.update({ where: { id: importId }, data: { status: statusImport } });

  await audit({
    actor: { id: actor.userId, email: actor.email },
    action: "baixa.executar",
    entity: "BaixaImport",
    entityId: importId,
    summary: `Baixa de estoque por planilha: ${baixados} baixado(s), ${falhas} falha(s), ${naoBaixados} não baixado(s)${resultado.interrompido ? " (interrompida)" : ""}.`,
    after: { baixados, falhas, naoBaixados, interrompido: resultado.interrompido, bloqueado: resultado.bloqueado },
    req: await requestHeaders(),
  });

  revalidatePath("/baixas");
  return {
    ok: true,
    importId,
    itens: saida,
    interrompido: resultado.interrompido,
    bloqueado: resultado.bloqueado,
    motivoInterrupcao: resultado.motivoInterrupcao,
    totais: { baixados, falhas, naoBaixados },
  };
}

// Executa a baixa da planilha inteira: persiste o import + itens e escreve no
// Omie item a item (sequencial, ban-safe). Idempotência: o id de CADA item vira
// o `cod_int_ajuste` do ajuste — "Continuar baixa" nunca baixa duas vezes.
export async function executarBaixa(input: unknown): Promise<ResultadoExecucao> {
  const vazio: ResultadoExecucao = {
    ok: false,
    itens: [],
    interrompido: false,
    bloqueado: false,
    totais: { baixados: 0, falhas: 0, naoBaixados: 0 },
  };

  const guarda = await guardarBaixas();
  if ("erro" in guarda) {
    return { ...vazio, erro: guarda.erro };
  }

  const parsed = executarBaixaSchema.safeParse(input);
  if (!parsed.success) {
    return { ...vazio, erro: "Dados inválidos: confira o solicitante e as linhas da planilha." };
  }
  const { arquivoNome, solicitante, itens } = parsed.data;

  // Descrição/id interno pra gravar nos itens (leitura cacheada da conferência).
  let produtos: Map<string, ProdutoEstoque>;
  try {
    produtos = await buscarProdutosPorCodigo(itens.map((item) => item.sku), chamar);
  } catch (erro) {
    return { ...vazio, erro: mensagemOmieIndisponivel(erro) };
  }

  const criado = await prisma.baixaImport.create({
    data: {
      autorId: guarda.userId,
      arquivoNome,
      solicitante,
      status: "ENVIANDO",
      totalItens: itens.length,
      itens: {
        create: itens.map((item) => ({
          sku: item.sku,
          descricao: produtos.get(item.sku)?.descricao,
          quantidade: item.quantidade,
          pedido: item.pedido,
          notaFiscal: item.notaFiscal,
          op: item.op,
          omieIdProd: produtos.get(item.sku)?.idProd,
        })),
      },
    },
    include: { itens: true },
  });

  const persistidos: ItemPersistido[] = criado.itens.map((item) => {
    const linha = itens.find(
      (l) =>
        l.sku === item.sku &&
        l.quantidade === Number(item.quantidade) &&
        (l.pedido ?? null) === item.pedido &&
        (l.notaFiscal ?? null) === item.notaFiscal &&
        (l.op ?? null) === item.op,
    );
    return {
      id: item.id,
      sku: item.sku,
      quantidade: Number(item.quantidade),
      descricao: item.descricao,
      obs: obsDoItem(arquivoNome, solicitante, linha ?? { sku: item.sku, quantidade: Number(item.quantidade) }),
    };
  });

  return processarBaixa(criado.id, persistidos, guarda);
}

// Retoma um import interrompido (pausa de segurança/bloqueio do Omie): baixa
// SÓ os itens que ainda estão pendentes — os já baixados nem são reenviados.
export async function continuarBaixa(importId: string): Promise<ResultadoExecucao> {
  const vazio: ResultadoExecucao = {
    ok: false,
    itens: [],
    interrompido: false,
    bloqueado: false,
    totais: { baixados: 0, falhas: 0, naoBaixados: 0 },
  };

  const guarda = await guardarBaixas();
  if ("erro" in guarda) {
    return { ...vazio, erro: guarda.erro };
  }

  const importacao = await prisma.baixaImport.findUnique({
    where: { id: String(importId) },
    include: { itens: { where: { status: "PENDENTE" } } },
  });
  if (!importacao) {
    return { ...vazio, erro: "Importação não encontrada." };
  }
  if (importacao.itens.length === 0) {
    return { ...vazio, erro: "Não há itens pendentes nesta importação." };
  }

  const persistidos: ItemPersistido[] = importacao.itens.map((item) => ({
    id: item.id,
    sku: item.sku,
    quantidade: Number(item.quantidade),
    descricao: item.descricao,
    obs: obsDoItem(importacao.arquivoNome, importacao.solicitante, {
      sku: item.sku,
      quantidade: Number(item.quantidade),
      pedido: item.pedido ?? undefined,
      notaFiscal: item.notaFiscal ?? undefined,
      op: item.op ?? undefined,
    }),
  }));

  return processarBaixa(importacao.id, persistidos, guarda);
}
