"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  cancelarRequisicaoSchema,
  criarRequisicaoSchema,
  decidirRequisicaoSchema,
  formatarNumeroRequisicao,
  reprocessarRequisicaoSchema,
} from "@/lib/contracts";
import { formatarDataHora } from "@/lib/datas";
import type { RequisicaoRelatorio } from "@/lib/requisicoes/relatorio";
import { prisma } from "@/lib/db";
import { locaisDisponiveis } from "@/lib/estoque/estoque.server";
import {
  LOCAL_PADRAO,
  baixarEstoque,
  buscarProdutosPorCodigo,
  buscarProdutosPorDescricao,
  dataOmieHoje,
  lotesPorCodigo,
  nomeDoLocal,
  saldoTotalPorCodigo,
  saldosPorCodigo,
  type ItemBaixa,
  type LoteDisponivel,
  type ProdutoEstoque,
  type ProdutoResumo,
} from "@/lib/estoque/omieEstoque";
import type { FormState } from "@/lib/form";
import { chamar } from "@/lib/omie";
import { OmieBlocked } from "@/lib/omie/errors";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canCancelRequisicao, canDecideRequisicao, canViewRequisicoes } from "@/lib/rbac";
import { agruparPorLocal, localEfetivo } from "@/lib/requisicoes/locaisPorItem";
import { requestHeaders } from "@/lib/request";

function unauthenticated(): FormState {
  return { status: "error", message: "Sessão expirada. Entre novamente." };
}

function omieConfigurado(): boolean {
  return Boolean(process.env.OMIE_APP_KEY && process.env.OMIE_APP_SECRET);
}

function parseItens(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export interface ResultadoBuscaProduto {
  ok: boolean;
  erro?: string;
  produtos: ProdutoResumo[];
}

// Busca de produto pra montar o pedido: o solicitante digita parte da descrição
// (ex.: "cama") ou o próprio código e escolhe na lista, sem decorar SKU. Só
// leitura (cacheada por termo no client Omie). Qualquer papel com o módulo.
export async function buscarProdutosOmie(termo: string): Promise<ResultadoBuscaProduto> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, erro: "Sessão expirada. Entre novamente.", produtos: [] };
  }
  const permissions = await getRolePermissionsMap();
  if (!canViewRequisicoes(session.user.role, permissions)) {
    return { ok: false, erro: "Você não tem permissão para buscar produtos.", produtos: [] };
  }
  const q = String(termo ?? "").trim();
  if (q.length < 2) {
    return { ok: true, produtos: [] };
  }
  if (!omieConfigurado()) {
    return { ok: false, erro: "Integração com o Omie não configurada no servidor.", produtos: [] };
  }
  try {
    const produtos = await buscarProdutosPorDescricao(q, chamar);
    return { ok: true, produtos };
  } catch (erro) {
    if (erro instanceof OmieBlocked) {
      return { ok: false, erro: "O Omie está indisponível agora. Tente em instantes.", produtos: [] };
    }
    return { ok: false, erro: "Não consegui buscar no Omie agora. Tente de novo.", produtos: [] };
  }
}

export interface ResultadoSaldoProduto {
  ok: boolean;
  saldo?: number; // total em todos os locais do Omie
}

// Saldo total (todos os locais) de um produto — mostrado ao lado do item depois
// que o solicitante escolhe na busca. Best-effort: erro/Omie fora → ok:false (a
// UI só não mostra o número, não atrapalha o pedido).
export async function saldoDoProduto(sku: string): Promise<ResultadoSaldoProduto> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false };
  const permissions = await getRolePermissionsMap();
  if (!canViewRequisicoes(session.user.role, permissions)) return { ok: false };
  const codigo = String(sku ?? "").trim();
  if (!codigo || !omieConfigurado()) return { ok: false };
  try {
    const saldos = await saldoTotalPorCodigo([codigo], dataOmieHoje(), chamar);
    const saldo = saldos.get(codigo);
    return saldo === undefined ? { ok: false } : { ok: true, saldo };
  } catch {
    return { ok: false };
  }
}

// Cria a requisição (qualquer papel com o módulo, inclusive FABRICA). Valida os
// SKUs contra o Omie JÁ NA CRIAÇÃO (leitura em lote, cacheada): pedido só entra
// na fila do gestor com códigos que existem — a descrição vem do cadastro real.
export async function criarRequisicao(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return unauthenticated();
  }

  const permissions = await getRolePermissionsMap();
  if (!canViewRequisicoes(session.user.role, permissions)) {
    return { status: "error", message: "Você não tem permissão para criar requisições." };
  }

  const parsed = criarRequisicaoSchema.safeParse({
    solicitanteNome: formData.get("solicitanteNome"),
    setorId: formData.get("setorId"),
    observacao: String(formData.get("observacao") ?? "").trim() || undefined,
    itens: parseItens(formData.get("itens")),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Confira o pedido: informe quem está pedindo, o setor e ao menos um item com código e quantidade.",
    };
  }
  const { solicitanteNome, setorId, observacao, itens } = parsed.data;

  const skusDuplicados = itens.length !== new Set(itens.map((i) => i.sku)).size;
  if (skusDuplicados) {
    return { status: "error", message: "Há itens repetidos no pedido. Some as quantidades num item só." };
  }

  const setor = await prisma.setor.findUnique({ where: { id: setorId }, select: { id: true, nome: true } });
  if (!setor) {
    return { status: "error", message: "Setor inválido." };
  }

  if (!omieConfigurado()) {
    return {
      status: "error",
      message: "Integração com o Omie não configurada no servidor (OMIE_APP_KEY/OMIE_APP_SECRET).",
    };
  }

  let produtos: Map<string, ProdutoEstoque>;
  try {
    produtos = await buscarProdutosPorCodigo(itens.map((i) => i.sku), chamar);
  } catch (erro) {
    if (erro instanceof OmieBlocked) {
      return {
        status: "error",
        message: "O Omie está temporariamente indisponível (bloqueio de consumo). Tente de novo em alguns minutos.",
      };
    }
    return { status: "error", message: "Não consegui validar os códigos no Omie agora. Tente novamente." };
  }

  const desconhecidos = itens.filter((i) => !produtos.has(i.sku)).map((i) => i.sku);
  if (desconhecidos.length > 0) {
    return {
      status: "error",
      message: `Código(s) não encontrado(s) no Omie: ${desconhecidos.join(", ")}. Confira o SKU.`,
    };
  }

  const criada = await prisma.requisicao.create({
    data: {
      solicitanteId: session.user.id,
      solicitanteNome,
      setorId,
      observacao,
      itens: {
        create: itens.map((item) => ({
          sku: item.sku,
          descricao: produtos.get(item.sku)?.descricao ?? "",
          quantidade: item.quantidade,
          // Unidade congelada no momento do pedido (o cadastro do Omie pode
          // mudar depois; o pedido tem que mostrar em que unidade foi feito).
          unidade: produtos.get(item.sku)?.unidade ?? null,
          omieIdProd: produtos.get(item.sku)?.idProd,
        })),
      },
    },
    select: { id: true, numero: true },
  });

  const numero = formatarNumeroRequisicao(criada.numero);
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "requisicao.criar",
    entity: "Requisicao",
    entityId: criada.id,
    summary: `Criou a requisição ${numero} (${itens.length} item(ns)) para o setor ${setor.nome}, solicitante ${solicitanteNome}.`,
    after: { numero, solicitanteNome, setor: setor.nome, itens },
    req: await requestHeaders(),
  });

  revalidatePath("/requisicoes");
  return {
    status: "success",
    message: `Requisição ${numero} criada. O gestor vai receber o pedido para confirmar.`,
  };
}

interface ItemParaBaixa {
  id: string;
  sku: string;
  quantidade: number;
}

interface ResultadoBaixaItens {
  itens: { chave: string; sku: string; outcome: string; motivo?: string; omieRef?: string }[];
  interrompido: boolean;
  bloqueado: boolean;
  motivoInterrupcao?: string;
}

type ExecucaoBaixa =
  | { ok: true; resultado: ResultadoBaixaItens; nomesPorLocal: Map<string, string | undefined> }
  | { ok: false; erro: string };

// Miolo da baixa de itens de requisição no Omie, compartilhado pela CONFIRMAÇÃO
// (`decidirRequisicao`) e pelo REPROCESSAMENTO dos itens com falha
// (`reprocessarItensRequisicao`): as duas fazem exatamente a mesma coisa com o
// Omie, o que muda é quais itens entram e o que o banco vira depois.
//
// Agrupa por local efetivo, lê produtos/saldos/lotes uma vez por local (leitura
// cacheada, sequencial) e baixa grupo a grupo. Interrompeu num grupo (bloqueio
// da Omie ou pausa de segurança), os grupos seguintes nem começam: os itens
// saem como "nao_baixado" pra próxima tentativa (a baixa é idempotente pelo
// `cod_int_ajuste` = id do item).
async function executarBaixaPorLocal(
  itens: readonly ItemParaBaixa[],
  localPorItem: ReadonlyMap<string, string>,
  obs: string,
): Promise<ExecucaoBaixa> {
  const grupos = agruparPorLocal(itens, (item) => localPorItem.get(item.id) ?? LOCAL_PADRAO);

  let produtos: Map<string, ProdutoEstoque>;
  const saldosPorLocal = new Map<string, Awaited<ReturnType<typeof saldosPorCodigo>>>();
  const lotesPorLocal = new Map<string, Map<string, LoteDisponivel[]>>();
  try {
    // Resolvemos os produtos de novo (em vez de reusar só o id salvo na criação)
    // porque precisamos do `produto_lote` pra saber quais itens exigem lote.
    produtos = await buscarProdutosPorCodigo([...new Set(itens.map((item) => item.sku))], chamar);
    for (const [local, itensDoLocal] of grupos) {
      const skusDoLocal = itensDoLocal.map((item) => item.sku);
      saldosPorLocal.set(local, await saldosPorCodigo(skusDoLocal, dataOmieHoje(), chamar, local));
      lotesPorLocal.set(local, await lotesPorCodigo(produtos, skusDoLocal, chamar, local));
    }
  } catch (erro) {
    if (erro instanceof OmieBlocked) {
      return {
        ok: false,
        erro: "O Omie está temporariamente indisponível (bloqueio de consumo). Tente de novo em alguns minutos.",
      };
    }
    return { ok: false, erro: "Não consegui consultar o saldo no Omie agora. Tente novamente." };
  }

  const nomesPorLocal = new Map<string, string | undefined>();
  for (const local of grupos.keys()) {
    nomesPorLocal.set(local, await nomeDoLocal(local, chamar));
  }

  const resultado: ResultadoBaixaItens = { itens: [], interrompido: false, bloqueado: false };
  for (const [local, itensDoLocal] of grupos) {
    if (resultado.interrompido) {
      for (const item of itensDoLocal) {
        resultado.itens.push({
          chave: item.id,
          sku: item.sku,
          outcome: "nao_baixado",
          motivo: "Baixa interrompida antes de chegar neste item.",
        });
      }
      continue;
    }
    const itensBaixa: ItemBaixa[] = itensDoLocal.map((item) => ({
      chave: item.id,
      sku: item.sku,
      quantidade: item.quantidade,
      obs,
    }));
    const parcial = await baixarEstoque(
      itensBaixa,
      {
        data: dataOmieHoje(),
        produtos,
        saldos: saldosPorLocal.get(local) ?? new Map(),
        lotes: lotesPorLocal.get(local),
        codigoLocal: local,
      },
      chamar,
    );
    resultado.itens.push(...parcial.itens);
    if (parcial.interrompido) {
      resultado.interrompido = true;
      resultado.bloqueado = parcial.bloqueado;
      resultado.motivoInterrupcao = parcial.motivoInterrupcao;
    }
  }

  return { ok: true, resultado, nomesPorLocal };
}

// Decisão do gestor (GESTOR/ADMIN — regra fixa). RECUSAR só marca o status;
// CONFIRMAR dispara a baixa de estoque no Omie item a item (local padrão).
// Se o Omie interromper (bloqueio/pausa de segurança), a requisição CONTINUA
// pendente: os itens já baixados ficam marcados e o reenvio é idempotente
// (cod_int_ajuste = id do item), então confirmar de novo só baixa o restante.
export async function decidirRequisicao(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return unauthenticated();
  }

  const permissions = await getRolePermissionsMap();
  if (!canDecideRequisicao(session.user.role, permissions)) {
    return { status: "error", message: "Apenas Gestor ou Administrador decide requisições." };
  }

  const parsed = decidirRequisicaoSchema.safeParse({
    id: formData.get("id"),
    decisao: formData.get("decisao"),
    motivo: String(formData.get("motivo") ?? "").trim() || undefined,
    localCodigo: String(formData.get("localCodigo") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Decisão inválida." };
  }
  const { id, decisao, motivo } = parsed.data;
  const localCodigo = parsed.data.localCodigo ?? LOCAL_PADRAO;

  const requisicao = await prisma.requisicao.findUnique({
    where: { id },
    include: { itens: true, setor: { select: { nome: true } } },
  });
  if (!requisicao) {
    return { status: "error", message: "Requisição não encontrada." };
  }
  if (requisicao.cancelada) {
    return { status: "error", message: "Esta requisição foi excluída e não pode mais ser decidida." };
  }
  if (requisicao.status !== "PENDENTE") {
    return { status: "error", message: "Esta requisição já foi decidida." };
  }

  const numero = formatarNumeroRequisicao(requisicao.numero);

  if (decisao === "RECUSAR") {
    if (!motivo) {
      return { status: "error", message: "Informe o motivo da recusa." };
    }
    await prisma.requisicao.update({
      where: { id },
      data: { status: "RECUSADA", gestorId: session.user.id, motivoDecisao: motivo, decididaEm: new Date() },
    });
    await audit({
      actor: { id: session.user.id, email: session.user.email },
      action: "requisicao.recusar",
      entity: "Requisicao",
      entityId: id,
      summary: `Recusou a requisição ${numero}. Motivo: ${motivo}`,
      before: { status: "PENDENTE" },
      after: { status: "RECUSADA", motivo },
      req: await requestHeaders(),
    });
    revalidatePath("/requisicoes");
    return { status: "success", message: `Requisição ${numero} recusada.` };
  }

  if (!omieConfigurado()) {
    return {
      status: "error",
      message: "Integração com o Omie não configurada no servidor (OMIE_APP_KEY/OMIE_APP_SECRET).",
    };
  }

  // Itens que ainda precisam de baixa (BAIXADO fica de fora — reconfirmação
  // após uma interrupção não baixa duas vezes).
  const pendentes = requisicao.itens.filter((item) => item.status !== "BAIXADO");
  if (pendentes.length === 0) {
    return { status: "error", message: "Todos os itens desta requisição já foram baixados." };
  }

  // Local POR ITEM (opcional): o form do gestor pode mandar `localItem__<id>`
  // pra cada item; sem escolha, o item herda o local do pedido.
  const localPorItem = new Map(
    pendentes.map((item) => [item.id, localEfetivo(formData.get(`localItem__${item.id}`), localCodigo)]),
  );

  const obs = `Requisição ${numero} — solicitante: ${requisicao.solicitanteNome} (setor ${requisicao.setor.nome}). Confirmada por ${session.user.email}.`;

  // Persiste o local do PEDIDO antes da baixa: numa interrupção (ou numa falha
  // de leitura), a tela mostra de onde a baixa saiu e a reconfirmação já sugere
  // o mesmo local.
  const localNome = await nomeDoLocal(localCodigo, chamar);
  await prisma.requisicao.update({
    where: { id },
    data: { localEstoqueCodigo: localCodigo, localEstoqueNome: localNome },
  });

  const execucao = await executarBaixaPorLocal(
    pendentes.map((item) => ({ id: item.id, sku: item.sku, quantidade: Number(item.quantidade) })),
    localPorItem,
    obs,
  );
  if (!execucao.ok) {
    return { status: "error", message: execucao.erro };
  }
  const { resultado, nomesPorLocal } = execucao;

  // Reflete o resultado por item no banco + trilha de movimentos dos baixados.
  const agora = new Date();
  for (const item of resultado.itens) {
    if (item.outcome === "baixado" || item.outcome === "ja_baixado") {
      const localDoItem = localPorItem.get(item.chave) ?? localCodigo;
      await prisma.requisicaoItem.update({
        where: { id: item.chave },
        data: {
          status: "BAIXADO",
          motivoErro: null,
          omieRef: item.omieRef,
          baixadoEm: agora,
          localEstoqueCodigo: localDoItem,
          localEstoqueNome: nomesPorLocal.get(localDoItem),
        },
      });
      const original = pendentes.find((p) => p.id === item.chave);
      if (item.outcome === "baixado" && original) {
        await prisma.movimentoEstoque.create({
          data: {
            tipo: "SAIDA",
            sku: item.sku,
            quantidade: original.quantidade,
            omieRef: item.omieRef,
            requisicaoItemId: item.chave,
          },
        });
      }
      continue;
    }
    if (item.outcome === "falha") {
      await prisma.requisicaoItem.update({
        where: { id: item.chave },
        data: { status: "FALHA", motivoErro: item.motivo ?? "Falha na baixa." },
      });
    }
    // "nao_baixado" fica PENDENTE para a próxima confirmação.
  }

  const baixados = resultado.itens.filter((i) => i.outcome === "baixado" || i.outcome === "ja_baixado").length;
  const falhas = resultado.itens.filter((i) => i.outcome === "falha").length;
  const naoBaixados = resultado.itens.filter((i) => i.outcome === "nao_baixado").length;

  if (resultado.interrompido) {
    await audit({
      actor: { id: session.user.id, email: session.user.email },
      action: "requisicao.confirmar",
      entity: "Requisicao",
      entityId: id,
      summary: `Confirmação da ${numero} interrompida: ${baixados} baixado(s), ${falhas} falha(s), ${naoBaixados} não baixado(s). ${resultado.motivoInterrupcao ?? ""}`.trim(),
      after: { baixados, falhas, naoBaixados, interrompido: true, bloqueado: resultado.bloqueado },
      req: await requestHeaders(),
    });
    revalidatePath("/requisicoes");
    return {
      status: "error",
      message:
        resultado.motivoInterrupcao ??
        "A baixa foi interrompida. Os itens já baixados ficaram salvos; confirme de novo mais tarde para o restante.",
    };
  }

  await prisma.requisicao.update({
    where: { id },
    data: {
      status: "CONFIRMADA",
      gestorId: session.user.id,
      motivoDecisao: motivo,
      decididaEm: agora,
    },
  });

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "requisicao.confirmar",
    entity: "Requisicao",
    entityId: id,
    summary: `Confirmou a requisição ${numero}: ${baixados} item(ns) baixado(s) no estoque${localNome ? ` (local ${localNome})` : ""}${falhas > 0 ? `, ${falhas} com falha` : ""}.`,
    before: { status: "PENDENTE" },
    after: { status: "CONFIRMADA", baixados, falhas, localEstoque: localNome ?? localCodigo },
    req: await requestHeaders(),
  });

  revalidatePath("/requisicoes");
  if (falhas > 0) {
    return {
      status: "success",
      message: `Requisição ${numero} confirmada: ${baixados} baixado(s), ${falhas} com falha. O pedido foi para "Itens com falha", onde dá para tentar a baixa de novo em outro local.`,
    };
  }
  return { status: "success", message: `Requisição ${numero} confirmada e estoque baixado no Omie.` };
}

export interface SaldoItemPorLocal {
  sku: string;
  descricao: string;
  quantidade: number; // o que o pedido precisa (pra marcar onde dá pra baixar)
  saldos: Record<string, number>; // código do local → saldo hoje
}

export interface ResultadoSaldosPorLocal {
  ok: boolean;
  erro?: string;
  locais: { codigo: string; descricao: string; padrao: boolean }[];
  itens: SaldoItemPorLocal[];
}

// Saldo de CADA item com falha em CADA local de estoque, pro gestor ver de onde
// dá pra baixar em vez de ir trocando o local no chute. Uma leitura por local
// (`ListarPosEstoque` já é em lote pelos SKUs), cacheada 60s pelo client — e com
// `cExibeTodos: "S"` um local zerado volta 0 sem virar fault, então isto não
// gasta orçamento de bloqueio da Omie (§6).
//
// Best-effort e SÓ LEITURA: qualquer erro devolve `ok:false` e a tela segue
// funcionando sem os números (o gestor ainda escolhe o local na mão).
export async function saldosPorLocalDosItens(requisicaoId: string): Promise<ResultadoSaldosPorLocal> {
  const vazio = { locais: [], itens: [] };
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, erro: "Sessão expirada. Entre novamente.", ...vazio };
  }
  const permissions = await getRolePermissionsMap();
  if (!canDecideRequisicao(session.user.role, permissions)) {
    return { ok: false, erro: "Você não tem permissão para ver o saldo por local.", ...vazio };
  }
  if (!omieConfigurado()) {
    return { ok: false, erro: "Integração com o Omie não configurada no servidor.", ...vazio };
  }

  const alvo = String(requisicaoId ?? "").trim();
  if (!alvo) {
    return { ok: false, erro: "Requisição inválida.", ...vazio };
  }
  const requisicao = await prisma.requisicao.findUnique({
    where: { id: alvo },
    select: {
      itens: {
        where: { status: "FALHA" },
        select: { sku: true, descricao: true, quantidade: true },
        orderBy: { sku: "asc" },
      },
    },
  });
  if (!requisicao || requisicao.itens.length === 0) {
    return { ok: false, erro: "Nenhum item com falha neste pedido.", ...vazio };
  }

  const locais = await locaisDisponiveis();
  if (locais.length === 0) {
    return { ok: false, erro: "Não consegui listar os locais de estoque do Omie agora.", ...vazio };
  }

  const skus = [...new Set(requisicao.itens.map((item) => item.sku))];
  const data = dataOmieHoje();
  const porLocal = new Map<string, Awaited<ReturnType<typeof saldosPorCodigo>>>();
  try {
    for (const local of locais) {
      porLocal.set(local.codigo, await saldosPorCodigo(skus, data, chamar, local.codigo));
    }
  } catch (erro) {
    if (erro instanceof OmieBlocked) {
      return { ok: false, erro: "O Omie está indisponível agora. Tente em instantes.", ...vazio };
    }
    return { ok: false, erro: "Não consegui ler o saldo por local no Omie agora.", ...vazio };
  }

  return {
    ok: true,
    locais: locais.map((local) => ({
      codigo: local.codigo,
      descricao: local.descricao,
      padrao: local.padrao,
    })),
    itens: requisicao.itens.map((item) => ({
      sku: item.sku,
      descricao: item.descricao,
      quantidade: Number(item.quantidade),
      saldos: Object.fromEntries(
        locais.map((local) => [local.codigo, porLocal.get(local.codigo)?.get(item.sku)?.saldo ?? 0]),
      ),
    })),
  };
}

// Nova tentativa de baixa dos itens que ficaram em FALHA num pedido JÁ
// CONFIRMADA — o caso típico é saldo insuficiente NAQUELE local: o material
// existe, só está em outro estoque. Sem isto, o item falho ficava travado pra
// sempre (a confirmação exige status PENDENTE) e a única saída era excluir o
// pedido e refazer.
//
// Só entram os itens com status FALHA: os já baixados nem são tocados, então
// nada baixa duas vezes. O pedido CONTINUA CONFIRMADA e a decisão original
// (gestor, data, motivo) fica preservada — isto não é uma re-decisão, é uma
// nova tentativa de execução. A baixa usa o mesmo `cod_int_ajuste` (id do item)
// da confirmação: se a baixa original tinha entrado no Omie sem a gente saber, o
// Omie devolve duplicado e o item vira "já baixado" em vez de duplicar a saída.
export async function reprocessarItensRequisicao(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return unauthenticated();
  }

  const permissions = await getRolePermissionsMap();
  if (!canDecideRequisicao(session.user.role, permissions)) {
    return { status: "error", message: "Apenas o Gestor da Fábrica, Gestor ou Administrador reprocessa itens." };
  }

  const parsed = reprocessarRequisicaoSchema.safeParse({
    id: formData.get("id"),
    localCodigo: String(formData.get("localCodigo") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Pedido inválido." };
  }
  const { id } = parsed.data;
  const localCodigo = parsed.data.localCodigo ?? LOCAL_PADRAO;

  const requisicao = await prisma.requisicao.findUnique({
    where: { id },
    include: { itens: true, setor: { select: { nome: true } } },
  });
  if (!requisicao) {
    return { status: "error", message: "Requisição não encontrada." };
  }
  if (requisicao.cancelada) {
    return { status: "error", message: "Esta requisição foi excluída e não pode ser reprocessada." };
  }
  if (requisicao.status !== "CONFIRMADA") {
    return {
      status: "error",
      message:
        requisicao.status === "PENDENTE"
          ? "Este pedido ainda não foi confirmado — use \"Confirmar e baixar estoque\"."
          : "Só dá para reprocessar itens de um pedido confirmado.",
    };
  }

  const falhos = requisicao.itens.filter((item) => item.status === "FALHA");
  if (falhos.length === 0) {
    return { status: "error", message: "Nenhum item com falha para reprocessar neste pedido." };
  }

  if (!omieConfigurado()) {
    return {
      status: "error",
      message: "Integração com o Omie não configurada no servidor (OMIE_APP_KEY/OMIE_APP_SECRET).",
    };
  }

  const numero = formatarNumeroRequisicao(requisicao.numero);
  // Local por item (opcional), igual à confirmação: sem escolha pro item, ele
  // sai do local escolhido pra esta rodada.
  const localPorItem = new Map(
    falhos.map((item) => [item.id, localEfetivo(formData.get(`localItem__${item.id}`), localCodigo)]),
  );
  const obs = `Requisição ${numero} — solicitante: ${requisicao.solicitanteNome} (setor ${requisicao.setor.nome}). Reprocessada por ${session.user.email}.`;

  const execucao = await executarBaixaPorLocal(
    falhos.map((item) => ({ id: item.id, sku: item.sku, quantidade: Number(item.quantidade) })),
    localPorItem,
    obs,
  );
  if (!execucao.ok) {
    return { status: "error", message: execucao.erro };
  }
  const { resultado, nomesPorLocal } = execucao;

  const agora = new Date();
  for (const item of resultado.itens) {
    if (item.outcome === "baixado" || item.outcome === "ja_baixado") {
      const localDoItem = localPorItem.get(item.chave) ?? localCodigo;
      await prisma.requisicaoItem.update({
        where: { id: item.chave },
        data: {
          status: "BAIXADO",
          motivoErro: null,
          omieRef: item.omieRef,
          baixadoEm: agora,
          localEstoqueCodigo: localDoItem,
          localEstoqueNome: nomesPorLocal.get(localDoItem),
        },
      });
      const original = falhos.find((p) => p.id === item.chave);
      if (item.outcome === "baixado" && original) {
        await prisma.movimentoEstoque.create({
          data: {
            tipo: "SAIDA",
            sku: item.sku,
            quantidade: original.quantidade,
            omieRef: item.omieRef,
            requisicaoItemId: item.chave,
          },
        });
      }
      continue;
    }
    // Continua em FALHA (é o status que faz o item aparecer pra nova tentativa),
    // mas com o motivo ATUALIZADO — inclusive no "nao_baixado", pra o gestor não
    // ler o erro da rodada passada achando que foi o desta.
    await prisma.requisicaoItem.update({
      where: { id: item.chave },
      data: { status: "FALHA", motivoErro: item.motivo ?? "Falha na baixa." },
    });
  }

  const baixados = resultado.itens.filter((i) => i.outcome === "baixado" || i.outcome === "ja_baixado").length;
  const restantes = resultado.itens.length - baixados;

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "requisicao.reprocessar",
    entity: "Requisicao",
    entityId: id,
    summary:
      `Reprocessou ${falhos.length} item(ns) com falha da requisição ${numero}: ` +
      `${baixados} baixado(s), ${restantes} ainda com falha.` +
      (resultado.interrompido ? ` Interrompido: ${resultado.motivoInterrupcao ?? ""}` : ""),
    before: { itensComFalha: falhos.map((item) => ({ sku: item.sku, motivo: item.motivoErro })) },
    after: {
      baixados,
      restantes,
      interrompido: resultado.interrompido,
      locais: [...new Set(localPorItem.values())].map((local) => nomesPorLocal.get(local) ?? local),
    },
    req: await requestHeaders(),
  });

  revalidatePath("/requisicoes");

  if (resultado.interrompido) {
    return {
      status: "error",
      message:
        resultado.motivoInterrupcao ??
        "A baixa foi interrompida. Os itens que saíram ficaram salvos, tente de novo mais tarde para o restante.",
    };
  }
  if (baixados === 0) {
    return {
      status: "error",
      message: `Nenhum item da ${numero} saiu nesta tentativa. Veja o motivo atualizado em cada item.`,
    };
  }
  if (restantes > 0) {
    return {
      status: "success",
      message: `${numero}: ${baixados} item(ns) baixado(s) agora, ${restantes} ainda com falha.`,
    };
  }
  return {
    status: "success",
    message: `${numero}: os ${baixados} item(ns) que faltavam foram baixados no Omie.`,
  };
}

// Arquiva / desarquiva um pedido JÁ DECIDIDO (gestor/admin). Não apaga nada: só
// tira das listas do dia a dia — arquivadas ficam atrás do filtro "Arquivadas" e
// continuam no relatório. Pendentes não podem ser arquivados (precisam de
// decisão). Idempotente: arquivar o que já está arquivado devolve sucesso.
export async function arquivarRequisicao(id: string, arquivar: boolean = true): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return unauthenticated();
  }
  const permissions = await getRolePermissionsMap();
  if (!canDecideRequisicao(session.user.role, permissions)) {
    return { status: "error", message: "Apenas Gestor ou Administrador arquiva requisições." };
  }
  const alvo = String(id ?? "").trim();
  if (!alvo) {
    return { status: "error", message: "Requisição inválida." };
  }

  const requisicao = await prisma.requisicao.findUnique({
    where: { id: alvo },
    select: { id: true, numero: true, status: true, arquivada: true, cancelada: true },
  });
  if (!requisicao) {
    return { status: "error", message: "Requisição não encontrada." };
  }
  if (requisicao.cancelada) {
    return { status: "error", message: "Esta requisição foi excluída — o arquivamento dela é definitivo." };
  }
  if (arquivar && requisicao.status === "PENDENTE") {
    return { status: "error", message: "Só dá para arquivar pedidos já confirmados ou recusados." };
  }

  const numero = formatarNumeroRequisicao(requisicao.numero);
  if (requisicao.arquivada === arquivar) {
    revalidatePath("/requisicoes");
    return { status: "success", message: `Requisição ${numero} ${arquivar ? "arquivada" : "desarquivada"}.` };
  }

  await prisma.requisicao.update({
    where: { id: alvo },
    data: { arquivada: arquivar, arquivadaEm: arquivar ? new Date() : null },
  });
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: arquivar ? "requisicao.arquivar" : "requisicao.desarquivar",
    entity: "Requisicao",
    entityId: alvo,
    summary: `${arquivar ? "Arquivou" : "Desarquivou"} a requisição ${numero}.`,
    req: await requestHeaders(),
  });

  revalidatePath("/requisicoes");
  return { status: "success", message: `Requisição ${numero} ${arquivar ? "arquivada" : "desarquivada"}.` };
}

// Exclui (cancela) um pedido — gestor da fábrica/gestor/admin, em QUALQUER
// status. É soft delete: liga a flag `cancelada` e arquiva, guardando quem
// excluiu e o motivo, SEM mexer no `status` (a decisão anterior é preservada).
// Nada é apagado — o pedido continua no relatório e em "Meus pedidos", pra quem
// pediu entender por que sumiu da fila.
//
// ATENÇÃO: cancelar NÃO estorna estoque. Itens já baixados seguem baixados no
// Omie; o estorno, se for o caso, é feito lá. A UI avisa isso antes de excluir.
export async function cancelarRequisicao(id: string, motivo: string): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return unauthenticated();
  }
  const permissions = await getRolePermissionsMap();
  if (!canCancelRequisicao(session.user.role, permissions)) {
    return { status: "error", message: "Apenas o Gestor da Fábrica, Gestor ou Administrador exclui requisições." };
  }

  const parsed = cancelarRequisicaoSchema.safeParse({ id, motivo });
  if (!parsed.success) {
    return { status: "error", message: "Informe o motivo da exclusão (pelo menos 3 caracteres)." };
  }

  const requisicao = await prisma.requisicao.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      numero: true,
      status: true,
      cancelada: true,
      solicitanteNome: true,
      itens: { select: { status: true } },
    },
  });
  if (!requisicao) {
    return { status: "error", message: "Requisição não encontrada." };
  }

  const numero = formatarNumeroRequisicao(requisicao.numero);
  if (requisicao.cancelada) {
    return { status: "error", message: `Requisição ${numero} já estava excluída.` };
  }

  const baixados = requisicao.itens.filter((item) => item.status === "BAIXADO").length;
  const agora = new Date();

  // `status` fica como estava (preserva a decisão); arquiva junto pra o pedido
  // já sair das listas do dia a dia pelo filtro que já existe.
  await prisma.requisicao.update({
    where: { id: parsed.data.id },
    data: {
      cancelada: true,
      canceladaPorId: session.user.id,
      canceladaEm: agora,
      motivoCancelamento: parsed.data.motivo,
      arquivada: true,
      arquivadaEm: agora,
    },
  });

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "requisicao.cancelar",
    entity: "Requisicao",
    entityId: parsed.data.id,
    summary:
      `Excluiu a requisição ${numero} (solicitante ${requisicao.solicitanteNome}). Motivo: ${parsed.data.motivo}` +
      (baixados > 0 ? ` — ATENÇÃO: ${baixados} item(ns) já baixado(s) no Omie NÃO foram estornados.` : ""),
    before: { status: requisicao.status, cancelada: false },
    after: { status: requisicao.status, cancelada: true, motivo: parsed.data.motivo, itensJaBaixados: baixados },
    req: await requestHeaders(),
  });

  revalidatePath("/requisicoes");
  if (baixados > 0) {
    return {
      status: "success",
      message: `Requisição ${numero} excluída. Atenção: ${baixados} item(ns) já tinham baixado no Omie e NÃO foram estornados — faça o estorno no Omie se precisar.`,
    };
  }
  return { status: "success", message: `Requisição ${numero} excluída.` };
}

// -----------------------------------------------------------------------------
// Relatório (PDF gerado no navegador; aqui só saem os DADOS já serializados)
// -----------------------------------------------------------------------------

const relatorioSchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface DadosRelatorio {
  ok: boolean;
  erro?: string;
  requisicoes: RequisicaoRelatorio[];
}

// Dados do relatório de requisições do período (gestor/admin). O período é
// interpretado no fuso de São Paulo (dia inteiro, inclusive).
export async function relatorioRequisicoes(input: unknown): Promise<DadosRelatorio> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, erro: "Sessão expirada. Entre novamente.", requisicoes: [] };
  }
  const permissions = await getRolePermissionsMap();
  if (!canDecideRequisicao(session.user.role, permissions)) {
    return { ok: false, erro: "Apenas Gestor ou Administrador gera o relatório.", requisicoes: [] };
  }

  const parsed = relatorioSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Período inválido.", requisicoes: [] };
  }
  const { de, ate } = parsed.data;
  const inicio = new Date(`${de}T00:00:00-03:00`);
  const fim = new Date(`${ate}T23:59:59.999-03:00`);
  if (!(inicio <= fim)) {
    return { ok: false, erro: "A data inicial precisa ser antes da final.", requisicoes: [] };
  }

  const registros = await prisma.requisicao.findMany({
    where: { criadoEm: { gte: inicio, lte: fim } },
    include: {
      itens: { orderBy: { sku: "asc" } },
      setor: { select: { nome: true } },
      gestor: { select: { name: true } },
      canceladaPor: { select: { name: true } },
    },
    orderBy: { numero: "asc" },
    take: 1000,
  });

  const requisicoes: RequisicaoRelatorio[] = registros.map((req) => ({
    numero: req.numero,
    status: req.status,
    solicitanteNome: req.solicitanteNome,
    setor: req.setor.nome,
    criadoEm: formatarDataHora(req.criadoEm),
    gestor: req.gestor?.name ?? null,
    decididaEm: req.decididaEm ? formatarDataHora(req.decididaEm) : null,
    motivoDecisao: req.motivoDecisao,
    localEstoqueNome: req.localEstoqueNome,
    cancelada: req.cancelada,
    canceladaPor: req.canceladaPor?.name ?? null,
    canceladaEm: req.canceladaEm ? formatarDataHora(req.canceladaEm) : null,
    motivoCancelamento: req.motivoCancelamento,
    itens: req.itens.map((item) => ({
      sku: item.sku,
      descricao: item.descricao,
      quantidade: Number(item.quantidade),
      unidade: item.unidade,
      status: item.status,
      motivoErro: item.motivoErro,
    })),
  }));

  return { ok: true, requisicoes };
}
