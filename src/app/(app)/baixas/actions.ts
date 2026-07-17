"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import type { ItemConsumo } from "@/lib/baixas/consumo";
import { conferirBaixaSchema, executarBaixaSchema, type BaixaLinha, type Role } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import {
  LOCAL_PADRAO,
  baixarEstoque,
  buscarProdutosPorCodigo,
  buscarProdutosPorDescricao,
  dataOmieHoje,
  lotesPorCodigo,
  nomeDoLocal,
  reverterBaixa,
  saldoTotalPorCodigo,
  saldosPorCodigo,
  type AlocacaoLote,
  type ItemBaixa,
  type ItemReversao,
  type LoteDisponivel,
  type ProdutoEstoque,
  type ProdutoResumo,
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

// --- Digitar na tela (sem planilha): busca de produto, saldo e histórico -------

export interface ResultadoBuscaProdutoBaixa {
  ok: boolean;
  erro?: string;
  produtos: ProdutoResumo[];
}

// Busca de produto pra lançar a baixa direto na tela (mesma busca da requisição,
// mas com a permissão de Baixas). Descrição do Omie + código; ignora inativos.
export async function buscarProdutosBaixa(termo: string): Promise<ResultadoBuscaProdutoBaixa> {
  const guarda = await guardarBaixas();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, produtos: [] };
  const q = String(termo ?? "").trim();
  if (q.length < 2) return { ok: true, produtos: [] };
  try {
    return { ok: true, produtos: await buscarProdutosPorDescricao(q, chamar) };
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), produtos: [] };
  }
}

// Saldo total (todos os locais) do produto escolhido — mostrado ao lado.
export async function saldoProdutoBaixa(sku: string): Promise<{ ok: boolean; saldo?: number }> {
  const guarda = await guardarBaixas();
  if ("erro" in guarda) return { ok: false };
  const codigo = String(sku ?? "").trim();
  if (!codigo) return { ok: false };
  try {
    const saldo = (await saldoTotalPorCodigo([codigo], dataOmieHoje(), chamar)).get(codigo);
    return saldo === undefined ? { ok: false } : { ok: true, saldo };
  } catch {
    return { ok: false };
  }
}

export interface HistoricoBaixaItem {
  sku: string;
  descricao: string;
  quantidade: number;
  pedido?: string;
  notaFiscal?: string;
  op?: string;
  observacao?: string;
}

// Histórico pra reusar lançamentos: os últimos itens que DERAM baixa, um por SKU
// (o mais recente), pra a pessoa marcar os que quer repetir sem digitar de novo.
export async function historicoBaixaItens(): Promise<HistoricoBaixaItem[]> {
  const guarda = await guardarBaixas();
  if ("erro" in guarda) return [];
  const itens = await prisma.baixaItem.findMany({
    where: { status: "BAIXADO" },
    orderBy: { baixadoEm: "desc" },
    take: 400,
    select: {
      sku: true,
      descricao: true,
      quantidade: true,
      pedido: true,
      notaFiscal: true,
      op: true,
      observacao: true,
    },
  });
  const vistos = new Set<string>();
  const saida: HistoricoBaixaItem[] = [];
  for (const item of itens) {
    if (vistos.has(item.sku)) continue;
    vistos.add(item.sku);
    saida.push({
      sku: item.sku,
      descricao: item.descricao ?? "",
      quantidade: Number(item.quantidade),
      pedido: item.pedido ?? undefined,
      notaFiscal: item.notaFiscal ?? undefined,
      op: item.op ?? undefined,
      observacao: item.observacao ?? undefined,
    });
    if (saida.length >= 50) break;
  }
  return saida;
}


export interface ConferenciaItem {
  sku: string;
  quantidade: number;
  descricao?: string;
  saldo?: number;
  ok: boolean;
  motivo?: string;
  // Estoque mínimo do Omie e se a baixa deixa o produto ABAIXO dele (mostrado só
  // para gestor). 0/ausente = sem mínimo definido.
  estoqueMinimo?: number;
  abaixoDoMinimo?: boolean;
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
    const dados = saldos.get(item.sku);
    const saldo = dados?.saldo ?? 0;
    const estoqueMinimo = dados?.estoqueMinimo ?? 0;
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
    const restante = disponivel - item.quantidade;
    return {
      sku: item.sku,
      quantidade: item.quantidade,
      descricao: produto.descricao,
      saldo,
      ok: true,
      estoqueMinimo,
      abaixoDoMinimo: estoqueMinimo > 0 && restante < estoqueMinimo,
    };
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
  const { itens, localCodigo } = parsed.data;

  try {
    const skus = itens.map((item) => item.sku);
    const produtos = await buscarProdutosPorCodigo(skus, chamar);
    const saldos = await saldosPorCodigo(skus, dataOmieHoje(), chamar, localCodigo ?? LOCAL_PADRAO);
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
  // A finalidade/observação livre vai NA FRENTE (é o que o pessoal quer ver como
  // motivo do consumo no Omie); o rastro (arquivo, solicitante, pedido/NF/OP)
  // segue atrás.
  const partes: string[] = [];
  if (item.observacao) partes.push(item.observacao);
  partes.push(`Baixa: ${arquivoNome}`, `solicitante: ${item.solicitante ?? solicitante}`);
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

// Um BaixaItem do banco já carrega tudo que a observação precisa (pedido, NF,
// OP) — mesma derivação para o import novo e para a retomada.
interface BaixaItemDb {
  id: string;
  sku: string;
  quantidade: unknown; // Prisma Decimal
  descricao: string | null;
  pedido: string | null;
  notaFiscal: string | null;
  op: string | null;
  observacao: string | null;
}

function itemPersistidoDe(arquivoNome: string, solicitante: string, item: BaixaItemDb): ItemPersistido {
  return {
    id: item.id,
    sku: item.sku,
    quantidade: Number(item.quantidade),
    descricao: item.descricao,
    obs: obsDoItem(arquivoNome, solicitante, {
      sku: item.sku,
      quantidade: Number(item.quantidade),
      pedido: item.pedido ?? undefined,
      notaFiscal: item.notaFiscal ?? undefined,
      op: item.op ?? undefined,
      observacao: item.observacao ?? undefined,
    }),
  };
}

// Núcleo compartilhado entre executar (import novo) e continuar (import
// interrompido): baixa os itens no Omie e reflete o resultado no banco.
// `produtosPrecarregados` evita repetir o ListarProdutos quando o caller
// acabou de resolver os códigos (executarBaixa).
async function processarBaixa(
  importId: string,
  itens: ItemPersistido[],
  actor: Guarda,
  codigoLocal: string,
  produtosPrecarregados?: Map<string, ProdutoEstoque>,
): Promise<ResultadoExecucao> {
  let produtos: Map<string, ProdutoEstoque>;
  let saldos: Map<string, SaldoEstoque>;
  let lotes: Map<string, LoteDisponivel[]>;
  try {
    const skus = itens.map((item) => item.sku);
    produtos = produtosPrecarregados ?? (await buscarProdutosPorCodigo(skus, chamar));
    saldos = await saldosPorCodigo(skus, dataOmieHoje(), chamar, codigoLocal);
    // Lotes só dos produtos com controle de lote (uma leitura por produto).
    lotes = await lotesPorCodigo(produtos, skus, chamar, codigoLocal);
  } catch (erro) {
    // O import fica ENVIANDO com os itens PENDENTE — o "Continuar baixa" da
    // tela retoma daqui (o importId volta mesmo com ok:false).
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

  const resultado = await baixarEstoque(
    itensBaixa,
    { data: dataOmieHoje(), produtos, saldos, lotes, codigoLocal },
    chamar,
  );

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
        data: {
          status: "BAIXADO",
          motivoErro: null,
          omieRef: item.omieRef,
          baixadoEm: agora,
          // Guarda o custo e os lotes SÓ na baixa nova (ja_baixado já tem do
          // envio anterior) — base do relatório de consumo e do estorno.
          ...(item.custoUnitario !== undefined ? { custoUnitario: item.custoUnitario } : {}),
          ...(item.lotes ? { loteConsumido: item.lotes as unknown as Prisma.InputJsonValue } : {}),
        },
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

  // Status do import pelo estado REAL de TODOS os itens no banco (uma retomada
  // sem falhas não pode "esconder" falhas de uma rodada anterior).
  const [pendentesNoBanco, falhasNoBanco] = await Promise.all([
    prisma.baixaItem.count({ where: { importId, status: "PENDENTE" } }),
    prisma.baixaItem.count({ where: { importId, status: "FALHA" } }),
  ]);
  const statusImport = pendentesNoBanco > 0 ? "ENVIANDO" : falhasNoBanco > 0 ? "FALHA" : "CONCLUIDO";
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
  const localCodigo = parsed.data.localCodigo ?? LOCAL_PADRAO;

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
      localEstoqueCodigo: localCodigo,
      localEstoqueNome: await nomeDoLocal(localCodigo, chamar),
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
          observacao: item.observacao,
          omieIdProd: produtos.get(item.sku)?.idProd,
        })),
      },
    },
    include: { itens: true },
  });

  const persistidos = criado.itens.map((item) => itemPersistidoDe(arquivoNome, solicitante, item));

  return processarBaixa(criado.id, persistidos, guarda, localCodigo, produtos);
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

  const persistidos = importacao.itens.map((item) =>
    itemPersistidoDe(importacao.arquivoNome, importacao.solicitante, item),
  );

  // Retoma no MESMO local da execução original.
  return processarBaixa(importacao.id, persistidos, guarda, importacao.localEstoqueCodigo ?? LOCAL_PADRAO);
}

// --- Relatório de consumo (R$) — gestor --------------------------------------

const consumoSchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const PAPEIS_RELATORIO: readonly Role[] = ["ADMIN", "GESTOR", "FABRICA_GESTOR"];

export interface DadosConsumo {
  ok: boolean;
  erro?: string;
  itens: ItemConsumo[];
}

// Itens BAIXADOS e NÃO estornados no período, com o valor (custo médio × qtd)
// pra o relatório de consumo. Só gestor/admin (é dado financeiro). O agrupamento
// e o PDF acontecem no cliente (consumo.ts/consumoPdf.ts).
export async function relatorioConsumo(input: unknown): Promise<DadosConsumo> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, erro: "Sessão expirada. Entre novamente.", itens: [] };
  }
  if (!PAPEIS_RELATORIO.includes(session.user.role)) {
    return { ok: false, erro: "Apenas Gestor ou Administrador gera o relatório de consumo.", itens: [] };
  }
  const parsed = consumoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Período inválido.", itens: [] };
  }
  const { de, ate } = parsed.data;
  const inicio = new Date(`${de}T00:00:00-03:00`);
  const fim = new Date(`${ate}T23:59:59.999-03:00`);
  if (!(inicio <= fim)) {
    return { ok: false, erro: "A data inicial precisa ser antes da final.", itens: [] };
  }

  const registros = await prisma.baixaItem.findMany({
    where: { status: "BAIXADO", estornadoEm: null, baixadoEm: { gte: inicio, lte: fim } },
    select: { sku: true, descricao: true, quantidade: true, custoUnitario: true, op: true, observacao: true },
    orderBy: { baixadoEm: "asc" },
    take: 5000,
  });

  const itens: ItemConsumo[] = registros.map((registro) => {
    const quantidade = Number(registro.quantidade);
    const custo = registro.custoUnitario != null ? Number(registro.custoUnitario) : 0;
    return {
      sku: registro.sku,
      descricao: registro.descricao ?? registro.sku,
      quantidade,
      valor: custo * quantidade,
      op: registro.op,
      finalidade: registro.observacao,
    };
  });
  return { ok: true, itens };
}

// --- Estorno (reverter uma baixa) --------------------------------------------

// Lê o loteConsumido (Json do banco) de volta para a alocação de lote.
function parseLotes(valor: unknown): AlocacaoLote[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  const saida: AlocacaoLote[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") continue;
    const registro = item as Record<string, unknown>;
    const nIdLote = registro.nIdLote != null ? String(registro.nIdLote) : "";
    const quantidade = Number(registro.quantidade);
    if (nIdLote && Number.isFinite(quantidade)) saida.push({ nIdLote, quantidade });
  }
  return saida.length > 0 ? saida : undefined;
}

export interface ResultadoEstorno {
  ok: boolean;
  erro?: string;
  mensagem?: string;
  estornados: number;
  falhas: number;
}

// Estorna uma baixa: lança a ENTRADA compensatória no Omie de cada item baixado
// (nos MESMOS lotes), devolvendo o estoque. Não apaga nada — marca `estornadoEm`
// e registra o movimento. Idempotente (cod_int `est-<item>`): reestornar não
// devolve duas vezes.
export async function estornarBaixa(importId: string): Promise<ResultadoEstorno> {
  const guarda = await guardarBaixas();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, estornados: 0, falhas: 0 };
  const alvo = String(importId ?? "").trim();
  if (!alvo) return { ok: false, erro: "Baixa inválida.", estornados: 0, falhas: 0 };

  const importacao = await prisma.baixaImport.findUnique({
    where: { id: alvo },
    include: { itens: { where: { status: "BAIXADO", estornadoEm: null } } },
  });
  if (!importacao) return { ok: false, erro: "Baixa não encontrada.", estornados: 0, falhas: 0 };
  if (importacao.itens.length === 0) {
    return { ok: false, erro: "Nada para estornar (baixa já estornada ou sem itens baixados).", estornados: 0, falhas: 0 };
  }

  const itensReversao: ItemReversao[] = importacao.itens
    .filter((item) => item.omieIdProd)
    .map((item) => ({
      chave: item.id,
      sku: item.sku,
      idProd: String(item.omieIdProd),
      quantidade: Number(item.quantidade),
      custoUnitario: item.custoUnitario != null ? Number(item.custoUnitario) : 0,
      lotes: parseLotes(item.loteConsumido),
      obs: `Estorno da baixa ${importacao.arquivoNome} - ${item.sku}`,
    }));
  if (itensReversao.length === 0) {
    return { ok: false, erro: "Itens sem id do Omie — não dá para estornar automaticamente.", estornados: 0, falhas: 0 };
  }

  let resultado: Awaited<ReturnType<typeof reverterBaixa>>;
  try {
    resultado = await reverterBaixa(
      itensReversao,
      dataOmieHoje(),
      chamar,
      importacao.localEstoqueCodigo ?? LOCAL_PADRAO,
    );
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), estornados: 0, falhas: 0 };
  }

  const agora = new Date();
  for (const item of resultado.itens) {
    if (item.outcome !== "estornado" && item.outcome !== "ja_estornado") continue;
    await prisma.baixaItem.update({
      where: { id: item.chave },
      data: { estornadoEm: agora, estornoRef: item.omieRef },
    });
    const original = importacao.itens.find((i) => i.id === item.chave);
    if (item.outcome === "estornado" && original) {
      await prisma.movimentoEstoque.create({
        data: {
          tipo: "ENTRADA",
          sku: item.sku,
          quantidade: original.quantidade,
          omieRef: item.omieRef,
          baixaItemId: item.chave,
        },
      });
    }
  }

  const estornados = resultado.itens.filter((i) => i.outcome === "estornado" || i.outcome === "ja_estornado").length;
  const falhas = resultado.itens.filter((i) => i.outcome === "falha").length;

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "baixa.estornar",
    entity: "BaixaImport",
    entityId: alvo,
    summary: `Estorno da baixa ${importacao.arquivoNome}: ${estornados} estornado(s), ${falhas} falha(s).`,
    after: { estornados, falhas, interrompido: resultado.interrompido },
    req: await requestHeaders(),
  });

  revalidatePath("/baixas");
  if (resultado.interrompido) {
    return { ok: false, erro: resultado.motivoInterrupcao ?? "Estorno interrompido.", estornados, falhas };
  }
  return {
    ok: true,
    estornados,
    falhas,
    mensagem: `Estorno concluído: ${estornados} item(ns) devolvido(s) ao estoque${falhas > 0 ? `, ${falhas} com falha` : ""}.`,
  };
}
