"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  conferirOpSchema,
  continuarMovimentoSchema,
  executarMovimentoSchema,
  type ConferirOpInput,
  type ContinuarMovimentoInput,
  type ExecutarMovimentoInput,
} from "@/lib/contracts";
import { prisma } from "@/lib/db";
import {
  LOCAL_PADRAO,
  dataOmieHoje,
  lotesPorCodigo,
  nomeDoLocal,
  saldosPorCodigo,
  type LoteDisponivel,
  type ProdutoEstoque,
  type SaldoEstoque,
} from "@/lib/estoque/omieEstoque";
import {
  acharOrdem,
  agregarItens,
  buscarProdutosPorId,
  listarOrdensProducao,
  transferirEstoque,
  type GrupoItem,
  type ItemTransferencia,
  type OrdemProducao,
  type ProdutoOp,
} from "@/lib/estoque/omieOp";
import { chamar } from "@/lib/omie";
import { OmieBlocked } from "@/lib/omie/errors";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewMovimentacoes } from "@/lib/rbac";
import { requestHeaders } from "@/lib/request";

interface Guarda {
  userId: string;
  email: string;
}

async function guardar(): Promise<Guarda | { erro: string }> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return { erro: "Sessão expirada. Entre novamente." };
  }
  const permissions = await getRolePermissionsMap();
  if (!canViewMovimentacoes(session.user.role, permissions)) {
    return { erro: "Você não tem permissão para movimentar estoque." };
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

function numeroDecimal(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

// -----------------------------------------------------------------------------
// Conferência (leitura): OP → itens → saldo na origem
// -----------------------------------------------------------------------------

export interface AlternativaLegado {
  codigoLegado: string;
  descricaoLegado: string;
  saldo: number;
}

export interface LinhaConferida {
  idProd: string;
  sku: string;
  descricao: string;
  unidade?: string;
  familia?: string;
  grupo: GrupoItem;
  quantidade: number;
  saldoOrigem: number;
  cmc: number;
  suficiente: boolean;
  /** O saldo está no código antigo, segundo o De/Para confirmado. */
  alternativa?: AlternativaLegado;
  aviso?: string;
}

export interface OrdemResumo {
  numero: string;
  produtoCodigo: string;
  produtoDescricao: string;
  quantidade: number;
  dataPrevisao?: string;
  concluida: boolean;
  totalItensOmie: number;
}

export interface ResultadoConferenciaOp {
  ok: boolean;
  erro?: string;
  /** Mais de uma OP casou com o número digitado (faltou o ano). */
  ambiguas?: string[];
  ordem?: OrdemResumo;
  linhas: LinhaConferida[];
}

const VAZIO: LinhaConferida[] = [];

/**
 * Resolve a OP e monta as linhas com saldo na origem, SEM escrever nada.
 *
 * Ordem das leituras (todas em lote, para não gastar orçamento de ban): a lista
 * de OPs, os produtos por id, o saldo dos SKUs na origem e — só quando algum
 * item ficou sem saldo — o saldo dos códigos antigos equivalentes, para poder
 * dizer onde o material está de verdade em vez de só "saldo 0".
 */
export async function conferirOp(input: ConferirOpInput): Promise<ResultadoConferenciaOp> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, linhas: VAZIO };

  const parsed = conferirOpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Informe o número da OP e o local de origem.", linhas: VAZIO };
  }
  const { numeroOp, origemCodigo, recarregar } = parsed.data;

  let ordens: OrdemProducao[];
  try {
    ordens = await listarOrdensProducao(chamar, { revalidar: recarregar });
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), linhas: VAZIO };
  }

  const { ordem, ambiguas } = acharOrdem(numeroOp, ordens);
  if (ambiguas) {
    return {
      ok: false,
      erro: "Mais de uma OP com esse número. Informe o ano (ex.: 2026/802).",
      ambiguas: ambiguas.map((o) => o.numero),
      linhas: VAZIO,
    };
  }
  if (!ordem) {
    return {
      ok: false,
      erro: `Não encontrei a OP ${numeroOp} no Omie. Confira o número (as ordens ficam em Produção → Ordens de Produção).`,
      linhas: VAZIO,
    };
  }

  const itens = agregarItens(ordem.itens);
  const ids = [ordem.idProduto, ...itens.map((i) => i.idProd)].filter(Boolean);

  let produtos: Map<string, ProdutoOp>;
  try {
    produtos = await buscarProdutosPorId(ids, chamar);
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), linhas: VAZIO };
  }

  const skus = itens.map((item) => produtos.get(item.idProd)?.codigo).filter((c): c is string => Boolean(c));

  let saldos: Map<string, SaldoEstoque>;
  try {
    saldos = await saldosPorCodigo(skus, dataOmieHoje(), chamar, origemCodigo);
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), linhas: VAZIO };
  }

  const linhas: LinhaConferida[] = itens.map((item) => {
    const produto = produtos.get(item.idProd);
    if (!produto) {
      return {
        idProd: item.idProd,
        sku: `#${item.idProd}`,
        descricao: "Produto não encontrado no Omie",
        grupo: "OUTRO" as GrupoItem,
        quantidade: item.quantidade,
        saldoOrigem: 0,
        cmc: 0,
        suficiente: false,
        aviso: "A OP aponta um id de produto que não voltou na consulta. Confira o cadastro no Omie.",
      };
    }
    const saldo = saldos.get(produto.codigo);
    const disponivel = saldo?.saldo ?? 0;
    return {
      idProd: item.idProd,
      sku: produto.codigo,
      descricao: produto.descricao,
      unidade: produto.unidade,
      familia: produto.familia,
      grupo: produto.grupo,
      quantidade: item.quantidade,
      saldoOrigem: disponivel,
      cmc: saldo?.cmc ?? 0,
      suficiente: disponivel >= item.quantidade,
    };
  });

  await anexarAlternativas(linhas, origemCodigo);

  const produtoOp = produtos.get(ordem.idProduto);
  return {
    ok: true,
    ordem: {
      numero: ordem.numero,
      produtoCodigo: produtoOp?.codigo ?? "",
      produtoDescricao: produtoOp?.descricao ?? "",
      quantidade: ordem.quantidade,
      dataPrevisao: ordem.dataPrevisao,
      concluida: ordem.concluida,
      totalItensOmie: ordem.itens.length,
    },
    linhas,
  };
}

/**
 * Para as linhas SEM saldo, procura no De/Para confirmado qual código antigo
 * corresponde e quanto ele tem na origem.
 *
 * É o que transforma "saldo 0, não dá para mover" em "o material está no
 * PRD00620, com 240 na origem". Só roda quando existe linha sem saldo, e só
 * consulta os legados que o De/Para já ligou — nada é adivinhado aqui.
 */
async function anexarAlternativas(linhas: LinhaConferida[], origemCodigo: string): Promise<void> {
  const semSaldo = linhas.filter((linha) => !linha.suficiente && linha.sku && !linha.sku.startsWith("#"));
  if (semSaldo.length === 0) return;

  const mapeamentos = await prisma.deParaProduto.findMany({
    where: { codigoNovo: { in: semSaldo.map((l) => l.sku) } },
    select: { codigoLegado: true, descricaoLegado: true, codigoNovo: true },
  });
  if (mapeamentos.length === 0) return;

  let saldosLegado: Map<string, SaldoEstoque>;
  try {
    saldosLegado = await saldosPorCodigo(
      mapeamentos.map((m) => m.codigoLegado),
      dataOmieHoje(),
      chamar,
      origemCodigo,
    );
  } catch {
    // Best-effort: sem o saldo do legado a linha continua aparecendo como sem
    // saldo, que é a verdade do código novo. Não é motivo para derrubar a tela.
    return;
  }

  const porNovo = new Map<string, AlternativaLegado>();
  for (const m of mapeamentos) {
    if (!m.codigoNovo) continue;
    const saldo = saldosLegado.get(m.codigoLegado)?.saldo ?? 0;
    const atual = porNovo.get(m.codigoNovo);
    if (!atual || saldo > atual.saldo) {
      porNovo.set(m.codigoNovo, {
        codigoLegado: m.codigoLegado,
        descricaoLegado: m.descricaoLegado,
        saldo,
      });
    }
  }

  for (const linha of semSaldo) {
    const alternativa = porNovo.get(linha.sku);
    if (alternativa && alternativa.saldo > 0) linha.alternativa = alternativa;
  }
}

// -----------------------------------------------------------------------------
// Execução (escrita): transferência item a item
// -----------------------------------------------------------------------------

export interface ItemExecutado {
  sku: string;
  descricao?: string;
  quantidade: number;
  unidade?: string;
  outcome: string;
  motivo?: string;
}

export interface ResultadoExecucaoMovimento {
  ok: boolean;
  erro?: string;
  movimentoId?: string;
  status?: string;
  itens: ItemExecutado[];
  interrompido?: boolean;
  bloqueado?: boolean;
  motivoInterrupcao?: string;
  /** Itens que saíram da origem e NÃO entraram no destino. */
  pendentes?: number;
}

const STATUS_POR_OUTCOME: Record<string, string> = {
  transferido: "TRANSFERIDO",
  ja_transferido: "TRANSFERIDO",
  entrada_pendente: "SAIDA_OK",
  falha: "FALHA",
  nao_transferido: "PENDENTE",
};

export async function executarMovimento(
  input: ExecutarMovimentoInput,
): Promise<ResultadoExecucaoMovimento> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, itens: [] };

  const parsed = executarMovimentoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      erro: parsed.error.issues[0]?.message ?? "Dados inválidos para a movimentação.",
      itens: [],
    };
  }
  const { numeroOp, origemCodigo, destinoCodigo, itens } = parsed.data;

  const [origemNome, destinoNome] = await Promise.all([
    nomeDoLocal(origemCodigo, chamar),
    nomeDoLocal(destinoCodigo, chamar),
  ]);

  const movimento = await prisma.movimentoOp.create({
    data: {
      autorId: guarda.userId,
      numeroOp,
      origemCodigo,
      origemNome,
      destinoCodigo,
      destinoNome,
      totalItens: itens.length,
      itens: {
        create: itens.map((item) => ({
          sku: item.sku,
          descricao: item.descricao,
          unidade: item.unidade,
          familia: item.familia,
          grupo: item.grupo,
          quantidade: item.quantidade,
          omieIdProd: item.idProd,
        })),
      },
    },
    include: { itens: true },
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "movimentacao.executar",
    entity: "MovimentoOp",
    entityId: movimento.id,
    summary:
      `Transferência da OP ${numeroOp}: ${itens.length} item(ns) de "${origemNome ?? origemCodigo}" ` +
      `para "${destinoNome ?? destinoCodigo}".`,
    after: { numeroOp, origemCodigo, destinoCodigo, itens: itens.length },
    omieTarget: process.env.OMIE_APP_KEY ? "omie" : null,
    req: await requestHeaders(),
  });

  return rodarTransferencia(movimento.id);
}

/**
 * Retoma um movimento com item pendente. Os locais e as quantidades vêm do
 * BANCO, nunca da tela: retomar com outra origem devolveria o material no lugar
 * errado, e o item pendente já teve sua saída lançada no local original.
 */
export async function continuarMovimento(
  input: ContinuarMovimentoInput,
): Promise<ResultadoExecucaoMovimento> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, itens: [] };

  const parsed = continuarMovimentoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: "Movimentação inválida.", itens: [] };

  const movimento = await prisma.movimentoOp.findUnique({
    where: { id: parsed.data.movimentoId },
    select: { id: true, numeroOp: true },
  });
  if (!movimento) return { ok: false, erro: "Movimentação não encontrada.", itens: [] };

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "movimentacao.continuar",
    entity: "MovimentoOp",
    entityId: movimento.id,
    summary: `Retomada da transferência da OP ${movimento.numeroOp}.`,
    omieTarget: process.env.OMIE_APP_KEY ? "omie" : null,
    req: await requestHeaders(),
  });

  return rodarTransferencia(movimento.id);
}

async function rodarTransferencia(movimentoId: string): Promise<ResultadoExecucaoMovimento> {
  const movimento = await prisma.movimentoOp.findUnique({
    where: { id: movimentoId },
    include: { itens: true },
  });
  if (!movimento) return { ok: false, erro: "Movimentação não encontrada.", itens: [] };

  // Só o que ainda não terminou. `SAIDA_OK` entra com `saidaFeita` para receber
  // apenas a perna de entrada.
  const pendentes = movimento.itens.filter((item) => item.status !== "TRANSFERIDO");
  if (pendentes.length === 0) {
    return {
      ok: true,
      movimentoId: movimento.id,
      status: movimento.status,
      itens: movimento.itens.map(paraItemExecutado),
      pendentes: 0,
    };
  }

  // Contexto de escrita: produtos (para saber quem tem controle de lote), saldo
  // e CMC na ORIGEM, e os lotes disponíveis lá.
  const produtos = new Map<string, ProdutoEstoque>();
  for (const item of pendentes) {
    if (!item.omieIdProd) continue;
    produtos.set(item.sku, { idProd: item.omieIdProd, descricao: item.descricao ?? item.sku });
  }

  let idsPorSku: Map<string, ProdutoOp>;
  try {
    // Relê os produtos pelo id para trazer `controleLote` e a unidade atuais —
    // o cadastro pode ter mudado entre a conferência e a execução.
    const frescos = await buscarProdutosPorId(
      pendentes.map((i) => i.omieIdProd).filter((id): id is string => Boolean(id)),
      chamar,
    );
    idsPorSku = new Map();
    for (const produto of frescos.values()) idsPorSku.set(produto.codigo, produto);
  } catch (erro) {
    return abortarAntesDeEscrever(movimento.id, movimento.status, erro);
  }
  for (const [sku, produto] of idsPorSku) produtos.set(sku, produto);

  const skusParaSaida = pendentes.filter((i) => i.status !== "SAIDA_OK").map((i) => i.sku);

  let saldos: Map<string, SaldoEstoque>;
  let lotes: Map<string, LoteDisponivel[]>;
  try {
    saldos = await saldosPorCodigo(skusParaSaida, dataOmieHoje(), chamar, movimento.origemCodigo);
    lotes = await lotesPorCodigo(produtos, skusParaSaida, chamar, movimento.origemCodigo);
  } catch (erro) {
    return abortarAntesDeEscrever(movimento.id, movimento.status, erro);
  }

  const paraTransferir: ItemTransferencia[] = pendentes.map((item) => ({
    chave: item.id,
    sku: item.sku,
    idProd: item.omieIdProd ?? "",
    quantidade: numeroDecimal(item.quantidade),
    obs: `OP ${movimento.numeroOp} · ${movimento.origemNome ?? movimento.origemCodigo} → ${movimento.destinoNome ?? movimento.destinoCodigo}`,
    saidaFeita: item.status === "SAIDA_OK",
    lotes: Array.isArray(item.loteConsumido)
      ? (item.loteConsumido as unknown as ItemTransferencia["lotes"])
      : undefined,
  }));

  const resultado = await transferirEstoque(
    paraTransferir,
    {
      data: dataOmieHoje(),
      origemCodigo: movimento.origemCodigo || LOCAL_PADRAO,
      destinoCodigo: movimento.destinoCodigo || LOCAL_PADRAO,
      produtos,
      saldos,
      lotes,
    },
    chamar,
  );

  for (const item of resultado.itens) {
    const status = STATUS_POR_OUTCOME[item.outcome] ?? "FALHA";
    await prisma.movimentoOpItem.update({
      where: { id: item.chave },
      data: {
        status,
        motivoErro: item.motivo ?? null,
        refSaida: item.refSaida ?? undefined,
        refEntrada: item.refEntrada ?? undefined,
        custoUnitario: item.custoUnitario ?? undefined,
        loteConsumido: item.lotes ? (item.lotes as unknown as object) : undefined,
        concluidoEm: status === "TRANSFERIDO" ? new Date() : null,
      },
    });

    // Trilha só do que EFETIVOU. Item pendente ou com falha não vira movimento.
    if (status === "TRANSFERIDO" && item.refEntrada) {
      const linha = movimento.itens.find((i) => i.id === item.chave);
      await prisma.movimentoEstoque.create({
        data: {
          tipo: "TRANSFERENCIA",
          sku: item.sku,
          quantidade: numeroDecimal(linha?.quantidade ?? 0),
          omieRef: item.refEntrada,
          movimentoOpItemId: item.chave,
        },
      });
    }
  }

  const finais = await prisma.movimentoOpItem.findMany({
    where: { movimentoId: movimento.id },
    orderBy: { sku: "asc" },
  });
  const qtdPendentes = finais.filter((i) => i.status === "SAIDA_OK").length;
  const status =
    finais.every((i) => i.status === "TRANSFERIDO")
      ? "CONCLUIDO"
      : qtdPendentes > 0
        ? "PENDENTE"
        : finais.some((i) => i.status === "FALHA")
          ? "FALHA"
          : "ENVIANDO";

  await prisma.movimentoOp.update({ where: { id: movimento.id }, data: { status } });
  revalidatePath("/movimentacoes");

  return {
    ok: true,
    movimentoId: movimento.id,
    status,
    itens: finais.map(paraItemExecutado),
    interrompido: resultado.interrompido,
    bloqueado: resultado.bloqueado,
    motivoInterrupcao: resultado.motivoInterrupcao,
    pendentes: qtdPendentes,
  };
}

/**
 * A leitura de contexto falhou ANTES de qualquer escrita no Omie, então nada
 * foi movimentado. O cabeçalho não pode ficar preso em "Em andamento": ele
 * apareceria no histórico como algo em curso que nunca vai terminar. Vira
 * FALHA, com o motivo no item, e a pessoa refaz a OP sem risco (não há perna
 * pendente para conciliar).
 *
 * Uma movimentação que JÁ tem perna pendente (status PENDENTE) mantém o status:
 * ela continua sendo divergência aberta e precisa seguir no aviso do topo.
 */
async function abortarAntesDeEscrever(
  movimentoId: string,
  statusAtual: string,
  erro: unknown,
): Promise<ResultadoExecucaoMovimento> {
  const mensagem = mensagemOmieIndisponivel(erro);
  if (statusAtual !== "PENDENTE") {
    await prisma.movimentoOp.update({ where: { id: movimentoId }, data: { status: "FALHA" } });
    await prisma.movimentoOpItem.updateMany({
      where: { movimentoId, status: { in: ["PENDENTE", "FALHA"] } },
      data: { status: "FALHA", motivoErro: mensagem },
    });
  }
  revalidatePath("/movimentacoes");
  return { ok: false, erro: mensagem, itens: [] };
}

function paraItemExecutado(item: {
  sku: string;
  descricao: string | null;
  unidade: string | null;
  quantidade: unknown;
  status: string;
  motivoErro: string | null;
}): ItemExecutado {
  return {
    sku: item.sku,
    descricao: item.descricao ?? undefined,
    unidade: item.unidade ?? undefined,
    quantidade: numeroDecimal(item.quantidade),
    outcome: item.status,
    motivo: item.motivoErro ?? undefined,
  };
}
