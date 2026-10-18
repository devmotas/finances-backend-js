const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Decimal } = require('@prisma/client/runtime/library');
const { netCash } = require('../../src/domain/balances');

const d = (n) => new Decimal(n);

test('saldo em caixa: entradas menos saídas menos aportes mais resgates', () => {
  const cash = netCash({ income: d(5000), expenses: d(3000), contributions: d(500), withdrawals: d(200) });
  assert.equal(cash.toNumber(), 1700);
});

test('sem movimentos o caixa é zero, mesmo com saldo inicial de investimento', () => {
  const cash = netCash({ income: d(0), expenses: d(0), contributions: d(0), withdrawals: d(0) });
  assert.equal(cash.toNumber(), 0);
});
