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
    // `proxy.ts` é o nome do middleware a partir do Next 16 (vital-ops); `middleware.ts`
    // é o nome anterior, ainda usado no mk-frontend. Os arquivos de RBAC entram porque
    // são a fonte única de verdade da autorização e não tinham guarda determinística.
    teste: (p) =>
      /^(middleware\.ts|src\/proxy\.ts|config\/route-permission\.ts|config\/routes\.ts|src\/lib\/(rbac|permissions|permissions\.server)\.ts)$/.test(
        p.replace(/\\/g, '/')
      ),
    problema: 'Arquivo que decide quais rotas são públicas e quais permissões cada uma exige.',
    recomendacao: 'Confirme que nenhuma rota privada virou pública e que a rota nova está coberta pelas permissões.',
  },
  {
    id: 'config-central-tocada',
    severidade: 'MODERADO',
    categoria: 'Config',
    // Recuperada da versão que o vital-ops mantinha à mão e que se perdeu quando as
    // regras foram consolidadas em módulos. Erro em qualquer um destes derruba login,
    // banco ou build da aplicação inteira.
    teste: (p) =>
      /^(src\/lib\/(db|auth|auth\.config)\.ts|prisma\.config\.ts|next\.config\.(ts|js|mjs))$/.test(
        p.replace(/\\/g, '/')
      ),
    problema: 'Arquivo de configuração central alterado (banco, autenticação ou build).',
    recomendacao: 'Revise com atenção: erro aqui afeta login, banco ou build da aplicação inteira.',
  },
];

// `catch { }` ou `catch (e) { }` com corpo vazio. Perdida na consolidação: o módulo
// spring tinha o equivalente para Java, e o lado JS/TS ficou descoberto.
const CATCH_VAZIO_JS = {
  id: 'sec-catch-vazio',
  severidade: 'MODERADO',
  categoria: 'Robustez',
  // Numa linha só, que é como quase sempre aparece em JS (`} catch {}`).
  regex: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
  soArquivo: /\.[jt]sx?$/,
  problema: 'catch vazio engole o erro silenciosamente.',
  recomendacao: 'Logue ou trate o erro; não silencie em caminho crítico (Server Action, auth, envio ao ERP).',
};

REGRAS_LINHA.push(CATCH_VAZIO_JS);

module.exports = { REGRAS_LINHA, REGRAS_CAMINHO };
