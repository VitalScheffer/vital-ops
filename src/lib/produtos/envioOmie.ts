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
import { OmieBlocked, OmieDuplicate } from "@/lib/omie/errors";

// Assinatura mínima de `chamar` do client Omie (o real é compatível com esta).
export type ChamarFn = (
  path: string,
  call: string,
  param: OmiePayload,
  options?: ChamarOptions,
) => Promise<OmiePayload | null>;

const WRITE: ChamarOptions = { write: true };

// Fixos confirmados pelo usuário (REQUISITOS §7/§8).
const NCM_FIXO = "9999.99.99";
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

interface Interrupcao {
  interrompido: boolean;
  bloqueado: boolean;
  motivo?: string;
}

/**
 * Envia ao Omie os produtos "novos" de uma BOM e suas relações de estrutura,
 * garantindo as famílias antes. Idempotente: `Upsert*` atualiza no reenvio e
 * `OmieDuplicate` conta como sucesso. Em `OmieBlocked`/erro, PARA o lote (o
 * breaker já protege) e marca o restante como não enviado.
 */
export async function orquestrarEnvio(input: EnvioInput, chamar: ChamarFn): Promise<EnvioResultado> {
  const novos = input.novos.filter((i) => i.status === "novo");
  const recusados = input.novos.length - novos.length;

  const familias: FamiliaResultado[] = [];
  const produtos: ProdutoResultado[] = [];
  const estrutura: EstruturaResultado[] = [];
  const idPorFamilia = new Map<Familia, unknown>();
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
    };
    const rawFamiliaId = item.familia ? idPorFamilia.get(item.familia) : undefined;
    if (rawFamiliaId !== undefined && rawFamiliaId !== null) param.codigo_familia = rawFamiliaId;
    // TODO: adicionar campo de controle de lote após confirmar o nome exato na API do Omie

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
      await chamar(
        "geral/malha/",
        "IncluirEstrutura",
        {
          intProduto: semEspaco(rel.codigoPai),
          intProdMalha: semEspaco(rel.codigoFilho),
          quantProdMalha: rel.quantidade ?? 1,
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
