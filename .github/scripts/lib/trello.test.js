const { test } = require('node:test');
const assert = require('node:assert');
const { acharShortlink } = require('./trello');

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
