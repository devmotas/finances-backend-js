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
  await prisma.recurrences.deleteMany({
    where: { OR: [{ category_id: { in: categoryIds } }, { destination_account_id: { in: accountIds } }] },
  });
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
    - nextMonth.committedNonEssential - nextMonth.committedInvestment - nextMonth.expectedWalletSpending;
  assert.ok(close(nextMonth.projectedBalance, projected));
  assert.ok(close(body.cashBalance, body.ledgerBalance + body.walletBalance));

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

function seriesRows(recurrenceId) {
  return prisma.transactions.findMany({
    where: { recurrence_id: BigInt(recurrenceId) },
    orderBy: [{ date: 'asc' }, { flow: 'asc' }],
  });
}

const pairOf = (rows, date) => rows.filter((t) => isoDate(t.date) === date);

test('entrada fixa com destino: cada mês gera a entrada e o aporte na conta, sem mexer no caixa', async () => {
  const account = await call('POST', '/investment-accounts', { name: `${TEMP_PREFIX} destino`, initialBalanceDate: '2026-01-01' });
  const accountId = account.body.id;
  const incomeCategoryId = await createCategory('PTR', 'income');
  const before = (await call('GET', '/finance/summary?year=2026&month=11')).body;

  const series = { categoryId: incomeCategoryId, description: 'PTR da Vale', amount: 810.5, startDate: '2026-11-07', kind: 'fixed' };
  assert.equal((await call('POST', '/recurrences', { ...series, categoryId: fixedCategoryId, destinationAccountId: accountId })).status, 400);
  assert.equal((await call('POST', '/recurrences', { ...series, kind: 'installment', installments: 2, destinationAccountId: accountId })).status, 400);
  assert.equal((await call('POST', '/recurrences', { ...series, destinationAccountId: 999999999 })).status, 404);

  const created = await call('POST', '/recurrences', { ...series, destinationAccountId: accountId });
  assert.equal(created.status, 201);
  assert.equal(created.body.series.destinationAccountId, accountId);
  const { recurrenceId } = created.body;
  const rows = await seriesRows(recurrenceId);
  assert.equal(rows.length, created.body.createdCount * 2);
  const [november, novemberContribution] = pairOf(rows, '2026-11-07');
  assert.equal(november.flow, 'income');
  assert.equal(Number(novemberContribution.investment_account_id), accountId);
  assert.equal(novemberContribution.direction, 'contribution');
  assert.equal(Number(novemberContribution.amount), 810.5);
  assert.equal(novemberContribution.recurrence_index, november.recurrence_index);

  const listed = (await call('GET', '/transactions?year=2026&month=11')).body.filter((t) => t.recurrenceId === recurrenceId);
  assert.deepEqual(listed.map((t) => [t.flow, t.destinationAccountId]), [['income', accountId], ['investment', null]]);

  const after = (await call('GET', '/finance/summary?year=2026&month=11')).body;
  assert.ok(close(after.totalIncome - before.totalIncome, 810.5));
  assert.ok(close(after.totalContributions - before.totalContributions, 810.5));
  assert.ok(close(after.monthBalance, before.monthBalance));
  assert.ok(close(after.cashBalance, before.cashBalance));
  const investedAccount = (await call('GET', '/investments?year=2026&month=11')).body.accounts.find((a) => a.id === accountId);
  assert.equal(investedAccount.monthContributions, 810.5);

  const lastPair = rows.slice(-2);
  await prisma.transactions.deleteMany({ where: { id: { in: lastPair.map((t) => t.id) } } });
  const lastDate = lastPair[0].date;
  await prisma.recurrences.update({
    where: { id: BigInt(recurrenceId) },
    data: { materialized_until: new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() - 1, 1)) },
  });
  await call('GET', '/transactions?year=2026&month=11');
  await call('GET', '/transactions?year=2026&month=11');
  assert.equal((await seriesRows(recurrenceId)).length, rows.length);

  const removed = await call('DELETE', `/transactions/${novemberContribution.id}`);
  assert.deepEqual(removed.body.deleted.map((t) => t.flow).sort(), ['income', 'investment']);
  assert.equal(pairOf(await seriesRows(recurrenceId), '2026-11-07').length, 0);
  assert.equal((await call('POST', '/transactions/restore', { transactions: removed.body.deleted })).status, 201);
  const [restoredIncome, restoredContribution] = pairOf(await seriesRows(recurrenceId), '2026-11-07');
  assert.equal(restoredContribution.direction, 'contribution');

  const edited = await call('PUT', `/transactions/${restoredIncome.id}`, { categoryId: incomeCategoryId, amount: 900, date: '2026-11-07', description: 'PTR da Vale' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.destinationAccountId, accountId);
  assert.deepEqual(pairOf(await seriesRows(recurrenceId), '2026-11-07').map((t) => Number(t.amount)), [900, 900]);
  assert.equal((await call('PUT', `/transactions/${restoredIncome.id}`, { investmentAccountId: accountId, direction: 'contribution', amount: 10, date: '2026-11-07' })).status, 400);
  assert.equal((await call('PUT', `/transactions/${restoredContribution.id}`, { investmentAccountId: accountId, direction: 'withdrawal', amount: 10, date: '2026-11-07' })).status, 400);

  const january = pairOf(await seriesRows(recurrenceId), '2027-01-07').find((t) => t.flow === 'investment');
  const replaced = await call('PUT', `/transactions/${january.id}?applyToFutureSeries=true`, {
    investmentAccountId: accountId, direction: 'contribution', amount: 1000, date: '2027-01-07', description: 'PTR da Vale',
  });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.flow, 'investment');
  const newSeries = await prisma.recurrences.findUnique({ where: { id: BigInt(replaced.body.recurrenceId) } });
  assert.equal(Number(newSeries.destination_account_id), accountId);
  const newRows = await seriesRows(replaced.body.recurrenceId);
  assert.ok(newRows.every((t) => Number(t.amount) === 1000));
  assert.deepEqual(pairOf(newRows, '2027-01-07').map((t) => t.flow), ['income', 'investment']);
  assert.equal(pairOf(await seriesRows(recurrenceId), '2026-12-07').length, 2);
  assert.equal(pairOf(await seriesRows(recurrenceId), '2027-01-07').length, 0);

  assert.equal((await call('DELETE', `/investment-accounts/${accountId}`)).status, 422);

  const firstOfNewSeries = newRows.find((t) => t.flow === 'income');
  const closed = await call('DELETE', `/transactions/${firstOfNewSeries.id}?applyToFutureSeries=true`);
  assert.equal(closed.body.deleted.length, newRows.length);
});

test('carteira: transferência fixa não mexe no caixa e a atualização de saldo vira gasto da carteira', async () => {
  const summaryOf = async (month) => (await call('GET', `/finance/summary?year=${month.slice(0, 4)}&month=${Number(month.slice(5))}`)).body;
  const before = await summaryOf('2026-11');
  const decemberBefore = await summaryOf('2026-12');
  const wallet = await call('POST', '/investment-accounts', {
    name: `${TEMP_PREFIX} carteira`, role: 'wallet', initialBalance: 100, initialBalanceDate: '2026-11-01',
  });
  assert.equal(wallet.status, 201);
  const walletId = wallet.body.id;

  const transfer = { destinationAccountId: walletId, amount: 750, startDate: '2026-11-02', kind: 'fixed', description: `${TEMP_PREFIX} Meu pagamento` };
  assert.equal((await call('POST', '/recurrences', { ...transfer, destinationAccountId: null })).status, 400);
  assert.equal((await call('POST', '/recurrences', { ...transfer, kind: 'installment', installments: 2 })).status, 400);
  const created = await call('POST', '/recurrences', transfer);
  assert.equal(created.status, 201);
  assert.equal(created.body.series.categoryId, null);
  const { recurrenceId } = created.body;
  const rows = await seriesRows(recurrenceId);
  assert.equal(rows.length, created.body.createdCount);
  assert.ok(rows.every((t) => t.flow === 'investment' && t.direction === 'contribution'));

  const withTransfer = await summaryOf('2026-11');
  assert.ok(close(withTransfer.cashBalance - before.cashBalance, 100));
  assert.ok(close(withTransfer.walletBalance - before.walletBalance, 850));
  assert.ok(close(withTransfer.totalContributions, before.totalContributions));
  assert.ok(close(withTransfer.investedPosition, before.investedPosition));
  assert.ok(withTransfer.nextMonth.expectedWalletSpending >= 750);
  const addedWalletSpending = withTransfer.nextMonth.expectedWalletSpending - before.nextMonth.expectedWalletSpending;
  assert.ok(close(withTransfer.nextMonth.projectedBalance - before.nextMonth.projectedBalance, 100 - addedWalletSpending));

  const spent = await call('POST', `/investment-accounts/${walletId}/balance-updates`, { date: '2026-11-20', balance: 300 });
  assert.equal(spent.status, 201);
  assert.deepEqual([spent.body.walletAdjustment.flow, spent.body.walletAdjustment.amount, spent.body.yield], ['expense', 550, 0]);
  const afterSpending = await summaryOf('2026-11');
  assert.ok(close(afterSpending.walletBalance - before.walletBalance, 300));
  assert.ok(close(afterSpending.ledgerBalance, withTransfer.ledgerBalance));
  assert.ok(close(afterSpending.cashBalance, afterSpending.ledgerBalance + afterSpending.walletBalance));
  assert.ok(close(afterSpending.totalNonEssential - before.totalNonEssential, 550));
  assert.ok(close(afterSpending.totalEssential, before.totalEssential));
  const decemberAfter = await summaryOf('2026-12');
  assert.equal(decemberAfter.reserve.referenceExpense, decemberBefore.reserve.referenceExpense);

  const listed = (await call('GET', '/transactions?year=2026&month=11')).body.find((t) => t.id === spent.body.walletAdjustment.transactionId);
  assert.equal(listed.walletAccountId, walletId);
  assert.equal(listed.flow, 'expense');
  assert.equal((await call('DELETE', `/transactions/${listed.id}`)).status, 422);

  const corrected = await call('POST', `/investment-accounts/${walletId}/balance-updates`, { date: '2026-11-20', balance: 900 });
  assert.deepEqual([corrected.body.walletAdjustment.flow, corrected.body.walletAdjustment.amount], ['income', 50]);
  const walletEntries = () => prisma.transactions.count({ where: { balance_update: { investment_account_id: BigInt(walletId) } } });
  assert.equal(await walletEntries(), 1);

  const investments = (await call('GET', '/investments?year=2026&month=11')).body;
  assert.ok(investments.accounts.every((a) => a.id !== walletId));
  const walletView = investments.wallets.find((w) => w.id === walletId);
  assert.deepEqual([walletView.balance, walletView.monthSpending, walletView.yield], [900, -50, 0]);
  assert.ok(investments.walletTransactions.some((t) => t.recurrenceId === recurrenceId));
  assert.ok(investments.transactions.every((t) => t.investmentAccountId !== walletId));

  assert.equal((await call('DELETE', `/investment-accounts/${walletId}/balance-updates/${corrected.body.id}`)).status, 204);
  assert.equal(await walletEntries(), 0);

  const december = rows.find((t) => isoDate(t.date) === '2026-12-02');
  const closed = await call('DELETE', `/transactions/${december.id}?applyToFutureSeries=true`);
  assert.equal(closed.body.deleted.length, rows.length - 1);
  const reopenSeries = closed.body.closedSeries.map(({ recurrenceId: id, previousEndMonth }) => ({ recurrenceId: id, endMonth: previousEndMonth }));
  assert.equal((await call('POST', '/transactions/restore', { transactions: closed.body.deleted, reopenSeries })).status, 201);
  assert.equal((await seriesRows(recurrenceId)).length, rows.length);

  const january = (await seriesRows(recurrenceId)).find((t) => isoDate(t.date) === '2027-01-02');
  const edited = await call('PUT', `/transactions/${january.id}?applyToFutureSeries=true`, {
    investmentAccountId: walletId, direction: 'contribution', amount: 800, date: '2027-01-02', description: transfer.description,
  });
  assert.equal(edited.status, 200);
  const newSeries = await prisma.recurrences.findUnique({ where: { id: BigInt(edited.body.recurrenceId) } });
  assert.deepEqual([newSeries.category_id, Number(newSeries.destination_account_id)], [null, walletId]);
  assert.ok((await seriesRows(edited.body.recurrenceId)).every((t) => Number(t.amount) === 800 && t.flow === 'investment'));
});
