const { accountPosition } = require('../domain/investmentPosition');
const { WALLET_CATEGORY, walletAdjustment } = require('../domain/wallet');

const MOVEMENT_SELECT = Object.freeze({ id: true, date: true, direction: true, amount: true, flow: true });

async function walletCategory(db, userId, flow) {
  const { name, expenseGroup } = WALLET_CATEGORY[flow];
  const existing = await db.categories.findFirst({
    where: { user_id: userId, flow, name: { equals: name, mode: 'insensitive' } },
  });
  if (existing) return existing;
  return db.categories.create({
    data: { user_id: userId, name, flow, expense_group: expenseGroup, opening_balance_amount: 0 },
  });
}

function walletMovements(db, accountId) {
  return db.transactions.findMany({
    where: { OR: [{ investment_account_id: accountId }, { balance_update: { investment_account_id: accountId } }] },
    select: MOVEMENT_SELECT,
  });
}

function expectedBalance(account, movements, date) {
  const wallet = {
    initialBalance: account.initial_balance,
    initialBalanceDate: account.initial_balance_date,
    movements,
    balanceUpdates: [],
  };
  return accountPosition(wallet, date).book;
}

async function createEntry(db, account, update, adjustment) {
  const category = await walletCategory(db, account.user_id, adjustment.flow);
  return db.transactions.create({
    data: {
      user_id: account.user_id,
      category_id: category.id,
      flow: adjustment.flow,
      amount: adjustment.amount,
      date: update.date,
      balance_update_id: update.id,
    },
    select: MOVEMENT_SELECT,
  });
}

async function reconcileWallet(db, account, fromDate) {
  const updates = await db.balance_updates.findMany({
    where: { investment_account_id: account.id, date: { gte: fromDate } },
    orderBy: { date: 'asc' },
  });
  await db.transactions.deleteMany({ where: { balance_update_id: { in: updates.map((u) => u.id) } } });
  const movements = await walletMovements(db, account.id);
  const entries = new Map();
  for (const update of updates) {
    const adjustment = walletAdjustment(update.balance, expectedBalance(account, movements, update.date));
    if (!adjustment) continue;
    const entry = await createEntry(db, account, update, adjustment);
    movements.push(entry);
    entries.set(String(update.id), entry);
  }
  return entries;
}

module.exports = { reconcileWallet };
