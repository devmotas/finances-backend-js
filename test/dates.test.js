const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addMonthsToDate } = require('../src/utils/dates');

function series(start, months) {
  return Array.from({ length: months }, (_, i) => addMonthsToDate(start, i).toISOString().slice(0, 10));
}

test('série iniciada no dia 31 cai no último dia dos meses mais curtos', () => {
  assert.deepEqual(series('2026-01-31', 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('série iniciada em 29/02 de ano bissexto mantém um lançamento por mês', () => {
  assert.deepEqual(series('2028-02-29', 3), ['2028-02-29', '2028-03-29', '2028-04-29']);
});

test('série iniciada no dia 30 passa por fevereiro e volta ao dia 30', () => {
  assert.deepEqual(series('2026-12-30', 3), ['2026-12-30', '2027-01-30', '2027-02-28']);
});

test('dia até 28 não muda', () => {
  assert.deepEqual(series('2026-11-15', 3), ['2026-11-15', '2026-12-15', '2027-01-15']);
});
