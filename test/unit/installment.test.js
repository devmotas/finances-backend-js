const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seriesDescription } = require('../../src/domain/installment');

test('série comum mantém a descrição ou vira nula', () => {
  assert.equal(seriesDescription('  Aluguel ', 3, null), 'Aluguel');
  assert.equal(seriesDescription('', 3, null), null);
});

test('parcelamento prefixa a parcela', () => {
  assert.equal(seriesDescription('Notebook', 2, 10), 'Parcela 2 de 10: Notebook');
  assert.equal(seriesDescription(null, 2, 10), 'Parcela 2 de 10');
});

test('prefixo vindo da edição de uma parcela não duplica', () => {
  assert.equal(seriesDescription('Parcela 3 de 10: Notebook novo', 5, 10), 'Parcela 5 de 10: Notebook novo');
  assert.equal(seriesDescription('Parcela 3 de 10', 5, 10), 'Parcela 5 de 10');
});
