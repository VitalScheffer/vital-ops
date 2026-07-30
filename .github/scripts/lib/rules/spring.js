// Regras específicas de Java / Spring Boot.
//
// Ancoradas em achados reais dos repositórios mk-integracao, mk-gerenciamento,
// mk-webhook-gateway e mk-impressora. Cada regra tem um caso positivo e um negativo
// verificados no código; ver security-rules.test.js.

const CONFIG_SPRING = /application([-.]\w+)?\.(properties|ya?ml)$/;

const REGRAS_LINHA = [
  {
    id: 'spring-segredo-properties',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /^\s*[\w.-]*(password|senha|secret|token|api[-_]?key)[\w.-]*\s*[:=]\s*\S+/i,
    // `${...}` é leitura de ambiente, que é o padrão correto. Sem este guard a regra
    // acusaria toda linha de configuração feita do jeito certo.
    guard: /[:=]\s*\$\{/,
    soArquivo: CONFIG_SPRING,
    problema: 'Segredo com valor literal no arquivo de configuração, versionado no git.',
    recomendacao: 'Leia de variável de ambiente (${VAR}) e rotacione a credencial que ficou exposta no histórico.',
  },
  {
    id: 'spring-default-fraco',
    severidade: 'MODERADO',
    categoria: 'Segredo',
    // `${VAR:valor}` com default preenchido: se a variável não for definida no
    // ambiente, a aplicação sobe com o valor de desenvolvimento em vez de falhar.
    regex: /[\w.-]*(password|senha|secret|token|api[-_]?key)[\w.-]*\s*[:=]\s*\$\{\w+:[^}\s]{2,}\}/i,
    soArquivo: CONFIG_SPRING,
    problema: 'Segredo com valor padrão de desenvolvimento. Sem a variável de ambiente a aplicação sobe com ele, em silêncio.',
    recomendacao: 'Use default vazio (${VAR:}) para a subida falhar quando a variável faltar.',
  },
  {
    id: 'spring-log-credenciais',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex:
      /\b(log|logger)\.(info|debug|warn|error|trace)\([^;]*,\s*\w*(credenciais|credentials|token|secret|senha|password)\w*(\.toString\(\))?\s*[,)]/i,
    soArquivo: /\.java$/,
    problema: 'Objeto de credencial passado como argumento de log. O segredo é gravado em texto plano no arquivo de log.',
    recomendacao: 'Logue só identificador não sensível (id da conta), nunca o objeto de credenciais.',
  },
  {
    id: 'spring-permitall-sensivel',
    severidade: 'PERIGO',
    categoria: 'Auth',
    regex: /requestMatchers\([^)]*(swagger|api-docs|actuator|admin|management)[^)]*\)[^;]*\.permitAll\(\)/i,
    soArquivo: /\.java$/,
    problema: 'Rota sensível (documentação, actuator, admin) liberada sem autenticação.',
    recomendacao: 'Mantenha .authenticated() nessas rotas.',
  },
  {
    id: 'spring-ddl-auto-destrutivo',
    severidade: 'PERIGO',
    categoria: 'Schema',
    regex: /ddl-auto\s*[:=]\s*(create|create-drop|update)\b/i,
    problema: 'ddl-auto destrutivo: create e create-drop apagam o schema, update altera a estrutura sem migration revisada.',
    recomendacao: 'Use validate e faça mudança de schema por migration.',
  },
  {
    id: 'spring-flyway-clean',
    severidade: 'PERIGO',
    categoria: 'Schema',
    regex: /flyway\.clean[-_]?disabled\s*[:=]\s*false|flyway\.clean\s*[:=]\s*true/i,
    problema: 'Flyway clean habilitado. O clean apaga todos os objetos do schema.',
    recomendacao: 'Mantenha clean-disabled=true em qualquer ambiente com dado real.',
  },
  {
    id: 'spring-csrf-disable',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /csrf\s*\([^)]*disable/i,
    soArquivo: /\.java$/,
    problema: 'CSRF desabilitado. Só é seguro se nenhuma rota autenticar por cookie/sessão.',
    recomendacao: 'Confirme que a autenticação é por Bearer token e registre a decisão no PR.',
  },
  {
    id: 'spring-cors-wildcard',
    severidade: 'MODERADO',
    categoria: 'Config',
    regex: /@CrossOrigin\s*\([^)]*["']\*["']|allowed-origins\s*[:=]\s*\$?\{?[\w.:-]*\*/i,
    problema: 'CORS liberado para qualquer origem.',
    recomendacao: 'Liste as origens conhecidas; evite default coringa quando a variável não é definida.',
  },
  {
    id: 'spring-block-sem-timeout',
    severidade: 'MODERADO',
    categoria: 'Robustez',
    regex: /\.block\(\s*\)/,
    soArquivo: /\.java$/,
    problema: '.block() sem timeout. Se a chamada externa pendurar, a thread fica presa indefinidamente.',
    recomendacao: 'Passe uma duração: .block(Duration.ofSeconds(n)).',
  },
  {
    id: 'mqtt-clientid-dinamico',
    severidade: 'PERIGO',
    categoria: 'Mensageria',
    // Causa confirmada da etiqueta impressa duas vezes: com clientId único por
    // instância, o broker trata cada worker como assinante distinto e entrega a
    // mesma mensagem a todos.
    regex: /clientId\b[^;]*=[^;]*(currentTimeMillis\(\)|UUID\.randomUUID\(\)|nanoTime\(\)|new\s+Random\(|Math\.random\()/,
    soArquivo: /\.java$/,
    problema: 'clientId de MQTT gerado dinamicamente. Duas instâncias viram assinantes distintos e cada uma processa a mesma mensagem.',
    recomendacao: 'Use clientId fixo, vindo de configuração, para o broker garantir um consumidor por identidade.',
  },
];

const REGRAS_CAMINHO = [
  {
    id: 'spring-migration',
    severidade: 'MODERADO',
    categoria: 'Schema',
    teste: (p) => /db\/migration\/.*\.sql$/.test(p.replace(/\\/g, '/')),
    problema: 'Nova migration de banco. O deploy aplica no schema de produção.',
    recomendacao: 'Confirme reversibilidade e impacto em dado existente.',
  },
  {
    id: 'spring-config-tocada',
    severidade: 'MODERADO',
    categoria: 'Config',
    teste: (p) => CONFIG_SPRING.test(p.replace(/\\/g, '/')),
    problema: 'Arquivo de configuração da aplicação alterado.',
    recomendacao: 'Cheque credencial, CORS, ddl-auto e endereço de serviço externo.',
  },
];

// `catch (...) { }` com corpo vazio na mesma linha, ou seguido só de `}`.
const CATCH_VAZIO = {
  id: 'spring-catch-vazio',
  severidade: 'MODERADO',
  categoria: 'Robustez',
  abre: /catch\s*\(\s*\w+(\.\w+)*\s+\w+\s*\)\s*\{\s*$/,
  silencia: /^\s*\}\s*$/,
  problema: 'catch com corpo vazio engole o erro sem deixar rastro.',
  recomendacao: 'Logue a exceção antes de decidir seguir; falha silenciosa vira bug invisível.',
};

module.exports = { REGRAS_LINHA, REGRAS_CAMINHO, PARES: [CATCH_VAZIO] };
