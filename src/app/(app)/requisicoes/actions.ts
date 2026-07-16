"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  criarRequisicaoSchema,
  decidirRequisicaoSchema,
  formatarNumeroRequisicao,
} from "@/lib/contracts";
import { prisma } from "@/lib/db";
import {
  LOCAL_PADRAO,
  baixarEstoque,
  buscarProdutosPorCodigo,
  dataOmieHoje,
  nomeDoLocal,
  saldosPorCodigo,
  type ItemBaixa,
  type ProdutoEstoque,
} from "@/lib/estoque/omieEstoque";
import type { FormState } from "@/lib/form";
import { chamar } from "@/lib/omie";
import { OmieBlocked } from "@/lib/omie/errors";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canDecideRequisicao, canViewRequisicoes } from "@/lib/rbac";
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

  // Produtos: usa o id interno resolvido na criação; se faltar em algum item
  // (não deveria), resolve de novo numa leitura em lote.
  const produtos = new Map<string, ProdutoEstoque>();
  for (const item of pendentes) {
    if (item.omieIdProd) {
      produtos.set(item.sku, { idProd: item.omieIdProd, descricao: item.descricao });
    }
  }
  const semId = pendentes.filter((item) => !produtos.has(item.sku)).map((item) => item.sku);

  let saldos;
  try {
    if (semId.length > 0) {
      const resolvidos = await buscarProdutosPorCodigo(semId, chamar);
      for (const [sku, produto] of resolvidos) produtos.set(sku, produto);
    }
    saldos = await saldosPorCodigo(pendentes.map((item) => item.sku), dataOmieHoje(), chamar, localCodigo);
  } catch (erro) {
    if (erro instanceof OmieBlocked) {
      return {
        status: "error",
        message: "O Omie está temporariamente indisponível (bloqueio de consumo). Tente confirmar de novo em alguns minutos.",
      };
    }
    return { status: "error", message: "Não consegui consultar o saldo no Omie agora. Tente novamente." };
  }

  const obs = `Requisição ${numero} — solicitante: ${requisicao.solicitanteNome} (setor ${requisicao.setor.nome}). Confirmada por ${session.user.email}.`;
  const itensBaixa: ItemBaixa[] = pendentes.map((item) => ({
    chave: item.id,
    sku: item.sku,
    quantidade: Number(item.quantidade),
    obs,
  }));

  // Persiste o local escolhido ANTES da baixa: numa interrupção, a tela mostra
  // de onde a baixa parcial saiu e a reconfirmação sugere o mesmo local.
  const localNome = await nomeDoLocal(localCodigo, chamar);
  await prisma.requisicao.update({
    where: { id },
    data: { localEstoqueCodigo: localCodigo, localEstoqueNome: localNome },
  });

  const resultado = await baixarEstoque(
    itensBaixa,
    { data: dataOmieHoje(), produtos, saldos, codigoLocal: localCodigo },
    chamar,
  );

  // Reflete o resultado por item no banco + trilha de movimentos dos baixados.
  const agora = new Date();
  for (const item of resultado.itens) {
    if (item.outcome === "baixado" || item.outcome === "ja_baixado") {
      await prisma.requisicaoItem.update({
        where: { id: item.chave },
        data: { status: "BAIXADO", motivoErro: null, omieRef: item.omieRef, baixadoEm: agora },
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
      message: `Requisição ${numero} confirmada: ${baixados} baixado(s), ${falhas} com falha — veja o motivo em cada item.`,
    };
  }
  return { status: "success", message: `Requisição ${numero} confirmada e estoque baixado no Omie.` };
}
