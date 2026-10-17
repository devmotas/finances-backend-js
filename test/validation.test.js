const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ZodError } = require('zod');
const { parseId, parseYearMonth } = require('../src/validation/common');
const { validateAmount } = require('../src/domain/amount');

test('id não numérico vira erro de validação (400), não 500', () => {
  assert.throws(() => parseId({ id: 'abc' }), ZodError);
  assert.equal(parseId({ id: '42' }), 42n);
});

test('mês fora de 1–12 é rejeitado', () => {
  assert.throws(() => parseYearMonth({ year: '2026', month: '13' }), ZodError);
  assert.throws(() => parseYearMonth({ year: '2026' }), ZodError);
  assert.deepEqual(parseYearMonth({ year: '2026', month: '10' }), { year: 2026, month: 10 });
});

test('valor negativo só é aceito em investimento', () => {
  assert.throws(() => validateAmount(-10, 'expense'), /negativo/);
  assert.throws(() => validateAmount(0, 'income'), /diferente de zero/);
  assert.doesNotThrow(() => validateAmount(-10, 'investment'));
});
