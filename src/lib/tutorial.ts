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
      "Funcionário vê Início e Produtos.",
      "Gestor e Administrador veem também Usuários e Auditoria.",
      "O menu à esquerda já mostra apenas o que o seu papel permite acessar.",
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
      "Precisa de material? Monte o pedido com os itens (código e quantidade), diga quem está pedindo e o setor.",
      "O pedido ganha um número (REQ-0001) e vai para o gestor, que confirma ou recusa.",
      "Quando o gestor confirma, a baixa no estoque do Omie acontece sozinha.",
    ],
    icon: "requisicoes",
    visibleTo: (navKeys) => navKeys.has("requisicoes"),
  },
  {
    key: "baixas",
    title: "Baixa de estoque por planilha",
    body: [
      "Baixe o modelo, preencha os itens de matéria-prima (código, quantidade, pedido, NF, OP) e suba a planilha.",
      "O sistema confere os códigos e o saldo no Omie antes de qualquer baixa.",
      "Confirmou? A saída é lançada no Omie item a item, com o vínculo do pedido e da nota na observação.",
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
