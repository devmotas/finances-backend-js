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

function projectedBalance(cashBalance, nextTotals, expectedWalletSpending) {
  return cashBalance.plus(netCash(nextTotals)).minus(expectedWalletSpending);
}

module.exports = { netCash, ledgerCash, cashBalanceOf, projectedBalance };
