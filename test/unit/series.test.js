const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  horizonMonth,
  pendingOccurrences,
  splitInstallments,
  normalizeSeriesRequest,
  closingMonthBefore,
  endMonthAfterClosing,
  installmentEndMonth,
} = require('../../src/domain/series');

const TODAY = new Date('2026-10-18T12:00:00Z');
const iso = (occurrences) => occurrences.map((o) => o.date.toISOString().slice(0, 10));

function fixedSeries(overrides = {}) {
  return {
    kind: 'fixed',
    startDate: '2026-04-02',
    firstIndex: 1,
    installmentTotal: null,
    endMonth: null,
    materializedUntil: { year: 2027, month: 3 },
    ...overrides,
  };
}

test('horizonte fica 12 meses à frente do mês do calendário', () => {
  assert.deepEqual(horizonMonth(TODAY), { year: 2027, month: 10 });
});

test('série fixa sem fim é completada do mês seguinte ao último gerado até o horizonte', () => {
  const occurrences = pendingOccurrences(fixedSeries(), TODAY);
  assert.deepEqual(occurrences.map((o) => o.index), [13, 14, 15, 16, 17, 18, 19]);
  assert.equal(iso(occurrences)[0], '2027-04-02');
  assert.equal(iso(occurrences).at(-1), '2027-10-02');
});

test('completar de novo não gera nada (idempotente)', () => {
  assert.deepEqual(pendingOccurrences(fixedSeries({ materializedUntil: { year: 2027, month: 10 } }), TODAY), []);
});

test('série encerrada para no mês de fim', () => {
  const occurrences = pendingOccurrences(fixedSeries({ endMonth: { year: 2027, month: 5 } }), TODAY);
  assert.deepEqual(iso(occurrences), ['2027-04-02', '2027-05-02']);
});

test('série que começa depois do horizonte gera ao menos o primeiro mês', () => {
  const series = fixedSeries({ startDate: '2028-03-31', materializedUntil: { year: 2028, month: 2 } });
  assert.deepEqual(iso(pendingOccurrences(series, TODAY)), ['2028-03-31']);
});

test('parcelada gera todas as parcelas, mesmo além do horizonte, a partir do índice inicial', () => {
  const series = {
    kind: 'installment',
    startDate: '2027-02-28',
    firstIndex: 2,
    installmentTotal: 24,
    endMonth: installmentEndMonth('2027-02-28', 2, 24),
    materializedUntil: { year: 2027, month: 1 },
  };
  const occurrences = pendingOccurrences(series, TODAY);
  assert.equal(occurrences.length, 23);
  assert.equal(occurrences[0].index, 2);
  assert.equal(iso(occurrences).at(-1), '2028-12-28');
});

test('valor total dividido igualmente, centavos que sobram na primeira parcela', () => {
  assert.deepEqual(splitInstallments(100, 3), [33.34, 33.33, 33.33]);
  assert.deepEqual(splitInstallments(1200, 12), Array(12).fill(100));
  assert.throws(() => splitInstallments(0.02, 3), /pequeno demais/);
});

test('corpo antigo: installmentTotal vira parcelada, sem ele vira fixa sem fim', () => {
  assert.equal(normalizeSeriesRequest({ amount: 50, months: 3, installmentTotal: 3 }).kind, 'installment');
  const fixed = normalizeSeriesRequest({ amount: 50, months: 12 });
  assert.equal(fixed.kind, 'fixed');
  assert.equal(fixed.installmentTotal, null);
});

test('parcelada pelo valor total usa a parcela regular como valor da série', () => {
  const request = normalizeSeriesRequest({ kind: 'installment', totalAmount: 100, installments: 3 });
  assert.equal(request.amount, 33.33);
  assert.deepEqual(request.installmentAmounts, [33.34, 33.33, 33.33]);
  assert.throws(() => normalizeSeriesRequest({ kind: 'installment', amount: 10 }), /parcelas/);
});

test('encerrar a partir de um mês fecha no mês anterior sem adiar um fim que já vem antes', () => {
  const closing = closingMonthBefore(new Date('2026-11-02'));
  assert.deepEqual(closing, { year: 2026, month: 10 });
  assert.deepEqual(endMonthAfterClosing(null, closing), closing);
  assert.deepEqual(endMonthAfterClosing({ year: 2026, month: 8 }, closing), { year: 2026, month: 8 });
  assert.deepEqual(endMonthAfterClosing({ year: 2027, month: 3 }, closing), closing);
});
