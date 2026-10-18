const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveRange, reportFileBaseName, REPORT_PERIOD } = require('../../src/reports/period');
const { buildCsv } = require('../../src/reports/csv');
const { buildPdf } = require('../../src/reports/pdf');

const iso = (d) => d.toISOString().slice(0, 10);

const transactions = [
  { date: new Date('2026-10-05'), flow: 'income', recurrence_id: 1n, amount: '5000.5', description: 'Salário', categories: { name: 'Trabalho' } },
  { date: new Date('2026-10-10'), flow: 'expense', recurrence_id: null, amount: '120', description: 'Mercado; semana', categories: { name: 'Casa' } },
  { date: new Date('2026-10-12'), flow: 'investment', recurrence_id: null, direction: 'withdrawal', amount: '300', description: null, categories: null, investment_accounts: { name: 'Dólar' } },
];

test('trimestre e ano cobrem o intervalo certo', () => {
  const quarter = resolveRange(2026, 11, REPORT_PERIOD.QUARTER);
  assert.deepEqual([iso(quarter.from), iso(quarter.to)], ['2026-10-01', '2026-12-31']);
  const year = resolveRange(2026, 5, REPORT_PERIOD.YEAR);
  assert.deepEqual([iso(year.from), iso(year.to)], ['2026-01-01', '2026-12-31']);
});

test('nome do arquivo acompanha o período', () => {
  assert.equal(reportFileBaseName(2026, 3, REPORT_PERIOD.MONTH), 'transacoes-2026-03');
  assert.equal(reportFileBaseName(2026, 11, REPORT_PERIOD.QUARTER), 'transacoes-2026-T4');
  assert.equal(reportFileBaseName(2026, 11, REPORT_PERIOD.YEAR), 'transacoes-2026');
});

test('CSV em pt-BR com vírgula decimal, aspas quando preciso e totais', () => {
  const csv = buildCsv(transactions).toString('utf8');
  assert.match(csv, /05\/10\/2026;Entrada;Trabalho;5000,50;Salário;Fixo/);
  assert.match(csv, /10\/10\/2026;Saída;Casa;120,00;"Mercado; semana";Do mês/);
  assert.match(csv, /Total entrada;5000,50/);
  assert.match(csv, /Total saída;120,00/);
  assert.match(csv, /12\/10\/2026;Investimento;Dólar;-300,00/);
  assert.match(csv, /Total investimento;-300,00/);
});

test('PDF é gerado', async () => {
  const pdf = await buildPdf(transactions, '01/10/2026 a 31/10/2026');
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});
