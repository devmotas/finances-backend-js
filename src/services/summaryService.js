const { Decimal } = require('@prisma/client/runtime/library');
const prisma = require('../db/prisma');
const { NotFoundError } = require('../errors/AppError');

async function summary(userId, year, month) {
  const end = new Date(Date.UTC(year, month, 0));
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const uid = BigInt(userId);

  const user = await prisma.users.findUnique({ where: { id: uid } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');

  const [openingAgg, incomeAgg, expenseAgg, investmentAgg, monthExpenseAgg] = await Promise.all([
    prisma.categories.aggregate({
      _sum: { opening_balance_amount: true },
      where: { user_id: uid, flow: 'investment' },
    }),
    prisma.transactions.aggregate({
      _sum: { amount: true },
      where: { user_id: uid, flow: 'income', date: { lte: end } },
    }),
    prisma.transactions.aggregate({
      _sum: { amount: true },
      where: { user_id: uid, flow: 'expense', date: { lte: end } },
    }),
    prisma.transactions.aggregate({
      _sum: { amount: true },
      where: { user_id: uid, flow: 'investment', date: { lte: end } },
    }),
    prisma.transactions.aggregate({
      _sum: { amount: true },
      where: { user_id: uid, flow: 'expense', date: { gte: monthStart, lte: end } },
    }),
  ]);

  const opening = new Decimal(openingAgg._sum.opening_balance_amount ?? 0);
  const incomeTotal = new Decimal(incomeAgg._sum.amount ?? 0);
  const expenseTotal = new Decimal(expenseAgg._sum.amount ?? 0);
  const investmentTotal = new Decimal(investmentAgg._sum.amount ?? 0);
  const monthExpenseTotal = new Decimal(monthExpenseAgg._sum.amount ?? 0);

  const accumulatedBalance = incomeTotal.minus(expenseTotal).minus(investmentTotal).plus(opening);
  const totalEmergencyReserve = accumulatedBalance.plus(investmentTotal);

  const monthsCovered = monthExpenseTotal.isZero()
    ? null
    : totalEmergencyReserve.dividedBy(monthExpenseTotal).toDecimalPlaces(2).toNumber();

  return {
    year,
    month,
    accumulatedBalance: accumulatedBalance.toDecimalPlaces(2).toNumber(),
    openingBalanceAmount: opening.toDecimalPlaces(2).toNumber(),
    monthExpenseTotal: monthExpenseTotal.toDecimalPlaces(2).toNumber(),
    cumulativeInvestmentContributions: investmentTotal.toDecimalPlaces(2).toNumber(),
    totalEmergencyReserve: totalEmergencyReserve.toDecimalPlaces(2).toNumber(),
    emergencyFundTargetMonths: user.emergency_fund_target_months,
    monthsOfReserveCovered: monthsCovered,
  };
}

module.exports = { summary };
