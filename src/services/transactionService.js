const prisma = require('../db/prisma');
const { NotFoundError, BadRequestError } = require('../errors/AppError');
const { validateAmount } = require('../domain/amount');
const { seriesDescription } = require('../domain/installment');
const { SCHEDULE } = require('../domain/constants');

function firstDay(year, month) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0));
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

async function listByMonth(userId, year, month) {
  const txs = await prisma.transactions.findMany({
    where: {
      user_id: BigInt(userId),
      date: { gte: firstDay(year, month), lte: lastDay(year, month) },
    },
    include: { categories: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  return txs.map(toDto);
}

async function create(userId, { categoryId, description, amount, date, schedule }) {
  const user = await prisma.users.findUnique({ where: { id: BigInt(userId) } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');

  const category = await prisma.categories.findFirst({
    where: { id: BigInt(categoryId), user_id: BigInt(userId) },
  });
  if (!category) throw new NotFoundError('Categoria não encontrada.');

  validateAmount(amount, category.flow);
  if (schedule === SCHEDULE.FIXED) {
    throw new BadRequestError('Lançamentos fixos são criados como série em /recurrences.');
  }

  const tx = await prisma.transactions.create({
    data: {
      user_id: BigInt(userId),
      category_id: BigInt(categoryId),
      description: description?.trim() || null,
      amount,
      date: new Date(date),
      schedule,
      flow: category.flow,
    },
    include: { categories: true },
  });
  return toDto(tx);
}

async function update(userId, transactionId, { categoryId, description, amount, date }, applyToFutureSeries) {
  const transaction = await findOrThrow(userId, transactionId);

  const category = await prisma.categories.findFirst({
    where: { id: BigInt(categoryId), user_id: BigInt(userId) },
  });
  if (!category) throw new NotFoundError('Categoria não encontrada.');

  validateAmount(amount, category.flow);
  const schedule = scheduleOf(transaction);

  if (applyToFutureSeries && transaction.recurrence_id != null) {
    const txDate = new Date(transaction.date);
    const monthStart = new Date(Date.UTC(txDate.getUTCFullYear(), txDate.getUTCMonth(), 1));

    const [recurrence, futureTxs] = await Promise.all([
      prisma.recurrences.findUnique({ where: { id: transaction.recurrence_id } }),
      prisma.transactions.findMany({
        where: {
          recurrence_id: transaction.recurrence_id,
          user_id: BigInt(userId),
          date: { gte: monthStart },
        },
      }),
    ]);

    await prisma.$transaction([
      prisma.recurrences.update({
        where: { id: recurrence.id },
        data: {
          category_id: BigInt(categoryId),
          description: seriesDescription(description, null, null),
          amount,
        },
      }),
      ...futureTxs.map((t) =>
        prisma.transactions.update({
          where: { id: t.id },
          data: {
            category_id: BigInt(categoryId),
            description: seriesDescription(description, t.recurrence_index, recurrence.installment_total),
            amount,
            schedule,
            flow: category.flow,
            ...(t.id === transaction.id ? { date: new Date(date) } : {}),
          },
        })
      ),
    ]);

    const updated = await prisma.transactions.findUnique({
      where: { id: BigInt(transactionId) },
      include: { categories: true },
    });
    return toDto(updated);
  }

  const updated = await prisma.transactions.update({
    where: { id: BigInt(transactionId) },
    data: {
      category_id: BigInt(categoryId),
      description: description?.trim() || null,
      amount,
      date: new Date(date),
      schedule,
      flow: category.flow,
    },
    include: { categories: true },
  });
  return toDto(updated);
}

async function remove(userId, transactionId, applyToFutureSeries) {
  const transaction = await findOrThrow(userId, transactionId);
  const where = deletionScope(userId, transaction, applyToFutureSeries);

  return prisma.$transaction(async (db) => {
    const deleted = await db.transactions.findMany({ where, orderBy: [{ date: 'asc' }, { id: 'asc' }] });
    await db.transactions.deleteMany({ where: { id: { in: deleted.map((t) => t.id) } } });
    return deleted.map(toDto);
  });
}

function deletionScope(userId, transaction, applyToFutureSeries) {
  if (!applyToFutureSeries || transaction.recurrence_id == null) {
    return { id: transaction.id };
  }
  const txDate = new Date(transaction.date);
  return {
    recurrence_id: transaction.recurrence_id,
    user_id: BigInt(userId),
    date: { gte: firstDay(txDate.getUTCFullYear(), txDate.getUTCMonth() + 1) },
  };
}

async function restore(userId, items) {
  const categories = await ownedCategories(userId, items);
  await assertOwnedRecurrences(userId, items);

  const data = items.map((item) => {
    const category = categories.get(String(item.categoryId));
    validateAmount(item.amount, category.flow);
    return {
      user_id: BigInt(userId),
      category_id: category.id,
      description: item.description?.trim() || null,
      amount: item.amount,
      date: new Date(item.date),
      schedule: item.recurrenceId != null ? SCHEDULE.FIXED : SCHEDULE.VARIABLE,
      flow: category.flow,
      recurrence_id: item.recurrenceId != null ? BigInt(item.recurrenceId) : null,
      recurrence_index: item.recurrenceId != null ? item.recurrenceIndex : null,
    };
  });

  const restored = await prisma.transactions.createManyAndReturn({ data });
  return restored.map(toDto);
}

async function ownedCategories(userId, items) {
  const ids = [...new Set(items.map((i) => String(i.categoryId)))];
  const found = await prisma.categories.findMany({
    where: { user_id: BigInt(userId), id: { in: ids.map(BigInt) } },
  });
  if (found.length !== ids.length) throw new NotFoundError('Categoria não encontrada.');
  return new Map(found.map((c) => [String(c.id), c]));
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
  });
  if (!tx) throw new NotFoundError('Transação não encontrada.');
  return tx;
}

function scheduleOf(transaction) {
  return transaction.recurrence_id != null ? SCHEDULE.FIXED : SCHEDULE.VARIABLE;
}

function toDto(tx) {
  return {
    id: Number(tx.id),
    categoryId: Number(tx.category_id),
    description: tx.description ?? null,
    amount: parseFloat(Number(tx.amount).toFixed(2)),
    date: formatDate(tx.date),
    schedule: tx.schedule,
    flow: tx.flow,
    recurrenceId: tx.recurrence_id ? Number(tx.recurrence_id) : null,
    recurrenceIndex: tx.recurrence_index ?? null,
  };
}

module.exports = { listByMonth, create, update, remove, restore };
