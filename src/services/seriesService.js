const prisma = require('../db/prisma');
const { INTERACTIVE_TRANSACTION_OPTIONS } = require('../db/transactionOptions');
const { NotFoundError, BadRequestError } = require('../errors/AppError');
const { validateAmount } = require('../domain/amount');
const { seriesDescription } = require('../domain/installment');
const { FLOW, SERIES_KIND } = require('../domain/constants');
const { monthOf, firstDay, monthsDiff, formatMonth, parseMonth, formatDate } = require('../domain/months');
const {
  FIRST_INDEX,
  horizonMonth,
  installmentEndMonth,
  pendingOccurrences,
  normalizeSeriesRequest,
  closingMonthBefore,
  endMonthAfterClosing,
} = require('../domain/series');

function toSeries(recurrence) {
  return {
    kind: recurrence.kind,
    startDate: formatDate(recurrence.start_date),
    firstIndex: recurrence.first_index,
    installmentTotal: recurrence.installment_total,
    endMonth: recurrence.end_month ? monthOf(recurrence.end_month) : null,
    materializedUntil: recurrence.materialized_until ? monthOf(recurrence.materialized_until) : null,
  };
}

function toSeriesDto(recurrence) {
  return {
    id: Number(recurrence.id),
    kind: recurrence.kind,
    categoryId: Number(recurrence.category_id),
    description: recurrence.description ?? null,
    amount: Number(recurrence.amount),
    startDate: formatDate(recurrence.start_date),
    endMonth: recurrence.end_month ? formatMonth(monthOf(recurrence.end_month)) : null,
    installmentTotal: recurrence.installment_total ?? null,
  };
}

function occurrenceRows(recurrence, flow, occurrences, installmentAmounts) {
  return occurrences.map(({ index, date }) => ({
    user_id: recurrence.user_id,
    category_id: recurrence.category_id,
    description: seriesDescription(recurrence.description, index, recurrence.installment_total),
    amount: installmentAmounts?.[index - FIRST_INDEX] ?? recurrence.amount,
    date,
    flow,
    recurrence_id: recurrence.id,
    recurrence_index: index,
  }));
}

async function materialize(db, recurrence, flow, today, installmentAmounts) {
  const occurrences = pendingOccurrences(toSeries(recurrence), today);
  if (occurrences.length === 0) return 0;
  await db.transactions.createMany({
    data: occurrenceRows(recurrence, flow, occurrences, installmentAmounts),
    skipDuplicates: true,
  });
  const last = occurrences[occurrences.length - 1];
  await db.recurrences.update({
    where: { id: recurrence.id },
    data: { materialized_until: firstDay(monthOf(last.date)) },
  });
  return occurrences.length;
}

async function topUpSeries(userId, today = new Date()) {
  const horizonStart = firstDay(horizonMonth(today));
  const candidates = await prisma.recurrences.findMany({
    where: {
      user_id: BigInt(userId),
      kind: SERIES_KIND.FIXED,
      materialized_until: { lt: horizonStart },
      OR: [{ end_month: null }, { end_month: { gt: prisma.recurrences.fields.materialized_until } }],
    },
    include: { categories: true },
  });
  for (const recurrence of candidates) {
    await prisma.$transaction((db) => materialize(db, recurrence, recurrence.categories.flow, today), INTERACTIVE_TRANSACTION_OPTIONS);
  }
}

async function seriesCategory(userId, categoryId) {
  const category = await prisma.categories.findFirst({
    where: { id: BigInt(categoryId), user_id: BigInt(userId) },
  });
  if (!category) throw new NotFoundError('Categoria não encontrada.');
  if (category.flow === FLOW.INVESTMENT) {
    throw new BadRequestError(
      'Não é possível criar série para investimentos. Registre cada aporte ou resgate na conta de investimento.'
    );
  }
  return category;
}

async function openSeries(db, { userId, category, description, amount, startDate, kind, firstIndex, installmentTotal, endMonth, installmentAmounts }, today) {
  const resolvedEnd =
    kind === SERIES_KIND.INSTALLMENT ? installmentEndMonth(startDate, firstIndex, installmentTotal) : endMonth;
  const recurrence = await db.recurrences.create({
    data: {
      user_id: BigInt(userId),
      category_id: category.id,
      description: seriesDescription(description, null, null),
      amount,
      start_date: new Date(startDate),
      kind,
      first_index: firstIndex,
      installment_total: installmentTotal,
      end_month: resolvedEnd ? firstDay(resolvedEnd) : null,
      materialized_until: firstDay(closingMonthBefore(new Date(startDate))),
    },
  });
  const createdCount = await materialize(db, recurrence, category.flow, today, installmentAmounts);
  return { recurrence, createdCount };
}

async function create(userId, body, today = new Date()) {
  const category = await seriesCategory(userId, body.categoryId);
  const request = normalizeSeriesRequest(body);
  validateAmount(request.amount, category.flow);
  (request.installmentAmounts ?? []).forEach((value) => validateAmount(value, category.flow));

  const { recurrence, createdCount } = await prisma.$transaction((db) =>
    openSeries(
      db,
      {
        userId,
        category,
        description: body.description,
        amount: request.amount,
        startDate: body.startDate,
        kind: request.kind,
        firstIndex: FIRST_INDEX,
        installmentTotal: request.installmentTotal,
        endMonth: null,
        installmentAmounts: request.installmentAmounts,
      },
      today
    ),
    INTERACTIVE_TRANSACTION_OPTIONS
  );
  const saved = await prisma.recurrences.findUnique({ where: { id: recurrence.id } });
  return { recurrenceId: Number(recurrence.id), createdCount, series: toSeriesDto(saved) };
}

async function closeOrDropOldSeries(db, recurrence, closingMonth) {
  const remaining = await db.transactions.count({ where: { recurrence_id: recurrence.id } });
  if (remaining === 0) {
    await db.recurrences.delete({ where: { id: recurrence.id } });
    return;
  }
  await db.recurrences.update({
    where: { id: recurrence.id },
    data: { end_month: firstDay(endMonthAfterClosing(recurrence.end_month ? monthOf(recurrence.end_month) : null, closingMonth)) },
  });
}

async function replaceFromTransaction(userId, transaction, { categoryId, description, amount, date }, today = new Date()) {
  const category = await seriesCategory(userId, categoryId);
  validateAmount(amount, category.flow);
  const recurrence = await prisma.recurrences.findUnique({ where: { id: transaction.recurrence_id } });
  const editedMonth = monthOf(transaction.date);
  const isInstallment = recurrence.kind === SERIES_KIND.INSTALLMENT;

  return prisma.$transaction(async (db) => {
    await db.transactions.deleteMany({
      where: { recurrence_id: recurrence.id, date: { gte: firstDay(editedMonth) } },
    });
    await closeOrDropOldSeries(db, recurrence, closingMonthBefore(transaction.date));
    const { recurrence: opened } = await openSeries(
      db,
      {
        userId,
        category,
        description,
        amount,
        startDate: date,
        kind: recurrence.kind,
        firstIndex: isInstallment ? transaction.recurrence_index : FIRST_INDEX,
        installmentTotal: recurrence.installment_total,
        endMonth: endStillAhead(recurrence, editedMonth),
        installmentAmounts: null,
      },
      today
    );
    return db.transactions.findFirst({
      where: { recurrence_id: opened.id },
      orderBy: { date: 'asc' },
      include: { recurrences: true },
    });
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}

function endStillAhead(recurrence, month) {
  if (!recurrence.end_month) return null;
  const end = monthOf(recurrence.end_month);
  return monthsDiff(month, end) >= 0 ? end : null;
}

async function closeSeries(db, recurrence, fromDate) {
  const previousEnd = recurrence.end_month ? monthOf(recurrence.end_month) : null;
  const newEnd = endMonthAfterClosing(previousEnd, closingMonthBefore(fromDate));
  await db.recurrences.update({ where: { id: recurrence.id }, data: { end_month: firstDay(newEnd) } });
  return { recurrenceId: Number(recurrence.id), previousEndMonth: previousEnd ? formatMonth(previousEnd) : null };
}

async function reopenSeries(db, userId, items) {
  for (const { recurrenceId, endMonth } of items) {
    const { count } = await db.recurrences.updateMany({
      where: { id: BigInt(recurrenceId), user_id: BigInt(userId) },
      data: { end_month: endMonth ? firstDay(parseMonth(endMonth)) : null },
    });
    if (count === 0) throw new NotFoundError('Série não encontrada.');
  }
}

module.exports = { create, topUpSeries, replaceFromTransaction, closeSeries, reopenSeries };
