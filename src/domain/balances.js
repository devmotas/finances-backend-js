const { Decimal } = require('@prisma/client/runtime/library');

function netCash({ income, expenses, contributions, withdrawals }) {
  return income.minus(expenses).minus(contributions).plus(withdrawals);
}

function ledgerCash(totals) {
  return netCash(totals)
    .minus(totals.walletIncome)
    .plus(totals.walletExpenses)
    .minus(totals.transfersIn)
    .plus(totals.transfersOut);
}

function cashBalanceOf(ledger, walletBalances) {
  return walletBalances.reduce((acc, balance) => acc.plus(balance), new Decimal(ledger));
}

function ledgerFlows(totals) {
  return {
    income: totals.income.minus(totals.walletIncome),
    essential: totals.essential,
    nonEssential: totals.nonEssential.minus(totals.walletExpenses),
    bills: totals.expenses.minus(totals.walletExpenses),
    investments: totals.contributions.minus(totals.withdrawals),
    walletTransfers: totals.transfersIn.minus(totals.transfersOut),
  };
}

function monthClosing(totals) {
  const flows = ledgerFlows(totals);
  return { ...flows, balance: ledgerCash(totals) };
}

function nextMonthPlan(ledgerBalance, nextTotals) {
  const flows = ledgerFlows(nextTotals);
  const availableForWallet = new Decimal(ledgerBalance).plus(flows.income).minus(flows.bills).minus(flows.investments);
  return {
    ...flows,
    availableForWallet,
    plannedWalletTransfer: flows.walletTransfers,
    projectedClosing: availableForWallet.minus(flows.walletTransfers),
  };
}

module.exports = { netCash, ledgerCash, cashBalanceOf, monthClosing, nextMonthPlan };
