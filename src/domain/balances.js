function netCash({ income, expenses, contributions, withdrawals }) {
  return income.minus(expenses).minus(contributions).plus(withdrawals);
}

module.exports = { netCash };
