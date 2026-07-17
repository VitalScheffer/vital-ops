// Changelog exibido em /novidades (item 4). Curado manualmente a partir do
// SESSION_LOG.md — não é gerado automaticamente.
//
// IMPORTANTE: toda entrega nova precisa de uma entrada nova aqui (data +
// bullets em pt-BR, resumindo o que mudou para quem usa o app, não para
// quem programa). Adicione no TOPO do array (mais recente primeiro).

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-07-17",
    title: "Relatório em PDF com a marca, saldo do Omie na requisição e ajustes",
    items: [
      "Relatório de Requisições em PDF ficou mais bonito e legível: cabeçalho com a logo e o nome Vital Scheffer, resumo do período e os itens em tabela, com rodapé e paginação.",
      "Na busca de produto da requisição, ao escolher um item aparece ao lado o estoque total no Omie (somando todos os locais).",
      "A busca de produto deixou de mostrar itens marcados como \"INATIVO\" na descrição (além dos já inativos no cadastro do Omie).",
      "Corrigida a piscada de alguns elementos ao trocar o tema claro/escuro.",
    ],
  },
  {
    date: "2026-07-17",
    title: "Finalidade do consumo na baixa por planilha e botão de tema claro/escuro",
    items: [
      'Baixa por planilha: nova coluna "Observação (finalidade / motivo)". O que você escrever nela (ex.: "consumo na produção", a OP ou o motivo) vai direto para a observação do movimento no Omie, sem precisar digitar na mão lá depois. Continua opcional (baixe o modelo atualizado na tela).',
      "Botão de tema no topo da tela: alterne entre automático (segue o sistema), claro e escuro. A escolha fica salva no seu navegador.",
    ],
  },
  {
    date: "2026-07-17",
    title: "Baixa de produtos com lote, produtos sem custo e busca na requisição",
    items: [
      "A baixa de estoque de produtos com controle de lote agora funciona sozinha: o sistema reconhece de qual lote a saída deve sair (consome primeiro o lote que vence antes) e baixa desse lote, sem precisar fazer na mão no Omie.",
      "Produto sem custo médio cadastrado deixou de travar a baixa: o sistema baixa mesmo assim, só consumindo o estoque.",
      "Na Requisição, o campo do produto virou uma busca: digite parte do nome (ex.: \"cama\") ou o código, escolha na lista e o item é preenchido automaticamente (ainda dá para digitar o código à mão).",
      "O gestor pode arquivar requisições já confirmadas ou recusadas para tirar da lista do dia a dia. Nada é apagado: um filtro \"Ver arquivadas\" mostra tudo e o relatório continua completo.",
    ],
  },
  {
    date: "2026-07-16",
    title: "Requisições de fábrica, baixa de estoque por planilha e o papel Fábrica",
    items: [
      "Nova tela Requisições: quem precisa de material monta o pedido (vários itens por pedido, com código do Omie e quantidade), diz quem está pedindo e o setor — o pedido ganha um número (REQ-0001) e vai para o gestor.",
      "O gestor confirma ou recusa o pedido; na confirmação, a baixa no estoque do Omie acontece sozinha, item a item, com o resultado visível em cada um.",
      "Nova tela Baixa de estoque: baixe o modelo de planilha (código Omie, quantidade, pedido, nota fiscal, OP e solicitante), suba preenchida, confira códigos e saldo no Omie e execute a baixa em massa.",
      "Novo papel \"Fábrica\": usuários do chão de fábrica que veem SÓ a tela de Requisições (configurável em Configurações, como os demais módulos).",
      "Segurança com o Omie: saldo é conferido antes de qualquer baixa, tudo é sequencial e reenvio não baixa duas vezes (idempotente).",
      "As duas telas novas trazem um passo a passo \"como funciona\" no topo, e o tutorial (?) explica os fluxos por papel.",
      "Seletor de local de estoque: na Baixa por planilha dá para trocar o local e ver o saldo de cada um antes de baixar; na Requisição, o gestor escolhe de qual local a baixa sai ao confirmar.",
      "Relatório em PDF das requisições: o gestor escolhe o período e baixa o resumo do que foi solicitado, aprovado ou recusado, com a situação de cada item.",
    ],
  },
  {
    date: "2026-07-08",
    title: "Envio ao Omie não trava mais o lote inteiro por causa de 1 item",
    items: [
      "Peça padrão que já existe no Omie sob outro código (ex.: parafuso ou dobradiça usados em vários projetos diferentes) agora é reconhecida e reaproveitada automaticamente, em vez de dar erro.",
      "Se mesmo assim algum item não puder ser enviado, os demais da mesma planilha continuam normalmente — antes, um erro travava o envio inteiro.",
      "Mensagens de erro do envio ao Omie ficaram mais claras, sem trecho técnico bruto.",
    ],
  },
  {
    date: "2026-07-07",
    title: "Reports com anexo, exclusão de usuário e leitura das BOMs antigas do CAD",
    items: [
      "Botão de Reportar no topo: qualquer pessoa relata um problema ou sugestão, anexa prints/fotos/planilhas, e acompanha o status até ser resolvido (com a resposta do time).",
      "Erros do sistema passam a ser registrados sozinhos para o time olhar, com uma tela amigável no lugar do erro técnico.",
      "Gestão de usuários: agora dá para excluir um usuário (com travas de segurança) e o modal de edição foi corrigido.",
      "Importação de BOM: as planilhas .xls mais antigas exportadas do CAD, que antes davam erro de leitura, agora são lidas normalmente.",
    ],
  },
  {
    date: "2026-07-06",
    title: "Plataforma no ar, controle de lote automático e vários acabamentos",
    items: [
      "A plataforma agora está no ar no endereço oficial vitalops.vitalscheffer.com.br, com conexão segura (cadeado).",
      "Envio ao Omie: os produtos entram já com o \"controle de lote\" ligado automaticamente — não precisa marcar na mão.",
      "Ao subir uma planilha que não é a BOM (ou está corrompida/com senha), agora aparece uma mensagem clara explicando o problema, em vez de um erro técnico.",
      "Ícone da Vital Scheffer na aba do navegador (favicon).",
      "Trocar de tela ficou mais rápido: aparece um carregamento na hora ao clicar no menu, com uma transição suave.",
      "Botão \"Entrar\" agora mostra que foi clicado (fica pressionado e exibe \"Entrando…\").",
      "Administrador passa a ver, na Auditoria, também as falhas do envio ao Omie (o que falhou e por quê).",
    ],
  },
  {
    date: "2026-07-02",
    title: "Selects com o visual do app, modal de edição renovado, permissões configuráveis e novidades",
    items: [
      "Todos os menus suspensos (papel, família, etc.) agora seguem o tema claro/escuro do app, em vez do estilo branco padrão do navegador.",
      "Modal de \"Editar usuário\" com visual consistente com o resto da plataforma.",
      "Administrador agora escolhe quais papéis acessam cada módulo (ex.: tirar Auditoria do Gestor) na nova tela de Configurações.",
      "Esta tela de novidades, para acompanhar o que muda na plataforma ao longo do tempo.",
    ],
  },
  {
    date: "2026-07-02",
    title: "Editar usuários e tutorial de boas-vindas",
    items: [
      "Edição de usuários: nome, papel, setores, ativar/desativar e redefinir senha.",
      "Tutorial de boas-vindas por papel, que abre sozinho no primeiro acesso de cada pessoa (com botão para rever quando quiser).",
    ],
  },
  {
    date: "2026-07-02",
    title: "Produtos — tela de revisão editável antes de gerar ou enviar",
    items: [
      "Revise e corrija os itens da BOM antes de gerar a planilha ou enviar ao Omie: incluir/excluir, editar descrição e família, e ajustar quantidade da estrutura.",
      "Resumo no topo mostra quantos itens estão selecionados, com erro ou ignorados.",
    ],
  },
  {
    date: "2026-07-02",
    title: "Produtos — envio automático ao Omie",
    items: [
      "Botão \"Enviar ao Omie\" envia famílias, produtos e estrutura direto pela API, com status por item (enviado, já existia, falha).",
      "Envio sequencial e seguro: se algo falhar ou bloquear, o restante fica marcado para reenviar depois.",
    ],
  },
  {
    date: "2026-07-02",
    title: "Produtos — BOM do CAD para planilha de importação do Omie",
    items: [
      "Nova aba Produtos: suba a BOM exportada do CAD e gere a planilha de produtos e estrutura pronta para importar no Omie.",
    ],
  },
  {
    date: "2026-07-02",
    title: "Primeira versão da plataforma",
    items: [
      "Login com e-mail e senha.",
      "Papéis Administrador, Gestor e Funcionário, com setores para organizar as pessoas.",
      "Auditoria: histórico de quem fez o quê, quando e de onde.",
    ],
  },
];
