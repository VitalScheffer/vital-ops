import {
  opcaoPadrao,
  type Modelo3dCatalogo,
  type ProdutoCatalogo,
} from "@/lib/configurador/catalogo";

// Núcleo do configurador: transformar as escolhas cruas da tela em seleções
// resolvidas (com rótulo), montar o código de identidade da combinação e apontar
// o que fugiu do padrão. Tudo puro — a mesma função roda no cliente (prévia ao
// vivo enquanto o vendedor marca) e no servidor (validação de verdade na Server
// Action). O cliente NUNCA é fonte de verdade: a action re-resolve do zero.

// Escolha crua de um grupo, como vem do formulário.
export interface EscolhaBruta {
  opcao: string;
  texto?: string;
}

export type EscolhasBrutas = Readonly<Record<string, EscolhaBruta | undefined>>;

// Escolha já casada com o catálogo. É isto que vira o snapshot no banco: guarda
// os RÓTULOS, não só as siglas, para a configuração continuar legível mesmo se o
// catálogo mudar depois.
export interface SelecaoResolvida {
  grupoCodigo: string;
  grupoRotulo: string;
  opcaoCodigo: string;
  opcaoRotulo: string;
  texto: string | null;
  padrao: boolean;
}

export type Resolucao =
  | { ok: true; selecoes: SelecaoResolvida[] }
  | { ok: false; erro: string };

export const TEXTO_LIVRE_MAX = 80;

// Quanto do texto livre entra no código de identidade. Textos diferentes que
// coincidam nos primeiros 16 caracteres normalizados geram o mesmo código e
// seriam vistos como repetidos — aceitável porque o texto integral fica no
// snapshot e aparece inteiro na tela da equipe de Projetos.
const TEXTO_NO_CODIGO_MAX = 16;

// Normaliza texto livre para caber no código: sem acento, maiúsculo, só letra e
// número ("2200 x 700 mm" -> "2200X700MM"). Determinístico: a mesma medida
// digitada com espaçamento diferente gera o mesmo código.
export function normalizarParaCodigo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, TEXTO_NO_CODIGO_MAX);
}

// Resolve TODOS os grupos do produto, na ordem do catálogo. Falha no primeiro
// problema com uma mensagem que o usuário entende (o grupo aparece pelo rótulo,
// não pela sigla).
export function resolverSelecoes(produto: ProdutoCatalogo, escolhas: EscolhasBrutas): Resolucao {
  const selecoes: SelecaoResolvida[] = [];

  for (const grupo of produto.grupos) {
    const escolha = escolhas[grupo.codigo];
    if (!escolha?.opcao) {
      return { ok: false, erro: `Escolha uma opção em "${grupo.rotulo}".` };
    }

    const opcao = grupo.opcoes.find((item) => item.codigo === escolha.opcao);
    if (!opcao) {
      return { ok: false, erro: `Opção inválida em "${grupo.rotulo}".` };
    }

    const texto = (escolha.texto ?? "").trim();
    if (opcao.exigeTexto && !texto) {
      return {
        ok: false,
        erro: `Informe ${(opcao.textoRotulo ?? "o valor").toLowerCase()} em "${grupo.rotulo}".`,
      };
    }
    if (texto.length > TEXTO_LIVRE_MAX) {
      return { ok: false, erro: `O texto em "${grupo.rotulo}" está muito longo.` };
    }

    selecoes.push({
      grupoCodigo: grupo.codigo,
      grupoRotulo: grupo.rotulo,
      opcaoCodigo: opcao.codigo,
      opcaoRotulo: opcao.rotulo,
      // Texto só é guardado na opção que o pede — evita lixo vindo do cliente.
      texto: opcao.exigeTexto ? texto : null,
      padrao: Boolean(opcao.padrao),
    });
  }

  return { ok: true, selecoes };
}

// Identidade determinística da combinação: mesmas escolhas = mesmo código, em
// qualquer ordem de preenchimento (a ordem vem do catálogo, não do formulário).
// É a chave que responde "essa maca já foi desenhada antes?".
export function montarCodigo(
  produto: ProdutoCatalogo,
  selecoes: readonly SelecaoResolvida[],
): string {
  const partes = selecoes.map((selecao) =>
    selecao.texto
      ? `${selecao.opcaoCodigo}${normalizarParaCodigo(selecao.texto)}`
      : selecao.opcaoCodigo,
  );
  return [produto.sigla, ...partes].join("-");
}

// O que difere do modelo da foto. É o destaque principal na tela da equipe de
// Projetos: eles precisam ver o desvio, não a lista inteira.
export function foraDoPadrao(selecoes: readonly SelecaoResolvida[]): SelecaoResolvida[] {
  return selecoes.filter((selecao) => !selecao.padrao);
}

// Escolhas iniciais do formulário: tudo no padrão. O vendedor só mexe no que
// muda, que é como ele descreve o pedido.
export function escolhasPadrao(produto: ProdutoCatalogo): Record<string, EscolhaBruta> {
  const escolhas: Record<string, EscolhaBruta> = {};
  for (const grupo of produto.grupos) {
    const padrao = opcaoPadrao(grupo);
    if (padrao) {
      escolhas[grupo.codigo] = { opcao: padrao.codigo };
    }
  }
  return escolhas;
}

// Caminho de volta: transforma um snapshot gravado (campo `selecoes`) nas
// escolhas do formulário, para repetir uma configuração anterior sem remarcar
// tudo. Tolerante de propósito — o snapshot é Json e pode ter sido gravado com
// um catálogo mais antigo: grupo ou opção que não existe mais é ignorado e
// aquele grupo fica no padrão atual, em vez de derrubar a tela.
export function escolhasDeSelecoes(
  produto: ProdutoCatalogo,
  selecoes: unknown,
): Record<string, EscolhaBruta> {
  const escolhas = escolhasPadrao(produto);
  if (!Array.isArray(selecoes)) {
    return escolhas;
  }

  for (const bruto of selecoes) {
    if (!bruto || typeof bruto !== "object") continue;
    const item = bruto as Partial<SelecaoResolvida>;

    const grupo = produto.grupos.find((candidato) => candidato.codigo === item.grupoCodigo);
    if (!grupo) continue;

    const opcao = grupo.opcoes.find((candidato) => candidato.codigo === item.opcaoCodigo);
    if (!opcao) continue;

    escolhas[grupo.codigo] = {
      opcao: opcao.codigo,
      texto: opcao.exigeTexto ? (item.texto ?? "") : undefined,
    };
  }

  return escolhas;
}

// Foto de referência para as escolhas atuais. Uma opção pode trazer `imagem`
// (o carro de emergência tem foto de slim e de grande); vale a primeira, na
// ordem dos grupos do catálogo. Sem nenhuma, fica a foto do produto. Puro e sem
// estado: o formulário recalcula a cada render, junto com o código.
export function imagemDoProduto(produto: ProdutoCatalogo, escolhas: EscolhasBrutas): string {
  for (const grupo of produto.grupos) {
    const escolhido = escolhas[grupo.codigo]?.opcao;
    const opcao = grupo.opcoes.find((item) => item.codigo === escolhido);
    if (opcao?.imagem) {
      return opcao.imagem;
    }
  }
  return produto.imagem;
}

// Modelo 3D das escolhas atuais. Mesma regra da foto: uma opção pode trazer o
// CAD inteiro (o carro grande é outro desenho, não uma peça do slim), e vale a
// primeira na ordem dos grupos; sem nenhuma, fica o modelo do produto.
export function modelo3dDoProduto(
  produto: ProdutoCatalogo,
  escolhas: EscolhasBrutas,
): Modelo3dCatalogo | undefined {
  for (const grupo of produto.grupos) {
    const escolhido = escolhas[grupo.codigo]?.opcao;
    const opcao = grupo.opcoes.find((item) => item.codigo === escolhido);
    if (opcao?.modelo3d) {
      return opcao.modelo3d;
    }
  }
  return produto.modelo3d;
}

// Valor escolhido, em texto: "Inox" ou "Outro peso (200 kg)". Fonte única do
// formato — as três telas do fluxo (configurador, histórico e fila de Projetos)
// mostram a mesma escolha escrita do mesmo jeito.
export function textoDaSelecao(selecao: SelecaoResolvida): string {
  return selecao.texto ? `${selecao.opcaoRotulo} (${selecao.texto})` : selecao.opcaoRotulo;
}

// A escolha com o nome do grupo: "Material: Inox".
export function rotuloDaSelecao(selecao: SelecaoResolvida): string {
  return `${selecao.grupoRotulo}: ${textoDaSelecao(selecao)}`;
}

// Resumo em texto puro (uma linha por grupo), para copiar/colar e para o corpo
// da mensagem que a equipe de Projetos vai ler.
export function resumoTexto(selecoes: readonly SelecaoResolvida[]): string {
  return selecoes
    .map(
      (selecao) => `${rotuloDaSelecao(selecao)}${selecao.padrao ? "" : "  (fora do padrão)"}`,
    )
    .join("\n");
}
