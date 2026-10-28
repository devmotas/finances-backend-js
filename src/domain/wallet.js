const { Decimal } = require('@prisma/client/runtime/library');
const { ACCOUNT_ROLE, FLOW, EXPENSE_GROUP, WALLET_SPENDING_WINDOW_MONTHS } = require('./constants');
const { addMonths } = require('./months');

const ZERO = new Decimal(0);

const WALLET_CATEGORY = Object.freeze({
  [FLOW.EXPENSE]: Object.freeze({ name: 'Gastos da carteira', flow: FLOW.EXPENSE, expenseGroup: EXPENSE_GROUP.NON_ESSENTIAL }),
  [FLOW.INCOME]: Object.freeze({ name: 'Entrada na carteira', flow: FLOW.INCOME, expenseGroup: null }),
});

function isWallet(account) {
  return account.role === ACCOUNT_ROLE.WALLET;
}

function walletAdjustment(realBalance, expectedBalance) {
  const difference = new Decimal(realBalance).minus(expectedBalance);
  if (difference.isZero()) return null;
  return { flow: difference.isNegative() ? FLOW.EXPENSE : FLOW.INCOME, amount: difference.abs() };
}

function walletSpendingWindow(selected) {
  return { from: addMonths(selected, -WALLET_SPENDING_WINDOW_MONTHS), to: addMonths(selected, -1) };
}

function netWalletSpending(totals) {
  return totals.walletExpenses.minus(totals.walletIncome);
}

function averageWalletSpending(windowTotals) {
  const withEntries = windowTotals.filter((t) => t.walletCount > 0);
  if (withEntries.length === 0) return ZERO;
  const total = withEntries.reduce((acc, t) => acc.plus(netWalletSpending(t)), ZERO);
  return Decimal.max(ZERO, total.dividedBy(withEntries.length));
}

function remainingWalletSpending(average, monthTotals) {
  return Decimal.max(ZERO, average.minus(netWalletSpending(monthTotals)));
}

function netTransfersToWallet(totals) {
  return Decimal.max(ZERO, totals.transfersIn.minus(totals.transfersOut));
}

function baselineWalletSpending(windowTotals, selectedTotals) {
  const hasHistory = windowTotals.some((t) => t.walletCount > 0);
  if (hasHistory) return averageWalletSpending(windowTotals);
  return Decimal.max(ZERO, netWalletSpending(selectedTotals));
}

function expectedWalletSpending(windowTotals, selectedTotals, nextTotals) {
  const baseline = Decimal.max(baselineWalletSpending(windowTotals, selectedTotals), netTransfersToWallet(nextTotals));
  return remainingWalletSpending(baseline, nextTotals);
}

module.exports = {
  WALLET_CATEGORY,
  isWallet,
  walletAdjustment,
  walletSpendingWindow,
  averageWalletSpending,
  remainingWalletSpending,
  expectedWalletSpending,
};
