// Regras específicas de Next.js / React.
//
// Nota sobre `soArquivo`: sempre ancorar com `$`. O mk-frontend versiona arquivos
// `.ts.disabled` (código desligado), e um regex `/\.(ts|tsx)/` sem âncora casa com
// eles, revisando código que nem é compilado.

const REGRAS_LINHA = [
  {
    id: 'next-public-com-segredo',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    // A classe [A-Z0-9_] não inclui `=`, então a busca fica confinada ao NOME da
    // variável. `NEXT_PUBLIC_AUTH_COOKIE_NAME=auth-token` não casa: o "token" do
    // valor está do outro lado do `=`, fora do alcance.
    regex: /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|KEY|APIKEY|PASSWORD|SENHA|PRIVATE|CREDENTIAL)[A-Z0-9_]*/,
    problema: 'Variável NEXT_PUBLIC_* com nome de segredo. O prefixo embute o valor no bundle enviado ao navegador.',
    recomendacao:
      'Não prefixe segredo com NEXT_PUBLIC_. Leia a variável sem prefixo no servidor e repasse ao client só o necessário.',
  },
  {
    id: 'next-credencial-localstorage',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /localStorage\.setItem\(\s*["'](auth|token|access_token|refresh_token|jwt|senha|password|credential)["']/i,
    problema: 'Token/credencial em localStorage fica acessível a qualquer script da página, inclusive via XSS.',
    recomendacao: 'Prefira cookie httpOnly. Se for indispensável manter em localStorage, justifique no PR.',
  },
  {
    id: 'sec-dangerous-html',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /dangerouslySetInnerHTML/,
    problema: 'Injeção de HTML sem sanitização (risco de XSS).',
    recomendacao: 'Sanitize o conteúdo antes de renderizar.',
  },
  {
    id: 'next-dominio-producao-fixo',
    severidade: 'MODERADO',
    categoria: 'Config',
    regex: /https?:\/\/[a-z0-9.-]*vitalscheffer\.com\.br/i,
    soArquivo: /\.(ts|tsx|js|jsx)$/,
    problema: 'URL de produção escrita no código. A imagem é construída uma vez e configurada por ambiente em runtime.',
    recomendacao: 'Leia de variável de ambiente, como o resto do projeto já faz.',
  },
];

const REGRAS_CAMINHO = [
  {
    id: 'next-arquivo-de-autorizacao',
    severidade: 'MODERADO',
    categoria: 'Auth',
    teste: (p) => /^(middleware\.ts|config\/route-permission\.ts|config\/routes\.ts)$/.test(p.replace(/\\/g, '/')),
    problema: 'Arquivo que decide quais rotas são públicas e quais roles cada rota exige.',
    recomendacao: 'Confirme que nenhuma rota privada virou pública e que a rota nova está coberta pelas permissões.',
  },
];

module.exports = { REGRAS_LINHA, REGRAS_CAMINHO };
