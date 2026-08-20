// Matéria-prima consumida por cada PEÇA (PC) da BOM.
//
// Três informações se cruzam para descobrir QUAL item MAT entra na estrutura da
// peça (levantado na BOM real "MSVCH MT001 I0POL.xls" + no catálogo do Omie):
//
//   1. o 3º bloco do código da PEÇA diz o MATERIAL e a FORMA nos 2 primeiros
//      caracteres ("MSVCH PC001 ITSLD" → I = inox, T = tubo; "ICSLD" → chapa;
//      "IAPOL" → trefilado; "I0POL" de submontagem = forma não se aplica);
//   2. a coluna de especificação da BOM dá a geometria ("TUBO QUAD
//      25,00x25,00x1,20mm", "# 3,0000" = chapa de 3mm, "TREF. Ø6,25");
//   3. a coluna de peso dá a massa UNITÁRIA da peça, que vira a quantidade em KG
//      (unidade dos cadastros MAT no Omie).
//
// O código do item MAT NÃO é deduzido por fórmula: casamos a geometria contra o
// catálogo real do Omie. Motivo prático — os códigos cadastrados são
// inconsistentes entre si (em MATTB "RD190" é Ø19,05, mas em MATTF "RD635" é
// Ø6,35), e um código inventado que não existe vira erro de escrita no Omie, que
// conta pro limite de bloqueio da app_key. A DESCRIÇÃO é a fonte da geometria; o
// código serve para a família e para conferir a liga.

import { blocosDoCodigo } from "@/lib/bom/bomParser";
import type { UnidadePeso } from "@/lib/bom/types";

// --- Formas -----------------------------------------------------------------

export type FormaMP =
  | "chapa"
  | "tubo-quadrado"
  | "tubo-retangular"
  | "tubo-redondo"
  | "trefilado-redondo";

export const ROTULO_FORMA: Record<FormaMP, string> = {
  chapa: "Chapa",
  "tubo-quadrado": "Tubo quadrado",
  "tubo-retangular": "Tubo retangular",
  "tubo-redondo": "Tubo redondo",
  "trefilado-redondo": "Trefilado redondo",
};

/** Geometria de uma matéria-prima, em milímetros. */
export interface EspecificacaoMP {
  forma: FormaMP;
  espessura?: number; // chapa: espessura da chapa; tubo: parede
  diametro?: number; // formas redondas
  ladoA?: number; // quadrado/retangular
  ladoB?: number;
  // Menor número de casas decimais entre as medidas lidas ("Ø15,8x1,2" = 1,
  // "Ø6,25" = 2). É a PRECISÃO com que o texto foi escrito, e é ela que define
  // quanta folga a comparação aceita (veja `toleranciaExata`).
  casasDecimais: number;
}

// --- Ligas / materiais ------------------------------------------------------

export type Liga = "INOX430" | "CARBONO1020" | "ACRILICO" | "PVC" | "COMPENSADO" | "MDF" | "POLIACETAL";

export const ROTULO_LIGA: Record<Liga, string> = {
  INOX430: "Aço inox 430",
  CARBONO1020: "Aço carbono 1020",
  ACRILICO: "Acrílico",
  PVC: "PVC expandido",
  COMPENSADO: "Compensado",
  MDF: "MDF",
  POLIACETAL: "Poliacetal",
};

// 3º bloco do código MAT, quando o token inteiro identifica a liga.
const LIGA_POR_BLOCO_EXATO: Record<string, Liga> = {
  IN430: "INOX430",
  AC012: "CARBONO1020",
  ARB00: "ACRILICO",
  PEB00: "PVC",
  MC000: "COMPENSADO",
  MM0LB: "MDF",
};

// Sufixo de 3 caracteres do 3º bloco ("12I43" → "I43", "0000O" → "00O"), usado
// quando o bloco inteiro não está na tabela acima.
const LIGA_POR_SUFIXO: Record<string, Liga> = {
  I43: "INOX430",
  C12: "CARBONO1020",
  "00O": "POLIACETAL",
};

/** Liga codificada no 3º bloco de um código MAT. `null` quando não reconhecida. */
export function ligaDoBlocoMat(bloco3: string): Liga | null {
  const bloco = bloco3.toUpperCase();
  return LIGA_POR_BLOCO_EXATO[bloco] ?? LIGA_POR_SUFIXO[bloco.slice(-3)] ?? null;
}

/** Liga citada em texto livre (descrição do cadastro MAT). */
export function ligaDoTexto(texto: string): Liga | null {
  const t = texto.toUpperCase();
  if (t.includes("INOX")) return "INOX430";
  if (t.includes("CARBONO") || t.includes("SAE 1020") || t.includes("1020")) return "CARBONO1020";
  if (t.includes("ACRILICO") || t.includes("ACRÍLICO")) return "ACRILICO";
  if (t.includes("PVC")) return "PVC";
  if (t.includes("COMPENSADO")) return "COMPENSADO";
  if (t.includes("MDF")) return "MDF";
  if (t.includes("POLIACETAL")) return "POLIACETAL";
  return null;
}

// --- Código da PEÇA: material + forma ---------------------------------------

// 1º caractere do 3º bloco do código da PEÇA = MATERIAL.
// CONFIRMADO em dados reais: "I" (a BOM da MSVCH só usa inox, e o catálogo MAT
// só tem inox 430). "C" é a leitura natural dos cadastros MAT em aço carbono
// 1020, e a BOM da CREHI MT003 é toda dele. "V" e "A" foram confirmados em
// 20/08/2026 lendo a ESTRUTURA já cadastrada no Omie das peças da CREHI MT003:
// `CREHI PC005 VCCSR` consome `MATCH 00200 PEB00` (PVC expandido) e
// `CREHI PC007 ACFRS` consome `MATCH 00600 ARB00` (acrílico). Inicial FORA desta
// tabela não relaxa o filtro: quem decide é o `casarMateriaPrima`, que recusa
// quando a geometria serve a mais de uma liga.
const LIGA_POR_INICIAL: Record<string, Liga> = {
  I: "INOX430",
  C: "CARBONO1020",
  V: "PVC",
  A: "ACRILICO",
};

// 2º caractere do 3º bloco do código da PEÇA = FORMA. "0" (zero) significa "não
// se aplica" e aparece nas submontagens ("I0POL"), que não consomem MP direto.
const FORMA_POR_INICIAL: Record<string, FormaMP[]> = {
  T: ["tubo-quadrado", "tubo-retangular", "tubo-redondo"],
  C: ["chapa"],
  A: ["trefilado-redondo"],
};

export interface PistaDoCodigo {
  liga: Liga | null;
  formas: FormaMP[] | null; // null = o código não restringe a forma
}

/** Lê material e forma dos 2 primeiros caracteres do 3º bloco do código da peça. */
export function pistaDoCodigoPeca(codigo: string): PistaDoCodigo {
  const blocos = blocosDoCodigo(codigo);
  if (!blocos) return { liga: null, formas: null };
  const bloco3 = blocos[2].toUpperCase();
  return {
    liga: LIGA_POR_INICIAL[bloco3[0]] ?? null,
    formas: FORMA_POR_INICIAL[bloco3[1]] ?? null,
  };
}

// --- Leitura da geometria ---------------------------------------------------

// Quantidade de medidas que cada forma consome, na ordem em que aparecem tanto
// na BOM quanto na descrição do cadastro.
const MEDIDAS_POR_FORMA: Record<FormaMP, number> = {
  chapa: 1,
  "tubo-quadrado": 3,
  "tubo-retangular": 3,
  "tubo-redondo": 2,
  "trefilado-redondo": 1,
};

function detectarForma(t: string): FormaMP | null {
  if (t.startsWith("#")) return "chapa";
  if (t.includes("CHAPA")) return "chapa";
  // Sextavado tem "entre planos" em vez de diâmetro: não dá pra comparar com as
  // formas redondas, e o catálogo só traz a bitola em polegada. Fora do automático.
  if (t.includes("SEXTAVAD")) return null;
  if (t.includes("TREF")) return "trefilado-redondo";
  if (t.includes("TUBO")) {
    if (t.includes("QUAD")) return "tubo-quadrado";
    if (t.includes("RET")) return "tubo-retangular";
    if (t.includes("RED")) return "tubo-redondo";
  }
  return null;
}

// Números decimais em ordem de aparição, aceitando vírgula ou ponto. Junto do
// valor vai quantas casas decimais o texto escreveu: "15,8" e "15,80" valem o
// mesmo número, mas não dizem a bitola com a mesma precisão.
function medidas(t: string): { valor: number; casas: number }[] {
  const achados: { valor: number; casas: number }[] = [];
  for (const m of t.matchAll(/\d+(?:[.,](\d+))?/g)) {
    const valor = Number(m[0].replace(",", "."));
    if (Number.isFinite(valor)) achados.push({ valor, casas: m[1]?.length ?? 0 });
  }
  return achados;
}

/**
 * Lê a geometria de um texto de especificação. Serve para os DOIS lados: a
 * coluna da BOM ("TUBO QUAD 25,00x25,00x1,20mm", "# 3,0000", "TREF. Ø6,25") e a
 * descrição do cadastro MAT ("TUBO QUADRADO 25x25x1.2 AÇO INOX POLIDO 430
 * (6000mm)"). Devolve `null` quando não dá pra ler com segurança.
 */
export function lerEspecificacao(texto: string): EspecificacaoMP | null {
  const bruto = texto.trim();
  if (!bruto) return null;

  // Fora o que vem entre parênteses: no cadastro MAT é sempre a dimensão da
  // barra/chapa inteira ("(6000mm)", "(1200x2000)"), não a da matéria-prima.
  const t = bruto.replace(/\([^)]*\)/g, " ").toUpperCase();

  // Medida em POLEGADAS ("5/8 POL", "2 POL"): não dá pra comparar com o
  // milímetro da BOM sem inventar conversão. Fica fora do casamento automático.
  if (/\d\s*POL\b/.test(t)) return null;

  const forma = detectarForma(t);
  if (!forma) return null;

  const nums = medidas(t);
  const precisa = MEDIDAS_POR_FORMA[forma];
  if (nums.length < precisa) return null;
  const usadas = nums.slice(0, precisa);
  // A medida escrita mais curta manda na precisão do conjunto (é ela que deixa
  // mais margem de dúvida sobre a bitola real).
  const casasDecimais = Math.min(...usadas.map((m) => m.casas));
  const [a, b, c] = usadas.map((m) => m.valor);

  switch (forma) {
    case "chapa":
      return { forma, espessura: a, casasDecimais };
    case "trefilado-redondo":
      return { forma, diametro: a, casasDecimais };
    case "tubo-redondo":
      return { forma, diametro: a, espessura: b, casasDecimais };
    case "tubo-quadrado":
    case "tubo-retangular":
      return { forma, ladoA: a, ladoB: b, espessura: c, casasDecimais };
  }
}

// --- Catálogo MAT indexado --------------------------------------------------

// --- Unidade do cadastro ----------------------------------------------------

// A unidade de consumo NÃO é do sistema, é de cada cadastro MAT no Omie. O aço
// é comprado por peso (KG) e a BOM dá a massa da peça, mas o catálogo real tem
// outras: perfil de borracha em M (vem em rolo e se corta por metro), courvin em
// M², estofado em UN. Para essas a coluna "Peso" da BOM não diz o consumo, e é a
// pessoa quem informa a quantidade na tela.
//
// Só o KG é reconhecido como "medido por peso". Unidade vazia (cadastro sem
// unidade legível) NÃO vira KG por omissão: converter o peso ali seria inventar
// um número na unidade errada, e no Omie a quantidade da estrutura vale sempre
// na unidade do item filho.
export function ehPorPeso(unidade: string): boolean {
  return normalizarUnidade(unidade) === "KG";
}

function normalizarUnidade(unidade: string | undefined): string {
  return (unidade ?? "").trim().toUpperCase();
}

/** Um item MAT do Omie já interpretado, pronto para o casamento. */
export interface ItemMat {
  codigo: string;
  descricao: string;
  /** Unidade do cadastro no Omie, normalizada ("KG", "M", "M²", "UN"). */
  unidade: string;
  espec: EspecificacaoMP | null;
  liga: Liga | null;
  // A liga do CÓDIGO e a da DESCRIÇÃO discordam (existe assim no Omie:
  // "MATTB RD127 12C12" tem código de carbono e descrição "AÇO INOX 430").
  // Item marcado assim nunca é escolhido sozinho — só na mão, pela tela.
  ambiguo: boolean;
}

// A descrição do cadastro repete o código na frente ("MATCH 00300 IN430 - CHAPA
// ESP 3,00 ..."); a geometria está depois do primeiro " - ". A tela também usa
// isto para não repetir o código na linha de baixo da lista de escolha.
export function parteDescritiva(codigo: string, descricao: string): string {
  const semCodigo = descricao.replace(/\s+/g, " ").trim();
  const prefixo = codigo.replace(/\s+/g, " ").trim();
  const resto = semCodigo.startsWith(prefixo) ? semCodigo.slice(prefixo.length) : semCodigo;
  return resto.replace(/^\s*-\s*/, "").trim() || semCodigo;
}

export interface ProdutoMatBruto {
  codigo: string;
  descricao: string;
  unidade?: string;
}

/**
 * Interpreta a lista crua vinda do Omie, resolvendo geometria, liga e conflitos.
 *
 * Sai em ORDEM ALFABÉTICA da descrição, que começa pelo próprio código, então a
 * ordem também agrupa as famílias (MATCH, MATTB, MATTF...). O Omie devolve na
 * ordem dele, e é esta lista que a tela mostra na escolha da matéria-prima:
 * ordenar aqui é o que garante que a lista chegue igual em qualquer consumidor.
 */
export function indexarCatalogo(itens: readonly ProdutoMatBruto[]): ItemMat[] {
  const indexados = itens.map((item) => {
    const texto = parteDescritiva(item.codigo, item.descricao);
    const blocos = blocosDoCodigo(item.codigo);
    const ligaCodigo = blocos ? ligaDoBlocoMat(blocos[2]) : null;
    const ligaTexto = ligaDoTexto(texto);
    return {
      codigo: item.codigo,
      descricao: item.descricao,
      unidade: normalizarUnidade(item.unidade),
      espec: lerEspecificacao(texto),
      liga: ligaCodigo ?? ligaTexto,
      ambiguo: ligaCodigo !== null && ligaTexto !== null && ligaCodigo !== ligaTexto,
    };
  });

  return indexados.sort((a, b) =>
    a.descricao.localeCompare(b.descricao, "pt-BR", { numeric: true, sensitivity: "base" }),
  );
}

// --- Casamento --------------------------------------------------------------

// Folga aceita entre a medida da BOM e a do cadastro para valer como "a mesma
// bitola", em milímetros. Ela sai da PRECISÃO com que a BOM escreveu a medida:
// o CAD encurta o que o cadastro traz cheio, e encurta dos dois jeitos:
// arredondando (Ø19,1 na BOM para o Ø19,05 do Omie) e truncando (Ø15,8 para
// Ø15,88, 0,08 de diferença). Com UMA casa decimal, portanto, a bitola real
// pode estar até um décimo adiante; com DUAS ("TREF. Ø6,25") a BOM já disse a
// bitola cheia, e aí Ø6,35 é outra bitola, não a mesma escrita curta.
//
// O teto de 0,1 mm é seguro porque as bitolas cadastradas no Omie, dentro da
// mesma forma e liga, estão a pelo menos 0,3 mm uma da outra.
const TOLERANCIA_MAXIMA = 0.1;

function toleranciaExata(casasDecimais: number): number {
  return Math.min(10 ** -casasDecimais, TOLERANCIA_MAXIMA);
}

// Acima disso a escolha deixa de ser óbvia (a BOM tem "TREF. Ø6,25" e o
// catálogo só tem Ø6,35): ainda sugerimos, mas pedindo confirmação na tela.
const TOLERANCIA_APROXIMADA = 0.3;

export type Confianca = "exata" | "aproximada";

export interface Casamento {
  item: ItemMat;
  confianca: Confianca;
  /** Maior diferença encontrada entre as medidas, em mm (0 = idênticas). */
  diferencaMaxMm: number;
}

function comparar(a: EspecificacaoMP, b: EspecificacaoMP): number | null {
  if (a.forma !== b.forma) return null;
  let pior = 0;
  for (const campo of ["espessura", "diametro", "ladoA", "ladoB"] as const) {
    const x = a[campo];
    const y = b[campo];
    if (x === undefined && y === undefined) continue;
    if (x === undefined || y === undefined) return null;
    pior = Math.max(pior, Math.abs(x - y));
  }
  return pior;
}

/**
 * Escolhe o item MAT que a peça consome. Filtra pela forma e pela liga que o
 * código da peça indica e pega o candidato de menor diferença dentro da folga.
 * Devolve `null` quando nada bate — a tela mostra o motivo e deixa escolher na mão.
 *
 * Quando o código da peça NÃO diz o material (inicial fora da tabela conhecida),
 * a geometria sozinha pode servir a mais de uma liga: o catálogo tem chapa de
 * 2,0 em inox E em acrílico, chapa de 0,9 em inox E em carbono. Nesse caso a
 * escolha é AMBÍGUA e devolvemos `null` em vez de eleger uma delas — mandar a
 * matéria-prima errada pro Omie é pior do que pedir a escolha na tela.
 */
export function casarMateriaPrima(
  espec: EspecificacaoMP,
  pista: PistaDoCodigo,
  catalogo: readonly ItemMat[],
): Casamento | null {
  const candidatos: Casamento[] = [];
  const folgaExata = toleranciaExata(espec.casasDecimais);

  for (const item of catalogo) {
    if (item.ambiguo || !item.espec) continue;
    if (pista.formas && !pista.formas.includes(item.espec.forma)) continue;
    if (pista.liga && item.liga !== pista.liga) continue;

    const diferenca = comparar(espec, item.espec);
    if (diferenca === null || diferenca > TOLERANCIA_APROXIMADA) continue;

    candidatos.push({
      item,
      confianca: diferenca <= folgaExata ? "exata" : "aproximada",
      diferencaMaxMm: diferenca,
    });
  }

  if (candidatos.length === 0) return null;

  // Sem material conhecido no código, só dá pra decidir se a geometria aponta
  // para uma liga só.
  if (!pista.liga && new Set(candidatos.map((c) => c.item.liga)).size > 1) return null;

  return candidatos.reduce((a, b) => (a.diferencaMaxMm <= b.diferencaMaxMm ? a : b));
}

// --- Peso -------------------------------------------------------------------

// O Omie recebe a estrutura em KG (unidade de todo cadastro MAT). Três casas
// decimais é o combinado com o usuário (1053,36 g vira 1,053 kg).
export const CASAS_DECIMAIS_KG = 3;

/** Converte a massa da BOM para KG, na unidade que o usuário escolheu na tela. */
export function pesoParaKg(peso: number, unidade: UnidadePeso): number {
  const kg = unidade === "g" ? peso / 1000 : peso;
  const fator = 10 ** CASAS_DECIMAIS_KG;
  return Math.round(kg * fator) / fator;
}
