"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  removerDeParaSchema,
  salvarDeParaSchema,
  type RemoverDeParaInput,
  type SalvarDeParaInput,
} from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { montarFila, type SugestaoDePara } from "@/lib/depara/depara";
import { listarLegadosComSaldo } from "@/lib/depara/legado";
import { dataOmieHoje } from "@/lib/estoque/omieEstoque";
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

export interface OpcaoMat {
  codigo: string;
  descricao: string;
  unidade: string;
  /** Cadastro com liga contraditória entre código e descrição — nunca automático. */
  ambiguo: boolean;
}

export interface DecisaoSalva {
  codigoNovo: string | null;
  confianca: string;
  observacao?: string;
  confirmadoPor?: string;
  confirmadoEm?: string;
}

export interface LinhaFila {
  codigo: string;
  descricao: string;
  saldo: number;
  sugestao: SugestaoDePara;
  decidido?: DecisaoSalva;
}

export interface ResultadoFila {
  ok: boolean;
  erro?: string;
  linhas: LinhaFila[];
  opcoes: OpcaoMat[];
  /** Quantos itens legados com saldo o local tinha antes do filtro de decididos. */
  total: number;
  decididos: number;
}

const FILA_VAZIA: ResultadoFila = { ok: false, linhas: [], opcoes: [], total: 0, decididos: 0 };

function paraOpcao(item: ItemMat): OpcaoMat {
  return {
    codigo: item.codigo,
    descricao: parteDescritiva(item.codigo, item.descricao),
    unidade: item.unidade,
    ambiguo: item.ambiguo,
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

  const decisoes = await prisma.deParaProduto.findMany({
    where: { codigoLegado: { in: legados.map((l) => l.codigo) } },
    select: {
      codigoLegado: true,
      codigoNovo: true,
      confianca: true,
      observacao: true,
      confirmadoEm: true,
      confirmadoPor: { select: { name: true } },
    },
  });
  const porLegado = new Map(decisoes.map((d) => [d.codigoLegado, d]));

  const linhas: LinhaFila[] = montarFila(legados, catalogo).map((linha) => {
    const decisao = porLegado.get(linha.codigo);
    return {
      codigo: linha.codigo,
      descricao: linha.descricao,
      saldo: linha.saldo ?? 0,
      sugestao: linha.sugestao,
      decidido: decisao
        ? {
            codigoNovo: decisao.codigoNovo,
            confianca: decisao.confianca,
            observacao: decisao.observacao ?? undefined,
            confirmadoPor: decisao.confirmadoPor?.name,
            confirmadoEm: decisao.confirmadoEm?.toISOString(),
          }
        : undefined,
    };
  });

  return {
    ok: true,
    linhas,
    opcoes: catalogo.map(paraOpcao),
    total: linhas.length,
    decididos: linhas.filter((l) => l.decidido).length,
  };
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

  const anterior = await prisma.deParaProduto.findUnique({
    where: { codigoLegado: dados.codigoLegado },
    select: { codigoNovo: true, confianca: true },
  });

  const comum = {
    descricaoLegado: dados.descricaoLegado,
    unidadeLegado: dados.unidadeLegado ?? null,
    codigoNovo,
    descricaoNovo: dados.descricaoNovo ?? null,
    unidadeNovo: dados.unidadeNovo ?? null,
    confianca: dados.confianca,
    motivo: dados.motivo ?? null,
    observacao: dados.observacao ?? null,
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
      ? `De/Para: ${dados.codigoLegado} → ${codigoNovo} (${dados.confianca.toLowerCase()}).`
      : `De/Para: ${dados.codigoLegado} marcado como sem equivalente.`,
    before: anterior ?? undefined,
    after: { codigoNovo, confianca: dados.confianca },
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
    select: { codigoNovo: true, confianca: true },
  });
  if (!anterior) return { ok: true };

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
