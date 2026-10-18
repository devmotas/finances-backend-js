const { Decimal } = require('@prisma/client/runtime/library');
const { INVESTMENT_DIRECTION } = require('./constants');

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

function bookValue(initialBalance, movements) {
  return movements.reduce((acc, m) => acc.plus(signedAmount(m.direction, m.amount)), new Decimal(initialBalance));
}

function latestUpdateUntil(balanceUpdates, until) {
  return balanceUpdates
    .filter((u) => u.date <= until)
    .reduce((latest, u) => (latest == null || u.date > latest.date ? u : latest), null);
}

function yieldAt(initialBalance, movements, update) {
  if (update == null) return ZERO;
  const bookAtUpdate = bookValue(initialBalance, movements.filter((m) => m.date <= update.date));
  return new Decimal(update.balance).minus(bookAtUpdate);
}

function accountPosition({ initialBalance, movements, balanceUpdates }, until) {
  const movementsUntil = movements.filter((m) => m.date <= until);
  const lastBalanceUpdate = latestUpdateUntil(balanceUpdates, until);
  const book = bookValue(initialBalance, movementsUntil);
  const accountYield = yieldAt(initialBalance, movementsUntil, lastBalanceUpdate);
  return {
    contributions: sumDirection(movementsUntil, INVESTMENT_DIRECTION.CONTRIBUTION),
    withdrawals: sumDirection(movementsUntil, INVESTMENT_DIRECTION.WITHDRAWAL),
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
