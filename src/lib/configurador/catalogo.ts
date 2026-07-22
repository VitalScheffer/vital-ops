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
// - `imagem` numa opção troca a foto de referência quando ela é escolhida (o
//   carro de emergência tem foto de slim e de grande). Vale a primeira opção
//   escolhida que tenha imagem, na ordem dos grupos; sem nenhuma, fica a foto do
//   produto.

export interface OpcaoCatalogo {
  codigo: string;
  rotulo: string;
  padrao?: boolean;
  // Abre um campo de texto obrigatório quando esta opção é escolhida.
  exigeTexto?: boolean;
  textoRotulo?: string;
  textoPlaceholder?: string;
  // Troca a foto de referência do produto enquanto esta opção estiver marcada.
  imagem?: string;
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
  // Uma linha, para o card de escolha do produto.
  resumo: string;
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
  resumo: "Maca de transporte, em carbono ou inox, com grades e suporte de soro.",
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

// A foto muda conforme o MODELO escolhido (slim ou grande) — por isso as duas
// opções do grupo MOD carregam `imagem`.
const CARRO_EMERGENCIA: ProdutoCatalogo = {
  slug: "carro-emergencia",
  nome: "Carro de Emergência",
  sigla: "CARRO",
  descricao:
    "Marque as opções desejadas. O que estiver marcado como (PADRÃO) é o modelo da foto; qualquer escolha diferente vira destaque para a equipe de Projetos.",
  resumo: "Carro de emergência slim ou grande, com gavetas, tampo e suportes configuráveis.",
  imagem: "/configurador/carro-emergencia-slim.png",
  imagemLargura: 1600,
  imagemAltura: 759,
  grupos: [
    {
      codigo: "MOD",
      rotulo: "Modelo",
      opcoes: [
        {
          codigo: "SLIM",
          rotulo: "Slim",
          padrao: true,
          imagem: "/configurador/carro-emergencia-slim.png",
        },
        {
          codigo: "GRAND",
          rotulo: "Grande",
          imagem: "/configurador/carro-emergencia-grande.png",
        },
      ],
    },
    {
      codigo: "MAT",
      rotulo: "Material",
      opcoes: [
        { codigo: "CARB", rotulo: "Carbono", padrao: true },
        { codigo: "INOX", rotulo: "Inox" },
      ],
    },
    {
      codigo: "GAV",
      rotulo: "Gavetas",
      opcoes: [
        { codigo: "G4", rotulo: "4 gavetas", padrao: true },
        { codigo: "G5", rotulo: "5 gavetas" },
        { codigo: "G6", rotulo: "6 gavetas" },
        { codigo: "G3GAVE", rotulo: "3 gavetas + gavetão" },
        { codigo: "G4GAVE", rotulo: "4 gavetas + gavetão" },
        { codigo: "G3BASC", rotulo: "3 gavetas + basculante" },
        { codigo: "G4BASC", rotulo: "4 gavetas + basculante" },
      ],
    },
    {
      codigo: "TAM",
      rotulo: "Tampo superior",
      opcoes: [
        { codigo: "TCARB", rotulo: "Carbono", padrao: true },
        { codigo: "TINOX", rotulo: "Inox" },
        { codigo: "TINOXRB", rotulo: "Inox com rebaixo" },
        { codigo: "TINOXRB2", rotulo: "Inox com rebaixo e dois módulos" },
      ],
    },
    {
      codigo: "ROD",
      rotulo: "Rodízios",
      opcoes: [
        { codigo: "RP3", rotulo: 'Plásticos 3"', padrao: true },
        { codigo: "RC3", rotulo: '3" cama' },
        { codigo: "RC4", rotulo: '4" cama' },
      ],
    },
    {
      codigo: "TRA",
      rotulo: "Trava das gavetas",
      opcoes: [
        { codigo: "TRFC", rotulo: "Frontal por cadeado", padrao: true },
        { codigo: "TRFCL", rotulo: "Frontal por cadeado + lateral por chave" },
      ],
    },
    {
      codigo: "TAB",
      rotulo: "Tábua de massagem",
      opcoes: [
        { codigo: "TAB1", rotulo: "Sim", padrao: true },
        { codigo: "TAB0", rotulo: "Não" },
      ],
    },
    {
      codigo: "OXI",
      rotulo: "Suporte para cilindro de oxigênio",
      opcoes: [
        { codigo: "OXI1", rotulo: "Sim", padrao: true },
        { codigo: "OXI0", rotulo: "Não" },
      ],
    },
    {
      codigo: "REG",
      rotulo: "Régua para tomadas",
      opcoes: [
        { codigo: "REG1", rotulo: "Sim", padrao: true },
        { codigo: "REG0", rotulo: "Não" },
      ],
    },
    {
      codigo: "DIV",
      rotulo: "Divisórias de gavetas",
      opcoes: [
        { codigo: "DIV1", rotulo: "Divisória na primeira gaveta", padrao: true },
        { codigo: "DIV12", rotulo: "Divisória na primeira e segunda gaveta" },
        { codigo: "DIVT", rotulo: "Divisória em todas as gavetas" },
      ],
    },
    {
      codigo: "DES",
      rotulo: "Suporte para desfibrilador",
      opcoes: [
        { codigo: "DES1", rotulo: "Sim", padrao: true },
        { codigo: "DES0", rotulo: "Não" },
      ],
    },
    {
      codigo: "SOR",
      rotulo: "Suporte para soro",
      opcoes: [
        { codigo: "SOR1", rotulo: "Sim", padrao: true },
        { codigo: "SOR0", rotulo: "Não" },
      ],
    },
    {
      codigo: "LIX",
      rotulo: "Suporte para lixeira",
      opcoes: [
        { codigo: "LIX1", rotulo: "Sim" },
        { codigo: "LIX0", rotulo: "Não", padrao: true },
      ],
    },
    {
      codigo: "PRA",
      rotulo: "Suporte para prancheta",
      opcoes: [
        { codigo: "PRA1", rotulo: "Sim" },
        { codigo: "PRA0", rotulo: "Não", padrao: true },
      ],
    },
    {
      codigo: "PER",
      rotulo: "Suporte para perfuro cortante",
      opcoes: [
        { codigo: "PER1", rotulo: "Sim" },
        { codigo: "PER0", rotulo: "Não", padrao: true },
      ],
    },
    {
      codigo: "GAS",
      rotulo: "Suporte régua para gases",
      opcoes: [
        { codigo: "GAS1", rotulo: "Sim" },
        { codigo: "GAS0", rotulo: "Não", padrao: true },
      ],
    },
    {
      codigo: "PAR",
      rotulo: "Para-choque",
      opcoes: [
        { codigo: "PAR0", rotulo: "Não", padrao: true },
        { codigo: "PARBMP", rotulo: "Sim, com bumper" },
        { codigo: "PARTOT", rotulo: "Sim, em todo o contorno emborrachado" },
      ],
    },
  ],
};

export const CATALOGO: readonly ProdutoCatalogo[] = [MACA_PADIOLA, CARRO_EMERGENCIA];

export function produtoPorSlug(slug: string): ProdutoCatalogo | undefined {
  return CATALOGO.find((produto) => produto.slug === slug);
}

export function opcaoPadrao(grupo: GrupoCatalogo): OpcaoCatalogo | undefined {
  return grupo.opcoes.find((opcao) => opcao.padrao);
}

export interface FotoProduto {
  src: string;
  // Como esta foto se chama para quem olha ("Slim", "Grande").
  rotulo: string;
}

// As fotos que representam o produto no card de escolha. São as imagens das
// OPÇÕES (o carro tem slim e grande), sem repetir; produto que não tem opção com
// foto fica com a dele. Deriva do catálogo de propósito: cadastrar uma variante
// nova com foto já a coloca no card, sem uma segunda lista para esquecer de
// atualizar.
export function fotosDoProduto(produto: ProdutoCatalogo): FotoProduto[] {
  const fotos: FotoProduto[] = [];
  const vistas = new Set<string>();

  for (const grupo of produto.grupos) {
    for (const opcao of grupo.opcoes) {
      if (opcao.imagem && !vistas.has(opcao.imagem)) {
        vistas.add(opcao.imagem);
        fotos.push({ src: opcao.imagem, rotulo: opcao.rotulo });
      }
    }
  }

  return fotos.length > 0 ? fotos : [{ src: produto.imagem, rotulo: produto.nome }];
}
