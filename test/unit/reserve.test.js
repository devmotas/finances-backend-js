const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Decimal } = require('@prisma/client/runtime/library');
const { referenceWindow, referenceExpense, coverageMonths } = require('../../src/domain/reserve');

const month = (essential, hasActivity = true) => ({ essential: new Decimal(essential), hasActivity });

test('janela são os seis meses fechados antes do mês selecionado', () => {
  assert.deepEqual(referenceWindow({ year: 2026, month: 3 }), {
    from: { year: 2025, month: 9 },
    to: { year: 2026, month: 2 },
  });
});

test('média das essenciais só dos meses com lançamentos', () => {
  const months = [month(0, false), month(0, false), month(1000), month(1200), month(800), month(1000)];
  assert.equal(referenceExpense(months).toNumber(), 1000);
  assert.equal(referenceExpense([month(0, false)]), null);
});

test('cobertura = reserva ÷ despesa de referência, nula sem referência', () => {
  assert.equal(coverageMonths(new Decimal(6000), new Decimal(1000)), 6);
  assert.equal(coverageMonths(new Decimal(1000), new Decimal(3000)), 0.33);
  assert.equal(coverageMonths(new Decimal(1000), null), null);
});
