const { Decimal } = require('@prisma/client/runtime/library');
const { ACCOUNT_ROLE, FLOW, EXPENSE_GROUP, WALLET_SPENDING_WINDOW_MONTHS } = require('./constants');
const { addMonths } = require('./months');

const ZERO = new Decimal(0);

const WALLET_CATEGORY = Object.freeze({
  [FLOW.EXPENSE]: Object.freeze({ name: 'Gastos da carteira', flow: FLOW.EXPENSE, expenseGroup: EXPENSE_GROUP.NON_ESSENTIAL }),
  [FLOW.INCOME]: Object.freeze({ name: 'Entrada na carteira', flow: FLOW.INCOME, expenseGroup: null }),
});

const WALLET_CATEGORY_MESSAGE =
  'Esta categoria é preenchida pela atualização de saldo da Carteira. Use a aba Carteira para registrar gastos dela.';

function isWalletCategory(category) {
  const managed = WALLET_CATEGORY[category.flow];
  return managed != null && category.name.toLowerCase() === managed.name.toLowerCase();
}

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

module.exports = {
  WALLET_CATEGORY,
  WALLET_CATEGORY_MESSAGE,
  isWalletCategory,
  isWallet,
  walletAdjustment,
  walletSpendingWindow,
  netWalletSpending,
  averageWalletSpending,
};
