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
import { OmieBlocked, OmieCodeConflict, OmieDescriptionConflict, OmieDuplicate } from "@/lib/omie/errors";
import { normalizarNcm } from "./ncm";

// Assinatura mínima de `chamar` do client Omie (o real é compatível com esta).
export type ChamarFn = (
  path: string,
  call: string,
  param: OmiePayload,
  options?: ChamarOptions,
) => Promise<OmiePayload | null>;

const WRITE: ChamarOptions = { write: true };

// Fixos confirmados pelo usuário (REQUISITOS §7/§8). O NCM deixou de ser fixo em
// 09/07/2026: o usuário escolhe por envio na tela; `NCM_PADRAO` é só o default.
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
  // NCM escolhido pelo usuário para os produtos NOVOS deste envio. Ausente/inválido
  // cai no NCM_PADRAO. Não afeta produtos que já existem (esses são pulados).
  ncm?: string;
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

// Extrai o código do produto conflitante da mensagem do Omie (conflito de
// DESCRIÇÃO): "...produto com código COMDB P0381 018AC." → "COMDB P0381 018AC".
const CODIGO_CONFLITANTE = /produto com c[oó]digo\s+([^.]+)\.?\s*$/i;

function extrairCodigoConflitante(mensagem: string): string | null {
  const match = CODIGO_CONFLITANTE.exec(mensagem.trim());
  return match ? match[1].trim() : null;
}

// Extrai o ID interno do produto conflitante da mensagem do Omie (conflito de
// CÓDIGO): "...produto com ID 12123048648." → "12123048648".
const ID_CONFLITANTE = /produto com id\s+(\d+)/i;

function extrairIdConflitante(mensagem: string): string | null {
  const match = ID_CONFLITANTE.exec(mensagem);
  return match ? match[1] : null;
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

// Busca (READ) o produto já cadastrado sob outro ID interno — usado só depois
// de um conflito de CÓDIGO confirmado pelo Omie (a mensagem já cita o ID do
// cadastro existente). `ConsultarProduto` aceita `codigo_produto` (ID interno)
// como chave principal (doc oficial: "É o ID do produto e será utilizado
// apenas nas APIs como chave principal para localizar um produto").
async function resolverProdutoExistentePorId(
  codigoProduto: string,
  chamar: ChamarFn,
): Promise<ProdutoExistente | null> {
  const resp = await chamar("geral/produtos/", "ConsultarProduto", {
    codigo_produto: Number(codigoProduto),
  });
  if (!resp) return null;
  return {
    codigoProduto: texto(resp.codigo_produto),
    codigoProdutoIntegracao: texto(resp.codigo_produto_integracao) || undefined,
  };
}

// Um cadastro já existente no Omie descoberto pela pré-checagem em lote.
interface CadastroExistente {
  idProduto?: string; // codigo_produto (ID interno do Omie)
  intProduto?: string; // codigo_produto_integracao real, quando preenchido
}

// Divide uma lista em blocos de tamanho fixo (respeita o limite de registros por
// página da Omie na leitura em lote).
function emBlocos<T>(itens: T[], tamanho: number): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos;
}

const BLOCO_PRECHECK = 50;

// Pré-checa (LEITURA em lote) quais códigos já estão cadastrados no Omie. Uma
// leitura que dá certo é requisição CORRETA — não conta pro contador de bloqueio
// da Omie (que dispara na 10ª requisição INCORRETA no mesmo método). Isso deixa o
// orquestrador PULAR o UpsertProduto dos que já existem, que hoje volta erro de
// conflito e é justamente o que estoura esse contador (peça padrão já cadastrada).
// Reusa o mesmo call já provado em produção (`ListarProdutos` + `produtosPorCodigo`),
// só que com vários códigos por chamada. Falha na leitura NÃO interrompe o envio:
// só perde a otimização (cai no caminho antigo de tentar o Upsert e tratar o
// conflito); apenas `OmieBlocked` (bloqueio real) interrompe o lote.
async function precarregarExistentes(
  codigos: string[],
  chamar: ChamarFn,
  interromper: (erro: unknown) => void,
): Promise<Map<string, CadastroExistente>> {
  const mapa = new Map<string, CadastroExistente>();
  for (const bloco of emBlocos(codigos, BLOCO_PRECHECK)) {
    try {
      const resp = await chamar("geral/produtos/", "ListarProdutos", {
        pagina: 1,
        registros_por_pagina: 100,
        apenas_importado_api: "N",
        filtrar_apenas_omiepdv: "N",
        produtosPorCodigo: bloco.map((codigo) => ({ codigo })),
      });
      const lista = resp?.produto_servico_cadastro;
      if (!Array.isArray(lista)) continue;
      for (const registro of lista as OmiePayload[]) {
        const codigo = texto(registro.codigo);
        if (!codigo) continue;
        mapa.set(semEspaco(codigo), {
          idProduto: texto(registro.codigo_produto),
          intProduto: texto(registro.codigo_produto_integracao) || undefined,
        });
      }
    } catch (erro) {
      if (erro instanceof OmieBlocked) {
        interromper(erro);
        break;
      }
      // Qualquer outro erro: só perde a otimização deste bloco.
    }
  }
  return mapa;
}

// Resolve um conflito (descrição OU código) reaproveitando o cadastro
// existente no Omie. Compartilhado pelas duas categorias — só muda como
// extrai a chave da mensagem e como busca o cadastro (§7).
async function tratarConflito(
  item: ParsedItem,
  erroOriginal: Error,
  chave: string | null,
  buscar: (chave: string, chamar: ChamarFn) => Promise<ProdutoExistente | null>,
  chamar: ChamarFn,
  integracaoReal: Map<string, string>,
  interromper: (erro: unknown) => void,
): Promise<ProdutoResultado> {
  try {
    const existente = chave ? await buscar(chave, chamar) : null;
    if (existente) {
      if (existente.codigoProdutoIntegracao) {
        integracaoReal.set(semEspaco(item.codigo), existente.codigoProdutoIntegracao);
      }
      return {
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "ja_existia",
        omieCodigoProduto: existente.codigoProduto,
      };
    }
  } catch (erroResolucao) {
    if (erroResolucao instanceof OmieBlocked) {
      interromper(erroResolucao);
      return {
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "falha",
        motivo: mensagem(erroOriginal),
      };
    }
    // Não deu pra confirmar o cadastro existente (erro na busca) — cai no
    // fallback abaixo em vez de assumir sucesso sem confirmar.
  }
  return {
    codigo: item.codigo,
    descricao: item.descricaoProduto,
    outcome: "falha",
    motivo: `${mensagem(erroOriginal)} Não foi possível localizar o cadastro existente automaticamente — confira manualmente no Omie.`,
  };
}

interface Interrupcao {
  interrompido: boolean;
  bloqueado: boolean;
  motivo?: string;
}

// A Omie conta TODA resposta fora de sucesso limpo pro seu próprio contador de
// banimento — inclusive duplicado/conflito, que pra nós é um outcome bom, mas
// pra Omie ainda é uma resposta de erro (REQUISITOS §6: "resultado vazio =
// erro, conta pro ban"; §7: reenviar estrutura já existente em massa "conta
// como erro e pode bloquear"). Como nosso próprio reaproveitamento de conflito
// faz uma leitura (ConsultarProduto/ListarProdutos) que costuma dar OK logo
// em seguida, o breaker do client é resetado a cada vez — ele não enxerga essa
// sequência de escritas ruins se acumulando. Por isso o orquestrador conta por
// conta própria, bem abaixo do limite real da Omie (10 seguidos), e pausa o
// envio antes de arriscar o bloqueio de verdade da chave.
const LIMITE_SEQUENCIA_RISCO = 5;

/**
 * Envia ao Omie os produtos "novos" de uma BOM e suas relações de estrutura,
 * garantindo as famílias antes. Antes dos produtos, faz uma PRÉ-CHECAGEM em lote
 * (leitura, não conta pro bloqueio da Omie) pra descobrir quais códigos JÁ existem
 * e PULAR o Upsert deles — reenviar um cadastro existente volta erro de conflito, e
 * é isso que estoura o contador de bloqueio (10 requisições incorretas no mesmo
 * método). A Estrutura referencia pai/filho pelo ID interno do Omie quando conhecido.
 * Idempotente: `Upsert*` atualiza no reenvio e
 * `OmieDuplicate` conta como sucesso. Conflito de descrição/código (peça
 * padrão já cadastrada sob outro código/ID, ex. parafuso/dobradiça) é
 * resolvido buscando e reaproveitando o cadastro existente — não para o lote.
 * Só `OmieBlocked` (breaker/app_key realmente bloqueado) PARA o lote inteiro
 * e marca o restante como não enviado; qualquer outro erro (classificado ou
 * não) é falha só daquele item, e o orquestrador segue pros próximos. Além
 * disso, uma SEQUÊNCIA de `LIMITE_SEQUENCIA_RISCO` respostas seguidas fora do
 * sucesso limpo (falha, duplicado, conflito) pausa o envio por segurança —
 * mesmo sem bloqueio explícito, a Omie conta essas respostas pro PRÓPRIO
 * limite de banimento, e o breaker do client não enxerga isso sozinho (a
 * leitura de resolução de conflito costuma dar OK e resetar o contador dele).
 */
export async function orquestrarEnvio(input: EnvioInput, chamar: ChamarFn): Promise<EnvioResultado> {
  const novos = input.novos.filter((i) => i.status === "novo");
  const recusados = input.novos.length - novos.length;
  const ncm = normalizarNcm(input.ncm);

  const familias: FamiliaResultado[] = [];
  const produtos: ProdutoResultado[] = [];
  const estrutura: EstruturaResultado[] = [];
  const idPorFamilia = new Map<Familia, unknown>();
  // Nosso código (sem espaço) → codigo_produto_integracao REAL, quando um item
  // foi resolvido por reaproveitamento (conflito de descrição ou de código). A
  // Estrutura usa isso pra referenciar o cadastro que realmente existe no Omie.
  const integracaoReal = new Map<string, string>();
  // Nosso código (sem espaço) → codigo_produto (ID interno do Omie), de quem já
  // existia (pré-check) OU foi enviado/reaproveitado agora. A Estrutura prefere
  // referenciar pelo ID interno (idProduto/idProdMalha), que não depende do
  // código de integração estar preenchido no cadastro.
  const idOmiePorCodigo = new Map<string, string>();
  const interrupcao: Interrupcao = { interrompido: false, bloqueado: false };
  let sequenciaRisco = 0;

  // Só bloqueio real (OmieBlocked) para o lote inteiro — qualquer outro erro
  // vira falha isolada do item, e o caller segue pros próximos.
  const interromper = (erro: unknown) => {
    if (!(erro instanceof OmieBlocked)) return;
    interrupcao.interrompido = true;
    interrupcao.bloqueado = true;
    interrupcao.motivo = mensagem(erro);
  };

  // Chamar depois de CADA resultado (família/produto/estrutura). Zera a
  // sequência em sucesso limpo; qualquer outra coisa soma, e ao bater o limite
  // pausa o envio por segurança (bloqueado fica false — não é um bloqueio real
  // da Omie, é a nossa própria margem de segurança).
  const registrarSequencia = (outcome: OutcomeEnvio, custoOmie = true) => {
    if (interrupcao.interrompido) return;
    // Sucesso limpo OU passo sem chamada ao Omie (item pulado por já existir)
    // zeram a sequência — só resposta ruim de uma chamada REAL soma pro freio.
    if (outcome === "enviado" || !custoOmie) {
      sequenciaRisco = 0;
      return;
    }
    sequenciaRisco += 1;
    if (sequenciaRisco >= LIMITE_SEQUENCIA_RISCO) {
      interrupcao.interrompido = true;
      interrupcao.motivo =
        `Envio pausado por segurança: ${LIMITE_SEQUENCIA_RISCO} respostas seguidas do Omie fora do ` +
        "sucesso direto (duplicado/conflito/falha). Isso também conta pro limite de bloqueio da " +
        "própria Omie — paramos aqui pra não arriscar travar a chave de verdade. Revise os itens " +
        "marcados e reenvie o restante em seguida.";
    }
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
      registrarSequencia("enviado");
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        // Upsert raramente duplica; se acontecer, seguimos sem o id da família.
        idPorFamilia.set(familia, undefined);
        familias.push({ familia, codFamilia, nomeFamilia, outcome: "ja_existia" });
        registrarSequencia("ja_existia");
        continue;
      }
      familias.push({ familia, codFamilia, nomeFamilia, outcome: "falha", motivo: mensagem(erro) });
      registrarSequencia("falha");
      interromper(erro);
    }
  }

  // 1.5. Pré-checagem em lote: descobre quais códigos JÁ existem no Omie (leitura,
  // não conta pro bloqueio) pra pular o UpsertProduto deles adiante. Inclui também
  // os códigos que só aparecem na estrutura (pai/filho fora de "novos"), pra a
  // Estrutura conseguir referenciá-los pelo ID interno.
  const codigosParaChecar = new Set<string>();
  for (const item of novos) codigosParaChecar.add(item.codigo);
  for (const rel of input.estrutura) {
    codigosParaChecar.add(rel.codigoPai);
    codigosParaChecar.add(rel.codigoFilho);
  }
  const existentes = interrupcao.interrompido
    ? new Map<string, CadastroExistente>()
    : await precarregarExistentes([...codigosParaChecar], chamar, interromper);
  for (const [chave, cadastro] of existentes) {
    if (cadastro.idProduto) idOmiePorCodigo.set(chave, cadastro.idProduto);
    if (cadastro.intProduto) integracaoReal.set(chave, cadastro.intProduto);
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

    const chaveItem = semEspaco(item.codigo);

    // Já cadastrado no Omie (descoberto na pré-checagem): NÃO reenvia o Upsert —
    // reenviar volta erro de conflito, que é o que estoura o contador de bloqueio
    // da Omie. Reaproveita o cadastro (ID interno guardado pra Estrutura). Como
    // não houve chamada ao Omie, não conta pro freio (custoOmie = false).
    const jaExiste = existentes.get(chaveItem);
    if (jaExiste) {
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "ja_existia",
        omieCodigoProduto: jaExiste.idProduto,
      });
      registrarSequencia("ja_existia", false);
      continue;
    }

    const param: OmiePayload = {
      codigo_produto_integracao: semEspaco(item.codigo),
      codigo: item.codigo,
      descricao: item.descricaoProduto,
      unidade: UNIDADE_FIXA,
      ncm,
      tipoItem: TIPO_ITEM_FIXO,
      // Controle de lote sempre ativo (REQUISITOS §7). Campo confirmado na doc
      // da API de produtos: `produto_lote` ("S"/"N").
      produto_lote: "S",
    };
    const rawFamiliaId = item.familia ? idPorFamilia.get(item.familia) : undefined;
    if (rawFamiliaId !== undefined && rawFamiliaId !== null) param.codigo_familia = rawFamiliaId;

    try {
      const resp = await chamar("geral/produtos/", "UpsertProduto", param, WRITE);
      const idProduto = texto(resp?.codigo_produto);
      if (idProduto) idOmiePorCodigo.set(chaveItem, idProduto);
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "enviado",
        omieCodigoProduto: idProduto,
      });
      registrarSequencia("enviado");
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        produtos.push({ codigo: item.codigo, descricao: item.descricaoProduto, outcome: "ja_existia" });
        registrarSequencia("ja_existia");
        continue;
      }
      if (erro instanceof OmieDescriptionConflict) {
        // Descrição já usada por OUTRO código — comum em peça padrão reaproveitada
        // entre BOMs (parafuso, dobradiça). Decisão do Vitor (08/07/2026): SEMPRE
        // reaproveitar o cadastro existente em vez de pedir pra renomear — o item
        // já pode estar em outro produto com ordem de produção ou saldo em
        // estoque. NÃO é sinal de risco de bloqueio do app_key: não para o lote.
        const codigoExistente = extrairCodigoConflitante(erro.message);
        const resultado = await tratarConflito(
          item,
          erro,
          codigoExistente,
          resolverProdutoExistente,
          chamar,
          integracaoReal,
          interromper,
        );
        if (resultado.omieCodigoProduto) idOmiePorCodigo.set(chaveItem, resultado.omieCodigoProduto);
        produtos.push(resultado);
        registrarSequencia(resultado.outcome);
        continue;
      }
      if (erro instanceof OmieCodeConflict) {
        // Código (SKU) já usado por OUTRO id interno — mesma política do
        // conflito de descrição (reaproveitar automaticamente), só que a
        // mensagem do Omie cita o ID interno do cadastro existente em vez do
        // código, então a busca é por ConsultarProduto/codigo_produto.
        const idExistente = extrairIdConflitante(erro.message);
        const resultado = await tratarConflito(
          item,
          erro,
          idExistente,
          resolverProdutoExistentePorId,
          chamar,
          integracaoReal,
          interromper,
        );
        if (resultado.omieCodigoProduto) idOmiePorCodigo.set(chaveItem, resultado.omieCodigoProduto);
        produtos.push(resultado);
        registrarSequencia(resultado.outcome);
        continue;
      }
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "falha",
        motivo: mensagem(erro),
      });
      registrarSequencia("falha");
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
      // Referência de pai/filho: prefere o ID INTERNO do Omie (idProduto/idProdMalha),
      // que não depende do código de integração estar preenchido no cadastro — vale
      // tanto pra quem já existia (pré-check) quanto pra quem acabou de ser enviado.
      // Só cai pro código de integração (intProduto/intProdMalha, código SEM espaço)
      // como fallback quando o ID interno não é conhecido. Formato confirmado na doc
      // da API de malha: pai no topo, filhos no array `itemMalhaIncluir` (um por
      // chamada, pro resultado por relação continuar granular).
      const chavePai = semEspaco(rel.codigoPai);
      const chaveFilho = semEspaco(rel.codigoFilho);
      const idPai = idOmiePorCodigo.get(chavePai);
      const idFilho = idOmiePorCodigo.get(chaveFilho);
      const refPai = idPai
        ? { idProduto: Number(idPai) }
        : { intProduto: integracaoReal.get(chavePai) ?? chavePai };
      const refFilho = idFilho
        ? { idProdMalha: Number(idFilho) }
        : { intProdMalha: integracaoReal.get(chaveFilho) ?? chaveFilho };
      await chamar(
        "geral/malha/",
        "IncluirEstrutura",
        {
          ...refPai,
          itemMalhaIncluir: [
            {
              ...refFilho,
              quantProdMalha: rel.quantidade ?? 1,
            },
          ],
        },
        WRITE,
      );
      estrutura.push({ ...chaves, outcome: "enviado" });
      registrarSequencia("enviado");
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        estrutura.push({ ...chaves, outcome: "ja_existia" });
        registrarSequencia("ja_existia");
        continue;
      }
      estrutura.push({ ...chaves, outcome: "falha", motivo: mensagem(erro) });
      registrarSequencia("falha");
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
