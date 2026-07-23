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
// - `pecas3d` / `acabamento3d` / `aviso3d` ligam a opção ao modelo 3D (ver
//   `modelo3d.ts` e o cabeçalho de `Modelo3dCatalogo`).

// Acabamento das peças "pintáveis" do modelo 3D. É o único material que o
// configurador troca: o resto (cromado, plástico, borracha) vem do CAD.
export type Acabamento3d = "pintado" | "inox";

export interface AcabamentoOpcao {
  acabamento: Acabamento3d;
  // Sem `pecas`, vale para o modelo inteiro. Com `pecas`, vale só para elas e
  // ganha do acabamento geral (a ordem dos grupos no catálogo não importa).
  pecas?: readonly string[];
}

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
  // Peças do modelo 3D que esta opção ACENDE. Peça citada por alguma opção do
  // grupo e ausente da opção marcada é apagada — por isso a opção "Não" leva
  // `pecas3d: []`, e não a ausência do campo.
  pecas3d?: readonly string[];
  acabamento3d?: AcabamentoOpcao;
  // O que o 3D deixa de mostrar quando esta opção está marcada (o CAD publicado
  // é de UMA configuração; o que não dá para ligar/desligar fica na foto do
  // desenho). Aparece como aviso ao lado da prévia. Opção nova que o modelo não
  // reproduz PRECISA de um aviso: sem ele, o vendedor acha que está vendo a
  // peça que pediu.
  aviso3d?: string;
}

export interface GrupoCatalogo {
  codigo: string;
  rotulo: string;
  opcoes: readonly OpcaoCatalogo[];
  // Peça do modelo 3D que este grupo representa. Com ela, clicar no item na
  // especificação faz a câmera voar até a peça. Só grupos que apontam uma peça
  // visível do 3D têm; os demais ficam sem.
  foco3d?: string;
}

// Modelo 3D do produto, gerado a partir do STEP do CAD por
// `scripts/step-para-glb.mjs`. Cada nó do arquivo se chama `peca:<chave>`, e é
// essa chave que as opções acendem e apagam. Produto sem `modelo3d` continua
// mostrando a foto.
export interface PecaInfo {
  nome: string;
  descricao: string;
}

export interface Modelo3dCatalogo {
  arquivo: string; // caminho em /public
  // Variante sem compressão meshopt, para o AR (o model-viewer não decodifica
  // meshopt). Baixada só quando o cliente abre o "ver no meu espaço".
  arquivoAr?: string;
  // De qual desenho o modelo saiu. Aparece na prévia, para quem olha saber que
  // aquilo é o CAD de uma configuração específica e não um render genérico.
  desenho: string;
  // Chaves de peça que o arquivo contém, na ordem em que fazem sentido para
  // quem lê. Serve de referência para quem for escrever `pecas3d` numa opção.
  pecas: readonly string[];
  // Medidas externas do produto, em mm, para a régua de cotas (A×L×P).
  dimensoesMm?: { altura: number; largura: number; profundidade: number };
  // Nome amigável e uma linha de descrição por peça, para o cartão que aparece
  // ao clicar/focar uma peça (hotspot).
  info?: Readonly<Record<string, PecaInfo>>;
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
  modelo3d?: Modelo3dCatalogo;
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

// Avisos repetidos em várias opções do mesmo grupo. Todos descrevem o CAD
// publicado (CREHS MT001 C0PTD R00), então mudar de desenho é mudar aqui.
const AVISO_GAVETAS = "o 3D mostra 3 gavetas + gavetão";
const AVISO_RODIZIOS = 'o 3D mostra rodízios plásticos 3"';
const AVISO_DIVISORIAS = "o 3D mostra divisória só na primeira gaveta";
const AVISO_ACESSORIO = "este acessório não está no 3D";

// A foto muda conforme o MODELO escolhido (slim ou grande) — por isso as duas
// opções do grupo MOD carregam `imagem`.
//
// O 3D é o CAD do slim. Ele acompanha o que dá para acender e apagar (soro,
// desfibrilador, oxigênio, tábua, régua) e a cor do material; o que é geometria
// fixa daquele desenho (número de gavetas, modelo grande, rebaixo do tampo)
// leva `aviso3d` na opção que foge dele.
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
  modelo3d: {
    arquivo: "/configurador/3d/carro-emergencia.glb",
    arquivoAr: "/configurador/3d/carro-emergencia-ar.glb",
    desenho: "CREHS MT001 C0PTD R00",
    pecas: [
      "estrutura",
      "tampo",
      "gavetas",
      "gavetao",
      "alca",
      "rodizios",
      "trava",
      "divisorias",
      "soro",
      "desfibrilador",
      "oxigenio",
      "tabua",
      "regua",
    ],
    dimensoesMm: { altura: 960, largura: 477, profundidade: 495 },
    info: {
      estrutura: {
        nome: "Estrutura",
        descricao: "Corpo do carro em chapa dobrada, com laterais e base reforçadas.",
      },
      tampo: { nome: "Tampo superior", descricao: "Superfície de apoio no topo do carro." },
      gavetas: { nome: "Gavetas", descricao: "Gavetas frontais com puxador e corrediça telescópica." },
      gavetao: { nome: "Gavetão", descricao: "Gaveta inferior mais alta, para itens maiores." },
      alca: { nome: "Alça de condução", descricao: "Alça tubular para empurrar o carro." },
      rodizios: { nome: "Rodízios", descricao: "Rodas giratórias, duas com freio." },
      trava: { nome: "Trava das gavetas", descricao: "Trava frontal por cadeado." },
      divisorias: { nome: "Divisórias", descricao: "Separadores internos da gaveta." },
      soro: { nome: "Suporte de soro", descricao: "Haste de soro com ganchos." },
      desfibrilador: {
        nome: "Suporte de desfibrilador",
        descricao: "Bandeja para acomodar o desfibrilador.",
      },
      oxigenio: {
        nome: "Suporte de oxigênio",
        descricao: "Apoio lateral para o cilindro de oxigênio.",
      },
      tabua: { nome: "Tábua de massagem", descricao: "Tábua de RCP presa na lateral." },
      regua: { nome: "Régua de tomadas", descricao: "Régua de tomadas com cabo." },
    },
  },
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
          aviso3d: "o 3D continua mostrando o slim",
        },
      ],
    },
    {
      codigo: "MAT",
      rotulo: "Material",
      foco3d: "estrutura",
      opcoes: [
        { codigo: "CARB", rotulo: "Carbono", padrao: true, acabamento3d: { acabamento: "pintado" } },
        { codigo: "INOX", rotulo: "Inox", acabamento3d: { acabamento: "inox" } },
      ],
    },
    {
      codigo: "GAV",
      rotulo: "Gavetas",
      foco3d: "gavetas",
      opcoes: [
        { codigo: "G4", rotulo: "4 gavetas", padrao: true, aviso3d: AVISO_GAVETAS },
        { codigo: "G5", rotulo: "5 gavetas", aviso3d: AVISO_GAVETAS },
        { codigo: "G6", rotulo: "6 gavetas", aviso3d: AVISO_GAVETAS },
        { codigo: "G3GAVE", rotulo: "3 gavetas + gavetão" },
        { codigo: "G4GAVE", rotulo: "4 gavetas + gavetão", aviso3d: AVISO_GAVETAS },
        { codigo: "G3BASC", rotulo: "3 gavetas + basculante", aviso3d: AVISO_GAVETAS },
        { codigo: "G4BASC", rotulo: "4 gavetas + basculante", aviso3d: AVISO_GAVETAS },
      ],
    },
    {
      codigo: "TAM",
      rotulo: "Tampo superior",
      foco3d: "tampo",
      opcoes: [
        {
          codigo: "TCARB",
          rotulo: "Carbono",
          padrao: true,
          acabamento3d: { acabamento: "pintado", pecas: ["tampo"] },
        },
        { codigo: "TINOX", rotulo: "Inox", acabamento3d: { acabamento: "inox", pecas: ["tampo"] } },
        {
          codigo: "TINOXRB",
          rotulo: "Inox com rebaixo",
          acabamento3d: { acabamento: "inox", pecas: ["tampo"] },
          aviso3d: "o rebaixo do tampo não aparece no 3D",
        },
        {
          codigo: "TINOXRB2",
          rotulo: "Inox com rebaixo e dois módulos",
          acabamento3d: { acabamento: "inox", pecas: ["tampo"] },
          aviso3d: "o rebaixo e os dois módulos não aparecem no 3D",
        },
      ],
    },
    {
      codigo: "ROD",
      rotulo: "Rodízios",
      foco3d: "rodizios",
      opcoes: [
        { codigo: "RP3", rotulo: 'Plásticos 3"', padrao: true },
        { codigo: "RC3", rotulo: '3" cama', aviso3d: AVISO_RODIZIOS },
        { codigo: "RC4", rotulo: '4" cama', aviso3d: AVISO_RODIZIOS },
      ],
    },
    {
      codigo: "TRA",
      rotulo: "Trava das gavetas",
      foco3d: "trava",
      opcoes: [
        { codigo: "TRFC", rotulo: "Frontal por cadeado", padrao: true },
        {
          codigo: "TRFCL",
          rotulo: "Frontal por cadeado + lateral por chave",
          aviso3d: "o 3D mostra só a trava frontal",
        },
      ],
    },
    {
      codigo: "TAB",
      rotulo: "Tábua de massagem",
      foco3d: "tabua",
      opcoes: [
        { codigo: "TAB1", rotulo: "Sim", padrao: true, pecas3d: ["tabua"] },
        { codigo: "TAB0", rotulo: "Não", pecas3d: [] },
      ],
    },
    {
      codigo: "OXI",
      rotulo: "Suporte para cilindro de oxigênio",
      foco3d: "oxigenio",
      opcoes: [
        { codigo: "OXI1", rotulo: "Sim", padrao: true, pecas3d: ["oxigenio"] },
        { codigo: "OXI0", rotulo: "Não", pecas3d: [] },
      ],
    },
    {
      codigo: "REG",
      rotulo: "Régua para tomadas",
      foco3d: "regua",
      opcoes: [
        { codigo: "REG1", rotulo: "Sim", padrao: true, pecas3d: ["regua"] },
        { codigo: "REG0", rotulo: "Não", pecas3d: [] },
      ],
    },
    {
      codigo: "DIV",
      rotulo: "Divisórias de gavetas",
      foco3d: "divisorias",
      opcoes: [
        { codigo: "DIV1", rotulo: "Divisória na primeira gaveta", padrao: true },
        { codigo: "DIV12", rotulo: "Divisória na primeira e segunda gaveta", aviso3d: AVISO_DIVISORIAS },
        { codigo: "DIVT", rotulo: "Divisória em todas as gavetas", aviso3d: AVISO_DIVISORIAS },
      ],
    },
    {
      codigo: "DES",
      rotulo: "Suporte para desfibrilador",
      foco3d: "desfibrilador",
      opcoes: [
        { codigo: "DES1", rotulo: "Sim", padrao: true, pecas3d: ["desfibrilador"] },
        { codigo: "DES0", rotulo: "Não", pecas3d: [] },
      ],
    },
    {
      codigo: "SOR",
      rotulo: "Suporte para soro",
      foco3d: "soro",
      opcoes: [
        { codigo: "SOR1", rotulo: "Sim", padrao: true, pecas3d: ["soro"] },
        { codigo: "SOR0", rotulo: "Não", pecas3d: [] },
      ],
    },
    {
      codigo: "LIX",
      rotulo: "Suporte para lixeira",
      opcoes: [
        { codigo: "LIX1", rotulo: "Sim", aviso3d: AVISO_ACESSORIO },
        { codigo: "LIX0", rotulo: "Não", padrao: true },
      ],
    },
    {
      codigo: "PRA",
      rotulo: "Suporte para prancheta",
      opcoes: [
        { codigo: "PRA1", rotulo: "Sim", aviso3d: AVISO_ACESSORIO },
        { codigo: "PRA0", rotulo: "Não", padrao: true },
      ],
    },
    {
      codigo: "PER",
      rotulo: "Suporte para perfuro cortante",
      opcoes: [
        { codigo: "PER1", rotulo: "Sim", aviso3d: AVISO_ACESSORIO },
        { codigo: "PER0", rotulo: "Não", padrao: true },
      ],
    },
    {
      codigo: "GAS",
      rotulo: "Suporte régua para gases",
      opcoes: [
        { codigo: "GAS1", rotulo: "Sim", aviso3d: AVISO_ACESSORIO },
        { codigo: "GAS0", rotulo: "Não", padrao: true },
      ],
    },
    {
      codigo: "PAR",
      rotulo: "Para-choque",
      opcoes: [
        { codigo: "PAR0", rotulo: "Não", padrao: true },
        { codigo: "PARBMP", rotulo: "Sim, com bumper", aviso3d: AVISO_ACESSORIO },
        {
          codigo: "PARTOT",
          rotulo: "Sim, em todo o contorno emborrachado",
          aviso3d: AVISO_ACESSORIO,
        },
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
