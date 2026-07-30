const { test } = require('node:test');
const assert = require('node:assert');
const { classificarArquivo, mapearAreas, inferirEscopoDeclarado, detectarForaDeEscopo } = require('./scope');

test('classifica arquivos por área', () => {
  assert.equal(classificarArquivo('frontend/components/x.tsx'), 'frontend');
  assert.equal(classificarArquivo('apps/leads/views.py'), 'backend');
  assert.equal(classificarArquivo('apps/leads/migrations/0007_x.py'), 'migration');
  assert.equal(classificarArquivo('.github/workflows/backend.yml'), 'ci/infra');
  assert.equal(classificarArquivo('openspec/specs/leads/spec.md'), 'specs');
  assert.equal(classificarArquivo('config/settings.py'), 'backend');
});

test('mapeia áreas únicas ordenadas', () => {
  const { areas } = mapearAreas(['frontend/a.tsx', 'apps/x.py', 'frontend/b.tsx']);
  assert.deepEqual(areas, ['backend', 'frontend']);
});

test('infere escopo explícito de conventional commit', () => {
  const e = inferirEscopoDeclarado('feat(frontend): nova tela de leads');
  assert.deepEqual(e.areas, ['frontend']);
  assert.equal(e.explicito, true);
});

test('infere escopo por palavra-chave (não explícito)', () => {
  const e = inferirEscopoDeclarado('Ajustes na tela e no CSS do chat');
  assert.deepEqual(e.areas, ['frontend']);
  assert.equal(e.explicito, false);
});

test('fora de escopo: tarefa front explícita que mexe no backend vira PERIGO', () => {
  const escopo = inferirEscopoDeclarado('feat(frontend): troca de ícones');
  const achado = detectarForaDeEscopo(escopo, ['backend', 'frontend']);
  assert.ok(achado);
  assert.equal(achado.severidade, 'PERIGO');
  assert.equal(achado.categoria, 'Escopo');
});

test('dentro do escopo: front explícita só no front não acusa', () => {
  const escopo = inferirEscopoDeclarado('feat(frontend): troca de ícones');
  assert.equal(detectarForaDeEscopo(escopo, ['frontend']), null);
});

test('specs junto não conta como fora de escopo', () => {
  const escopo = inferirEscopoDeclarado('feat(backend): novo endpoint');
  assert.equal(detectarForaDeEscopo(escopo, ['backend', 'specs']), null);
});

test('escopo não explícito não bloqueia deterministicamente (deixa pro LLM)', () => {
  const escopo = inferirEscopoDeclarado('Ajustes na tela');
  assert.equal(detectarForaDeEscopo(escopo, ['backend', 'frontend']), null);
});
