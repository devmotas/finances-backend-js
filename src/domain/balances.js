// Saldos acumulados até uma data. O saldo inicial das categorias de investimento é dinheiro
// já investido, então entra no patrimônio investido e não no caixa.
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
