const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Decimal } = require('@prisma/client/runtime/library');
const { computeBalances } = require('../src/domain/balances');

const d = (n) => new Decimal(n);

test('só saldo inicial de investimento: caixa zero, tudo investido', () => {
  const r = computeBalances({ opening: d(10000), income: d(0), expense: d(0), investment: d(0) });
  assert.equal(r.cashBalance.toNumber(), 0);
  assert.equal(r.investedPosition.toNumber(), 10000);
  assert.equal(r.totalReserve.toNumber(), 10000);
});

test('aporte sai do caixa e entra no investido', () => {
  const r = computeBalances({ opening: d(1000), income: d(5000), expense: d(3000), investment: d(500) });
  assert.equal(r.cashBalance.toNumber(), 1500);
  assert.equal(r.investedPosition.toNumber(), 1500);
  assert.equal(r.totalReserve.toNumber(), 3000);
});

test('resgate (aporte negativo) volta para o caixa', () => {
  const r = computeBalances({ opening: d(2000), income: d(0), expense: d(0), investment: d(-300) });
  assert.equal(r.cashBalance.toNumber(), 300);
  assert.equal(r.investedPosition.toNumber(), 1700);
  assert.equal(r.totalReserve.toNumber(), 2000);
});
