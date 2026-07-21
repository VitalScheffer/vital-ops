// Catálogo do configurador de produto: quais produtos existem, quais grupos de
// escolha cada um tem e quais opções cada grupo oferece.
//
// Por que em CÓDIGO e não no banco: enquanto não existir uma tela de cadastro de
// catálogo, "editar este arquivo + deploy" é mais simples, mais revisável (o
// diff vira histórico) e mais seguro do que semear tabelas na mão. A tela lê
// daqui de forma genérica — nenhuma opção da maca está escrita no JSX. Quando
// virar cadastro pela tela, o formato abaixo é o mesmo que as tabelas terão.
//
// Regras do formato:
// - `codigo` de grupo e de opção é a SIGLA usada no código de identidade da
//   configuração (ver `codigo.ts`). Não mude uma sigla já usada em produção: o
//   código de configurações antigas deixa de bater com o das novas e a detecção
//   de repetidos passa a errar.
// - exatamente UMA opção por grupo deve ter `padrao: true` (é o modelo da foto).
// - `exigeTexto` marca a opção que abre um campo livre ("OUTRO PESO - INDICAR").

export interface OpcaoCatalogo {
  codigo: string;
  rotulo: string;
  padrao?: boolean;
  // Abre um campo de texto obrigatório quando esta opção é escolhida.
  exigeTexto?: boolean;
  textoRotulo?: string;
  textoPlaceholder?: string;
}

export interface GrupoCatalogo {
  codigo: string;
  rotulo: string;
  opcoes: readonly OpcaoCatalogo[];
}

export interface ProdutoCatalogo {
  slug: string;
  nome: string;
  sigla: string; // prefixo do código de identidade (ex.: "MACA")
  descricao: string;
  imagem: string; // caminho em /public
  imagemLargura: number;
  imagemAltura: number;
  grupos: readonly GrupoCatalogo[];
}

const MACA_PADIOLA: ProdutoCatalogo = {
  slug: "maca-padiola",
  nome: "Maca Padiola",
  sigla: "MACA",
  descricao:
    "Marque as opções desejadas. O que estiver marcado como (PADRÃO) é o modelo da foto; qualquer escolha diferente vira destaque para a equipe de Projetos.",
  imagem: "/configurador/maca-padiola.jpg",
  imagemLargura: 1600,
  imagemAltura: 759,
  grupos: [
    {
      codigo: "MAT",
      rotulo: "Material",
      opcoes: [
        { codigo: "CARB", rotulo: "Carbono", padrao: true },
        { codigo: "INOX", rotulo: "Inox" },
      ],
    },
    {
      codigo: "EST",
      rotulo: "Estrutura",
      opcoes: [
        { codigo: "SOLD", rotulo: "Soldada" },
        { codigo: "DESM", rotulo: "Desmontável", padrao: true },
      ],
    },
    {
      codigo: "LEI",
      rotulo: "Leito",
      opcoes: [
        { codigo: "ACO", rotulo: "Aço" },
        { codigo: "ACOCOL", rotulo: "Aço + colchonete", padrao: true },
        { codigo: "MADEST", rotulo: "Madeira estofado" },
      ],
    },
    {
      codigo: "ROD",
      rotulo: "Rodízios",
      opcoes: [
        { codigo: "R3", rotulo: '3"', padrao: true },
        { codigo: "R4", rotulo: '4"' },
        { codigo: "R5", rotulo: '5"' },
        { codigo: "R6", rotulo: '6"' },
        { codigo: "R8", rotulo: '8"' },
      ],
    },
    {
      codigo: "DISP",
      rotulo: "Disponibilidade dos rodízios",
      opcoes: [
        { codigo: "TGF", rotulo: "Todos giratórios com freio" },
        { codigo: "2CF", rotulo: "Dois com freio e dois sem", padrao: true },
      ],
    },
    {
      codigo: "GRA",
      rotulo: "Grades laterais",
      opcoes: [
        { codigo: "GCP", rotulo: "Aço carbono pintado", padrao: true },
        { codigo: "GIP", rotulo: "Aço inox polido" },
      ],
    },
    {
      codigo: "SOR",
      rotulo: "Suporte de soro",
      opcoes: [
        { codigo: "SS0", rotulo: "Não", padrao: true },
        { codigo: "SS4", rotulo: "Sim, nos quatro cantos" },
        { codigo: "SSD", rotulo: "Sim, em diagonal apenas" },
        { codigo: "SS1", rotulo: "Sim, em um canto apenas" },
      ],
    },
    {
      codigo: "OXI",
      rotulo: "Suporte para cilindro de oxigênio",
      opcoes: [
        { codigo: "OX0", rotulo: "Não", padrao: true },
        { codigo: "OX1", rotulo: "Sim" },
      ],
    },
    {
      codigo: "PESO",
      rotulo: "Peso suportado",
      opcoes: [
        { codigo: "P120", rotulo: "120 kg", padrao: true },
        {
          codigo: "POUT",
          rotulo: "Outro peso",
          exigeTexto: true,
          textoRotulo: "Peso suportado",
          textoPlaceholder: "Ex.: 200 kg",
        },
      ],
    },
    {
      codigo: "MED",
      rotulo: "Medidas aproximadas",
      opcoes: [
        { codigo: "M2000", rotulo: "2000 x 600 x 800 mm (C x L x A)", padrao: true },
        {
          codigo: "MOUT",
          rotulo: "Outra medida",
          exigeTexto: true,
          textoRotulo: "Medida (C x L x A)",
          textoPlaceholder: "Ex.: 2200 x 700 x 850 mm",
        },
      ],
    },
  ],
};

export const CATALOGO: readonly ProdutoCatalogo[] = [MACA_PADIOLA];

export function produtoPorSlug(slug: string): ProdutoCatalogo | undefined {
  return CATALOGO.find((produto) => produto.slug === slug);
}

export function opcaoPadrao(grupo: GrupoCatalogo): OpcaoCatalogo | undefined {
  return grupo.opcoes.find((opcao) => opcao.padrao);
}
