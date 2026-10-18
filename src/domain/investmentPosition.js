const { Decimal } = require('@prisma/client/runtime/library');
const { INVESTMENT_DIRECTION, FLOW } = require('./constants');

const ZERO = new Decimal(0);

function signedAmount(direction, amount) {
  const value = new Decimal(amount);
  return direction === INVESTMENT_DIRECTION.WITHDRAWAL ? value.negated() : value;
}

function sumDirection(movements, direction) {
  return movements
    .filter((m) => m.direction === direction)
    .reduce((acc, m) => acc.plus(m.amount), ZERO);
}

function movementValue(movement) {
  if (movement.flow === FLOW.EXPENSE) return new Decimal(movement.amount).negated();
  if (movement.flow === FLOW.INCOME) return new Decimal(movement.amount);
  return signedAmount(movement.direction, movement.amount);
}

function openingAt({ initialBalance, initialBalanceDate }, until) {
  return initialBalanceDate && until < initialBalanceDate ? ZERO : new Decimal(initialBalance);
}

function bookAt(account, movements, until) {
  return movements
    .filter((m) => m.date <= until)
    .reduce((acc, m) => acc.plus(movementValue(m)), openingAt(account, until));
}

function latestUpdateUntil(balanceUpdates, until) {
  return balanceUpdates
    .filter((u) => u.date <= until)
    .reduce((latest, u) => (latest == null || u.date > latest.date ? u : latest), null);
}

function yieldAt(account, movements, update) {
  if (update == null) return ZERO;
  return new Decimal(update.balance).minus(bookAt(account, movements, update.date));
}

function walletSpending(movements) {
  return movements
    .filter((m) => m.flow === FLOW.EXPENSE || m.flow === FLOW.INCOME)
    .reduce((acc, m) => acc.minus(movementValue(m)), ZERO);
}

function accountPosition(account, until) {
  const movementsUntil = account.movements.filter((m) => m.date <= until);
  const lastBalanceUpdate = latestUpdateUntil(account.balanceUpdates, until);
  const book = bookAt(account, movementsUntil, until);
  const accountYield = yieldAt(account, movementsUntil, lastBalanceUpdate);
  return {
    contributions: sumDirection(movementsUntil, INVESTMENT_DIRECTION.CONTRIBUTION),
    withdrawals: sumDirection(movementsUntil, INVESTMENT_DIRECTION.WITHDRAWAL),
    spending: walletSpending(movementsUntil),
    book,
    yield: accountYield,
    position: book.plus(accountYield),
    lastBalanceUpdate,
  };
}

function missingToTarget(targetBalance, balance) {
  if (targetBalance == null) return null;
  return Decimal.max(ZERO, new Decimal(targetBalance).minus(balance));
}

module.exports = { signedAmount, accountPosition, missingToTarget };
