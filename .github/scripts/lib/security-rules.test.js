const { test } = require('node:test');
const assert = require('node:assert');
const { escanear, escanearDiff, escanearCaminhos, montarRegras } = require('./security-rules');

function diffAdd(arquivo, linhas) {
  const corpo = linhas.map((l) => `+${l}`).join('\n');
  return `diff --git a/${arquivo} b/${arquivo}\n--- a/${arquivo}\n+++ b/${arquivo}\n@@ -0,0 +1,${linhas.length} @@\n${corpo}\n`;
}

function temPerigo(achados, categoria) {
  return achados.some((a) => a.severidade === 'PERIGO' && (!categoria || a.categoria === categoria));
}

test('auto-login (o caso real) vira PERIGO e NÃO passa', () => {
  const diff = diffAdd('apps/accounts/middleware.py', [
    'class DevAutoLoginMiddleware:',
    '    def __call__(self, request):',
    '        request.user = User.objects.get(username="gestor@vital.dev")',
  ]);
  const achados = escanearDiff(diff);
  assert.ok(temPerigo(achados, 'Auth'), 'auto-login deveria ser PERIGO');
});

test('DEBUG = True vira PERIGO', () => {
  const achados = escanearDiff(diffAdd('config/settings.py', ['DEBUG = True']));
  assert.ok(temPerigo(achados, 'Config'));
});

test('permission_classes = [] vira PERIGO', () => {
  const achados = escanearDiff(diffAdd('apps/leads/views.py', ['    permission_classes = []']));
  assert.ok(temPerigo(achados, 'Auth'));
});

test('AllowAny vira PERIGO', () => {
  const achados = escanearDiff(diffAdd('apps/leads/views.py', ['    permission_classes = [AllowAny]']));
  assert.ok(temPerigo(achados, 'Auth'));
});

test('SECRET_KEY hardcoded vira PERIGO, mas via env não', () => {
  const hard = escanearDiff(diffAdd('config/settings.py', ['SECRET_KEY = "django-insecure-abc123xyz"']));
  assert.ok(temPerigo(hard, 'Segredo'));

  const env = escanearDiff(diffAdd('config/settings.py', ['SECRET_KEY = os.environ["SECRET_KEY"]']));
  assert.ok(!temPerigo(env, 'Segredo'), 'ler de env não é hardcode');
});

// A chave do teste original era AKIAIOSFODNN7EXAMPLE, que e a chave de documentacao
// publicada pela propria AWS e aparece em tutorial do mundo inteiro. Acusa-la e falso
// positivo, entao o teste passou a usar uma chave com formato realista.
test('AWS Access Key vira PERIGO', () => {
  const achados = escanearDiff(diffAdd('deploy.py', ['aws_key = "AKIA2X7QLMNPQRSTUVWX"']));
  assert.ok(temPerigo(achados, 'Segredo'));
});

test('código backend normal não gera PERIGO', () => {
  const diff = diffAdd('apps/leads/views.py', [
    'class LeadViewSet(viewsets.ModelViewSet):',
    '    permission_classes = [IsAuthenticated]',
    '    queryset = Lead.objects.all()',
  ]);
  assert.ok(!temPerigo(escanearDiff(diff)), 'não deveria acusar PERIGO');
});

test('linhas removidas/contexto são ignoradas', () => {
  const diff = `diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -1,1 +1,1 @@\n-DEBUG = True\n DEBUG = False\n`;
  assert.ok(!temPerigo(escanearDiff(diff)), 'DEBUG=True só na linha removida não conta');
});

test('except: pass vira MODERADO (falha silenciosa)', () => {
  const diff = diffAdd('apps/x.py', ['    try:', '        faz()', '    except Exception:', '        pass']);
  const achados = escanearDiff(diff);
  assert.ok(achados.some((a) => a.id === 'sec-falha-silenciosa' && a.severidade === 'MODERADO'));
});

// Antes era PERIGO, que bloqueava o PR. Virou MODERADO por decisão de time: todo PR
// que ajusta o próprio CI se autobloqueava, e isso treinava as pessoas a ignorar o
// selo vermelho. Continua aparecendo no relatório.
test('mexer em workflow de deploy vira MODERADO (path rule)', () => {
  const achados = escanearCaminhos(['.github/workflows/backend.yml']);
  assert.ok(achados.some((a) => a.severidade === 'MODERADO' && a.categoria === 'Deploy/CI'));
  assert.ok(!temPerigo(achados));
});

test('nova migration vira MODERADO (path rule)', () => {
  const achados = escanearCaminhos(['apps/leads/migrations/0007_add_field.py']);
  assert.ok(achados.some((a) => a.severidade === 'MODERADO' && a.categoria === 'Schema'));
});

test('reporta o número da linha (a partir do cabeçalho de hunk)', () => {
  const diff = [
    'diff --git a/config/settings.py b/config/settings.py',
    '--- a/config/settings.py',
    '+++ b/config/settings.py',
    '@@ -10,2 +10,3 @@',
    ' contexto1',
    '+DEBUG = True',
    ' contexto2',
  ].join('\n');
  const debug = escanearDiff(diff).find((a) => a.id === 'config-debug-true');
  assert.equal(debug.linha, 11);
});

test('dedup: mesma regra no mesmo arquivo conta uma vez', () => {
  const diff = diffAdd('config/settings.py', ['DEBUG = True', 'DEBUG = True']);
  const achados = escanear(diff, ['config/settings.py']);
  assert.equal(achados.filter((a) => a.id === 'config-debug-true').length, 1);
});

// --- Regressao dos falsos positivos confirmados em producao ---
// Cada um destes ja bloqueou ou poluiu PR legitimo. Os testes existem para que a
// correcao nao seja desfeita sem alguem perceber.

test('FP: regex.exec() do JS nao e execucao arbitraria', () => {
  const diff = diffAdd('src/parser.ts', [
    'const m = re.exec(linha);',
    'const partes = padrao.exec(texto);',
    'const linhas = cursor.execute(sql);',
  ]);
  const achados = escanearDiff(diff);
  assert.equal(achados.filter((a) => a.id === 'sec-eval-exec').length, 0);
});

test('eval( de verdade continua sendo pego', () => {
  const achados = escanearDiff(diffAdd('src/perigoso.js', ['const r = eval(entradaDoUsuario);']));
  assert.ok(achados.some((a) => a.id === 'sec-eval-exec'));
});

test('FP: .env.example e feito para ser versionado', () => {
  for (const arq of ['.env.example', '.env.production.example', 'config/.env.sample']) {
    const achados = escanearDiff(diffAdd(arq, ['DATABASE_URL=postgres://usuario:senha@host:5432/banco']));
    assert.equal(
      achados.filter((a) => a.id === 'config-env-versionado').length,
      0,
      arq + ' nao deveria acusar .env versionado'
    );
  }
});

test('.env de verdade continua sendo PERIGO', () => {
  const achados = escanearDiff(diffAdd('.env', ['DATABASE_URL=postgres://usuario:senha@host:5432/banco']));
  assert.ok(achados.some((a) => a.id === 'config-env-versionado' && a.severidade === 'PERIGO'));
});

test('FP: credencial em arquivo de teste nao bloqueia o PR', () => {
  for (const arq of ['tests/test_login.py', 'src/__tests__/auth.spec.ts', 'apps/core/fixtures/seed.py']) {
    const achados = escanearDiff(diffAdd(arq, ['password = "senha-de-teste-123"']));
    const cred = achados.find((a) => a.id === 'segredo-credencial-literal');
    assert.ok(cred, arq + ' deveria continuar reportando');
    assert.equal(cred.severidade, 'MODERADO', arq + ' nao deveria ser PERIGO');
  }
});

test('credencial em codigo de producao continua PERIGO', () => {
  const achados = escanearDiff(diffAdd('apps/core/client.py', ['password = "senha-real-123"']));
  assert.ok(achados.some((a) => a.id === 'segredo-credencial-literal' && a.severidade === 'PERIGO'));
});

test('FP: prosa em markdown nao e codigo', () => {
  const diff = diffAdd('docs/README.md', [
    'Nao existe auto-login neste sistema; a sessao expira em 30 min.',
    'Nunca use DEBUG = True em producao.',
  ]);
  assert.equal(escanearDiff(diff).length, 0);
});

test('composicao: regra de stack so entra quando a stack existe', () => {
  const diff = diffAdd('apps/leads/views.py', ['    permission_classes = []']);
  assert.ok(escanearDiff(diff, montarRegras(['django'])).some((a) => a.id === 'auth-permission-vazio'));
  assert.equal(escanearDiff(diff, montarRegras(['spring'])).filter((a) => a.id === 'auth-permission-vazio').length, 0);
});
test('FP: codigo gerado e de terceiro nao entra na revisao', () => {
  const casos = [
    ['docs/output/script/quarkdown.js', 'var f = new Function(a); const r = eval(x);'],
    ['node_modules/lib/index.js', 'const r = eval(entrada);'],
    ['frontend/.next/static/chunk.js', 'password = "abc123def"'],
    ['target/classes/App.js', 'const r = eval(x);'],
    ['package-lock.json', '"integrity": "sha512-abcdef1234567890"'],
    ['app/static/vendor.min.js', 'const r = eval(x);'],
  ];
  for (const [arq, linha] of casos) {
    assert.equal(escanearDiff(diffAdd(arq, [linha])).length, 0, arq + ' nao deveria gerar achado');
  }
});

test('codigo proprio com mesmo padrao continua sendo pego', () => {
  const achados = escanearDiff(diffAdd('src/app/util.js', ['const r = eval(entrada);']));
  assert.ok(achados.some((a) => a.id === 'sec-eval-exec'));
});
test('pega segredo com prefixo (app_secret, client_secret) que a versao antiga perdia', () => {
  const casos = [
    ["app/api/omie/route.js", "  app_secret: '613348abc256e52d487df9b388b8329a',"],
    ["app/api/ml/route.js", '  client_secret: "O0Cqu4RRcRarM0GK7FVUxyao0JNBQ87y",'],
    ["src/cfg.ts", "const apiKey = 'sk-live-abcdef123456';"],
  ];
  for (const [arq, linha] of casos) {
    const a = escanearDiff(diffAdd(arq, [linha]));
    assert.ok(a.some((x) => x.id === 'segredo-credencial-literal'), arq + ' deveria acusar');
  }
});

test('placeholder declarado nao e segredo', () => {
  const casos = [
    ['.env.example', 'NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here'],
    ['scripts/setup.js', "  apiKey: 'demo-api-key',"],
    ['config/exemplo.ts', "const token = 'changeme';"],
  ];
  for (const [arq, linha] of casos) {
    const a = escanearDiff(diffAdd(arq, [linha]));
    assert.equal(a.filter((x) => x.id === 'segredo-credencial-literal').length, 0, arq + ' nao deveria acusar');
  }
});

test('chave de exemplo oficial da AWS nao bloqueia', () => {
  const a = escanearDiff(diffAdd('lib/rules.test.js', ['aws_key = "AKIAIOSFODNN7EXAMPLE"']));
  assert.equal(a.filter((x) => x.id === 'segredo-aws-key' && x.severidade === 'PERIGO').length, 0);
});

test('chave AWS de verdade continua PERIGO', () => {
  const a = escanearDiff(diffAdd('deploy.py', ['aws_key = "AKIA2X7QLMNPQRSTUVWX"']));
  assert.ok(a.some((x) => x.id === 'segredo-aws-key' && x.severidade === 'PERIGO'));
});