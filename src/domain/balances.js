function computeBalances({ opening, income, expense, investment }) {
  const cashBalance = income.minus(expense).minus(investment);
  const investedPosition = opening.plus(investment);
  return {
    cashBalance,
    investedPosition,
    totalReserve: cashBalance.plus(investedPosition),
  };
}

module.exports = { computeBalances };
