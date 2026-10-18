require('dotenv').config();
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const DEV_DATABASE_FLAG = 'INTEGRATION_DB';
const DEV_DATABASE_VALUE = 'dev';
const DEV_DATABASE_HOST = 'ep-old-bird';
const TEMP_PREFIX = 'Teste integração';
const CENTS_TOLERANCE = 0.01;

if (process.env[DEV_DATABASE_FLAG] !== DEV_DATABASE_VALUE || !(process.env.DATABASE_URL ?? '').includes(DEV_DATABASE_HOST)) {
  test(`integração ignorada: defina ${DEV_DATABASE_FLAG}=${DEV_DATABASE_VALUE} com o .env no branch dev`, { skip: true }, () => {});
  return;
}

const app = require('../../src/app');
const prisma = require('../../src/db/prisma');
const { signUserToken } = require('../../src/security/tokens');
const { horizonMonth } = require('../../src/domain/series');
const { formatMonth, monthsDiff } = require('../../src/domain/months');

let server;
let baseUrl;
let token;
let categoryId;
let fixedCategoryId;

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

const isoDate = (d) => d.toISOString().slice(0, 10);
const close = (a, b) => Math.abs(a - b) < CENTS_TOLERANCE;

function transactionsOfCategory(id = categoryId) {
  return prisma.transactions.findMany({
    where: { category_id: BigInt(id) },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
}

async function createCategory(suffix, flow, expenseGroup) {
  const created = await call('POST', '/categories', { name: `${TEMP_PREFIX} ${suffix}`, flow, expenseGroup });
  return created.body.id;
}

async function removeTemporaryData() {
  const categories = await prisma.categories.findMany({ where: { name: { startsWith: TEMP_PREFIX } } });
  const categoryIds = categories.map((c) => c.id);
  const accounts = await prisma.investment_accounts.findMany({ where: { name: { startsWith: TEMP_PREFIX } } });
  const accountIds = accounts.map((a) => a.id);
  await prisma.transactions.deleteMany({
    where: {
      OR: [
        { category_id: { in: categoryIds } },
        { investment_account_id: { in: accountIds } },
        { description: { startsWith: TEMP_PREFIX } },
      ],
    },
  });
  await prisma.recurrences.deleteMany({ where: { category_id: { in: categoryIds } } });
  await prisma.investment_accounts.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.categories.deleteMany({ where: { id: { in: categoryIds } } });
}

before(async () => {
  const user = await prisma.users.findFirst({ orderBy: { id: 'asc' } });
  token = signUserToken(user.id);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await removeTemporaryData();
  categoryId = await createCategory('saída', 'expense', 'essential');
  fixedCategoryId = await createCategory('fixa', 'expense', 'nonEssential');
});

after(async () => {
  await removeTemporaryData();
  server.close();
  await prisma.$disconnect();
});

test('resumo único: totais do mês, caixa, reserva e próximo mês', async () => {
  const { status, body } = await call('GET', '/finance/summary?year=2026&month=10');
  assert.equal(status, 200);
  assert.ok(close(body.totalExpenses, body.totalEssential + body.totalNonEssential));
  assert.ok(close(body.monthBalance, body.totalIncome - body.totalExpenses - body.netInvested));
  assert.equal(body.accumulatedBalance, body.cashBalance);
  assert.equal(body.totalEmergencyReserve, body.reserve.amount);
  assert.equal(body.monthsOfReserveCovered, body.reserve.coverageMonths);

  const { nextMonth } = body;
  assert.deepEqual([nextMonth.year, nextMonth.month], [2026, 11]);
  const projected = body.cashBalance + nextMonth.committedIncome - nextMonth.committedEssential
    - nextMonth.committedNonEssential - nextMonth.committedInvestment;
  assert.ok(close(nextMonth.projectedBalance, projected));

  const investments = await call('GET', '/investments?year=2026&month=10');
  const reserveAccounts = investments.body.accounts.filter((a) => ['reserve', 'short_term_reserve'].includes(a.role));
  assert.ok(close(body.reserve.amount, reserveAccounts.reduce((acc, a) => acc + a.balance, 0)));
  assert.ok(close(body.investedPosition, investments.body.summary.positionThroughMonthEnd));
  assert.ok(close(body.reserve.coverageMonths, body.reserve.amount / body.reserve.referenceExpense));
});

test('investimentos e relatórios respondem', async () => {
  assert.equal((await call('GET', '/investments?year=2026&month=10')).status, 200);
  const report = await call('GET', '/reports/export?year=2026&month=10&period=quarter');
  assert.match(report.headers.get('content-disposition'), /transacoes-2026-T4\.csv/);
});

test('categoria: saída sem grupo e troca de tipo são rejeitadas', async () => {
  assert.equal((await call('POST', '/categories', { name: `${TEMP_PREFIX} x`, flow: 'expense' })).status, 400);
  const change = await call('PUT', `/categories/${categoryId}`, { name: `${TEMP_PREFIX} saída`, flow: 'income' });
  assert.equal(change.status, 422);
});

test('série iniciada em 31/01 tem um lançamento por mês', async () => {
  const created = await call('POST', '/recurrences', {
    categoryId, description: 'Teste', amount: 50, startDate: '2027-01-31', months: 3, installmentTotal: 3,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.series.kind, 'installment');
  const dates = (await transactionsOfCategory()).map((t) => isoDate(t.date));
  assert.deepEqual(dates, ['2027-01-31', '2027-02-28', '2027-03-31']);
});

test('editar este e os próximos encerra a série e abre outra a partir do mês', async () => {
  const [january, february] = await transactionsOfCategory();
  const updated = await call('PUT', `/transactions/${february.id}?applyToFutureSeries=true`, {
    categoryId, description: 'Parcela 2 de 3: Teste novo', amount: 99, date: '2027-02-28', schedule: 'variable',
  });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.body.recurrenceId, Number(january.recurrence_id));
  assert.equal(updated.body.seriesKind, 'installment');
  assert.equal(updated.body.seriesEndsOn, '2027-03');

  const [keptJanuary, newFebruary, newMarch] = await transactionsOfCategory();
  assert.equal(Number(keptJanuary.amount), 50);
  assert.equal(keptJanuary.recurrence_id, january.recurrence_id);
  assert.equal(newFebruary.recurrence_index, 2);
  assert.equal(newMarch.description, 'Parcela 3 de 3: Teste novo');
  assert.equal(Number(newMarch.amount), 99);

  const oldSeries = await prisma.recurrences.findUnique({ where: { id: january.recurrence_id } });
  assert.equal(isoDate(oldSeries.end_month), '2027-01-01');
  const newSeries = await prisma.recurrences.findUnique({ where: { id: newMarch.recurrence_id } });
  assert.equal(Number(newSeries.amount), 99);
});

test('validações de entrada respondem 400', async () => {
  assert.equal((await call('POST', '/transactions', { categoryId, amount: 10, date: '2027-01-10', schedule: 'fixed' })).status, 400);
  assert.equal((await call('POST', '/recurrences', { categoryId, amount: -5, startDate: '2027-01-01', months: 2 })).status, 400);
  assert.equal((await call('DELETE', '/transactions/abc')).status, 400);
  assert.equal((await call('GET', '/finance/summary?year=2026&month=13')).status, 400);
  assert.equal((await call('POST', '/transactions', { amount: 10, date: '2027-01-10' })).status, 400);
});

test('excluir este e os próximos devolve os lançamentos e desfazer (corpo antigo) recria', async () => {
  const before = await transactionsOfCategory();
  const removed = await call('DELETE', `/transactions/${before[1].id}?applyToFutureSeries=true`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.deleted.length, 2);
  assert.equal(removed.body.closedSeries.length, 1);
  assert.equal((await transactionsOfCategory()).length, 1);

  const restored = await call('POST', '/transactions/restore', { transactions: removed.body.deleted });
  assert.equal(restored.status, 201);
  const after = await transactionsOfCategory();
  assert.deepEqual(
    after.map((t) => [isoDate(t.date), t.description, t.recurrence_id, t.recurrence_index]),
    before.map((t) => [isoDate(t.date), t.description, t.recurrence_id, t.recurrence_index])
  );
});

test('desfazer com categoria de outro usuário responde 404', async () => {
  const foreign = { categoryId: 999999999, amount: 10, date: '2027-01-10', recurrenceId: null };
  assert.equal((await call('POST', '/transactions/restore', { transactions: [foreign] })).status, 404);
  assert.equal((await call('POST', '/transactions/restore', { transactions: [] })).status, 400);
});

test('excluir as séries e depois a categoria com série responde 422', async () => {
  const [january, february] = await transactionsOfCategory();
  assert.equal((await call('DELETE', `/transactions/${february.id}?applyToFutureSeries=true`)).status, 200);
  assert.equal((await call('DELETE', `/transactions/${january.id}?applyToFutureSeries=true`)).status, 200);
  assert.equal((await transactionsOfCategory()).length, 0);
  assert.equal((await call('DELETE', `/categories/${categoryId}`)).status, 422);
});

test('série fixa é gerada até o horizonte e completada ao listar o mês', async () => {
  const created = await call('POST', '/recurrences', {
    categoryId: fixedCategoryId, description: 'Assinatura', amount: 10, startDate: '2026-12-05', kind: 'fixed',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.series.endMonth, null);
  const horizon = horizonMonth(new Date());
  const expected = monthsDiff({ year: 2026, month: 12 }, horizon) + 1;
  assert.equal(created.body.createdCount, expected);

  const rows = await transactionsOfCategory(fixedCategoryId);
  const [lastRow, previousRow] = [rows.at(-1), rows.at(-2)];
  await prisma.transactions.deleteMany({ where: { id: { in: [lastRow.id, previousRow.id] } } });
  await prisma.recurrences.update({
    where: { id: lastRow.recurrence_id },
    data: { materialized_until: new Date(Date.UTC(previousRow.date.getUTCFullYear(), previousRow.date.getUTCMonth() - 1, 1)) },
  });

  const listed = await call('GET', '/transactions?year=2026&month=12');
  const december = listed.body.find((t) => t.recurrenceId === created.body.recurrenceId);
  assert.equal(december.seriesKind, 'fixed');
  assert.equal(december.seriesEndsOn, null);
  await call('GET', '/transactions?year=2026&month=12');
  const toppedUp = await transactionsOfCategory(fixedCategoryId);
  assert.equal(toppedUp.length, expected);
  assert.equal(formatMonth({ year: toppedUp.at(-1).date.getUTCFullYear(), month: toppedUp.at(-1).date.getUTCMonth() + 1 }), formatMonth(horizon));
});

test('excluir este e os próximos numa fixa encerra a série e desfazer reabre', async () => {
  const rows = await transactionsOfCategory(fixedCategoryId);
  const march = rows.find((t) => isoDate(t.date) === '2027-03-05');
  const removed = await call('DELETE', `/transactions/${march.id}?applyToFutureSeries=true`);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.closedSeries, [{ recurrenceId: Number(march.recurrence_id), previousEndMonth: null }]);
  const closed = await prisma.recurrences.findUnique({ where: { id: march.recurrence_id } });
  assert.equal(isoDate(closed.end_month), '2027-02-01');

  await call('GET', '/transactions?year=2027&month=3');
  assert.equal((await transactionsOfCategory(fixedCategoryId)).length, rows.length - removed.body.deleted.length);
  const february = (await call('GET', '/transactions?year=2027&month=2')).body.find((t) => t.recurrenceId === Number(march.recurrence_id));
  assert.equal(february.seriesEndsOn, '2027-02');

  const reopenSeries = removed.body.closedSeries.map(({ recurrenceId, previousEndMonth }) => ({ recurrenceId, endMonth: previousEndMonth }));
  const restored = await call('POST', '/transactions/restore', { transactions: removed.body.deleted, reopenSeries });
  assert.equal(restored.status, 201);
  const reopened = await prisma.recurrences.findUnique({ where: { id: march.recurrence_id } });
  assert.equal(reopened.end_month, null);
  const after = await transactionsOfCategory(fixedCategoryId);
  assert.deepEqual(after.map((t) => t.recurrence_index), rows.map((t) => t.recurrence_index));
});

test('editar este e os próximos numa fixa abre nova série com o novo valor', async () => {
  const rows = await transactionsOfCategory(fixedCategoryId);
  const january = rows.find((t) => isoDate(t.date) === '2027-01-05');
  const updated = await call('PUT', `/transactions/${january.id}?applyToFutureSeries=true`, {
    categoryId: fixedCategoryId, description: 'Assinatura reajustada', amount: 20, date: '2027-01-05',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.recurrenceIndex, 1);

  const after = await transactionsOfCategory(fixedCategoryId);
  const december = after.find((t) => isoDate(t.date) === '2026-12-05');
  assert.equal(Number(december.amount), 10);
  assert.equal(december.recurrence_id, january.recurrence_id);
  const fromJanuary = after.filter((t) => t.date >= january.date);
  assert.ok(fromJanuary.every((t) => Number(t.amount) === 20 && Number(t.recurrence_id) === updated.body.recurrenceId));
  assert.equal(after.length, rows.length);
});

test('compra parcelada pelo valor total divide com o resto na primeira parcela', async () => {
  const created = await call('POST', '/recurrences', {
    categoryId: fixedCategoryId, description: 'Geladeira', totalAmount: 100, installments: 3, startDate: '2027-01-10', kind: 'installment',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.series.endMonth, '2027-03');
  const rows = await prisma.transactions.findMany({
    where: { recurrence_id: BigInt(created.body.recurrenceId) },
    orderBy: { date: 'asc' },
  });
  assert.deepEqual(rows.map((t) => Number(t.amount)), [33.34, 33.33, 33.33]);
  assert.equal(rows[0].description, 'Parcela 1 de 3: Geladeira');
});

test('conta de investimento: CRUD, aporte, pegar emprestado e rendimento pela atualização de saldo', async () => {
  const name = `${TEMP_PREFIX} curto prazo`;
  const created = await call('POST', '/investment-accounts', {
    name, role: 'short_term_reserve', initialBalance: 1000, initialBalanceDate: '2026-01-01', targetBalance: 2000,
  });
  assert.equal(created.status, 201);
  const accountId = created.body.id;
  assert.equal((await call('POST', '/investment-accounts', { name })).status, 409);
  assert.equal((await call('POST', '/investment-accounts', { name: `${TEMP_PREFIX} y`, targetBalance: 10 })).status, 400);

  const contribution = await call('POST', '/transactions', {
    investmentAccountId: accountId, direction: 'contribution', amount: 500, date: '2026-02-10',
  });
  assert.equal(contribution.status, 201);
  assert.equal(contribution.body.direction, 'contribution');
  assert.equal(contribution.body.flow, 'investment');
  const borrow = await call('POST', '/transactions', {
    investmentAccountId: accountId, direction: 'withdrawal', amount: 200, date: '2026-03-05',
  });
  assert.equal(borrow.status, 201);
  assert.equal((await call('POST', '/transactions', { investmentAccountId: accountId, direction: 'withdrawal', amount: -5, date: '2026-03-05' })).status, 400);

  const update = await call('POST', `/investment-accounts/${accountId}/balance-updates`, { date: '2026-03-31', balance: 1400 });
  assert.equal(update.status, 201);
  assert.equal(update.body.yield, 100);
  assert.equal((await call('GET', `/investment-accounts/${accountId}/balance-updates`)).body.length, 1);
  const listed = (await call('GET', '/investment-accounts')).body.find((a) => a.id === accountId);
  assert.equal(listed.balance, 1400);
  assert.equal(listed.lastBalanceUpdate.date, '2026-03-31');

  const march = await call('GET', '/investments?year=2026&month=3');
  const account = march.body.accounts.find((a) => a.id === accountId);
  assert.equal(account.balance, 1400);
  assert.equal(account.yield, 100);
  assert.equal(account.missingToTarget, 600);
  assert.equal(account.monthWithdrawals, 200);

  const summary = await call('GET', '/finance/summary?year=2026&month=3');
  assert.equal(summary.body.reserve.shortTermBalance, 1400);
  assert.equal(summary.body.reserve.shortTermTarget, 2000);
  assert.equal(summary.body.reserve.shortTermMissing, 600);

  const renamed = await call('PUT', `/investment-accounts/${accountId}`, { name: `${name} 2` });
  assert.equal(renamed.body.role, 'short_term_reserve');
  assert.equal(renamed.body.targetBalance, 2000);

  assert.equal((await call('DELETE', `/investment-accounts/${accountId}`)).status, 422);
  await call('DELETE', `/transactions/${contribution.body.id}`);
  await call('DELETE', `/transactions/${borrow.body.id}`);
  assert.equal((await call('DELETE', `/investment-accounts/${accountId}`)).status, 204);
});

test('compatibilidade: aporte negativo pela categoria de investimento vira resgate da conta', async () => {
  const legacy = await prisma.investment_accounts.findFirst({ where: { legacy_category_id: { not: null } } });
  const created = await call('POST', '/transactions', {
    categoryId: Number(legacy.legacy_category_id), amount: -50, date: '2026-02-15', schedule: 'variable', description: `${TEMP_PREFIX} legado`,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.investmentAccountId, Number(legacy.id));
  assert.equal(created.body.direction, 'withdrawal');
  assert.equal(created.body.amount, 50);

  const removed = await call('DELETE', `/transactions/${created.body.id}`);
  const restored = await call('POST', '/transactions/restore', { transactions: removed.body.deleted });
  assert.equal(restored.body.restored[0].direction, 'withdrawal');
  await call('DELETE', `/transactions/${restored.body.restored[0].id}`);
});
