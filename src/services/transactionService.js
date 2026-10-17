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

  if (applyToFutureSeries && transaction.recurrence_id != null) {
    const txDate = new Date(transaction.date);
    const monthStart = new Date(Date.UTC(txDate.getUTCFullYear(), txDate.getUTCMonth(), 1));

    await prisma.transactions.deleteMany({
      where: {
        recurrence_id: transaction.recurrence_id,
        user_id: BigInt(userId),
        date: { gte: monthStart },
      },
    });
  } else {
    await prisma.transactions.delete({ where: { id: BigInt(transactionId) } });
  }
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

module.exports = { listByMonth, create, update, remove };
