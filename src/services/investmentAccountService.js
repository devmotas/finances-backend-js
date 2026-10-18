const prisma = require('../db/prisma');
const { NotFoundError, ConflictError, UnprocessableError, BadRequestError } = require('../errors/AppError');
const { ACCOUNT_ROLE } = require('../domain/constants');
const { accountPosition, missingToTarget } = require('../domain/investmentPosition');
const { formatDate } = require('../domain/months');

const CENTS_DIGITS = 2;

function money(value) {
  return value == null ? null : Number(Number(value).toFixed(CENTS_DIGITS));
}

function todayDate() {
  return new Date(formatDate(new Date()));
}

function assertTargetAllowed(role, targetBalance) {
  if (targetBalance != null && role !== ACCOUNT_ROLE.SHORT_TERM_RESERVE) {
    throw new BadRequestError('Valor-alvo só existe para a reserva de curto prazo.');
  }
}

async function loadPortfolio(userId, until = null) {
  const uid = BigInt(userId);
  const dateFilter = until ? { lte: until } : undefined;
  const [accounts, movements, balanceUpdates] = await Promise.all([
    prisma.investment_accounts.findMany({ where: { user_id: uid }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    prisma.transactions.findMany({
      where: { user_id: uid, investment_account_id: { not: null }, date: dateFilter },
      select: { investment_account_id: true, date: true, direction: true, amount: true },
    }),
    prisma.balance_updates.findMany({
      where: { investment_accounts: { user_id: uid }, date: dateFilter },
      orderBy: { date: 'asc' },
    }),
  ]);
  return accounts.map((account) => ({
    account,
    movements: movements.filter((m) => m.investment_account_id === account.id),
    balanceUpdates: balanceUpdates.filter((u) => u.investment_account_id === account.id),
  }));
}

function positionOf(entry, until) {
  return accountPosition(
    {
      initialBalance: entry.account.initial_balance,
      movements: entry.movements,
      balanceUpdates: entry.balanceUpdates,
    },
    until
  );
}

function toAccountDto(account) {
  return {
    id: Number(account.id),
    name: account.name,
    role: account.role,
    initialBalance: money(account.initial_balance),
    initialBalanceDate: formatDate(account.initial_balance_date),
    targetBalance: money(account.target_balance),
    legacyCategoryId: account.legacy_category_id ? Number(account.legacy_category_id) : null,
  };
}

function toAccountWithPositionDto(entry, until) {
  const position = positionOf(entry, until);
  const update = position.lastBalanceUpdate;
  return {
    ...toAccountDto(entry.account),
    contributions: money(position.contributions),
    withdrawals: money(position.withdrawals),
    yield: money(position.yield),
    balance: money(position.position),
    missingToTarget: money(missingToTarget(entry.account.target_balance, position.position)),
    lastBalanceUpdate: update ? { date: formatDate(update.date), balance: money(update.balance) } : null,
  };
}

async function list(userId) {
  const today = todayDate();
  const portfolio = await loadPortfolio(userId, today);
  return portfolio.map((entry) => toAccountWithPositionDto(entry, today));
}

async function findOrThrow(userId, accountId) {
  const account = await prisma.investment_accounts.findFirst({
    where: { id: BigInt(accountId), user_id: BigInt(userId) },
  });
  if (!account) throw new NotFoundError('Conta de investimento não encontrada.');
  return account;
}

async function assertUniqueName(userId, name, exceptId = null) {
  const duplicate = await prisma.investment_accounts.findFirst({
    where: {
      user_id: BigInt(userId),
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: BigInt(exceptId) } } : {}),
    },
  });
  if (duplicate) throw new ConflictError(`Já existe uma conta de investimento com o nome '${name}'.`);
}

function accountData({ name, role, initialBalance, initialBalanceDate, targetBalance }) {
  assertTargetAllowed(role, targetBalance);
  return {
    name,
    role,
    initial_balance: initialBalance,
    initial_balance_date: new Date(initialBalanceDate),
    target_balance: targetBalance ?? null,
  };
}

async function create(userId, body) {
  await assertUniqueName(userId, body.name);
  const account = await prisma.investment_accounts.create({
    data: {
      user_id: BigInt(userId),
      ...accountData({
        ...body,
        role: body.role ?? ACCOUNT_ROLE.INVESTMENT,
        initialBalance: body.initialBalance ?? 0,
        initialBalanceDate: body.initialBalanceDate ?? formatDate(todayDate()),
      }),
    },
  });
  return toAccountDto(account);
}

async function update(userId, accountId, body) {
  const current = await findOrThrow(userId, accountId);
  await assertUniqueName(userId, body.name, accountId);
  const role = body.role ?? current.role;
  const keptTarget = role === ACCOUNT_ROLE.SHORT_TERM_RESERVE ? current.target_balance : null;
  const updated = await prisma.investment_accounts.update({
    where: { id: current.id },
    data: accountData({
      name: body.name,
      role,
      initialBalance: body.initialBalance ?? current.initial_balance,
      initialBalanceDate: body.initialBalanceDate ?? formatDate(current.initial_balance_date),
      targetBalance: body.targetBalance === undefined ? keptTarget : body.targetBalance,
    }),
  });
  return toAccountDto(updated);
}

async function remove(userId, accountId) {
  const account = await findOrThrow(userId, accountId);
  const hasMovements = await prisma.transactions.findFirst({ where: { investment_account_id: account.id } });
  if (hasMovements) {
    throw new UnprocessableError(
      `A conta '${account.name}' possui lançamentos e não pode ser excluída.`
    );
  }
  const isSeriesDestination = await prisma.recurrences.findFirst({ where: { destination_account_id: account.id } });
  if (isSeriesDestination) {
    throw new UnprocessableError(
      `A conta '${account.name}' recebe uma entrada fixa e não pode ser excluída.`
    );
  }
  await prisma.investment_accounts.delete({ where: { id: account.id } });
}

async function accountHistory(userId, accountId) {
  const portfolio = await loadPortfolio(userId);
  return portfolio.find((entry) => entry.account.id === BigInt(accountId));
}

function toBalanceUpdateDto(entry, update) {
  return {
    id: Number(update.id),
    investmentAccountId: Number(update.investment_account_id),
    date: formatDate(update.date),
    balance: money(update.balance),
    yield: money(positionOf(entry, update.date).yield),
  };
}

async function addBalanceUpdate(userId, accountId, { date, balance }) {
  const account = await findOrThrow(userId, accountId);
  const saved = await prisma.balance_updates.upsert({
    where: { investment_account_id_date: { investment_account_id: account.id, date: new Date(date) } },
    create: { investment_account_id: account.id, date: new Date(date), balance },
    update: { balance },
  });
  return toBalanceUpdateDto(await accountHistory(userId, accountId), saved);
}

async function listBalanceUpdates(userId, accountId) {
  await findOrThrow(userId, accountId);
  const entry = await accountHistory(userId, accountId);
  return [...entry.balanceUpdates].reverse().map((update) => toBalanceUpdateDto(entry, update));
}

async function removeBalanceUpdate(userId, accountId, updateId) {
  const account = await findOrThrow(userId, accountId);
  const { count } = await prisma.balance_updates.deleteMany({
    where: { id: BigInt(updateId), investment_account_id: account.id },
  });
  if (count === 0) throw new NotFoundError('Atualização de saldo não encontrada.');
}

async function syncLegacyCategory(category) {
  await prisma.investment_accounts.upsert({
    where: { legacy_category_id: category.id },
    create: {
      user_id: category.user_id,
      name: category.name,
      initial_balance: category.opening_balance_amount,
      initial_balance_date: todayDate(),
      legacy_category_id: category.id,
    },
    update: { name: category.name, initial_balance: category.opening_balance_amount },
  });
}

async function removeLegacyAccount(categoryId) {
  await prisma.investment_accounts.deleteMany({ where: { legacy_category_id: BigInt(categoryId) } });
}

module.exports = {
  list,
  create,
  update,
  remove,
  addBalanceUpdate,
  listBalanceUpdates,
  removeBalanceUpdate,
  loadPortfolio,
  positionOf,
  toAccountWithPositionDto,
  syncLegacyCategory,
  removeLegacyAccount,
  money,
};
