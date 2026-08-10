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
// 1020, mas ainda NÃO apareceu numa BOM. Inicial FORA desta tabela não relaxa o
// filtro: quem decide é o `casarMateriaPrima`, que recusa quando a geometria
// serve a mais de uma liga.
const LIGA_POR_INICIAL: Record<string, Liga> = {
  I: "INOX430",
  C: "CARBONO1020",
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

// Números decimais em ordem de aparição, aceitando vírgula ou ponto.
function medidas(t: string): number[] {
  const achados: number[] = [];
  for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = Number(m[0].replace(",", "."));
    if (Number.isFinite(n)) achados.push(n);
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
  const [a, b, c] = nums;

  switch (forma) {
    case "chapa":
      return { forma, espessura: a };
    case "trefilado-redondo":
      return { forma, diametro: a };
    case "tubo-redondo":
      return { forma, diametro: a, espessura: b };
    case "tubo-quadrado":
    case "tubo-retangular":
      return { forma, ladoA: a, ladoB: b, espessura: c };
  }
}

// --- Catálogo MAT indexado --------------------------------------------------

/** Um item MAT do Omie já interpretado, pronto para o casamento. */
export interface ItemMat {
  codigo: string;
  descricao: string;
  unidade: string;
  espec: EspecificacaoMP | null;
  liga: Liga | null;
  // A liga do CÓDIGO e a da DESCRIÇÃO discordam (existe assim no Omie:
  // "MATTB RD127 12C12" tem código de carbono e descrição "AÇO INOX 430").
  // Item marcado assim nunca é escolhido sozinho — só na mão, pela tela.
  ambiguo: boolean;
}

// A descrição do cadastro repete o código na frente ("MATCH 00300 IN430 - CHAPA
// ESP 3,00 ..."); a geometria está depois do primeiro " - ".
function parteDescritiva(codigo: string, descricao: string): string {
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

/** Interpreta a lista crua vinda do Omie, resolvendo geometria, liga e conflitos. */
export function indexarCatalogo(itens: readonly ProdutoMatBruto[]): ItemMat[] {
  return itens.map((item) => {
    const texto = parteDescritiva(item.codigo, item.descricao);
    const blocos = blocosDoCodigo(item.codigo);
    const ligaCodigo = blocos ? ligaDoBlocoMat(blocos[2]) : null;
    const ligaTexto = ligaDoTexto(texto);
    return {
      codigo: item.codigo,
      descricao: item.descricao,
      unidade: item.unidade ?? "",
      espec: lerEspecificacao(texto),
      liga: ligaCodigo ?? ligaTexto,
      ambiguo: ligaCodigo !== null && ligaTexto !== null && ligaCodigo !== ligaTexto,
    };
  });
}

// --- Casamento --------------------------------------------------------------

// Folga aceita entre a medida da BOM e a do cadastro, em milímetros. A BOM
// arredonda o que o cadastro traz cheio (Ø19,1 na BOM vs Ø19,05 no Omie;
// Ø15,9 vs Ø15,88), então uma folga pequena ainda é "a mesma bitola".
const TOLERANCIA_EXATA = 0.06;
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

  for (const item of catalogo) {
    if (item.ambiguo || !item.espec) continue;
    if (pista.formas && !pista.formas.includes(item.espec.forma)) continue;
    if (pista.liga && item.liga !== pista.liga) continue;

    const diferenca = comparar(espec, item.espec);
    if (diferenca === null || diferenca > TOLERANCIA_APROXIMADA) continue;

    candidatos.push({
      item,
      confianca: diferenca <= TOLERANCIA_EXATA ? "exata" : "aproximada",
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
