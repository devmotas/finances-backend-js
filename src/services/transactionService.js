const prisma = require('../db/prisma');
const { INTERACTIVE_TRANSACTION_OPTIONS } = require('../db/transactionOptions');
const { NotFoundError, BadRequestError, UnprocessableError } = require('../errors/AppError');
const { validateAmount } = require('../domain/amount');
const { SCHEDULE, FLOW, INVESTMENT_DIRECTION } = require('../domain/constants');
const { monthOf, firstDay, lastDay, formatMonth, formatDate } = require('../domain/months');
const seriesService = require('./seriesService');

const TX_INCLUDE = Object.freeze({ recurrences: true, balance_update: true });
const SERIES_TO_INVESTMENT_MESSAGE = 'Um lançamento de série não pode virar aporte ou resgate.';
const PAIRED_CONTRIBUTION_MESSAGE = 'O aporte de uma entrada com destino continua sendo aporte; mude só valor, data, descrição ou conta.';
const WALLET_ENTRY_MESSAGE = 'Este lançamento vem da atualização de saldo da Carteira. Corrija ou exclua a atualização de saldo.';
const DATE_ORDER = Object.freeze([{ date: 'asc' }, { id: 'asc' }]);

async function listByMonth(userId, year, month) {
  await seriesService.topUpSeries(userId);
  const selected = { year, month };
  const txs = await prisma.transactions.findMany({
    where: { user_id: BigInt(userId), date: { gte: firstDay(selected), lte: lastDay(selected) } },
    include: TX_INCLUDE,
    orderBy: DATE_ORDER,
  });
  return txs.map(toDto);
}

async function loadTargets(userId, items) {
  const uid = BigInt(userId);
  const idsOf = (key) => [...new Set(items.filter((i) => i[key] != null).map((i) => BigInt(i[key])))];
  const categoryIds = idsOf('categoryId');
  const accountIds = idsOf('investmentAccountId');
  const [categories, accounts, legacyAccounts] = await Promise.all([
    prisma.categories.findMany({ where: { user_id: uid, id: { in: categoryIds } } }),
    prisma.investment_accounts.findMany({ where: { user_id: uid, id: { in: accountIds } } }),
    prisma.investment_accounts.findMany({ where: { user_id: uid, legacy_category_id: { in: categoryIds } } }),
  ]);
  return {
    categories: new Map(categories.map((c) => [String(c.id), c])),
    accounts: new Map(accounts.map((a) => [String(a.id), a])),
    accountsByLegacyCategory: new Map(legacyAccounts.map((a) => [String(a.legacy_category_id), a])),
  };
}

function investmentData(account, direction, amount) {
  if (!account) throw new NotFoundError('Conta de investimento não encontrada.');
  if (direction == null) throw new BadRequestError('Informe se o lançamento é aporte ou resgate.');
  if (!(amount > 0)) throw new BadRequestError('O valor do aporte ou resgate deve ser maior que zero.');
  return {
    category_id: account.legacy_category_id,
    investment_account_id: account.id,
    direction,
    amount,
    flow: FLOW.INVESTMENT,
  };
}

function directionOfSigned(amount) {
  return amount < 0 ? INVESTMENT_DIRECTION.WITHDRAWAL : INVESTMENT_DIRECTION.CONTRIBUTION;
}

function targetData(item, targets) {
  if (item.investmentAccountId != null) {
    return investmentData(targets.accounts.get(String(item.investmentAccountId)), item.direction, item.amount);
  }
  const category = targets.categories.get(String(item.categoryId));
  if (!category) throw new NotFoundError('Categoria não encontrada.');
  if (category.flow === FLOW.INVESTMENT) {
    validateAmount(item.amount, FLOW.INVESTMENT);
    const account = targets.accountsByLegacyCategory.get(String(category.id));
    return investmentData(account, item.direction ?? directionOfSigned(item.amount), Math.abs(item.amount));
  }
  validateAmount(item.amount, category.flow);
  return { category_id: category.id, investment_account_id: null, direction: null, amount: item.amount, flow: category.flow };
}

async function resolveTarget(userId, item) {
  return targetData(item, await loadTargets(userId, [item]));
}

async function create(userId, body) {
  if (body.schedule === SCHEDULE.FIXED) {
    throw new BadRequestError('Lançamentos fixos são criados como série em /recurrences.');
  }
  const target = await resolveTarget(userId, body);
  const tx = await prisma.transactions.create({
    data: {
      user_id: BigInt(userId),
      description: body.description?.trim() || null,
      date: new Date(body.date),
      ...target,
    },
    include: TX_INCLUDE,
  });
  return toDto(tx);
}

function isPairedContribution(transaction) {
  return transaction.recurrence_id != null && transaction.flow === FLOW.INVESTMENT;
}

function assertKeepsSeriesShape(transaction, target) {
  if (transaction.recurrence_id == null) return;
  if (!isPairedContribution(transaction)) {
    if (target.flow === FLOW.INVESTMENT) throw new BadRequestError(SERIES_TO_INVESTMENT_MESSAGE);
    return;
  }
  if (target.flow !== FLOW.INVESTMENT || target.direction !== INVESTMENT_DIRECTION.CONTRIBUTION) {
    throw new BadRequestError(PAIRED_CONTRIBUTION_MESSAGE);
  }
}

function sameOccurrence(transaction) {
  return { recurrence_id: transaction.recurrence_id, recurrence_index: transaction.recurrence_index };
}

async function mirrorPairedContribution(db, income) {
  if (income.recurrence_id == null || isPairedContribution(income)) return;
  await db.transactions.updateMany({
    where: { ...sameOccurrence(income), flow: FLOW.INVESTMENT },
    data: { amount: income.amount, date: income.date, description: income.description },
  });
}

function assertNotWalletEntry(transaction) {
  if (transaction.balance_update_id != null) throw new UnprocessableError(WALLET_ENTRY_MESSAGE);
}

async function update(userId, transactionId, body, applyToFutureSeries) {
  const transaction = await findOrThrow(userId, transactionId);
  assertNotWalletEntry(transaction);
  const target = await resolveTarget(userId, body);
  assertKeepsSeriesShape(transaction, target);

  if (applyToFutureSeries && transaction.recurrence_id != null) {
    return toDto(await seriesService.replaceFromTransaction(userId, transaction, body));
  }

  const updated = await prisma.$transaction(async (db) => {
    const saved = await db.transactions.update({
      where: { id: transaction.id },
      data: {
        description: body.description?.trim() || null,
        date: new Date(body.date),
        ...target,
      },
      include: TX_INCLUDE,
    });
    await mirrorPairedContribution(db, saved);
    return saved;
  }, INTERACTIVE_TRANSACTION_OPTIONS);
  return toDto(updated);
}

function deletionWhere(transaction, applyToFutureSeries) {
  if (transaction.recurrence_id == null) return { id: transaction.id };
  if (applyToFutureSeries) {
    return { recurrence_id: transaction.recurrence_id, date: { gte: firstDay(monthOf(transaction.date)) } };
  }
  return transaction.recurrence_index == null ? { id: transaction.id } : sameOccurrence(transaction);
}

async function remove(userId, transactionId, applyToFutureSeries) {
  const transaction = await findOrThrow(userId, transactionId);
  assertNotWalletEntry(transaction);
  const closesSeries = applyToFutureSeries && transaction.recurrence_id != null;
  const where = deletionWhere(transaction, applyToFutureSeries);

  return prisma.$transaction(async (db) => {
    const deleted = await db.transactions.findMany({ where, include: TX_INCLUDE, orderBy: DATE_ORDER });
    await db.transactions.deleteMany({ where: { id: { in: deleted.map((t) => t.id) } } });
    const closedSeries = closesSeries
      ? [await seriesService.closeSeries(db, transaction.recurrences, transaction.date)]
      : [];
    return { deleted: deleted.map(toDto), closedSeries };
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}

async function restore(userId, items, reopenSeries = []) {
  const targets = await loadTargets(userId, items);
  await assertOwnedRecurrences(userId, items);

  const data = items.map((item) => {
    const inSeries = item.recurrenceId != null;
    return {
      user_id: BigInt(userId),
      description: item.description?.trim() || null,
      date: new Date(item.date),
      recurrence_id: inSeries ? BigInt(item.recurrenceId) : null,
      recurrence_index: inSeries ? item.recurrenceIndex : null,
      ...targetData(item, targets),
    };
  });

  return prisma.$transaction(async (db) => {
    const created = await db.transactions.createManyAndReturn({ data, select: { id: true } });
    await seriesService.reopenSeries(db, userId, reopenSeries);
    const restored = await db.transactions.findMany({
      where: { id: { in: created.map((t) => t.id) } },
      include: TX_INCLUDE,
      orderBy: DATE_ORDER,
    });
    return restored.map(toDto);
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}

async function assertOwnedRecurrences(userId, items) {
  const ids = [...new Set(items.filter((i) => i.recurrenceId != null).map((i) => String(i.recurrenceId)))];
  if (ids.length === 0) return;
  const count = await prisma.recurrences.count({
    where: { user_id: BigInt(userId), id: { in: ids.map(BigInt) } },
  });
  if (count !== ids.length) throw new NotFoundError('Série não encontrada.');
}

async function findOrThrow(userId, transactionId) {
  const tx = await prisma.transactions.findFirst({
    where: { id: BigInt(transactionId), user_id: BigInt(userId) },
    include: TX_INCLUDE,
  });
  if (!tx) throw new NotFoundError('Transação não encontrada.');
  return tx;
}

function seriesEndsOn(recurrence) {
  return recurrence?.end_month ? formatMonth(monthOf(recurrence.end_month)) : null;
}

function destinationOf(tx) {
  const accountId = tx.flow === FLOW.INCOME ? tx.recurrences?.destination_account_id : null;
  return accountId ? Number(accountId) : null;
}

function toDto(tx) {
  return {
    id: Number(tx.id),
    categoryId: tx.category_id ? Number(tx.category_id) : null,
    investmentAccountId: tx.investment_account_id ? Number(tx.investment_account_id) : null,
    direction: tx.direction ?? null,
    description: tx.description ?? null,
    amount: parseFloat(Number(tx.amount).toFixed(2)),
    date: formatDate(tx.date),
    schedule: tx.recurrence_id ? SCHEDULE.FIXED : SCHEDULE.VARIABLE,
    flow: tx.flow,
    recurrenceId: tx.recurrence_id ? Number(tx.recurrence_id) : null,
    recurrenceIndex: tx.recurrence_index ?? null,
    seriesKind: tx.recurrences?.kind ?? null,
    seriesEndsOn: seriesEndsOn(tx.recurrences),
    installmentTotal: tx.recurrences?.installment_total ?? null,
    destinationAccountId: destinationOf(tx),
    walletAccountId: tx.balance_update ? Number(tx.balance_update.investment_account_id) : null,
  };
}

module.exports = { listByMonth, create, update, remove, restore };
