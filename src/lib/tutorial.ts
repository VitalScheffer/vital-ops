// Passos do tutorial de boas-vindas. A visibilidade segue a MESMA navegação já
// resolvida pelo servidor (chaves dos itens de menu que o usuário efetivamente
// vê — já reflete RolePermission, sem duplicar a consulta ao banco aqui).
// Dados puros (sem JSX) para serem filtráveis e testáveis; o ícone é uma chave
// mapeada para um SVG do lucide no componente cliente.
export type TutorialIcon =
  | "welcome"
  | "roles"
  | "products"
  | "requisicoes"
  | "baixas"
  | "users"
  | "audit"
  | "reopen";

export interface TutorialStep {
  key: string;
  title: string;
  body: string[];
  icon: TutorialIcon;
  visibleTo: (navKeys: ReadonlySet<string>) => boolean;
}

const always = (): boolean => true;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    key: "welcome",
    title: "Bem-vindo ao Vital Ops",
    body: [
      "Esta é a plataforma interna de operações da Vital Scheffer.",
      "Em poucos passos você entende o que dá para fazer por aqui. Use Voltar e Próximo para navegar.",
    ],
    icon: "welcome",
    visibleTo: always,
  },
  {
    key: "roles",
    title: "O que você vê depende do seu papel",
    body: [
      "Funcionário vê os módulos operacionais: Produtos, Pranchas, Requisições e Baixa de estoque.",
      "Fábrica é o papel do chão de fábrica: vê só Requisições, para pedir material ao estoque.",
      "Gestor e Administrador veem também Usuários e Auditoria — e são os únicos que confirmam requisições.",
      "O menu à esquerda já mostra apenas o que o seu papel permite acessar (o Administrador ajusta isso em Configurações).",
    ],
    icon: "roles",
    visibleTo: always,
  },
  {
    key: "products",
    title: "Produtos (BOM → Omie)",
    body: [
      "Suba a BOM exportada do CAD para começar.",
      "Revise e edite os itens na tela de revisão (código, descrição, família, quantidade).",
      "Depois é só gerar a planilha de importação ou enviar direto ao Omie.",
    ],
    icon: "products",
    visibleTo: (navKeys) => navKeys.has("produtos"),
  },
  {
    key: "requisicoes",
    title: "Requisições (pedir material ao estoque)",
    body: [
      "Passo 1 — Monte o pedido: informe quem está pedindo, o setor e os itens (código do produto no Omie + quantidade). Dá para pedir vários itens de uma vez.",
      "Passo 2 — Ao enviar, o sistema confere os códigos no Omie e o pedido ganha um número (ex.: REQ-0001), entrando na fila do gestor.",
      "Passo 3 — O gestor confirma ou recusa (recusa sempre tem motivo, que você vê em \"Meus pedidos\").",
      "Passo 4 — Na confirmação, o gestor escolhe o local de estoque e a baixa no Omie acontece sozinha, item por item, com a situação de cada item visível no pedido.",
    ],
    icon: "requisicoes",
    visibleTo: (navKeys) => navKeys.has("requisicoes"),
  },
  {
    key: "baixas",
    title: "Baixa de estoque por planilha (matéria-prima)",
    body: [
      "Passo 1 — Baixe o modelo (.xlsx) na própria tela: Produto (código Omie), Quantidade, Pedido, Nota Fiscal, OP e Solicitante.",
      "Passo 2 — Preencha uma linha por item e suba o arquivo. Pedido, NF e OP são referências que ficam gravadas na movimentação do Omie.",
      "Passo 3 — Escolha o local de estoque e o sistema confere cada linha no Omie (código existe? tem saldo naquele local?) SEM baixar nada ainda — troque o local para ver qual tem o material.",
      "Passo 4 — Ao executar, a saída é lançada no estoque do Omie no local escolhido, item a item; se interromper no meio, dá para continuar de onde parou sem baixar duas vezes.",
    ],
    icon: "baixas",
    visibleTo: (navKeys) => navKeys.has("baixas"),
  },
  {
    key: "users",
    title: "Usuários e setores",
    body: [
      "Cadastre pessoas, defina o papel (Administrador, Gestor ou Funcionário) e associe setores.",
      "Você também pode editar um usuário: nome, papel, setores, ativar/desativar e redefinir a senha.",
    ],
    icon: "users",
    visibleTo: (navKeys) => navKeys.has("usuarios"),
  },
  {
    key: "audit",
    title: "Auditoria",
    body: [
      "Tudo que acontece fica registrado: quem fez, o quê, quando, o IP e o navegador.",
      "Use a Auditoria para acompanhar logins, criação e edição de usuários e envios ao Omie.",
    ],
    icon: "audit",
    visibleTo: (navKeys) => navKeys.has("auditoria"),
  },
  {
    key: "reopen",
    title: "Pode rever quando quiser",
    body: [
      "Este tutorial abre sozinho no seu primeiro acesso.",
      "Para revê-lo depois, clique no ícone de ajuda (?) no topo, ao lado de Sair.",
    ],
    icon: "reopen",
    visibleTo: always,
  },
];

// Passos visíveis dado o menu já resolvido pelo servidor (já sem a função de
// visibilidade). Recebe as chaves dos itens de navegação visíveis.
export function tutorialStepsFor(navKeys: readonly string[]): TutorialStep[] {
  const keys = new Set(navKeys);
  return TUTORIAL_STEPS.filter((step) => step.visibleTo(keys));
}

// Chave de "já viu" no localStorage, por usuário (id ou e-mail).
export function tutorialSeenKey(userKey: string): string {
  return `vital-ops:tutorial-seen:${userKey}`;
}
