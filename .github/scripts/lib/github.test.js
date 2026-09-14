const { test } = require('node:test');
const assert = require('node:assert');

const { REVIEW } = require('./github');

test('atenção é uma aprovação formal e mantém o alerta não bloqueante', () => {
  assert.deepEqual(REVIEW.ATENCAO, { evento: 'APPROVE', estado: 'APPROVED' });
  assert.deepEqual(REVIEW.BLOQUEAR, { evento: 'REQUEST_CHANGES', estado: 'CHANGES_REQUESTED' });
});
