"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  baixarOpSchema,
  buscarSubstitutoSchema,
  conferirOpSchema,
  continuarMovimentoSchema,
  estornarOpSchema,
  executarMovimentoSchema,
  type BaixarOpInput,
  type BuscarSubstitutoInput,
  type ConferirOpInput,
  type ContinuarMovimentoInput,
  type EstornarOpInput,
  type ExecutarMovimentoInput,
} from "@/lib/contracts";
import { prisma } from "@/lib/db";
import {
  anotarUnidades,
  indexarSubstitutos,
  type Substituto,
} from "@/lib/depara/substituto";
import { listarLegadosComSaldo } from "@/lib/depara/legado";
import {
  LOCAL_PADRAO,
  baixarEstoque,
  buscarProdutosPorCodigo,
  buscarProdutosPorDescricao,
  dataOmieHoje,
  lotesPorCodigo,
  nomeDoLocal,
  reverterBaixa,
  saldosPorCodigo,
  type AlocacaoLote,
  type ItemBaixa,
  type ItemReversao,
  type LoteDisponivel,
  type ProdutoEstoque,
  type SaldoEstoque,
} from "@/lib/estoque/omieEstoque";
import {
  acharOrdem,
  agregarItens,
  chaveDaBaixa,
  chaveDaOrdem,
  itemDaChaveDeBaixa,
  buscarProdutosPorId,
  listarOrdensProducao,
  transferirEstoque,
  type GrupoItem,
  type ItemTransferencia,
  type OrdemProducao,
  type ProdutoOp,
} from "@/lib/estoque/omieOp";
import { chamar } from "@/lib/omie";
import { listarCatalogoMat } from "@/lib/produtos/catalogoMat";
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
  /**
   * Cadastros ANTIGOS que seguram o saldo deste item, quando o código novo está
   * sem. A pessoa escolhe na tela qual mover; nenhum vem selecionado sozinho.
   */
  substitutos?: Substituto[];
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

  await anexarSubstitutos(linhas, origemCodigo);

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
 * Para as linhas SEM saldo, descobre qual cadastro ANTIGO segura o material.
 *
 * É o que transforma "saldo 0, não dá para mover" em "o PRD00620 tem 240 na
 * origem, quer mover ele?". Duas fontes, e a tela mostra a diferença: o De/Para
 * já confirmado por gente, e o casamento automático por geometria e liga para
 * quem ainda não foi revisado.
 *
 * Só roda quando existe linha sem saldo, e as leituras extras (posição do local
 * e catálogo MAT) são em lote e cacheadas. Best-effort: se qualquer uma falhar,
 * a linha continua aparecendo como sem saldo, que é a verdade do código novo, e
 * a tela não cai por causa disso.
 */
async function anexarSubstitutos(linhas: LinhaConferida[], origemCodigo: string): Promise<void> {
  const semSaldo = linhas.filter((linha) => !linha.suficiente && !linha.sku.startsWith("#"));
  if (semSaldo.length === 0) return;

  try {
    const [catalogo, legados, pares] = await Promise.all([
      listarCatalogoMat(chamar),
      listarLegadosComSaldo(origemCodigo, dataOmieHoje(), chamar),
      prisma.deParaProduto.findMany({
        where: { codigoNovo: { not: null } },
        select: {
          codigoLegado: true,
          codigoNovo: true,
          unidadeLegado: true,
          fatorConversao: true,
          aposentadoEm: true,
        },
      }),
    ]);

    // Código APOSENTADO não pode ser oferecido como substituto: ele foi tirado
    // de circulação de propósito (o saldo dele já foi para o código novo, e o
    // cadastro pode até estar inativo no Omie). Oferecer seria mandar a fábrica
    // buscar material num lugar que a empresa acabou de fechar.
    const aposentados = new Set(pares.filter((p) => p.aposentadoEm).map((p) => p.codigoLegado));
    const confirmados = pares.flatMap((p) =>
      p.codigoNovo && !p.aposentadoEm
        ? [
            {
              codigoLegado: p.codigoLegado,
              codigoNovo: p.codigoNovo,
              unidadeLegado: p.unidadeLegado,
              fatorConversao: p.fatorConversao === null ? null : Number(p.fatorConversao),
            },
          ]
        : [],
    );

    const indice = indexarSubstitutos(
      legados.filter((l) => !aposentados.has(l.codigo)),
      catalogo,
      confirmados,
    );

    // `listarLegadosComSaldo` já devolve só cadastro ATIVO e com a unidade
    // lida, que é o que permite avisar "a OP pede KG e este está em M²" — e,
    // quando o par tem fator gravado, já converter a quantidade em vez de
    // deixá-la em branco para alguém digitar.
    for (const linha of semSaldo) {
      const achados = indice.get(linha.sku);
      if (!achados || achados.length === 0) continue;
      linha.substitutos = anotarUnidades(achados, linha.unidade, linha.quantidade);
    }
  } catch {
    // Ver o comentário acima: sem substituto a tela continua correta, só menos
    // prestativa. Derrubar a conferência por causa disso seria pior.
  }
}

export interface ResultadoBuscaSubstituto {
  ok: boolean;
  erro?: string;
  substitutos: Substituto[];
}

/**
 * Busca livre de substituto: a pessoa digita o código ou parte da descrição e a
 * tela mostra o que existe, com o saldo NA ORIGEM.
 *
 * O seletor de candidatos deduzidos resolve o caso comum e falha exatamente
 * onde dói: quando o casamento por geometria não achou nada (a descrição antiga
 * não se lê como chapa/tubo), quando o cadastro está num local que não entrou na
 * varredura, ou quando quem está na tela simplesmente SABE de qual código o
 * material tem que sair. Nesses casos a lista pronta não tem o item e não havia
 * como digitar.
 *
 * O resultado carrega os mesmos avisos do caminho automático: origem da
 * ligação, mudança de unidade e conversão pelo fator do De/Para quando existe.
 * Buscar na mão não pode ser um atalho que pula as conferências.
 */
export async function buscarSubstituto(
  input: BuscarSubstitutoInput,
): Promise<ResultadoBuscaSubstituto> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, substitutos: [] };

  const parsed = buscarSubstitutoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Digite pelo menos 2 caracteres do código ou da descrição.", substitutos: [] };
  }
  const { termo, origemCodigo, skuDaOp, quantidadePedida } = parsed.data;

  let achados: Awaited<ReturnType<typeof buscarProdutosPorDescricao>>;
  try {
    achados = await buscarProdutosPorDescricao(termo, chamar, 20);
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), substitutos: [] };
  }

  const candidatos = achados.filter((a) => a.codigo !== skuDaOp);
  if (candidatos.length === 0) return { ok: true, substitutos: [] };

  const codigos = candidatos.map((c) => c.codigo);
  let produtos: Map<string, ProdutoEstoque>;
  let saldos: Map<string, SaldoEstoque>;
  try {
    produtos = await buscarProdutosPorCodigo([...codigos, skuDaOp], chamar);
    saldos = await saldosPorCodigo(codigos, dataOmieHoje(), chamar, origemCodigo);
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), substitutos: [] };
  }

  const pares = await prisma.deParaProduto.findMany({
    where: { codigoLegado: { in: codigos } },
    select: { codigoLegado: true, codigoNovo: true, fatorConversao: true, aposentadoEm: true },
  });
  const porLegado = new Map(pares.map((p) => [p.codigoLegado, p]));

  const unidadeDaOp = produtos.get(skuDaOp)?.unidade;

  const substitutos: Substituto[] = [];
  for (const candidato of candidatos) {
    const par = porLegado.get(candidato.codigo);
    // Aposentado não volta pela busca: fechar o cadastro e continuar oferecendo
    // ele numa caixinha de texto seria fechar só pela metade.
    if (par?.aposentadoEm) continue;
    const produto = produtos.get(candidato.codigo);
    if (!produto) continue;

    const confirmadoPraEste = par?.codigoNovo === skuDaOp;
    substitutos.push({
      codigo: candidato.codigo,
      idProd: produto.idProd,
      descricao: candidato.descricao,
      unidade: candidato.unidade ?? produto.unidade,
      saldo: saldos.get(candidato.codigo)?.saldo ?? 0,
      origem: confirmadoPraEste ? "confirmado" : "busca",
      unidadeMuda: false,
      ...(confirmadoPraEste && par?.fatorConversao
        ? { fatorConversao: Number(par.fatorConversao) }
        : {}),
      avisos: confirmadoPraEste
        ? []
        : [
            par?.codigoNovo
              ? `Atenção: no De/Para este código está ligado a ${par.codigoNovo}, não a ${skuDaOp}.`
              : "Escolhido na mão: ninguém ligou este código ao que a OP pede. Confira o material antes de mover.",
          ],
    });
  }

  // Quem tem material aparece primeiro; quem já está ligado ao código da OP
  // ganha do resto. Saldo zero fica na lista de propósito, para a pessoa ver
  // que achou o cadastro certo e ele está vazio.
  substitutos.sort((a, b) => {
    if (a.origem !== b.origem) return a.origem === "confirmado" ? -1 : 1;
    return b.saldo - a.saldo;
  });

  return { ok: true, substitutos: anotarUnidades(substitutos, unidadeDaOp, quantidadePedida) };
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
          substituiSku: item.substituiSku,
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

// -----------------------------------------------------------------------------
// Consumo: a baixa do que já está reservado para a OP, e o estorno
// -----------------------------------------------------------------------------
//
// Reservar e consumir são dois passos do MESMO item, não dois registros: o que
// se baixa é exatamente o que foi reservado. Por isso a baixa mora no
// `MovimentoOpItem` e a tabelinha da tela mostra os dois estados na mesma linha.

export type EstadoConsumo = "reservado" | "baixado" | "estornado" | "falha";

export interface ItemReservado {
  id: string;
  sku: string;
  descricao?: string;
  unidade?: string;
  quantidade: number;
  /** Código novo que a OP pediu, quando esta linha moveu o cadastro antigo. */
  substituiSku?: string;
  /** Onde o material está parado (destino da reserva). */
  localCodigo: string;
  localNome: string;
  estado: EstadoConsumo;
  baixadoEm?: string;
  baixaLocalNome?: string;
  estornadoEm?: string;
  motivoErro?: string;
}

export interface ResultadoResumoOp {
  ok: boolean;
  erro?: string;
  itens: ItemReservado[];
}

/**
 * O estado que a tabelinha mostra.
 *
 * A ordem importa: `baixadoEm` vem PRIMEIRO porque o estorno LIMPA esse campo
 * (o material voltou e pode ser baixado de novo). Um item com `estornadoEm`
 * preenchido e `baixadoEm` vazio já está disponível outra vez; o rótulo
 * "estornado" existe para a pessoa saber que ali houve um vai e volta, não para
 * dizer que a linha está encerrada.
 */
function estadoDoItem(item: {
  estornadoEm: Date | null;
  baixadoEm: Date | null;
  baixaMotivoErro: string | null;
}): EstadoConsumo {
  if (item.baixadoEm) return "baixado";
  if (item.baixaMotivoErro) return "falha";
  if (item.estornadoEm) return "estornado";
  return "reservado";
}

/**
 * O que está reservado para uma OP, em qualquer movimentação já feita dela.
 *
 * O casamento do número é pela chave normalizada e não por igualdade de texto:
 * a mesma OP pode ter sido gravada como "2026/00802" numa movimentação e
 * "2026/802" noutra, e material reservado que não aparece na tabelinha é
 * material que ninguém vai lembrar de baixar.
 */
export async function resumoOp(numeroOp: string): Promise<ResultadoResumoOp> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, itens: [] };

  const alvo = chaveDaOrdem(String(numeroOp ?? ""));
  if (!alvo) return { ok: true, itens: [] };

  const incluirItens = { itens: { where: { status: "TRANSFERIDO" }, orderBy: { sku: "asc" as const } } };

  // Caminho normal: o número gravado é o `cNumOP` canônico que veio do Omie, e
  // `numeroOp` é indexado. A varredura só entra em cena se o casamento exato
  // não achar nada — material reservado que não aparece na tabelinha é material
  // que ninguém vai lembrar de baixar.
  const exatos = await prisma.movimentoOp.findMany({
    where: { numeroOp: String(numeroOp).trim(), itens: { some: { status: "TRANSFERIDO" } } },
    orderBy: { criadoEm: "desc" },
    include: incluirItens,
  });

  const movimentos =
    exatos.length > 0
      ? exatos
      : await prisma.movimentoOp.findMany({
          where: { itens: { some: { status: "TRANSFERIDO" } } },
          orderBy: { criadoEm: "desc" },
          take: 200,
          include: incluirItens,
        });

  const itens: ItemReservado[] = [];
  for (const movimento of movimentos) {
    if (chaveDaOrdem(movimento.numeroOp) !== alvo) continue;
    for (const item of movimento.itens) {
      itens.push({
        id: item.id,
        sku: item.sku,
        descricao: item.descricao ?? undefined,
        unidade: item.unidade ?? undefined,
        quantidade: numeroDecimal(item.quantidade),
        substituiSku: item.substituiSku ?? undefined,
        localCodigo: movimento.destinoCodigo,
        localNome: movimento.destinoNome ?? movimento.destinoCodigo,
        estado: estadoDoItem(item),
        baixadoEm: item.baixadoEm?.toISOString(),
        baixaLocalNome: item.baixaLocalNome ?? undefined,
        estornadoEm: item.estornadoEm?.toISOString(),
        motivoErro: item.baixaMotivoErro ?? undefined,
      });
    }
  }

  return { ok: true, itens };
}

export interface ResultadoConsumo {
  ok: boolean;
  erro?: string;
  itens: ItemReservado[];
  baixados?: number;
  falhas?: number;
  motivoInterrupcao?: string;
}

/**
 * Baixa (consome) o material reservado da OP.
 *
 * A baixa sai do local onde o material FOI GUARDADO, e a pessoa pode trocar
 * esse local por item. Como o `baixarEstoque` opera num local por vez, os itens
 * são agrupados por local e cada grupo vira uma execução: assim saldo, lotes e
 * FEFO são sempre lidos do lugar certo.
 *
 * `cod_int_ajuste` é `<id do item>-b`, distinto das duas pernas da
 * transferência (`-s` e `-e`), então baixar de novo é duplicado idempotente e
 * nunca consome o material duas vezes.
 */
export async function baixarOp(input: BaixarOpInput): Promise<ResultadoConsumo> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, itens: [] };

  const parsed = baixarOpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? "Dados inválidos.", itens: [] };
  }

  const escolhas = new Map(parsed.data.itens.map((i) => [i.itemId, i.localCodigo]));
  const registros = await prisma.movimentoOpItem.findMany({
    where: { id: { in: [...escolhas.keys()] }, status: "TRANSFERIDO", baixadoEm: null },
    include: { movimento: { select: { numeroOp: true, destinoCodigo: true, destinoNome: true } } },
  });
  if (registros.length === 0) {
    return { ok: false, erro: "Nenhum item reservado disponível para baixa nesta seleção.", itens: [] };
  }

  // Agrupa por local: o `baixarEstoque` lê saldo, lotes e FEFO de um local só.
  const porLocal = new Map<string, typeof registros>();
  for (const registro of registros) {
    const local = escolhas.get(registro.id) || registro.movimento.destinoCodigo || LOCAL_PADRAO;
    const grupo = porLocal.get(local);
    if (grupo) grupo.push(registro);
    else porLocal.set(local, [registro]);
  }

  let baixados = 0;
  let falhas = 0;
  let motivoInterrupcao: string | undefined;

  for (const [local, grupo] of porLocal) {
    const skus = [...new Set(grupo.map((r) => r.sku))];
    const localNome = await nomeDoLocal(local, chamar);

    let produtos: Map<string, ProdutoEstoque>;
    let saldos: Map<string, SaldoEstoque>;
    let lotes: Map<string, LoteDisponivel[]>;
    try {
      produtos = await buscarProdutosPorCodigo(skus, chamar);
      saldos = await saldosPorCodigo(skus, dataOmieHoje(), chamar, local);
      lotes = await lotesPorCodigo(produtos, skus, chamar, local);
    } catch (erro) {
      motivoInterrupcao = mensagemOmieIndisponivel(erro);
      falhas += grupo.length;
      continue;
    }

    // `-b<seq>`: o contador de ciclos garante chave nova depois de um estorno.
    // Reusar a chave faria o Omie responder "duplicado" e o app marcar como
    // baixado sem ter baixado nada.
    const itensBaixa: ItemBaixa[] = grupo.map((registro) => ({
      chave: chaveDaBaixa(registro.id, registro.baixaSeq),
      sku: registro.sku,
      quantidade: numeroDecimal(registro.quantidade),
      obs: `Consumo OP ${registro.movimento.numeroOp}`,
    }));

    const resultado = await baixarEstoque(
      itensBaixa,
      { data: dataOmieHoje(), produtos, saldos, lotes, codigoLocal: local },
      chamar,
    );
    if (resultado.motivoInterrupcao) motivoInterrupcao = resultado.motivoInterrupcao;

    for (const linha of resultado.itens) {
      const itemId = itemDaChaveDeBaixa(linha.chave);
      const deuCerto = linha.outcome === "baixado" || linha.outcome === "ja_baixado";
      if (deuCerto) baixados += 1;
      else falhas += 1;

      await prisma.movimentoOpItem.update({
        where: { id: itemId },
        data: deuCerto
          ? {
              baixadoEm: new Date(),
              refBaixa: linha.omieRef ?? undefined,
              baixaLocalCodigo: local,
              baixaLocalNome: localNome ?? local,
              baixaMotivoErro: null,
              baixaLote: linha.lotes ? (linha.lotes as unknown as object) : undefined,
              custoUnitario: linha.custoUnitario ?? undefined,
              // Começa um CICLO novo: o estorno anterior deixa de ser o estado
              // corrente da linha. Sem limpar, o próximo estorno seria recusado
              // pelo filtro e a pessoa ficaria sem como voltar atrás na segunda
              // vez. O rastro do vai e volta continua no log e no Omie.
              estornadoEm: null,
              refEstorno: null,
            }
          : { baixaMotivoErro: linha.motivo ?? "Falha na baixa." },
      });

      if (deuCerto && linha.omieRef) {
        await prisma.movimentoEstoque.create({
          data: {
            tipo: "SAIDA",
            sku: linha.sku,
            quantidade: numeroDecimal(grupo.find((r) => r.id === itemId)?.quantidade ?? 0),
            omieRef: linha.omieRef,
            movimentoOpItemId: itemId,
          },
        });
      }
    }
  }

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "movimentacao.baixar",
    entity: "MovimentoOp",
    entityId: parsed.data.numeroOp,
    summary: `Baixa do material reservado da OP ${parsed.data.numeroOp}: ${baixados} baixado(s), ${falhas} com falha.`,
    after: { baixados, falhas },
    omieTarget: process.env.OMIE_APP_KEY ? "omie" : null,
    req: await requestHeaders(),
  });

  revalidatePath("/movimentacoes");
  const resumo = await resumoOp(parsed.data.numeroOp);
  return { ok: true, itens: resumo.itens, baixados, falhas, motivoInterrupcao };
}

/**
 * Estorno: devolve ao estoque o que foi baixado, lançando a ENTRADA no MESMO
 * local de onde a saída saiu e nos MESMOS lotes.
 *
 * Local, quantidade, custo e lotes vêm do registro da baixa, nunca da tela. É
 * o botão de voltar um passo, e ele não pode depender de a pessoa lembrar de
 * onde tirou o material.
 */
export async function estornarOp(input: EstornarOpInput): Promise<ResultadoConsumo> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, itens: [] };

  const parsed = estornarOpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: "Seleção inválida.", itens: [] };

  // Só `baixadoEm` preenchido: é o que diz que existe uma baixa CORRENTE para
  // reverter. `estornadoEm` não entra no filtro porque a baixa seguinte o
  // limpa; olhar para ele bloquearia o segundo estorno do mesmo item.
  const registros = await prisma.movimentoOpItem.findMany({
    where: { id: { in: parsed.data.itemIds }, baixadoEm: { not: null } },
    include: { movimento: { select: { numeroOp: true } } },
  });
  if (registros.length === 0) {
    return { ok: false, erro: "Nenhuma baixa estornável nesta seleção.", itens: [] };
  }

  const porLocal = new Map<string, typeof registros>();
  for (const registro of registros) {
    const local = registro.baixaLocalCodigo || LOCAL_PADRAO;
    const grupo = porLocal.get(local);
    if (grupo) grupo.push(registro);
    else porLocal.set(local, [registro]);
  }

  let estornados = 0;
  let falhas = 0;
  let motivoInterrupcao: string | undefined;
  const numeroOp = registros[0].movimento.numeroOp;

  for (const [local, grupo] of porLocal) {
    let produtos: Map<string, ProdutoEstoque>;
    try {
      produtos = await buscarProdutosPorCodigo([...new Set(grupo.map((r) => r.sku))], chamar);
    } catch (erro) {
      motivoInterrupcao = mensagemOmieIndisponivel(erro);
      falhas += grupo.length;
      continue;
    }

    const reversoes: ItemReversao[] = grupo.flatMap((registro) => {
      const idProd = produtos.get(registro.sku)?.idProd ?? registro.omieIdProd;
      if (!idProd) return [];
      return [
        {
          // A MESMA chave da baixa que está sendo revertida: o `reverterBaixa`
          // prefixa com `est-`, então o par baixa/estorno fica amarrado.
          chave: chaveDaBaixa(registro.id, registro.baixaSeq),
          sku: registro.sku,
          idProd,
          quantidade: numeroDecimal(registro.quantidade),
          custoUnitario: numeroDecimal(registro.custoUnitario ?? 0),
          lotes: Array.isArray(registro.baixaLote)
            ? (registro.baixaLote as unknown as AlocacaoLote[])
            : undefined,
          obs: `Estorno consumo OP ${registro.movimento.numeroOp}`,
        },
      ];
    });

    const resultado = await reverterBaixa(reversoes, dataOmieHoje(), chamar, local);
    if (resultado.motivoInterrupcao) motivoInterrupcao = resultado.motivoInterrupcao;

    for (const linha of resultado.itens) {
      const itemId = itemDaChaveDeBaixa(linha.chave);
      const deuCerto = linha.outcome === "estornado" || linha.outcome === "ja_estornado";
      if (deuCerto) estornados += 1;
      else falhas += 1;

      if (!deuCerto) {
        await prisma.movimentoOpItem.update({
          where: { id: itemId },
          data: { baixaMotivoErro: linha.motivo ?? "Falha no estorno." },
        });
        continue;
      }

      // O material voltou ao local de onde saiu: a baixa é DESFEITA (campos
      // limpos) e o contador avança, para uma baixa futura usar chave nova. O
      // `estornadoEm`/`refEstorno` ficam como rastro do vai e volta.
      await prisma.movimentoOpItem.update({
        where: { id: itemId },
        data: {
          estornadoEm: new Date(),
          refEstorno: linha.omieRef ?? undefined,
          baixadoEm: null,
          refBaixa: null,
          baixaLote: Prisma.DbNull,
          baixaMotivoErro: null,
          baixaSeq: { increment: 1 },
        },
      });
    }
  }

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "movimentacao.estornar",
    entity: "MovimentoOp",
    entityId: numeroOp,
    summary: `Estorno da baixa da OP ${numeroOp}: ${estornados} estornado(s), ${falhas} com falha.`,
    after: { estornados, falhas },
    omieTarget: process.env.OMIE_APP_KEY ? "omie" : null,
    req: await requestHeaders(),
  });

  revalidatePath("/movimentacoes");
  const resumo = await resumoOp(numeroOp);
  return { ok: true, itens: resumo.itens, baixados: estornados, falhas, motivoInterrupcao };
}
