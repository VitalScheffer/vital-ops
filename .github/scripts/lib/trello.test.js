const { test } = require('node:test');
const assert = require('node:assert');
const { acharShortlink, normalizarNome } = require('./trello');

test('extrai shortlink de URL de card no corpo do PR', () => {
  assert.equal(acharShortlink('Card: https://trello.com/c/AbCd1234/45-titulo'), 'AbCd1234');
});

test('extrai shortlink mesmo sem path depois do id', () => {
  assert.equal(acharShortlink('veja https://trello.com/c/XyZ9'), 'XyZ9');
});

test('sem link de card retorna null', () => {
  assert.equal(acharShortlink('PR sem card vinculado'), null);
  assert.equal(acharShortlink(''), null);
  assert.equal(acharShortlink(undefined), null);
});

test('nome de pessoa e comparado sem acento e sem caixa', () => {
  assert.equal(normalizarNome('  Hiro   Terato '), 'hiro terato');
  assert.equal(normalizarNome('João Vítor'), 'joao vitor');
  assert.equal(normalizarNome(undefined), '');
});

test('de-para do Trello aceita nome completo com espaco', () => {
  const mapa = JSON.parse(
    require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', 'trello-members.json'),
      'utf8'
    )
  );
  // o Hiro abriu PR com dois logins diferentes: os dois precisam estar no mapa
  assert.equal(mapa.HiroTeratoDevVitalscheffer, 'Hiro Terato');
  assert.equal(mapa.HiroTeratovitalscheffer, 'Hiro Terato');
});

test('nenhuma chave do de-para esta duplicada ignorando caixa', () => {
  const mapa = JSON.parse(
    require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', 'trello-members.json'),
      'utf8'
    )
  );
  const vistos = new Set();
  for (const login of Object.keys(mapa)) {
    if (login.startsWith('_')) continue;
    const chave = login.toLowerCase();
    assert.ok(!vistos.has(chave), `login duplicado no de-para: ${login}`);
    vistos.add(chave);
  }
});
