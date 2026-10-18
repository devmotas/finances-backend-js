require('dotenv').config();
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const DEV_DATABASE_FLAG = 'INTEGRATION_DB';
const DEV_DATABASE_VALUE = 'dev';
const TEMP_CATEGORY_PREFIX = 'Teste integração';

if (process.env[DEV_DATABASE_FLAG] !== DEV_DATABASE_VALUE) {
  test(`integração ignorada: defina ${DEV_DATABASE_FLAG}=${DEV_DATABASE_VALUE} com o .env no branch dev`, { skip: true }, () => {});
  return;
}

const app = require('../../src/app');
const prisma = require('../../src/db/prisma');
const { signUserToken } = require('../../src/security/tokens');

let server;
let baseUrl;
let token;
let categoryId;

async function call(method, url, payload) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  const body = isJson ? await response.json() : await response.text();
  return { status: response.status, body, headers: response.headers };
}

function transactionsOfCategory() {
  return prisma.transactions.findMany({
    where: { category_id: BigInt(categoryId) },
    orderBy: { date: 'asc' },
  });
}

async function removeTemporaryData() {
  const temporary = await prisma.categories.findMany({ where: { name: { startsWith: TEMP_CATEGORY_PREFIX } } });
  const ids = temporary.map((c) => c.id);
  await prisma.transactions.deleteMany({ where: { category_id: { in: ids } } });
  await prisma.recurrences.deleteMany({ where: { category_id: { in: ids } } });
  await prisma.categories.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  const user = await prisma.users.findFirst();
  token = signUserToken(user.id);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await removeTemporaryData();
  const created = await call('POST', '/categories', {
    name: `${TEMP_CATEGORY_PREFIX} saída`,
    flow: 'expense',
    expenseGroup: 'essential',
  });
  categoryId = created.body.id;
});

after(async () => {
  await removeTemporaryData();
  server.close();
  await prisma.$disconnect();
});

test('resumo: caixa + investido = reserva', async () => {
  const { status, body } = await call('GET', '/finance/summary?year=2026&month=10');
  assert.equal(status, 200);
  assert.ok(Math.abs(body.accumulatedBalance + body.investedPosition - body.totalEmergencyReserve) < 0.01);
});

test('investimentos e relatórios respondem', async () => {
  assert.equal((await call('GET', '/investments?year=2026&month=10')).status, 200);
  const report = await call('GET', '/reports/export?year=2026&month=10&period=quarter');
  assert.match(report.headers.get('content-disposition'), /transacoes-2026-T4\.csv/);
});

test('categoria: saída sem grupo e troca de tipo são rejeitadas', async () => {
  assert.equal((await call('POST', '/categories', { name: `${TEMP_CATEGORY_PREFIX} x`, flow: 'expense' })).status, 400);
  const change = await call('PUT', `/categories/${categoryId}`, { name: `${TEMP_CATEGORY_PREFIX} saída`, flow: 'income' });
  assert.equal(change.status, 422);
});

test('série iniciada em 31/01 tem um lançamento por mês', async () => {
  const created = await call('POST', '/recurrences', {
    categoryId, description: 'Teste', amount: 50, startDate: '2027-01-31', months: 3, installmentTotal: 3,
  });
  assert.equal(created.status, 201);
  const dates = (await transactionsOfCategory()).map((t) => t.date.toISOString().slice(0, 10));
  assert.deepEqual(dates, ['2027-01-31', '2027-02-28', '2027-03-31']);
});

test('editar este e os próximos atualiza a série e preserva o rótulo de parcela', async () => {
  const [, february] = await transactionsOfCategory();
  const updated = await call('PUT', `/transactions/${february.id}?applyToFutureSeries=true`, {
    categoryId, description: 'Parcela 2 de 3: Teste novo', amount: 99, date: '2027-02-28', schedule: 'variable',
  });
  assert.equal(updated.status, 200);
  const [january, , march] = await transactionsOfCategory();
  assert.equal(Number(january.amount), 50);
  assert.equal(march.description, 'Parcela 3 de 3: Teste novo');
  assert.equal(march.schedule, 'fixed');
  const recurrence = await prisma.recurrences.findUnique({ where: { id: march.recurrence_id } });
  assert.equal(Number(recurrence.amount), 99);
});

test('validações de entrada respondem 400', async () => {
  assert.equal((await call('POST', '/transactions', { categoryId, amount: 10, date: '2027-01-10', schedule: 'fixed' })).status, 400);
  assert.equal((await call('POST', '/recurrences', { categoryId, amount: -5, startDate: '2027-01-01', months: 2 })).status, 400);
  assert.equal((await call('DELETE', '/transactions/abc')).status, 400);
  assert.equal((await call('GET', '/finance/summary?year=2026&month=13')).status, 400);
});

test('excluir este e os próximos devolve os lançamentos e desfazer recria a série', async () => {
  const before = await transactionsOfCategory();
  const removed = await call('DELETE', `/transactions/${before[0].id}?applyToFutureSeries=true`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.deleted.length, before.length);
  assert.equal((await transactionsOfCategory()).length, 0);

  const restored = await call('POST', '/transactions/restore', { transactions: removed.body.deleted });
  assert.equal(restored.status, 201);
  const after = await transactionsOfCategory();
  assert.deepEqual(
    after.map((t) => [t.date.toISOString().slice(0, 10), t.description, t.recurrence_id, t.recurrence_index]),
    before.map((t) => [t.date.toISOString().slice(0, 10), t.description, t.recurrence_id, t.recurrence_index])
  );
});

test('desfazer com categoria de outro usuário responde 404', async () => {
  const foreign = { categoryId: 999999999, amount: 10, date: '2027-01-10', recurrenceId: null };
  assert.equal((await call('POST', '/transactions/restore', { transactions: [foreign] })).status, 404);
  assert.equal((await call('POST', '/transactions/restore', { transactions: [] })).status, 400);
});

test('excluir a série e depois a categoria com série responde 422', async () => {
  const [first] = await transactionsOfCategory();
  assert.equal((await call('DELETE', `/transactions/${first.id}?applyToFutureSeries=true`)).status, 200);
  assert.equal((await transactionsOfCategory()).length, 0);
  assert.equal((await call('DELETE', `/categories/${categoryId}`)).status, 422);
});
