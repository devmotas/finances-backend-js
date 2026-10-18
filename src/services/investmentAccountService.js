const prisma = require('../db/prisma');
const { INTERACTIVE_TRANSACTION_OPTIONS } = require('../db/transactionOptions');
const { NotFoundError, ConflictError, UnprocessableError, BadRequestError } = require('../errors/AppError');
const { ACCOUNT_ROLE } = require('../domain/constants');
const { accountPosition, missingToTarget } = require('../domain/investmentPosition');
const { isWallet } = require('../domain/wallet');
const { formatDate } = require('../domain/months');
const { reconcileWallet } = require('./walletService');

const CENTS_DIGITS = 2;
const EARLIEST_DATE = new Date(Date.UTC(1900, 0, 1));
const ROLE_CHANGE_MESSAGE =
  'A Carteira não pode virar conta de investimento, nem o contrário, depois de ter lançamentos ou atualizações de saldo.';
const MOVEMENT_SELECT = Object.freeze({
  investment_account_id: true,
  date: true,
  direction: true,
  amount: true,
  flow: true,
  balance_update: { select: { investment_account_id: true } },
});

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

function movementAccountId(movement) {
  return movement.investment_account_id ?? movement.balance_update?.investment_account_id;
}

async function loadPortfolio(userId, until = null) {
  const uid = BigInt(userId);
  const dateFilter = until ? { lte: until } : undefined;
  const [accounts, movements, balanceUpdates] = await Promise.all([
    prisma.investment_accounts.findMany({ where: { user_id: uid }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    prisma.transactions.findMany({
      where: {
        user_id: uid,
        date: dateFilter,
        OR: [{ investment_account_id: { not: null } }, { balance_update_id: { not: null } }],
      },
      select: MOVEMENT_SELECT,
    }),
    prisma.balance_updates.findMany({
      where: { investment_accounts: { user_id: uid }, date: dateFilter },
      orderBy: { date: 'asc' },
    }),
  ]);
  return accounts.map((account) => ({
    account,
    movements: movements.filter((m) => movementAccountId(m) === account.id),
    balanceUpdates: balanceUpdates.filter((u) => u.investment_account_id === account.id),
  }));
}

function positionOf(entry, until) {
  return accountPosition(
    {
      initialBalance: entry.account.initial_balance,
      initialBalanceDate: isWallet(entry.account) ? entry.account.initial_balance_date : null,
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
    spending: money(position.spending),
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

async function hasHistory(account) {
  const [movement, balanceUpdate] = await Promise.all([
    prisma.transactions.findFirst({ where: { investment_account_id: account.id } }),
    prisma.balance_updates.findFirst({ where: { investment_account_id: account.id } }),
  ]);
  return movement != null || balanceUpdate != null;
}

async function assertRoleChangeAllowed(current, role) {
  const togglesWallet = isWallet(current) !== isWallet({ role });
  if (togglesWallet && (await hasHistory(current))) throw new UnprocessableError(ROLE_CHANGE_MESSAGE);
}

async function update(userId, accountId, body) {
  const current = await findOrThrow(userId, accountId);
  await assertUniqueName(userId, body.name, accountId);
  const role = body.role ?? current.role;
  await assertRoleChangeAllowed(current, role);
  const keptTarget = role === ACCOUNT_ROLE.SHORT_TERM_RESERVE ? current.target_balance : null;
  const updated = await prisma.$transaction(async (db) => {
    const saved = await db.investment_accounts.update({
      where: { id: current.id },
      data: accountData({
        name: body.name,
        role,
        initialBalance: body.initialBalance ?? current.initial_balance,
        initialBalanceDate: body.initialBalanceDate ?? formatDate(current.initial_balance_date),
        targetBalance: body.targetBalance === undefined ? keptTarget : body.targetBalance,
      }),
    });
    await reconcileIfWallet(db, saved, EARLIEST_DATE);
    return saved;
  }, INTERACTIVE_TRANSACTION_OPTIONS);
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
      `A conta '${account.name}' é destino de uma série fixa e não pode ser excluída.`
    );
  }
  await prisma.investment_accounts.delete({ where: { id: account.id } });
}

async function accountHistory(userId, accountId) {
  const portfolio = await loadPortfolio(userId);
  return portfolio.find((entry) => entry.account.id === BigInt(accountId));
}

function toWalletAdjustmentDto(walletEntry) {
  if (!walletEntry) return null;
  return { transactionId: Number(walletEntry.id), flow: walletEntry.flow, amount: money(walletEntry.amount) };
}

function toBalanceUpdateDto(entry, update, walletEntry = null) {
  return {
    id: Number(update.id),
    investmentAccountId: Number(update.investment_account_id),
    date: formatDate(update.date),
    balance: money(update.balance),
    yield: money(positionOf(entry, update.date).yield),
    walletAdjustment: toWalletAdjustmentDto(walletEntry),
  };
}

function reconcileIfWallet(db, account, fromDate) {
  return isWallet(account) ? reconcileWallet(db, account, fromDate) : new Map();
}

async function addBalanceUpdate(userId, accountId, { date, balance }) {
  const account = await findOrThrow(userId, accountId);
  const { saved, walletEntries } = await prisma.$transaction(async (db) => {
    const upserted = await db.balance_updates.upsert({
      where: { investment_account_id_date: { investment_account_id: account.id, date: new Date(date) } },
      create: { investment_account_id: account.id, date: new Date(date), balance },
      update: { balance },
    });
    return { saved: upserted, walletEntries: await reconcileIfWallet(db, account, upserted.date) };
  }, INTERACTIVE_TRANSACTION_OPTIONS);
  const entry = await accountHistory(userId, accountId);
  return toBalanceUpdateDto(entry, saved, walletEntries.get(String(saved.id)));
}

function walletEntriesOf(accountId) {
  return prisma.transactions.findMany({
    where: { balance_update: { investment_account_id: BigInt(accountId) } },
    select: { id: true, flow: true, amount: true, balance_update_id: true },
  });
}

async function listBalanceUpdates(userId, accountId) {
  await findOrThrow(userId, accountId);
  const [entry, walletEntries] = await Promise.all([accountHistory(userId, accountId), walletEntriesOf(accountId)]);
  const walletEntryOf = (update) => walletEntries.find((w) => w.balance_update_id === update.id);
  return [...entry.balanceUpdates].reverse().map((update) => toBalanceUpdateDto(entry, update, walletEntryOf(update)));
}

async function removeBalanceUpdate(userId, accountId, updateId) {
  const account = await findOrThrow(userId, accountId);
  const update = await prisma.balance_updates.findFirst({
    where: { id: BigInt(updateId), investment_account_id: account.id },
  });
  if (!update) throw new NotFoundError('Atualização de saldo não encontrada.');
  await prisma.$transaction(async (db) => {
    await db.balance_updates.delete({ where: { id: update.id } });
    await reconcileIfWallet(db, account, update.date);
  }, INTERACTIVE_TRANSACTION_OPTIONS);
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
