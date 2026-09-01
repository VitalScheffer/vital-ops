"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  buscarCadastroSchema,
  migrarLegadoSchema,
  pendenciasLegadoSchema,
  reativarLegadoSchema,
  removerDeParaSchema,
  salvarDeParaSchema,
  type BuscarCadastroInput,
  type MigrarLegadoInput,
  type PendenciasLegadoInput,
  type ReativarLegadoInput,
  type RemoverDeParaInput,
  type SalvarDeParaInput,
} from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { avaliarConversao, quantidadeNoNovo } from "@/lib/depara/conversao";
import { montarFila, sugerirEquivalente, type SugestaoDePara } from "@/lib/depara/depara";
import { ehCodigoNovo, listarLegadosComSaldo } from "@/lib/depara/legado";
import {
  conferirPendencias,
  temPendencia,
  type PendenciasLegado,
  type RequisicaoPendente,
} from "@/lib/depara/pendencias";
import {
  buscarProdutosPorCodigo,
  buscarProdutosPorDescricao,
  consultarLotes,
  dataOmieHoje,
  nomeDoLocal,
  saldoPorLocal,
  saldoTotalPorCodigo,
  saldosPorCodigo,
  type LoteDisponivel,
  type ProdutoEstoque,
  type SaldoEstoque,
} from "@/lib/estoque/omieEstoque";
import { migrarSaldo, novoAceitaEntrada, type ItemMigracao } from "@/lib/estoque/omieMigracao";
import { inativarProduto } from "@/lib/estoque/omieProduto";
import { chamar } from "@/lib/omie";
import { OmieBlocked } from "@/lib/omie/errors";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { listarCatalogoMat } from "@/lib/produtos/catalogoMat";
import { parteDescritiva, type ItemMat } from "@/lib/produtos/materiaPrima";
import { canViewDePara } from "@/lib/rbac";
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
  if (!canViewDePara(session.user.role, permissions)) {
    return { erro: "Você não tem permissão para editar o De/Para de códigos." };
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

function decimal(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export interface OpcaoMat {
  codigo: string;
  descricao: string;
  unidade: string;
  /** Cadastro com liga contraditória entre código e descrição — nunca automático. */
  ambiguo: boolean;
}

export interface DecisaoSalva {
  codigoNovo: string | null;
  descricaoNovo?: string;
  unidadeNovo?: string;
  confianca: string;
  observacao?: string;
  /** 1 unidade do NOVO = X do ANTIGO. */
  fatorConversao?: number;
  confirmadoPor?: string;
  confirmadoEm?: string;
  /** O código antigo foi tirado de circulação aqui dentro. */
  aposentadoEm?: string;
  aposentadoPor?: string;
  migradoEm?: string;
  saldoMigrado?: number;
  inativadoNoOmieEm?: string;
}

export interface LinhaFila {
  codigo: string;
  descricao: string;
  /** Unidade do cadastro antigo, lida do Omie. */
  unidade?: string;
  /** id interno do Omie (só a busca direta traz). */
  idProd?: string;
  /** Saldo no local consultado. */
  saldo: number;
  /** Saldo somado de TODOS os locais (só a busca direta traz). */
  saldoTotal?: number;
  sugestao: SugestaoDePara;
  decidido?: DecisaoSalva;
  /** Achado pela busca direta, não pela fila do local. */
  daBusca?: boolean;
  /** O código já está no padrão novo: não há o que converter. */
  jaNovo?: boolean;
}

export interface ResultadoFila {
  ok: boolean;
  erro?: string;
  linhas: LinhaFila[];
  opcoes: OpcaoMat[];
  /** Quantos itens legados com saldo o local tinha antes do filtro de decididos. */
  total: number;
  decididos: number;
  /** Códigos aposentados que foram escondidos da fila. */
  aposentados: number;
}

const FILA_VAZIA: ResultadoFila = {
  ok: false,
  linhas: [],
  opcoes: [],
  total: 0,
  decididos: 0,
  aposentados: 0,
};

function paraOpcao(item: ItemMat): OpcaoMat {
  return {
    codigo: item.codigo,
    descricao: parteDescritiva(item.codigo, item.descricao),
    unidade: item.unidade,
    ambiguo: item.ambiguo,
  };
}

type DecisaoDoBanco = Awaited<ReturnType<typeof lerDecisoes>>[number];

async function lerDecisoes(codigos: readonly string[]) {
  return prisma.deParaProduto.findMany({
    where: { codigoLegado: { in: [...codigos] } },
    select: {
      codigoLegado: true,
      codigoNovo: true,
      descricaoNovo: true,
      unidadeNovo: true,
      confianca: true,
      observacao: true,
      fatorConversao: true,
      confirmadoEm: true,
      aposentadoEm: true,
      migradoEm: true,
      saldoMigrado: true,
      inativadoNoOmieEm: true,
      confirmadoPor: { select: { name: true } },
      aposentadoPor: { select: { name: true } },
    },
  });
}

function paraDecisao(d: DecisaoDoBanco): DecisaoSalva {
  return {
    codigoNovo: d.codigoNovo,
    descricaoNovo: d.descricaoNovo ?? undefined,
    unidadeNovo: d.unidadeNovo ?? undefined,
    confianca: d.confianca,
    observacao: d.observacao ?? undefined,
    fatorConversao: d.fatorConversao === null ? undefined : decimal(d.fatorConversao),
    confirmadoPor: d.confirmadoPor?.name,
    confirmadoEm: d.confirmadoEm?.toISOString(),
    aposentadoEm: d.aposentadoEm?.toISOString(),
    aposentadoPor: d.aposentadoPor?.name,
    migradoEm: d.migradoEm?.toISOString(),
    saldoMigrado: d.saldoMigrado === null ? undefined : decimal(d.saldoMigrado),
    inativadoNoOmieEm: d.inativadoNoOmieEm?.toISOString(),
  };
}

/**
 * Monta a fila de conversão de um local: cadastros antigos COM SALDO, a
 * sugestão automática de equivalente e o que já foi decidido antes.
 *
 * A fila sai da posição de estoque (e não do catálogo inteiro) porque a
 * pergunta que importa é "onde está o material parado". Item já decidido
 * continua na lista, marcado, para dar para revisar e corrigir — sumir com ele
 * esconderia justamente um De/Para errado.
 *
 * O que SOME é o código já APOSENTADO: ele foi tirado de circulação de
 * propósito, e devolvê-lo à fila toda semana faria a pessoa revisar de novo uma
 * decisão que já foi tomada. O contador diz quantos ficaram de fora.
 */
export async function carregarFila(
  localCodigo: string,
  recarregar = false,
): Promise<ResultadoFila> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ...FILA_VAZIA, erro: guarda.erro };

  const local = String(localCodigo ?? "").trim();
  if (!/^\d{1,15}$/.test(local)) {
    return { ...FILA_VAZIA, erro: "Local de estoque inválido." };
  }

  let catalogo: ItemMat[];
  let legados: Awaited<ReturnType<typeof listarLegadosComSaldo>>;
  try {
    catalogo = await listarCatalogoMat(chamar, { revalidar: recarregar });
    legados = await listarLegadosComSaldo(local, dataOmieHoje(), chamar, { revalidar: recarregar });
  } catch (erro) {
    return { ...FILA_VAZIA, erro: mensagemOmieIndisponivel(erro) };
  }

  const decisoes = await lerDecisoes(legados.map((l) => l.codigo));
  const porLegado = new Map(decisoes.map((d) => [d.codigoLegado, d]));

  let aposentados = 0;
  const linhas: LinhaFila[] = [];
  for (const linha of montarFila(legados, catalogo)) {
    const decisao = porLegado.get(linha.codigo);
    if (decisao?.aposentadoEm) {
      aposentados += 1;
      continue;
    }
    linhas.push({
      codigo: linha.codigo,
      descricao: linha.descricao,
      unidade: linha.unidade,
      saldo: linha.saldo ?? 0,
      sugestao: linha.sugestao,
      decidido: decisao ? paraDecisao(decisao) : undefined,
    });
  }

  return {
    ok: true,
    linhas,
    opcoes: catalogo.map(paraOpcao),
    total: linhas.length,
    decididos: linhas.filter((l) => l.decidido).length,
    aposentados,
  };
}

export interface ResultadoBusca {
  ok: boolean;
  erro?: string;
  linhas: LinhaFila[];
}

/**
 * Busca um cadastro pelo CÓDIGO ou por parte da descrição, direto no catálogo do
 * Omie.
 *
 * Existe porque a fila é montada a partir da POSIÇÃO DE ESTOQUE, e isso deixa
 * dois tipos de cadastro invisíveis: o que está com saldo zero em todos os
 * locais e o que a leitura de geometria não reconhece como matéria-prima.
 * Conferido em 01/09/2026: o PRD02227 ("SERRA FITA 13 X 0.9 x24dx4,05 MT
 * -ESPUMA", família FERRAMENTAS, unidade UN) cai nos dois filtros e, sem esta
 * busca, não teria como ser ligado nunca.
 *
 * A busca NÃO aplica nenhum dos filtros da fila de propósito: quem digitou o
 * código sabe o que quer, e esconder o resultado seria repetir exatamente o
 * problema que ela veio resolver. O que a linha faz é dizer o que encontrou —
 * saldo zero, código já no padrão novo, sem sugestão de equivalente.
 */
export async function buscarCadastro(input: BuscarCadastroInput): Promise<ResultadoBusca> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, linhas: [] };

  const parsed = buscarCadastroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Digite pelo menos 2 caracteres do código ou da descrição.", linhas: [] };
  }
  const { termo, localCodigo } = parsed.data;

  let catalogo: ItemMat[];
  let achados: Awaited<ReturnType<typeof buscarProdutosPorDescricao>>;
  try {
    catalogo = await listarCatalogoMat(chamar);
    achados = await buscarProdutosPorDescricao(termo, chamar, 20);
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), linhas: [] };
  }
  if (achados.length === 0) {
    return { ok: true, linhas: [] };
  }

  const codigos = achados.map((a) => a.codigo);
  let saldoTotal = new Map<string, number>();
  let saldoLocal = new Map<string, SaldoEstoque>();
  let produtos = new Map<string, ProdutoEstoque>();
  try {
    [saldoTotal, produtos] = await Promise.all([
      saldoTotalPorCodigo(codigos, dataOmieHoje(), chamar),
      buscarProdutosPorCodigo(codigos, chamar),
    ]);
    if (localCodigo) {
      saldoLocal = await saldosPorCodigo(codigos, dataOmieHoje(), chamar, localCodigo);
    }
  } catch {
    // Sem saldo a linha continua útil: dá para ligar o par mesmo assim. O que
    // não dá é derrubar a busca por causa de um número de apoio.
  }

  const decisoes = await lerDecisoes(codigos);
  const porLegado = new Map(decisoes.map((d) => [d.codigoLegado, d]));

  const linhas: LinhaFila[] = achados.map((achado) => {
    const decisao = porLegado.get(achado.codigo);
    const jaNovo = ehCodigoNovo(achado.codigo);
    return {
      codigo: achado.codigo,
      descricao: achado.descricao,
      unidade: achado.unidade,
      idProd: produtos.get(achado.codigo)?.idProd,
      saldo: saldoLocal.get(achado.codigo)?.saldo ?? 0,
      saldoTotal: saldoTotal.get(achado.codigo) ?? 0,
      sugestao: jaNovo
        ? {
            confianca: "SEM_SUGESTAO" as const,
            motivo: "Este código já está no padrão novo: não há para onde convertê-lo.",
            unidadeMuda: false,
            alertas: [],
          }
        : sugerirEquivalente(
            { codigo: achado.codigo, descricao: achado.descricao, unidade: achado.unidade },
            catalogo,
          ),
      decidido: decisao ? paraDecisao(decisao) : undefined,
      daBusca: true,
      jaNovo,
    };
  });

  return { ok: true, linhas };
}

/**
 * Busca códigos NOVOS para o campo "código novo".
 *
 * O seletor da fila lista só o catálogo MAT, que é o certo para matéria-prima e
 * insuficiente para o resto: um cadastro antigo de ferramenta ou de componente
 * comprado tem equivalente no padrão novo que não começa com MAT, e sem esta
 * busca ele não aparece em lugar nenhum da tela.
 */
export async function buscarCodigoNovo(termo: string): Promise<{ ok: boolean; opcoes: OpcaoMat[]; erro?: string }> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, opcoes: [], erro: guarda.erro };

  const q = String(termo ?? "").trim();
  if (q.length < 2) return { ok: true, opcoes: [] };

  try {
    const achados = await buscarProdutosPorDescricao(q, chamar, 20);
    return {
      ok: true,
      opcoes: achados
        .filter((a) => ehCodigoNovo(a.codigo))
        .map((a) => ({
          codigo: a.codigo,
          descricao: parteDescritiva(a.codigo, a.descricao),
          unidade: a.unidade ?? "",
          ambiguo: false,
        })),
    };
  } catch (erro) {
    return { ok: false, opcoes: [], erro: mensagemOmieIndisponivel(erro) };
  }
}

export interface ResultadoSalvar {
  ok: boolean;
  erro?: string;
}

/**
 * Grava (ou corrige) uma linha do De/Para. Sempre com autor e data: este mapa
 * decide de qual cadastro o material sai numa transferência, então "quem disse
 * que esses dois são a mesma coisa" precisa estar respondido no próprio
 * registro, não só no log.
 *
 * A validação de unidade mora AQUI e não só na tela: um par em unidades
 * diferentes sem fator gravado não é um detalhe cosmético, é a diferença entre
 * mover 21,66 kg e mover 3,07 m². Quando as unidades batem, o fator é
 * descartado — unidade igual é sempre 1 para 1, e um fator sobrando de uma
 * correção anterior multiplicaria material sem motivo.
 */
export async function salvarDePara(input: SalvarDeParaInput): Promise<ResultadoSalvar> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const parsed = salvarDeParaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const dados = parsed.data;
  const codigoNovo = dados.confianca === "SEM_EQUIVALENTE" ? null : (dados.codigoNovo ?? null);

  let fatorConversao: number | null = null;
  if (codigoNovo) {
    const avaliacao = avaliarConversao({
      unidadeLegado: dados.unidadeLegado,
      unidadeNovo: dados.unidadeNovo,
      fator: dados.fatorConversao,
    });
    if (avaliacao.situacao === "FATOR_PENDENTE") {
      return {
        ok: false,
        erro:
          `Unidades diferentes (${avaliacao.unidadeNovo} no novo, ${avaliacao.unidadeLegado} no antigo). ` +
          `Informe quantos ${avaliacao.unidadeLegado} equivalem a 1 ${avaliacao.unidadeNovo} para poder movimentar.`,
      };
    }
    if (avaliacao.situacao === "COM_FATOR") fatorConversao = avaliacao.fator ?? null;
  }

  const anterior = await prisma.deParaProduto.findUnique({
    where: { codigoLegado: dados.codigoLegado },
    select: { codigoNovo: true, confianca: true, fatorConversao: true, aposentadoEm: true },
  });
  if (anterior?.aposentadoEm) {
    return {
      ok: false,
      erro: "Este código antigo já foi aposentado. Reative antes de mudar a ligação dele.",
    };
  }

  const comum = {
    descricaoLegado: dados.descricaoLegado,
    unidadeLegado: dados.unidadeLegado ?? null,
    codigoNovo,
    descricaoNovo: dados.descricaoNovo ?? null,
    unidadeNovo: dados.unidadeNovo ?? null,
    confianca: dados.confianca,
    motivo: dados.motivo ?? null,
    observacao: dados.observacao ?? null,
    fatorConversao: fatorConversao === null ? null : new Prisma.Decimal(fatorConversao),
    confirmadoPorId: guarda.userId,
    confirmadoEm: new Date(),
  };

  await prisma.deParaProduto.upsert({
    where: { codigoLegado: dados.codigoLegado },
    create: { codigoLegado: dados.codigoLegado, ...comum },
    update: comum,
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: anterior ? "depara.atualizar" : "depara.criar",
    entity: "DeParaProduto",
    entityId: dados.codigoLegado,
    summary: codigoNovo
      ? `De/Para: ${dados.codigoLegado} → ${codigoNovo} (${dados.confianca.toLowerCase()})` +
        (fatorConversao ? `, fator ${fatorConversao}.` : ".")
      : `De/Para: ${dados.codigoLegado} marcado como sem equivalente.`,
    before: anterior ?? undefined,
    after: { codigoNovo, confianca: dados.confianca, fatorConversao },
    req: await requestHeaders(),
  });

  revalidatePath("/de-para");
  return { ok: true };
}

/** Desfaz uma decisão: o item volta para a fila com a sugestão automática. */
export async function removerDePara(input: RemoverDeParaInput): Promise<ResultadoSalvar> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const parsed = removerDeParaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: "Código inválido." };

  const anterior = await prisma.deParaProduto.findUnique({
    where: { codigoLegado: parsed.data.codigoLegado },
    select: { codigoNovo: true, confianca: true, aposentadoEm: true, migradoEm: true },
  });
  if (!anterior) return { ok: true };
  if (anterior.aposentadoEm || anterior.migradoEm) {
    return {
      ok: false,
      erro:
        "Este par já teve saldo migrado ou foi aposentado. Apagar a linha jogaria fora o registro de " +
        "para onde o material foi. Use \"Reativar\" se precisar voltar a usar o código antigo.",
    };
  }

  await prisma.deParaProduto.delete({ where: { codigoLegado: parsed.data.codigoLegado } });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "depara.remover",
    entity: "DeParaProduto",
    entityId: parsed.data.codigoLegado,
    summary: `De/Para removido: ${parsed.data.codigoLegado} volta para a fila de revisão.`,
    before: anterior,
    req: await requestHeaders(),
  });

  revalidatePath("/de-para");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Aposentar o código antigo: conferir pendências, migrar o saldo, inativar
// -----------------------------------------------------------------------------

export interface SaldoDoLocal {
  localCodigo: string;
  localNome: string;
  saldo: number;
  cmc: number;
  /** Quanto disso vira no código novo, com o fator do par. */
  quantidadeNova?: number;
}

export interface ResultadoPendencias {
  ok: boolean;
  erro?: string;
  codigoLegado?: string;
  codigoNovo?: string;
  /** Situação da conversão de unidade do par (é ela que libera a migração). */
  conversao?: {
    situacao: string;
    mensagem: string;
    podeMovimentar: boolean;
    fator?: number;
  };
  saldos: SaldoDoLocal[];
  saldoTotal: number;
  pendencias: PendenciasLegado;
  /** Impedimento duro: nem com confirmação dá para migrar. */
  impedimento?: string;
}

const SEM_PENDENCIAS: PendenciasLegado = {
  ops: [],
  compras: [],
  requisicoes: [],
  incompleto: false,
  avisos: [],
};

/** Requisições internas ainda não baixadas que citam o SKU. */
async function requisicoesAbertas(sku: string): Promise<RequisicaoPendente[]> {
  const itens = await prisma.requisicaoItem.findMany({
    where: {
      sku,
      baixadoEm: null,
      requisicao: { status: { in: ["PENDENTE", "CONFIRMADA"] }, cancelada: false },
    },
    select: {
      quantidade: true,
      status: true,
      requisicao: { select: { numero: true, solicitanteNome: true } },
    },
    orderBy: { requisicao: { numero: "desc" } },
    take: 50,
  });
  return itens.map((item) => ({
    numero: item.requisicao.numero,
    solicitante: item.requisicao.solicitanteNome,
    quantidade: decimal(item.quantidade),
    status: item.status,
  }));
}

/**
 * A conferência que roda antes de aposentar: onde o saldo está, o que ainda usa
 * o código e se a conversão de unidade está resolvida.
 *
 * Tudo aqui é LEITURA. O impedimento é devolvido como texto e não como exceção
 * porque a tela precisa mostrar o motivo junto com o resto do quadro — dizer só
 * "não dá" obrigaria a pessoa a adivinhar qual dos requisitos faltou.
 */
export async function pendenciasLegado(input: PendenciasLegadoInput): Promise<ResultadoPendencias> {
  const guarda = await guardar();
  if ("erro" in guarda) {
    return { ok: false, erro: guarda.erro, saldos: [], saldoTotal: 0, pendencias: SEM_PENDENCIAS };
  }

  const parsed = pendenciasLegadoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Código inválido.", saldos: [], saldoTotal: 0, pendencias: SEM_PENDENCIAS };
  }
  const { codigoLegado } = parsed.data;

  const par = await prisma.deParaProduto.findUnique({
    where: { codigoLegado },
    select: { codigoNovo: true, unidadeLegado: true, unidadeNovo: true, fatorConversao: true },
  });
  if (!par?.codigoNovo) {
    return {
      ok: false,
      erro: "Ligue este código a um código novo antes de aposentá-lo.",
      saldos: [],
      saldoTotal: 0,
      pendencias: SEM_PENDENCIAS,
    };
  }

  const avaliacao = avaliarConversao({
    unidadeLegado: par.unidadeLegado,
    unidadeNovo: par.unidadeNovo,
    fator: par.fatorConversao === null ? null : decimal(par.fatorConversao),
  });

  let produtos: Map<string, ProdutoEstoque>;
  let saldos: Awaited<ReturnType<typeof saldoPorLocal>>;
  try {
    produtos = await buscarProdutosPorCodigo([codigoLegado, par.codigoNovo], chamar);
    saldos = await saldoPorLocal(codigoLegado, dataOmieHoje(), chamar, { revalidar: true });
  } catch (erro) {
    return {
      ok: false,
      erro: mensagemOmieIndisponivel(erro),
      saldos: [],
      saldoTotal: 0,
      pendencias: SEM_PENDENCIAS,
    };
  }

  const legado = produtos.get(codigoLegado);
  const novo = produtos.get(par.codigoNovo);
  let impedimento: string | undefined;
  if (!legado) impedimento = `O cadastro ${codigoLegado} não foi encontrado no Omie.`;
  else if (!novo) impedimento = `O cadastro novo ${par.codigoNovo} não foi encontrado no Omie.`;
  else {
    const aceita = novoAceitaEntrada(novo);
    if (!aceita.ok) impedimento = aceita.motivo;
  }
  if (!impedimento && !avaliacao.podeMovimentar) impedimento = avaliacao.mensagem;

  const comSaldo = saldos.filter((s) => s.saldo > 0);
  const nomes = await Promise.all(comSaldo.map((s) => nomeDoLocal(s.localCodigo, chamar)));
  const detalhados: SaldoDoLocal[] = comSaldo.map((s, i) => ({
    localCodigo: s.localCodigo,
    localNome: nomes[i] ?? s.localCodigo,
    saldo: s.saldo,
    cmc: s.cmc,
    ...(avaliacao.podeMovimentar
      ? { quantidadeNova: quantidadeNoNovo(s.saldo, avaliacao) ?? s.saldo }
      : {}),
  }));

  const [pendenciasOmie, requisicoes] = await Promise.all([
    legado
      ? conferirPendencias({ idProd: legado.idProd, requisicoes: [] }, chamar)
      : Promise.resolve(SEM_PENDENCIAS),
    requisicoesAbertas(codigoLegado),
  ]);

  return {
    ok: true,
    codigoLegado,
    codigoNovo: par.codigoNovo,
    conversao: {
      situacao: avaliacao.situacao,
      mensagem: avaliacao.mensagem,
      podeMovimentar: avaliacao.podeMovimentar,
      fator: avaliacao.fator,
    },
    saldos: detalhados,
    saldoTotal: detalhados.reduce((soma, s) => soma + s.saldo, 0),
    pendencias: { ...pendenciasOmie, requisicoes },
    impedimento,
  };
}

export interface ItemMigrado {
  localNome: string;
  quantidadeLegado: number;
  quantidadeNovo: number;
  status: string;
  motivo?: string;
}

export interface ResultadoMigracaoLegado {
  ok: boolean;
  erro?: string;
  migracaoId?: string;
  status?: string;
  itens: ItemMigrado[];
  /** Locais em que a saída passou e a entrada não. */
  pendentes?: number;
  aposentado?: boolean;
  inativadoNoOmie?: boolean;
  avisoInativacao?: string;
  motivoInterrupcao?: string;
}

const STATUS_POR_OUTCOME: Record<string, string> = {
  migrado: "MIGRADO",
  ja_migrado: "MIGRADO",
  entrada_pendente: "SAIDA_OK",
  falha: "FALHA",
  nao_migrado: "PENDENTE",
};

/**
 * Move todo o saldo do código antigo para o novo e aposenta o cadastro.
 *
 * Três passos, nesta ordem, e a ordem é o ponto:
 *
 *  1. mover o saldo, local por local (o saldo tem endereço; migrar pelo total
 *     lançaria no local padrão material que estava na Matéria-Prima);
 *  2. marcar como aposentado AQUI — reversível, e é o que tira o código da fila
 *     e das sugestões de substituto;
 *  3. só então inativar no Omie, se a pessoa pediu.
 *
 * Inativar ANTES de mover deixaria o saldo preso num cadastro que a API não
 * aceita mais movimentar. E a inativação só acontece se a migração fechou
 * inteira: aposentar um cadastro que ainda segura material é a forma mais
 * rápida de perder material de vista.
 */
export async function migrarLegado(input: MigrarLegadoInput): Promise<ResultadoMigracaoLegado> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, itens: [] };

  const parsed = migrarLegadoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: "Dados inválidos.", itens: [] };
  const { codigoLegado, inativarNoOmie, confirmaPendencias } = parsed.data;

  const par = await prisma.deParaProduto.findUnique({
    where: { codigoLegado },
    select: {
      id: true,
      codigoNovo: true,
      unidadeLegado: true,
      unidadeNovo: true,
      fatorConversao: true,
      aposentadoEm: true,
    },
  });
  if (!par?.codigoNovo) {
    return { ok: false, erro: "Ligue este código a um código novo antes de aposentá-lo.", itens: [] };
  }
  if (par.aposentadoEm) {
    return { ok: false, erro: "Este código antigo já está aposentado.", itens: [] };
  }

  const conferencia = await pendenciasLegado({ codigoLegado });
  if (!conferencia.ok) return { ok: false, erro: conferencia.erro, itens: [] };
  if (conferencia.impedimento) return { ok: false, erro: conferencia.impedimento, itens: [] };
  if (temPendencia(conferencia.pendencias) && !confirmaPendencias) {
    return {
      ok: false,
      erro:
        "Existe documento em aberto com este código (OP, requisição ou pedido de compra). " +
        "Confira a lista e confirme que quer seguir mesmo assim.",
      itens: [],
    };
  }
  if (conferencia.pendencias.incompleto && !confirmaPendencias) {
    return {
      ok: false,
      erro:
        "Não consegui conferir todas as pendências no Omie agora, então não dá para dizer que não há nada " +
        "em aberto. Tente de novo em alguns minutos ou confirme que quer seguir assim mesmo.",
      itens: [],
    };
  }

  const fator = conferencia.conversao?.fator ?? 1;

  // Nada a mover: o cadastro está zerado em todos os locais. A aposentadoria
  // segue — é justamente o caso mais limpo.
  const migracao =
    conferencia.saldos.length > 0
      ? await prisma.migracaoLegado.create({
          data: {
            deParaId: par.id,
            autorId: guarda.userId,
            codigoLegado,
            codigoNovo: par.codigoNovo,
            fator: new Prisma.Decimal(fator),
            totalLocais: conferencia.saldos.length,
            itens: {
              create: conferencia.saldos.map((s) => ({
                localCodigo: s.localCodigo,
                localNome: s.localNome,
                quantidadeLegado: new Prisma.Decimal(s.saldo),
                quantidadeNovo: new Prisma.Decimal(s.quantidadeNova ?? s.saldo),
                custoUnitario: new Prisma.Decimal(s.cmc),
              })),
            },
          },
          include: { itens: true },
        })
      : null;

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "depara.migrar",
    entity: "DeParaProduto",
    entityId: codigoLegado,
    summary:
      `Migração de saldo ${codigoLegado} → ${par.codigoNovo}: ` +
      `${conferencia.saldos.length} local(is), total ${conferencia.saldoTotal}` +
      (inativarNoOmie ? ", com inativação no Omie." : "."),
    after: {
      codigoNovo: par.codigoNovo,
      fator,
      locais: conferencia.saldos.length,
      inativarNoOmie,
      pendenciasConfirmadas: confirmaPendencias,
    },
    omieTarget: "omie",
    req: await requestHeaders(),
  });

  const execucao = migracao
    ? await rodarMigracao(migracao.id)
    : { ok: true as const, itens: [] as ItemMigrado[], pendentes: 0, status: "CONCLUIDO" };

  const tudoCerto = (execucao.pendentes ?? 0) === 0 && execucao.status === "CONCLUIDO";
  if (!tudoCerto) {
    revalidatePath("/de-para");
    return { ...execucao, ok: execucao.ok, aposentado: false };
  }

  // Passo 2: aposentar aqui dentro (reversível).
  await prisma.deParaProduto.update({
    where: { codigoLegado },
    data: {
      aposentadoEm: new Date(),
      aposentadoPorId: guarda.userId,
      migradoEm: new Date(),
      saldoMigrado: new Prisma.Decimal(conferencia.saldoTotal),
    },
  });

  // Passo 3: inativar no Omie, se pedido.
  let inativado = false;
  let avisoInativacao: string | undefined;
  if (inativarNoOmie) {
    const produtos = await buscarProdutosPorCodigo([codigoLegado], chamar).catch(() => null);
    const idProd = produtos?.get(codigoLegado)?.idProd;
    if (!idProd) {
      avisoInativacao = "O saldo foi migrado, mas não consegui achar o cadastro no Omie para inativar.";
    } else {
      const resultado = await inativarProduto(idProd, chamar);
      inativado = resultado.ok;
      if (resultado.ok) {
        await prisma.deParaProduto.update({
          where: { codigoLegado },
          data: { inativadoNoOmieEm: new Date() },
        });
      } else {
        avisoInativacao =
          `O saldo foi migrado e o código está aposentado aqui, mas a inativação no Omie falhou: ${resultado.motivo}`;
      }
    }
    await audit({
      actor: { id: guarda.userId, email: guarda.email },
      action: "depara.inativar_omie",
      entity: "DeParaProduto",
      entityId: codigoLegado,
      summary: inativado
        ? `Cadastro ${codigoLegado} inativado no Omie.`
        : `Falha ao inativar ${codigoLegado} no Omie: ${avisoInativacao ?? "motivo desconhecido"}`,
      after: { inativado },
      omieTarget: "omie",
      req: await requestHeaders(),
    });
  }

  revalidatePath("/de-para");
  return { ...execucao, aposentado: true, inativadoNoOmie: inativado, avisoInativacao };
}

async function rodarMigracao(migracaoId: string): Promise<ResultadoMigracaoLegado> {
  const migracao = await prisma.migracaoLegado.findUnique({
    where: { id: migracaoId },
    include: { itens: true },
  });
  if (!migracao) return { ok: false, erro: "Migração não encontrada.", itens: [] };

  const pendentes = migracao.itens.filter((i) => i.status !== "MIGRADO");
  if (pendentes.length === 0) {
    return {
      ok: true,
      migracaoId: migracao.id,
      status: migracao.status,
      itens: migracao.itens.map(paraItemMigrado),
      pendentes: 0,
    };
  }

  let produtos: Map<string, ProdutoEstoque>;
  try {
    produtos = await buscarProdutosPorCodigo([migracao.codigoLegado, migracao.codigoNovo], chamar);
  } catch (erro) {
    return abortarMigracao(migracao.id, migracao.status, erro);
  }
  const legado = produtos.get(migracao.codigoLegado);
  const novo = produtos.get(migracao.codigoNovo);
  if (!legado || !novo) {
    return abortarMigracao(migracao.id, migracao.status, new Error("Cadastro não encontrado no Omie."));
  }

  // Saldo e lotes são relidos por LOCAL, na hora: a conferência pode ter sido
  // feita minutos antes e alguém pode ter mexido no estoque no meio.
  const saldos = new Map<string, SaldoEstoque>();
  const lotes = new Map<string, LoteDisponivel[]>();
  try {
    const atual = await saldoPorLocal(migracao.codigoLegado, dataOmieHoje(), chamar, { revalidar: true });
    for (const linha of atual) saldos.set(linha.localCodigo, linha);
    if (legado.controleLote) {
      for (const item of pendentes) {
        if (item.status === "SAIDA_OK") continue;
        lotes.set(item.localCodigo, await consultarLotes(legado.idProd, chamar, item.localCodigo));
      }
    }
  } catch (erro) {
    return abortarMigracao(migracao.id, migracao.status, erro);
  }

  const paraMigrar: ItemMigracao[] = pendentes.map((item) => ({
    chave: item.id,
    localCodigo: item.localCodigo,
    quantidadeLegado: decimal(item.quantidadeLegado),
    quantidadeNovo: decimal(item.quantidadeNovo),
    obs: `Migração ${migracao.codigoLegado} → ${migracao.codigoNovo} · ${item.localNome ?? item.localCodigo}`,
    saidaFeita: item.status === "SAIDA_OK",
    lotes: Array.isArray(item.loteConsumido)
      ? (item.loteConsumido as unknown as ItemMigracao["lotes"])
      : undefined,
  }));

  const resultado = await migrarSaldo(
    paraMigrar,
    { data: dataOmieHoje(), legado, novo, saldos, lotes },
    chamar,
  );

  for (const item of resultado.itens) {
    const status = STATUS_POR_OUTCOME[item.outcome] ?? "FALHA";
    await prisma.migracaoLegadoItem.update({
      where: { id: item.chave },
      data: {
        status,
        motivoErro: item.motivo ?? null,
        refSaida: item.refSaida ?? undefined,
        refEntrada: item.refEntrada ?? undefined,
        custoUnitario: item.custoUnitario === undefined ? undefined : new Prisma.Decimal(item.custoUnitario),
        loteConsumido: item.lotes ? (item.lotes as unknown as object) : undefined,
        concluidoEm: status === "MIGRADO" ? new Date() : null,
      },
    });
  }

  const finais = await prisma.migracaoLegadoItem.findMany({
    where: { migracaoId: migracao.id },
    orderBy: { localCodigo: "asc" },
  });
  const qtdPendentes = finais.filter((i) => i.status === "SAIDA_OK").length;
  const status = finais.every((i) => i.status === "MIGRADO")
    ? "CONCLUIDO"
    : qtdPendentes > 0
      ? "PENDENTE"
      : finais.some((i) => i.status === "FALHA")
        ? "FALHA"
        : "ENVIANDO";

  await prisma.migracaoLegado.update({ where: { id: migracao.id }, data: { status } });

  return {
    ok: true,
    migracaoId: migracao.id,
    status,
    itens: finais.map(paraItemMigrado),
    pendentes: qtdPendentes,
    motivoInterrupcao: resultado.motivoInterrupcao,
  };
}

/**
 * A leitura de contexto falhou ANTES de qualquer escrita, então nada foi
 * migrado. O cabeçalho não pode ficar preso em "Em andamento": vira FALHA, com
 * o motivo, e dá para refazer sem risco. Migração que já tem perna pendente
 * mantém o status — ela continua sendo divergência aberta.
 */
async function abortarMigracao(
  migracaoId: string,
  statusAtual: string,
  erro: unknown,
): Promise<ResultadoMigracaoLegado> {
  const motivo = mensagemOmieIndisponivel(erro);
  if (statusAtual !== "PENDENTE") {
    await prisma.migracaoLegado.update({ where: { id: migracaoId }, data: { status: "FALHA" } });
    await prisma.migracaoLegadoItem.updateMany({
      where: { migracaoId, status: { in: ["PENDENTE", "FALHA"] } },
      data: { status: "FALHA", motivoErro: motivo },
    });
  }
  return { ok: false, erro: motivo, itens: [] };
}

function paraItemMigrado(item: {
  localNome: string | null;
  localCodigo: string;
  quantidadeLegado: unknown;
  quantidadeNovo: unknown;
  status: string;
  motivoErro: string | null;
}): ItemMigrado {
  return {
    localNome: item.localNome ?? item.localCodigo,
    quantidadeLegado: decimal(item.quantidadeLegado),
    quantidadeNovo: decimal(item.quantidadeNovo),
    status: item.status,
    motivo: item.motivoErro ?? undefined,
  };
}

/**
 * Tira a tag de aposentado: o código volta para a fila e volta a ser oferecido
 * como substituto.
 *
 * NÃO desfaz o saldo migrado nem a inativação no Omie, e isso é deliberado:
 * material não volta por causa de um clique numa tag, e reativar no Omie é uma
 * escrita que merece a mesma cerimônia da inativação. O registro de que houve
 * migração fica onde estava.
 */
export async function reativarLegado(input: ReativarLegadoInput): Promise<ResultadoSalvar> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const parsed = reativarLegadoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: "Código inválido." };

  const atual = await prisma.deParaProduto.findUnique({
    where: { codigoLegado: parsed.data.codigoLegado },
    select: { aposentadoEm: true, inativadoNoOmieEm: true },
  });
  if (!atual?.aposentadoEm) return { ok: true };

  await prisma.deParaProduto.update({
    where: { codigoLegado: parsed.data.codigoLegado },
    data: { aposentadoEm: null, aposentadoPorId: null },
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "depara.reativar",
    entity: "DeParaProduto",
    entityId: parsed.data.codigoLegado,
    summary:
      `Código antigo ${parsed.data.codigoLegado} reativado aqui` +
      (atual.inativadoNoOmieEm ? " (o cadastro segue INATIVO no Omie)." : "."),
    before: { aposentadoEm: atual.aposentadoEm },
    req: await requestHeaders(),
  });

  revalidatePath("/de-para");
  return { ok: true };
}

export interface EntradaNoAposentado {
  codigoLegado: string;
  codigoNovo: string | null;
  saldoAtual: number;
  saldoMigrado: number;
  aposentadoEm?: string;
}

export interface ResultadoEntradas {
  ok: boolean;
  erro?: string;
  entradas: EntradaNoAposentado[];
}

/**
 * Códigos já aposentados que VOLTARAM a ter saldo.
 *
 * É a resposta ao caso da nota fiscal que chega com o PRD antigo: o
 * recebimento entra no Omie no código velho, o saldo reaparece num cadastro que
 * já deveria estar zerado, e sem alguém olhando isso fica invisível — o
 * material existe, mas nenhuma OP nova o encontra, porque as OPs pedem o código
 * novo.
 *
 * A detecção é pelo SALDO e não pela nota de propósito: qualquer entrada conta
 * (NF, ajuste manual, devolução), e o saldo é a única leitura que já fazemos e
 * que não depende de qual módulo do Omie originou o lançamento.
 */
export async function entradasEmAposentados(): Promise<ResultadoEntradas> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, entradas: [] };

  const aposentados = await prisma.deParaProduto.findMany({
    where: { aposentadoEm: { not: null } },
    select: { codigoLegado: true, codigoNovo: true, saldoMigrado: true, aposentadoEm: true },
    orderBy: { aposentadoEm: "desc" },
    take: 100,
  });
  if (aposentados.length === 0) return { ok: true, entradas: [] };

  let saldos: Map<string, number>;
  try {
    saldos = await saldoTotalPorCodigo(
      aposentados.map((a) => a.codigoLegado),
      dataOmieHoje(),
      chamar,
    );
  } catch (erro) {
    return { ok: false, erro: mensagemOmieIndisponivel(erro), entradas: [] };
  }

  const entradas: EntradaNoAposentado[] = [];
  for (const item of aposentados) {
    const saldoAtual = saldos.get(item.codigoLegado) ?? 0;
    if (saldoAtual <= 0) continue;
    entradas.push({
      codigoLegado: item.codigoLegado,
      codigoNovo: item.codigoNovo,
      saldoAtual,
      saldoMigrado: decimal(item.saldoMigrado),
      aposentadoEm: item.aposentadoEm?.toISOString(),
    });
  }

  return { ok: true, entradas };
}

/**
 * Manda para o código novo o saldo que reapareceu num código aposentado.
 *
 * Reusa o mesmo caminho da migração original (mesma tabela, mesma idempotência,
 * mesmo tratamento de saída/entrada), porque é a mesma operação: o material
 * entrou no lugar errado e precisa ir para o certo. O que muda é só a origem do
 * pedido — aqui é o alerta, não a aposentadoria.
 */
export async function migrarEntradaTardia(input: PendenciasLegadoInput): Promise<ResultadoMigracaoLegado> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, itens: [] };

  const parsed = pendenciasLegadoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: "Código inválido.", itens: [] };
  const { codigoLegado } = parsed.data;

  const par = await prisma.deParaProduto.findUnique({
    where: { codigoLegado },
    select: { id: true, codigoNovo: true, aposentadoEm: true, saldoMigrado: true },
  });
  if (!par?.codigoNovo || !par.aposentadoEm) {
    return { ok: false, erro: "Este código não está aposentado com um par definido.", itens: [] };
  }

  const conferencia = await pendenciasLegado({ codigoLegado });
  if (!conferencia.ok) return { ok: false, erro: conferencia.erro, itens: [] };
  if (conferencia.impedimento) return { ok: false, erro: conferencia.impedimento, itens: [] };
  if (conferencia.saldos.length === 0) {
    return { ok: false, erro: "Este código já está zerado em todos os locais.", itens: [] };
  }

  const fator = conferencia.conversao?.fator ?? 1;
  const migracao = await prisma.migracaoLegado.create({
    data: {
      deParaId: par.id,
      autorId: guarda.userId,
      codigoLegado,
      codigoNovo: par.codigoNovo,
      fator: new Prisma.Decimal(fator),
      totalLocais: conferencia.saldos.length,
      itens: {
        create: conferencia.saldos.map((s) => ({
          localCodigo: s.localCodigo,
          localNome: s.localNome,
          quantidadeLegado: new Prisma.Decimal(s.saldo),
          quantidadeNovo: new Prisma.Decimal(s.quantidadeNova ?? s.saldo),
          custoUnitario: new Prisma.Decimal(s.cmc),
        })),
      },
    },
  });

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "depara.migrar_entrada_tardia",
    entity: "DeParaProduto",
    entityId: codigoLegado,
    summary:
      `Entrada nova no código aposentado ${codigoLegado} mandada para ${par.codigoNovo}: ` +
      `${conferencia.saldoTotal} em ${conferencia.saldos.length} local(is).`,
    after: { codigoNovo: par.codigoNovo, total: conferencia.saldoTotal },
    omieTarget: "omie",
    req: await requestHeaders(),
  });

  const execucao = await rodarMigracao(migracao.id);

  if (execucao.status === "CONCLUIDO") {
    await prisma.deParaProduto.update({
      where: { codigoLegado },
      data: {
        migradoEm: new Date(),
        saldoMigrado: new Prisma.Decimal(decimal(par.saldoMigrado) + conferencia.saldoTotal),
      },
    });
  }

  revalidatePath("/de-para");
  return execucao;
}

/**
 * Retoma uma migração que ficou com local em SAIDA_OK (o saldo saiu do código
 * antigo e não entrou no novo). Os locais e as quantidades vêm do BANCO.
 */
export async function continuarMigracao(migracaoId: string): Promise<ResultadoMigracaoLegado> {
  const guarda = await guardar();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro, itens: [] };

  const migracao = await prisma.migracaoLegado.findUnique({
    where: { id: String(migracaoId ?? "").trim() },
    select: { id: true, codigoLegado: true, codigoNovo: true },
  });
  if (!migracao) return { ok: false, erro: "Migração não encontrada.", itens: [] };

  await audit({
    actor: { id: guarda.userId, email: guarda.email },
    action: "depara.migrar_continuar",
    entity: "MigracaoLegado",
    entityId: migracao.id,
    summary: `Retomada da migração ${migracao.codigoLegado} → ${migracao.codigoNovo}.`,
    omieTarget: "omie",
    req: await requestHeaders(),
  });

  const resultado = await rodarMigracao(migracao.id);
  revalidatePath("/de-para");
  return resultado;
}
