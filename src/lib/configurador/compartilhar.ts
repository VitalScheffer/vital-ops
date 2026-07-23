  import { type ProdutoCatalogo } from "@/lib/configurador/catalogo";
import { escolhasPadrao, type EscolhaBruta, type EscolhasBrutas } from "@/lib/configurador/codigo";
import { QUALIDADE_PADRAO, type Qualidade } from "@/lib/configurador/qualidade";

// Link de conferência: a configuração inteira cabe na URL, e a tela pública
// (`/ver/<produto>`) monta o 3D a partir dela.
//
// A configuração NÃO vai para o banco e a tela pública não lê banco nenhum:
// o link não é uma chave que dá acesso a algo guardado, é o próprio conteúdo.
// Assim ninguém descobre a configuração de outro cliente trocando um número na
// URL, e não sobra link "vivo" para expirar depois.
//
// Formato: só o que FOGE DO PADRÃO viaja, em `GRUPO.OPCAO` separados por `~`
// (`MAT.INOX~TAB.TAB0`). Opção com texto livre leva o texto no terceiro campo
// (`PESO.POUT.200 kg`). Fica curto, legível e sem depender de codificação
// exótica; quem lê valida tudo contra o catálogo.

const SEPARADOR_ITEM = "~";
const SEPARADOR_CAMPO = ".";

export function codificarEscolhas(produto: ProdutoCatalogo, escolhas: EscolhasBrutas): string {
  const partes: string[] = [];

  for (const grupo of produto.grupos) {
    const escolha = escolhas[grupo.codigo];
    const opcao = grupo.opcoes.find((item) => item.codigo === escolha?.opcao);
    if (!opcao) continue;

    const texto = opcao.exigeTexto ? (escolha?.texto ?? "").trim() : "";
    if (opcao.padrao && !texto) continue;

    partes.push([grupo.codigo, opcao.codigo, texto].filter(Boolean).join(SEPARADOR_CAMPO));
  }

  return partes.join(SEPARADOR_ITEM);
}

// Caminho de volta. Tolerante de propósito: link antigo, catálogo que mudou ou
// URL adulterada não derrubam a tela — o que não casa com o catálogo é ignorado
// e aquele grupo fica no padrão.
export function decodificarEscolhas(
  produto: ProdutoCatalogo,
  codificado: string | undefined | null,
): Record<string, EscolhaBruta> {
  const escolhas = escolhasPadrao(produto);

  for (const item of (codificado ?? "").split(SEPARADOR_ITEM)) {
    if (!item) continue;
    const [grupoCodigo, opcaoCodigo, ...resto] = item.split(SEPARADOR_CAMPO);

    const grupo = produto.grupos.find((candidato) => candidato.codigo === grupoCodigo);
    const opcao = grupo?.opcoes.find((candidato) => candidato.codigo === opcaoCodigo);
    if (!grupo || !opcao) continue;

    escolhas[grupo.codigo] = {
      opcao: opcao.codigo,
      texto: opcao.exigeTexto ? resto.join(SEPARADOR_CAMPO) : undefined,
    };
  }

  return escolhas;
}

// A URL que o vendedor copia e manda para o cliente. `origem` é o endereço do
// próprio site (`window.location.origin`), para o link sair certo em produção,
// em pré-visualização da Vercel ou rodando local, sem nada configurado. A
// qualidade só entra na URL quando foge do padrão (link mais curto no comum).
export function linkDeConferencia(
  origem: string,
  produto: ProdutoCatalogo,
  escolhas: EscolhasBrutas,
  qualidade: Qualidade = QUALIDADE_PADRAO,
): string {
  const partes: string[] = [];
  const codificado = codificarEscolhas(produto, escolhas);
  if (codificado) partes.push(`c=${encodeURIComponent(codificado)}`);
  if (qualidade !== QUALIDADE_PADRAO) partes.push(`q=${qualidade}`);
  const consulta = partes.join("&");
  return `${origem}/ver/${produto.slug}${consulta ? `?${consulta}` : ""}`;
}
