const prisma = require('../db/prisma');
const { NotFoundError, ConflictError, UnprocessableError } = require('../errors/AppError');

async function listAll(userId) {
  const cats = await prisma.categories.findMany({ where: { user_id: BigInt(userId) } });
  return cats.map(toDto);
}

async function create(userId, { name, flow, expenseGroup, openingBalanceAmount }) {
  const dup = await prisma.categories.findFirst({
    where: {
      user_id: BigInt(userId),
      name: { equals: name, mode: 'insensitive' },
    },
  });
  if (dup) throw new ConflictError(`Já existe uma categoria com o nome '${name}'.`);

  const user = await prisma.users.findUnique({ where: { id: BigInt(userId) } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');

  const category = await prisma.categories.create({
    data: {
      user_id: BigInt(userId),
      name,
      flow,
      expense_group: expenseGroup ?? null,
      opening_balance_amount: normalizedOpeningBalance(flow, openingBalanceAmount),
      created_at: new Date(),
    },
  });
  return toDto(category);
}

async function update(userId, categoryId, { name, flow, expenseGroup, openingBalanceAmount }) {
  const category = await findOrThrow(userId, categoryId);

  if (category.name.toLowerCase() !== name.toLowerCase()) {
    const dup = await prisma.categories.findFirst({
      where: {
        user_id: BigInt(userId),
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (dup) throw new ConflictError(`Já existe uma categoria com o nome '${name}'.`);
  }

  const updated = await prisma.categories.update({
    where: { id: BigInt(categoryId) },
    data: {
      name,
      flow,
      expense_group: expenseGroup ?? null,
      opening_balance_amount: normalizedOpeningBalance(flow, openingBalanceAmount),
    },
  });
  return toDto(updated);
}

async function remove(userId, categoryId) {
  const cat = await findOrThrow(userId, categoryId);

  const hasTxs = await prisma.transactions.findFirst({
    where: { category_id: BigInt(categoryId) },
  });
  if (hasTxs) {
    throw new UnprocessableError(
      `A categoria '${cat.name}' possui transações vinculadas e não pode ser excluída.`
    );
  }
  await prisma.categories.delete({ where: { id: BigInt(categoryId) } });
}

async function findOrThrow(userId, categoryId) {
  const cat = await prisma.categories.findFirst({
    where: { id: BigInt(categoryId), user_id: BigInt(userId) },
  });
  if (!cat) throw new NotFoundError('Categoria não encontrada.');
  return cat;
}

function normalizedOpeningBalance(flow, raw) {
  if (flow !== 'investment') return 0;
  return raw ?? 0;
}

function toDto(cat) {
  return {
    id: Number(cat.id),
    name: cat.name,
    flow: cat.flow,
    expenseGroup: cat.expense_group ?? null,
    openingBalanceAmount: parseFloat(Number(cat.opening_balance_amount).toFixed(2)),
  };
}

module.exports = { listAll, create, update, remove };
