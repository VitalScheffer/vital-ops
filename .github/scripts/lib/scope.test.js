const { test } = require('node:test');
const assert = require('node:assert');
const { classificarArquivo, mapearAreas, inferirEscopoDeclarado, detectarForaDeEscopo } = require('./scope');

test('classifica arquivos por área', () => {
  assert.equal(classificarArquivo('src/components/users/EditUserDialog.tsx'), 'ui');
  assert.equal(classificarArquivo('src/app/(app)/usuarios/actions.ts'), 'server');
  assert.equal(classificarArquivo('src/lib/rbac.ts'), 'server');
  assert.equal(classificarArquivo('prisma/migrations/20260702_init/migration.sql'), 'migration');
  assert.equal(classificarArquivo('prisma/schema.prisma'), 'schema');
  assert.equal(classificarArquivo('.github/workflows/gemini-review.yml'), 'ci/infra');
  assert.equal(classificarArquivo('docs/REQUISITOS.md'), 'specs');
  assert.equal(classificarArquivo('src/app/(app)/usuarios/page.tsx'), 'ui');
});

test('mapeia áreas únicas ordenadas', () => {
  const { areas } = mapearAreas(['src/components/a.tsx', 'src/lib/x.ts', 'src/components/b.tsx']);
  assert.deepEqual(areas, ['server', 'ui']);
});

test('infere escopo explícito de conventional commit', () => {
  const e = inferirEscopoDeclarado('feat(ui): novo componente de select');
  assert.deepEqual(e.areas, ['ui']);
  assert.equal(e.explicito, true);
});

test('infere escopo por palavra-chave (não explícito)', () => {
  const e = inferirEscopoDeclarado('Ajustes na tela e no CSS do modal');
  assert.deepEqual(e.areas, ['ui']);
  assert.equal(e.explicito, false);
});

test('fora de escopo: tarefa de UI explícita que mexe em server vira PERIGO', () => {
  const escopo = inferirEscopoDeclarado('feat(ui): troca de ícones');
  const achado = detectarForaDeEscopo(escopo, ['server', 'ui']);
  assert.ok(achado);
  assert.equal(achado.severidade, 'PERIGO');
  assert.equal(achado.categoria, 'Escopo');
});

test('dentro do escopo: UI explícita só na UI não acusa', () => {
  const escopo = inferirEscopoDeclarado('feat(ui): troca de ícones');
  assert.equal(detectarForaDeEscopo(escopo, ['ui']), null);
});

test('specs junto não conta como fora de escopo', () => {
  const escopo = inferirEscopoDeclarado('feat(server): novo endpoint');
  assert.equal(detectarForaDeEscopo(escopo, ['server', 'specs']), null);
});

test('escopo não explícito não bloqueia deterministicamente (deixa pro LLM)', () => {
  const escopo = inferirEscopoDeclarado('Ajustes na tela');
  assert.equal(detectarForaDeEscopo(escopo, ['server', 'ui']), null);
});
