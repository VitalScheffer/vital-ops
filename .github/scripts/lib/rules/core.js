// Regras que valem para QUALQUER stack: segredo commitado, .env versionado,
// execução dinâmica, TLS desligado, alteração de deploy/CI.
//
// Regras específicas de framework ficam nos módulos irmãos (django.js, spring.js,
// next.js, ...) e são compostas em security-rules.js conforme o que o repositório
// realmente usa. Assim uma correção aqui chega em todos os repositórios de uma vez,
// em vez de precisar ser repetida em cada um.

// Linhas que leem de ambiente não são segredo hardcoded — não acusar.
const LE_DE_AMBIENTE = /(os\.environ|getenv|process\.env|settings\.|config\(|env\(|ENV\[|\bvars\.|\bsecrets\.|System\.getenv|@Value\s*\(|\$\{)/i;

// Prosa não é código. Regras de linha não se aplicam a documentação: a palavra
// "auto-login" num README é uma frase, não um mecanismo de bypass.
// `.qd` é o formato do Quarkdown, usado nos guias de integração do mk-documentos.
const ARQUIVO_DE_PROSA = /\.(md|markdown|txt|rst|adoc|qd)$/i;

// Código gerado ou de terceiro. Ninguém escreve nem revisa essas linhas, então
// acusá-las é ruído garantido: um bundle minificado casa com quase toda regra de
// execução dinâmica, e um lockfile casa com regra de segredo por causa dos hashes.
// Vale para build versionado de propósito (o mk-documentos versiona `output/`).
const CAMINHO_GERADO =
  /(^|\/)(node_modules|vendor|dist|build|out|output|target|\.next|\.nuxt|coverage|__pycache__|migrations\/__pycache__)\//i;
const ARQUIVO_GERADO = /(\.min\.(m?js|css)|\.bundle\.m?js|\.worker\.min\.m?js|-lock\.json|\.lock|\.sum)$/i;

// Arquivo de teste/fixture/seed. Segredo aqui quase sempre é valor de mentira, então
// em vez de ignorar (perderia um vazamento real) as regras de credencial caem para
// MODERADO: continua aparecendo no relatório, mas deixa de bloquear o PR.
const ARQUIVO_DE_TESTE =
  /(^|\/)(tests?|__tests__|__mocks__|spec|specs|fixtures?|factories|seeds?|mocks?)\//i;
const NOME_DE_TESTE = /(^|\/)(test_[^/]+\.py|[^/]+_test\.(py|go|java)|[^/]+\.(test|spec)\.[jt]sx?)$/i;

// `.env` de exemplo é feito para ser versionado. Sem esta lista, todo PR que mexe em
// `.env.example` ou `.env.production.example` vira PERIGO "vazamento de segredos".
const ENV_DE_EXEMPLO = /\.(example|exemplo|sample|template|dist|tpl)$/i;

// Valor que se anuncia como placeholder. Diferente de `LE_DE_AMBIENTE`, que olha de
// onde o valor vem, isto olha o próprio valor: `your_api_key_here` e `demo-api-key`
// (a chave padrão do emulador do Firebase) não são segredo.
const VALOR_DE_EXEMPLO = /(your[_-][a-z0-9_-]*[_-]here|changeme|change[_-]me|placeholder|xxxx+|<[a-z_]+>|\bdemo[-_]|\bfake[-_]|\bdummy[-_])/i;

const SEGREDO_NAO_E = new RegExp(`${LE_DE_AMBIENTE.source}|${VALOR_DE_EXEMPLO.source}`, 'i');

const REGRAS_LINHA = [
  {
    id: 'auth-auto-login',
    severidade: 'PERIGO',
    categoria: 'Auth',
    regex: /auto[_\- ]?login/i,
    problema: 'Mecanismo de auto-login detectado (pula a autenticação).',
    recomendacao:
      'Auto-login NUNCA pode chegar na main: se for só dev, isole atrás de flag de ambiente e remova do PR de produção.',
  },
  {
    id: 'segredo-secret-key',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /SECRET_KEY\s*=\s*['"][^'"]{8,}['"]/,
    guard: LE_DE_AMBIENTE,
    rebaixarEmTeste: true,
    problema: 'SECRET_KEY hardcoded no código.',
    recomendacao: 'Mova para variável de ambiente/secret.',
  },
  {
    id: 'segredo-aws-key',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /AKIA[0-9A-Z]{16}/,
    // AKIAIOSFODNN7EXAMPLE é a chave de exemplo publicada pela própria AWS e
    // aparece em documentação e teste do mundo inteiro.
    guard: /AKIA[0-9A-Z]*EXAMPLE/,
    rebaixarEmTeste: true,
    problema: 'Possível AWS Access Key ID hardcoded.',
    recomendacao: 'Remova a credencial e rotacione a chave imediatamente.',
  },
  {
    id: 'segredo-private-key',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    problema: 'Chave privada commitada no repositório.',
    recomendacao: 'Remova do git, rotacione e guarde como secret.',
  },
  {
    id: 'segredo-credencial-literal',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    // Prefixo tolerado de propósito. A versão anterior era `\b(...|secret|...)\b`, e
    // `\b` antes de "secret" nunca casa em `app_secret` nem em `client_secret`,
    // porque `_` é caractere de palavra e não existe fronteira ali. O resultado foi
    // segredo real do Omie e do Mercado Livre passando batido no intra-vital.
    regex: /[\w.-]*(api[_-]?key|secret|token|senha|password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{6,}['"]/i,
    guard: SEGREDO_NAO_E,
    rebaixarEmTeste: true,
    problema: 'Credencial/segredo aparentemente hardcoded.',
    recomendacao: 'Use variável de ambiente/secret; se for real, rotacione.',
  },
  {
    id: 'config-env-versionado',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /^\s*[A-Z0-9_]+\s*=\s*.+/,
    soArquivo: /(^|\/)\.env(\.|$)/,
    naoArquivo: ENV_DE_EXEMPLO,
    problema: 'Arquivo .env versionado (provável vazamento de segredos).',
    recomendacao: 'Remova o .env do git e adicione ao .gitignore.',
  },
  {
    id: 'sec-eval-exec',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    // `[^.\w]` antes do nome impede casar com `re.exec(...)`, `padrao.exec(...)` e
    // `cursor.execute(...)`, que são chamadas comuns e inofensivas. Só pega `eval(`
    // e `exec(` como chamada própria.
    regex: /(^|[^.\w])(eval|exec)\s*\(/,
    problema: 'Uso de eval/exec — risco de execução arbitrária.',
    recomendacao: 'Evite; se inevitável, valide rigorosamente a entrada.',
  },
  {
    id: 'sec-ssl-verify-false',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/,
    problema: 'Verificação de certificado TLS desativada.',
    recomendacao: 'Mantenha a verificação de certificado ligada.',
  },
];

const REGRAS_CAMINHO = [
  {
    id: 'deploy-pipeline',
    severidade: 'MODERADO',
    categoria: 'Deploy/CI',
    teste: (p) => p.startsWith('.github/workflows/'),
    problema: 'Alteração em workflow de deploy/CI.',
    recomendacao: 'Revise com atenção: erro aqui quebra o deploy.',
  },
];

module.exports = {
  REGRAS_LINHA,
  REGRAS_CAMINHO,
  LE_DE_AMBIENTE,
  ARQUIVO_DE_PROSA,
  ARQUIVO_DE_TESTE,
  NOME_DE_TESTE,
  ENV_DE_EXEMPLO,
  CAMINHO_GERADO,
  ARQUIVO_GERADO,
};
