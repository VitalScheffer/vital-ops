// Orquestração do envio de produtos ao Omie (Fase 2, parte 2).
//
// Fluxo SEQUENCIAL e ban-safe (REQUISITOS §6/§7): famílias → produtos → estrutura.
// Nada de disparo em paralelo. Confia no breaker/cache do client Omie
// (src/lib/omie) e usa a estratégia write-then-handle-duplicate: NÃO consulta
// antes; chama Upsert/Incluir e trata OmieDuplicate como sucesso idempotente.
//
// Módulo PURO: não toca no banco nem na sessão — recebe `chamar` por parâmetro
// (facilita mockar nos testes). A persistência/auditoria fica na Server Action.

import type { EstruturaRel, Familia, ParsedItem } from "@/lib/bom/types";
import type { ChamarOptions, OmiePayload } from "@/lib/omie/client";
import { OmieBlocked, OmieDescriptionConflict, OmieDuplicate } from "@/lib/omie/errors";

// Assinatura mínima de `chamar` do client Omie (o real é compatível com esta).
export type ChamarFn = (
  path: string,
  call: string,
  param: OmiePayload,
  options?: ChamarOptions,
) => Promise<OmiePayload | null>;

const WRITE: ChamarOptions = { write: true };

// Fixos confirmados pelo usuário (REQUISITOS §7/§8).
// NCM: era 9999.99.99 (genérico), mas a SEFAZ rejeita como inexistente na nota
// de transferência — trocado para 9403.20.90 em 07/07/2026 (pedido do Vitor).
const NCM_FIXO = "9403.20.90";
const UNIDADE_FIXA = "UN";
const TIPO_ITEM_FIXO = "04";

const MOTIVO_NAO_ENVIADO = "Lote interrompido antes de chegar neste item.";

export type OutcomeEnvio = "enviado" | "ja_existia" | "falha" | "nao_enviado";

export interface FamiliaResultado {
  familia: Familia;
  codFamilia: string;
  nomeFamilia: string;
  codigoFamilia?: string; // id da família retornado pelo Omie (para exibição)
  outcome: OutcomeEnvio;
  motivo?: string;
}

export interface ProdutoResultado {
  codigo: string;
  descricao: string;
  outcome: OutcomeEnvio;
  motivo?: string;
  omieCodigoProduto?: string;
}

export interface EstruturaResultado {
  numeroPai: string;
  numeroFilho: string;
  codigoPai: string;
  codigoFilho: string;
  outcome: OutcomeEnvio;
  motivo?: string;
}

export interface EnvioTotais {
  produtos: number; // total de itens "novo" processados
  enviados: number;
  jaExistiam: number;
  falhas: number;
  naoEnviados: number; // não alcançados por interrupção do lote
  recusados: number; // recebidos mas que não eram "novo" (não enviados de propósito)
}

export interface EnvioResultado {
  familias: FamiliaResultado[];
  produtos: ProdutoResultado[];
  estrutura: EstruturaResultado[];
  interrompido: boolean;
  bloqueado: boolean; // interrompido especificamente por bloqueio do Omie/breaker
  motivoInterrupcao?: string;
  totais: EnvioTotais;
}

export interface EnvioInput {
  novos: ParsedItem[];
  estrutura: EstruturaRel[];
}

function semEspaco(codigo: string): string {
  return codigo.replace(/\s+/g, "");
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

// "SBM - SUBMONTAGEM" → { codFamilia: "SBM", nomeFamilia: "SUBMONTAGEM" }.
function partesFamilia(familia: Familia): { codFamilia: string; nomeFamilia: string } {
  const [cod, ...resto] = familia.split(" - ");
  return { codFamilia: cod.trim(), nomeFamilia: resto.join(" - ").trim() };
}

function familiasDistintas(itens: ParsedItem[]): Familia[] {
  const vistas = new Set<Familia>();
  const ordem: Familia[] = [];
  for (const item of itens) {
    if (!item.familia || vistas.has(item.familia)) continue;
    vistas.add(item.familia);
    ordem.push(item.familia);
  }
  return ordem;
}

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

// Extrai o código do produto conflitante da mensagem do Omie: "...produto com
// código COMDB P0381 018AC." → "COMDB P0381 018AC".
const CODIGO_CONFLITANTE = /produto com c[oó]digo\s+([^.]+)\.?\s*$/i;

function extrairCodigoConflitante(mensagem: string): string | null {
  const match = CODIGO_CONFLITANTE.exec(mensagem.trim());
  return match ? match[1].trim() : null;
}

interface ProdutoExistente {
  codigoProduto?: string;
  codigoProdutoIntegracao?: string;
}

// Busca (READ, não conta como escrita) o produto já cadastrado sob outro
// código — usado só depois de um conflito de descrição confirmado pelo Omie,
// nunca preventivamente (write-then-handle-duplicate, REQUISITOS §6).
async function resolverProdutoExistente(codigo: string, chamar: ChamarFn): Promise<ProdutoExistente | null> {
  const resp = await chamar("geral/produtos/", "ListarProdutos", {
    pagina: 1,
    registros_por_pagina: 1,
    apenas_importado_api: "N",
    filtrar_apenas_omiepdv: "N",
    produtosPorCodigo: [{ codigo }],
  });
  const lista = resp?.produto_servico_cadastro;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const produto = lista[0] as OmiePayload;
  return {
    codigoProduto: texto(produto.codigo_produto),
    codigoProdutoIntegracao: texto(produto.codigo_produto_integracao) || undefined,
  };
}

interface Interrupcao {
  interrompido: boolean;
  bloqueado: boolean;
  motivo?: string;
}

/**
 * Envia ao Omie os produtos "novos" de uma BOM e suas relações de estrutura,
 * garantindo as famílias antes. Idempotente: `Upsert*` atualiza no reenvio e
 * `OmieDuplicate` conta como sucesso. Conflito de descrição (peça padrão já
 * cadastrada sob outro código, ex. parafuso/dobradiça) é resolvido buscando e
 * reaproveitando o cadastro existente — não para o lote. Em `OmieBlocked`/erro
 * genérico, PARA o lote (o breaker já protege) e marca o restante como não
 * enviado.
 */
export async function orquestrarEnvio(input: EnvioInput, chamar: ChamarFn): Promise<EnvioResultado> {
  const novos = input.novos.filter((i) => i.status === "novo");
  const recusados = input.novos.length - novos.length;

  const familias: FamiliaResultado[] = [];
  const produtos: ProdutoResultado[] = [];
  const estrutura: EstruturaResultado[] = [];
  const idPorFamilia = new Map<Familia, unknown>();
  // Nosso código (sem espaço) → codigo_produto_integracao REAL, quando um item
  // foi resolvido por reaproveitamento (conflito de descrição). A Estrutura usa
  // isso pra referenciar o cadastro que realmente existe no Omie.
  const integracaoReal = new Map<string, string>();
  const interrupcao: Interrupcao = { interrompido: false, bloqueado: false };

  const interromper = (erro: unknown) => {
    interrupcao.interrompido = true;
    if (erro instanceof OmieBlocked) interrupcao.bloqueado = true;
    interrupcao.motivo = mensagem(erro);
  };

  // 1. Famílias primeiro (COM/SBM/PCF/PCA) — garante o id antes dos produtos.
  for (const familia of familiasDistintas(novos)) {
    if (interrupcao.interrompido) break;
    const { codFamilia, nomeFamilia } = partesFamilia(familia);
    try {
      const resp = await chamar(
        "geral/familias/",
        "UpsertFamilia",
        { codInt: codFamilia, codFamilia, nomeFamilia, inativo: "N" },
        WRITE,
      );
      const rawId = resp?.codigo;
      idPorFamilia.set(familia, rawId);
      familias.push({ familia, codFamilia, nomeFamilia, codigoFamilia: texto(rawId), outcome: "enviado" });
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        // Upsert raramente duplica; se acontecer, seguimos sem o id da família.
        idPorFamilia.set(familia, undefined);
        familias.push({ familia, codFamilia, nomeFamilia, outcome: "ja_existia" });
        continue;
      }
      familias.push({ familia, codFamilia, nomeFamilia, outcome: "falha", motivo: mensagem(erro) });
      interromper(erro);
    }
  }

  // 2. Produtos (idempotente via UpsertProduto).
  for (const item of novos) {
    if (interrupcao.interrompido) {
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "nao_enviado",
        motivo: MOTIVO_NAO_ENVIADO,
      });
      continue;
    }

    const param: OmiePayload = {
      codigo_produto_integracao: semEspaco(item.codigo),
      codigo: item.codigo,
      descricao: item.descricaoProduto,
      unidade: UNIDADE_FIXA,
      ncm: NCM_FIXO,
      tipoItem: TIPO_ITEM_FIXO,
      // Controle de lote sempre ativo (REQUISITOS §7). Campo confirmado na doc
      // da API de produtos: `produto_lote` ("S"/"N").
      produto_lote: "S",
    };
    const rawFamiliaId = item.familia ? idPorFamilia.get(item.familia) : undefined;
    if (rawFamiliaId !== undefined && rawFamiliaId !== null) param.codigo_familia = rawFamiliaId;

    try {
      const resp = await chamar("geral/produtos/", "UpsertProduto", param, WRITE);
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "enviado",
        omieCodigoProduto: texto(resp?.codigo_produto),
      });
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        produtos.push({ codigo: item.codigo, descricao: item.descricaoProduto, outcome: "ja_existia" });
        continue;
      }
      if (erro instanceof OmieDescriptionConflict) {
        // Descrição já usada por OUTRO código — comum em peça padrão reaproveitada
        // entre BOMs (parafuso, dobradiça). Decisão do Vitor (08/07/2026): SEMPRE
        // reaproveitar o cadastro existente em vez de pedir pra renomear — o item
        // já pode estar em outro produto com ordem de produção ou saldo em
        // estoque. NÃO é sinal de risco de bloqueio do app_key: não para o lote.
        const codigoExistente = extrairCodigoConflitante(erro.message);
        try {
          const existente = codigoExistente ? await resolverProdutoExistente(codigoExistente, chamar) : null;
          if (existente) {
            if (existente.codigoProdutoIntegracao) {
              integracaoReal.set(semEspaco(item.codigo), existente.codigoProdutoIntegracao);
            }
            produtos.push({
              codigo: item.codigo,
              descricao: item.descricaoProduto,
              outcome: "ja_existia",
              omieCodigoProduto: existente.codigoProduto,
            });
            continue;
          }
        } catch (erroResolucao) {
          if (erroResolucao instanceof OmieBlocked) {
            produtos.push({
              codigo: item.codigo,
              descricao: item.descricaoProduto,
              outcome: "falha",
              motivo: mensagem(erro),
            });
            interromper(erroResolucao);
            continue;
          }
          // Não deu pra confirmar o cadastro existente (erro na busca) — cai no
          // fallback abaixo em vez de assumir sucesso sem confirmar.
        }
        produtos.push({
          codigo: item.codigo,
          descricao: item.descricaoProduto,
          outcome: "falha",
          motivo: `${mensagem(erro)} Não foi possível localizar o cadastro existente automaticamente — confira manualmente no Omie.`,
        });
        continue;
      }
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "falha",
        motivo: mensagem(erro),
      });
      interromper(erro);
    }
  }

  // 3. Estrutura (IncluirEstrutura não tem Upsert → duplicado = já existe = ok).
  for (const rel of input.estrutura) {
    const chaves = {
      numeroPai: rel.numeroPai,
      numeroFilho: rel.numeroFilho,
      codigoPai: rel.codigoPai,
      codigoFilho: rel.codigoFilho,
    };
    if (interrupcao.interrompido) {
      estrutura.push({ ...chaves, outcome: "nao_enviado", motivo: MOTIVO_NAO_ENVIADO });
      continue;
    }

    try {
      // int* referenciam o codigo_produto_integracao (código SEM espaço) — assim
      // a estrutura resolve pai/filho sem consultar o id interno (REQUISITOS §6).
      // Formato confirmado na doc da API de malha: pai no topo (`intProduto`) e
      // filhos no array `itemMalhaIncluir` (um por chamada, para o resultado
      // por relação continuar granular). Quando o pai/filho foi reaproveitado de
      // um cadastro existente (conflito de descrição), usa o codigo_produto_
      // integracao REAL desse cadastro em vez do nosso código gerado localmente.
      const intProduto = integracaoReal.get(semEspaco(rel.codigoPai)) ?? semEspaco(rel.codigoPai);
      const intProdMalha = integracaoReal.get(semEspaco(rel.codigoFilho)) ?? semEspaco(rel.codigoFilho);
      await chamar(
        "geral/malha/",
        "IncluirEstrutura",
        {
          intProduto,
          itemMalhaIncluir: [
            {
              intProdMalha,
              quantProdMalha: rel.quantidade ?? 1,
            },
          ],
        },
        WRITE,
      );
      estrutura.push({ ...chaves, outcome: "enviado" });
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        estrutura.push({ ...chaves, outcome: "ja_existia" });
        continue;
      }
      estrutura.push({ ...chaves, outcome: "falha", motivo: mensagem(erro) });
      interromper(erro);
    }
  }

  const contar = (o: OutcomeEnvio) => produtos.filter((p) => p.outcome === o).length;
  return {
    familias,
    produtos,
    estrutura,
    interrompido: interrupcao.interrompido,
    bloqueado: interrupcao.bloqueado,
    motivoInterrupcao: interrupcao.motivo,
    totais: {
      produtos: produtos.length,
      enviados: contar("enviado"),
      jaExistiam: contar("ja_existia"),
      falhas: contar("falha"),
      naoEnviados: contar("nao_enviado"),
      recusados,
    },
  };
}
