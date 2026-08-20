@AGENTS.md

<!-- CEREBRO-CENTRAL:INICIO -->
## Cérebro Central de Memórias (obrigatório)

Este repositório é o projeto `vital-ops` no Cérebro Central. As ferramentas
chegam pelo servidor MCP `cerebro`.

**Antes de ler código ou propor qualquer mudança nesta sessão:**

1. Chame `iniciar_sessao` com `projeto: "vital-ops"`. Ela devolve com quem você
   está falando, a última sessão deste repo, o que ficou pendente, quem mexeu
   por último e quais projetos quebram se você mudar contrato. **Não comece sem isso.**
2. Se o preflight disser que não sabe quem está no teclado, **pergunte** e chame
   `definir_desenvolvedor`. Nunca deduza a pessoa pelo repositório: qualquer um
   da equipe mexe em qualquer projeto.
3. Bateu erro? Chame `buscar_erro` com o texto do erro **antes** de começar a
   depurar. Pode já estar resolvido por outra pessoa em outro projeto.

**Durante a sessão:**

4. Resolveu um erro de build, migration, deploy, Docker, Node, PowerShell ou API?
   Chame `registrar_erro` com o texto do erro, a solução e o comando que funcionou.
5. Vai contrariar uma decisão que aparece no preflight? Diga isso em voz alta
   antes de mudar, e explique por quê.

**No fim da sessão:**

6. Chame `salvar_sessao` com projeto `vital-ops`. Sessão não salva é sessão
   perdida: a próxima IA (e a próxima pessoa) começa do zero.
7. Continue mantendo o `SESSION_LOG.md` deste repo. O Cérebro importa esse
   arquivo, então ele não é trabalho duplicado.

**Consulta livre:** `consultar_memoria` busca em todo o histórico dos repositórios,
não só neste.
<!-- CEREBRO-CENTRAL:FIM -->
