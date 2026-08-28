# Movimentação por OP e De/Para de códigos — Design

## Objetivo

Duas telas novas no Vital Ops:

1. `/movimentacoes` — a pessoa digita o número da Ordem de Produção do Omie e transfere a matéria-prima e os componentes daquela OP de um local de estoque para outro (o caso de uso é reservar material para produção). Sem PDF, sem planilha.
2. `/de-para` — liga o código antigo (`PRD…`) ao cadastro novo de matéria-prima (`MAT…`), que é o que destrava a tela 1.

## Descoberta que definiu o desenho

Sondagem read-only contra a API real do Omie em 28/08/2026, com a app_key da empresa:

- **A OP do Omie já entrega a BOM explodida e multiplicada.** `ListarOrdemProducao` com `lExibirItens: true` devolve `itensDetalhes` com produto, quantidade e local por item. A OP 2026/00801 (10 unidades de `CREHS MT002 I0POL`) traz 75 itens: `10` de cada peça e `11,7349` KG de tubo. A OP 2026/00802 (450 unidades) traz `263,745` KG. Quem multiplica é o Omie. Não há parser de BOM nesta tela, nem conversão de peso.
- **Não existe transferência entre locais na API.** O serviço `estoque/ajuste/` tem `ENT` e `SAI`. Transferir é uma saída na origem seguida de uma entrada no destino.
- **O local "Reservado Produção" já existia** (código 12, id `12170621031`, criado em 24/08/2026), junto com "Reservado Cliente" e "Reservado Licitação".
- **O saldo está no código antigo.** Dos 92 MAT ativos, 0 têm saldo no Local Padrão e 19 no Estoque de Matéria-Prima, que por sua vez tem 961 itens com saldo, quase todos em `PRD…`. Sem De/Para, a tela 1 encontraria saldo zero em quase toda linha de OP nova.
- **A empresa está no meio da troca de padrão.** A OP 2026/00604 (maio) usa `PRD00813` com item `PRD00620 - CHAPA 0,90 X 1200 X 2000 MM ACO INOX 200` em M²; a OP 2026/00801 (agosto) usa `CREHS MT002 I0POL` com `MATCH 00060 IN430` em KG.
- `ListarProdutos` aceita `codigo_produto` (id interno) dentro de `produtosPorCodigo`. Uma OP de 75 itens custa 2 leituras, não 75.

## Escopo aprovado

- Origem e destino são **os dois** selecionáveis (decisão do Vitor). A sugestão inicial é Estoque de Matéria-Prima → Reservado Produção, escolhida por NOME e não por id fixo, porque o id é de cada base.
- A movimentação é uma transferência de verdade (SAI + ENT), não a flag `cReservado` nativa da OP.
- O De/Para cobre só matéria-prima (`PRD` → `MAT`).
- Transferir saldo do código antigo para o novo **não** entra: é migração de estoque e merece decisão em separado.

## Arquitetura

Dois módulos PUROS, no mesmo desenho do `omieEstoque.ts` (recebem `chamar` por parâmetro, não tocam banco nem sessão):

- `src/lib/estoque/omieOp.ts` — leitura da OP, casamento do número digitado (`chaveDaOrdem`/`acharOrdem`), agregação dos itens repetidos, classificação por família (`grupoDoItem`) e a transferência (`transferirEstoque`).
- `src/lib/depara/depara.ts` + `legado.ts` — sugestão de equivalente e a origem da fila.

O casamento do De/Para **reaproveita o motor que já existe** em `src/lib/produtos/materiaPrima.ts` (`lerEspecificacao` + `ligaDoTexto` + `casarMateriaPrima`). A diferença é a origem da pista: na BOM ela vem do código da peça, aqui vem da própria descrição, porque `PRD00620` não diz nada.

`src/lib/estoque/locais.ts` guarda a escolha do local sugerido, pura, compartilhada entre Server Component e cliente.

## O estado que justifica as tabelas novas

`MovimentoOpItem.status = 'SAIDA_OK'`: a saída passou e a entrada não. O material saiu do saldo da origem e não chegou ao destino. Não é "falha" (repetir do zero baixaria de novo) e não é sucesso. A tela mostra esses itens em destaque no topo e o botão "Concluir entrada" reenvia só a perna que falta, com `saidaFeita: true`. Sem persistir isso, uma queda no meio da execução viraria divergência de estoque que ninguém descobre.

Idempotência: `cod_int_ajuste` é `<id do item>-s` e `<id do item>-e`. Reenviar é duplicado idempotente. Saída duplicada + entrada nova = a retomada que conserta o pendente; as duas duplicadas = `ja_transferido`.

## Segurança e ban-safety (§6 do REQUISITOS)

- Tudo sequencial. Leitura em lote antes de escrever.
- Saldo e existência do produto validados LOCALMENTE: item sem saldo nem vira chamada.
- Freio próprio de sequência de risco (5 respostas seguidas fora do sucesso limpo pausa a execução), igual ao `baixarEstoque`.
- `OmieBlocked` interrompe sem deixar item pela metade.
- A retomada lê os locais e as quantidades do BANCO, nunca da tela: retomar com outra origem devolveria o material no lugar errado.
- Módulos novos no RBAC: `movimentacoes` acompanha `baixas` (as duas escrevem no estoque). `depara` nasce só para ADMIN/GESTOR, porque uma linha errada ali move a matéria-prima errada em toda OP seguinte.

## Onde o automático para e a pessoa decide

O De/Para nunca liga sozinho. Dois motivos concretos, os dois com aviso escrito na linha:

- `ligaDoTexto` trata todo "INOX" como 430 (regra correta para o catálogo novo, que só tem 430). A descrição antiga diz "ACO INOX 200", que é outra série. Confiança cai para APROXIMADA e o aviso pede confirmação com a engenharia.
- A unidade muda de M² para KG. Converter dependeria de espessura e densidade, e a tabela de densidade do repo ainda tem três valores estimados (pendência de 20/08).

## Testes

- `omieOp.test.ts` (24 casos) com recorte fiel da resposta real da OP 2026/00801: leitura, paginação, normalização do número, ambiguidade de sequencial sem ano, agregação de item repetido (inclusive o erro de ponto flutuante), classificação de família (com o caso "MATERIAIS DE ESCRITÓRIO" que não pode virar matéria-prima), e a transferência inteira: ordem das pernas, entrada pendente, retomada só com a entrada, saldo insuficiente sem gastar chamada, duplicado nas duas pernas, bloqueio e ausência de custo médio.
- `depara.test.ts` (10 casos) com catálogo MAT recortado do Omie real: casamento por espessura e liga, o alerta de inox 200, o alerta de mudança de unidade, tubo redondo, descrição que não é matéria-prima, bitola inexistente, liga respeitada, ordenação por saldo e o filtro de código no padrão novo 5-5-5.

## Pendências deixadas

- Rodar a migração `20260828120000_movimentacao_op_e_depara` (o `vercel-build` já faz `prisma migrate deploy`).
- Primeira sessão de De/Para com a engenharia: são 92 MAT ativos e centenas de `PRD` com saldo.
- Decidir em separado se haverá botão de transferir saldo do código antigo para o novo.
