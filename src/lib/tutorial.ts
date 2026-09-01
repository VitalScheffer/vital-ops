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
  | "movimentacoes"
  | "depara"
  | "users"
  | "audit"
  | "notificacoes"
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
      "Gestor da Fábrica também vê só Requisições, mas com a fila de aprovação: é ele quem confirma ou recusa os pedidos.",
      "Gestor e Administrador veem também Usuários e Auditoria, e igualmente confirmam requisições.",
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
    key: "movimentacoes",
    title: "Movimentação por OP (reserva de produção)",
    body: [
      "Passo 1 — Digite o número da Ordem de Produção do Omie (ex.: 2026/00802). Não precisa de PDF nem de planilha: o sistema busca a OP e traz o produto, a quantidade a produzir e a lista de material.",
      "Passo 2 — Confira a lista. As quantidades já vêm multiplicadas pela quantidade da OP e na unidade de cada cadastro (10 unidades de uma chapa de 1 kg aparecem como 10 kg). Vêm marcados só matéria-prima e comprados; um botão mostra toda a BOM.",
      "Passo 3 — Escolha de onde sai e para onde vai. O padrão é sair do Estoque de Matéria-Prima e ir para Reservado Produção, mas o destino é livre. Trocar a origem reconsulta o saldo na hora.",
      "Passo 4 — Ao transferir, cada item vira uma saída na origem e uma entrada no destino (o Omie não tem transferência pronta). Se algo interromper, a tela avisa o que ficou sem a entrada e conclui só o que falta, sem mover nada duas vezes.",
      "Item sem saldo no código novo oferece o cadastro ANTIGO que tem o material. Se a lista vier vazia, use o campo de busca da própria linha para procurar o código na mão.",
      "Se a unidade for outra (M² contra KG) e o par tiver fator gravado no De/Para, a quantidade já vem convertida. Sem fator, ela vem em branco e você digita.",
      "Passo 5 — Quando a produção começar, use a seção \"Reservado para a OP\" para dar baixa. Escolha um local para todos ou um por item. Errou? \"Reverter baixa\" devolve o material ao mesmo local e aos mesmos lotes.",
    ],
    icon: "movimentacoes",
    visibleTo: (navKeys) => navKeys.has("movimentacoes"),
  },
  {
    key: "depara",
    title: "De/Para de códigos (PRD para MAT)",
    body: [
      "O estoque físico ainda está lançado nos códigos antigos (PRD) e as ordens de produção novas já pedem os códigos novos (MAT). Esta tela liga um ao outro, uma vez por item.",
      "A fila mostra os cadastros ATIVOS que ainda têm saldo, ordenados pelo saldo: quem tem mais material parado aparece primeiro. Cadastro inativo ou bloqueado não entra.",
      "A sugestão é automática (forma, bitola e liga lidas da descrição), mas quem decide é você. Onde a liga não bate com o catálogo novo ou onde a unidade muda, a linha vem com aviso e exige confirmação.",
      "Não achou o código na fila? Ele pode estar zerado em todos os locais (a fila só mostra quem tem saldo) ou não se ler como matéria-prima. Use \"Buscar cadastro\" para ir direto ao catálogo do Omie e ligar o par assim mesmo.",
      "Unidades diferentes pedem um fator, uma vez: 1 KG do código novo = quantos M² do antigo. A partir daí a Movimentação por OP já converte a quantidade sozinha.",
      "Depois de ligado, a tela de Movimentação por OP passa a mostrar em qual código antigo o material está quando o código novo aparecer sem saldo.",
      "\"Aposentar código antigo\" fecha o ciclo: confere o que ainda roda com ele (OP aberta, requisição, pedido de compra), move TODO o saldo local por local para o código novo e, se você marcar, inativa o cadastro no Omie. Se depois entrar nota fiscal no código velho, a tela avisa em destaque.",
    ],
    icon: "depara",
    visibleTo: (navKeys) => navKeys.has("depara"),
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
    key: "notificacoes",
    title: "Notificações do Windows",
    body: [
      "O sininho no topo mostra o que precisa da sua atenção. Abra o dropdown e clique em \"Ativar notificações do Windows\" para receber um aviso do sistema operacional mesmo com a aba fora de foco ou minimizada.",
      "Cada papel recebe o que é seu: gestor é avisado de pedido novo para decidir, quem pediu é avisado da decisão, Projetos é avisado de configuração nova, e o comercial é avisado da resposta.",
      "Clicar na notificação leva direto para a tela do assunto. Dá para desativar a qualquer momento no mesmo sininho.",
    ],
    icon: "notificacoes",
    visibleTo: always,
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
