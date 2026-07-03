const { test } = require('node:test');
const assert = require('node:assert');
const { escanear, escanearDiff, escanearCaminhos } = require('./security-rules');

function diffAdd(arquivo, linhas) {
  const corpo = linhas.map((l) => `+${l}`).join('\n');
  return `diff --git a/${arquivo} b/${arquivo}\n--- a/${arquivo}\n+++ b/${arquivo}\n@@ -0,0 +1,${linhas.length} @@\n${corpo}\n`;
}

function temPerigo(achados, categoria) {
  return achados.some((a) => a.severidade === 'PERIGO' && (!categoria || a.categoria === categoria));
}

test('SECRET/token hardcoded vira PERIGO, mas via process.env não', () => {
  const hard = escanearDiff(diffAdd('src/lib/auth.ts', ['const secret = "abc123xyzsegredo";']));
  assert.ok(temPerigo(hard, 'Segredo'));

  const env = escanearDiff(diffAdd('src/lib/auth.ts', ['const secret = process.env.AUTH_SECRET;']));
  assert.ok(!temPerigo(env, 'Segredo'), 'ler de env não é hardcode');
});

test('AWS Access Key vira PERIGO', () => {
  const achados = escanearDiff(diffAdd('src/lib/db.ts', ['const awsKey = "AKIAIOSFODNN7EXAMPLE";']));
  assert.ok(temPerigo(achados, 'Segredo'));
});

test('.env versionado vira PERIGO', () => {
  const achados = escanearCaminhos(['.env']);
  assert.equal(achados.length, 0, 'a regra de .env é por conteúdo de linha, não só caminho');
  const porLinha = escanearDiff(diffAdd('.env', ['DATABASE_URL=postgresql://user:pass@host/db']));
  assert.ok(temPerigo(porLinha, 'Segredo'));
});

test('$queryRawUnsafe vira PERIGO', () => {
  const achados = escanearDiff(diffAdd('src/lib/db.ts', ['await prisma.$queryRawUnsafe(sql);']));
  assert.ok(temPerigo(achados, 'Segurança'));
});

test('dangerouslySetInnerHTML vira achado MODERADO', () => {
  const achados = escanearDiff(diffAdd('src/components/X.tsx', ['<div dangerouslySetInnerHTML={{ __html: html }} />']));
  assert.ok(achados.some((a) => a.id === 'sec-dangerous-html' && a.severidade === 'MODERADO'));
});

test('código normal não gera PERIGO', () => {
  const diff = diffAdd('src/components/Button.tsx', [
    'export function Button({ children }: { children: React.ReactNode }) {',
    '  return <button>{children}</button>;',
    '}',
  ]);
  assert.ok(!temPerigo(escanearDiff(diff)), 'não deveria acusar PERIGO');
});

test('linhas removidas/contexto são ignoradas', () => {
  const diff = `diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,1 @@\n-const token = "abcdef123456";\n const token2 = "outra coisa não secreta";\n`;
  assert.ok(!temPerigo(escanearDiff(diff)), 'segredo só na linha removida não conta');
});

test('catch vazio (mesma linha) vira MODERADO (falha silenciosa)', () => {
  const diff = diffAdd('src/app/(app)/produtos/enviar-actions.ts', ['try {', '  await audit(x);', '} catch {}']);
  const achados = escanearDiff(diff);
  assert.ok(achados.some((a) => a.id === 'sec-catch-vazio' && a.severidade === 'MODERADO'));
});

test('catch vazio (bloco em duas linhas) vira MODERADO', () => {
  const diff = diffAdd('src/lib/audit.ts', ['try {', '  await risco();', '} catch (err) {', '}']);
  const achados = escanearDiff(diff);
  assert.ok(achados.some((a) => a.id === 'sec-catch-vazio' && a.severidade === 'MODERADO'));
});

test('catch com tratamento não acusa falha silenciosa', () => {
  const diff = diffAdd('src/lib/audit.ts', ['try {', '  await risco();', '} catch (err) {', '  console.error(err);', '}']);
  const achados = escanearDiff(diff);
  assert.ok(!achados.some((a) => a.id === 'sec-catch-vazio'));
});

test('mexer em workflow de deploy vira PERIGO (path rule)', () => {
  const achados = escanearCaminhos(['.github/workflows/gemini-review.yml']);
  assert.ok(temPerigo(achados, 'Deploy/CI'));
});

test('nova migration vira MODERADO (path rule)', () => {
  const achados = escanearCaminhos(['prisma/migrations/20260702_init/migration.sql']);
  assert.ok(achados.some((a) => a.severidade === 'MODERADO' && a.categoria === 'Schema'));
});

test('schema.prisma tocado vira MODERADO (path rule)', () => {
  const achados = escanearCaminhos(['prisma/schema.prisma']);
  assert.ok(achados.some((a) => a.id === 'schema-prisma-tocado' && a.severidade === 'MODERADO'));
});

test('src/lib/auth.ts tocado vira MODERADO (config central)', () => {
  const achados = escanearCaminhos(['src/lib/auth.ts']);
  assert.ok(achados.some((a) => a.id === 'config-central-tocada' && a.severidade === 'MODERADO'));
});

test('reporta o número da linha (a partir do cabeçalho de hunk)', () => {
  const diff = [
    'diff --git a/src/lib/db.ts b/src/lib/db.ts',
    '--- a/src/lib/db.ts',
    '+++ b/src/lib/db.ts',
    '@@ -10,2 +10,3 @@',
    ' contexto1',
    '+await prisma.$queryRawUnsafe(sql);',
    ' contexto2',
  ].join('\n');
  const achado = escanearDiff(diff).find((a) => a.id === 'sec-raw-sql');
  assert.equal(achado.linha, 11);
});

test('dedup: mesma regra no mesmo arquivo conta uma vez', () => {
  const diff = diffAdd('src/lib/db.ts', [
    'await prisma.$queryRawUnsafe(a);',
    'await prisma.$queryRawUnsafe(b);',
  ]);
  const achados = escanear(diff, ['src/lib/db.ts']);
  assert.equal(achados.filter((a) => a.id === 'sec-raw-sql').length, 1);
});
