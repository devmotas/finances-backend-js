const { Decimal } = require('@prisma/client/runtime/library');
const prisma = require('../db/prisma');
const { listByMonth } = require('./transactionService');

function addYM(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function firstDay(year, month) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0));
}

function ymLte(a, b) {
  return a.year < b.year || (a.year === b.year && a.month <= b.month);
}

function toNum(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(val.toString());
}

function round2(n) {
  return parseFloat(n.toFixed(2));
}

async function monthView(userId, year, month) {
  const uid = BigInt(userId);
  const windowStart = addYM(year, month, -11);
  const windowEnd = { year, month };

  // Transações do mês filtradas por investment (via DTO do transactionService)
  const allMonthTxs = await listByMonth(userId, year, month);
  const monthTransactions = allMonthTxs.filter((t) => t.flow === 'investment');
  const monthTotal = monthTransactions.reduce((acc, t) => acc + t.amount, 0);

  const [openingAgg, accBeforeAgg, priorInWindowAgg, windowTxsRaw] = await Promise.all([
    prisma.categories.aggregate({
      _sum: { opening_balance_amount: true },
      where: { user_id: uid, flow: 'investment' },
    }),
    prisma.transactions.aggregate({
      _sum: { amount: true },
      where: { user_id: uid, flow: 'investment', date: { lt: firstDay(year, month) } },
    }),
    prisma.transactions.aggregate({
      _sum: { amount: true },
      where: {
        user_id: uid,
        flow: 'investment',
        date: { lt: firstDay(windowStart.year, windowStart.month) },
      },
    }),
    prisma.transactions.findMany({
      where: {
        user_id: uid,
        flow: 'investment',
        date: {
          gte: firstDay(windowStart.year, windowStart.month),
          lte: lastDay(windowEnd.year, windowEnd.month),
        },
      },
      include: { categories: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const openingBalanceTotal = toNum(openingAgg._sum.opening_balance_amount);
  const accumulatedBeforeMonth = toNum(accBeforeAgg._sum.amount);
  const priorInWindow = toNum(priorInWindowAgg._sum.amount);

  const totalThroughMonthEnd = accumulatedBeforeMonth + monthTotal;
  const positionBeforeMonth = openingBalanceTotal + accumulatedBeforeMonth;
  const positionThroughMonthEnd = openingBalanceTotal + totalThroughMonthEnd;

  // Categorias de investimento ordenadas por nome depois id
  const investmentCats = await prisma.categories.findMany({
    where: { user_id: uid, flow: 'investment' },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  const stackCategories = investmentCats.map((c) => ({ id: Number(c.id), name: c.name }));
  const openingVec = investmentCats.map((c) => toNum(c.opening_balance_amount));
  const openingTotal = openingVec.reduce((a, b) => a + b, 0);

  const monthlySeries = [
    {
      year: 0,
      month: 0,
      invested: round2(openingTotal),
      cumulativeWealth: round2(openingBalanceTotal),
      displayLabel: 'Saldo inicial',
      categoryAmounts: openingVec.map(round2),
    },
  ];

  let cursor = { ...windowStart };
  let runningInWindow = 0;

  while (ymLte(cursor, windowEnd)) {
    const from = firstDay(cursor.year, cursor.month);
    const to = lastDay(cursor.year, cursor.month);

    const catVec = investmentCats.map((cat) => {
      const catTotal = windowTxsRaw
        .filter((tx) => tx.category_id === cat.id && tx.date >= from && tx.date <= to)
        .reduce((acc, tx) => acc + toNum(tx.amount), 0);
      return round2(catTotal);
    });

    const invested = catVec.reduce((a, b) => a + b, 0);
    runningInWindow += invested;

    monthlySeries.push({
      year: cursor.year,
      month: cursor.month,
      invested: round2(invested),
      cumulativeWealth: round2(openingBalanceTotal + priorInWindow + runningInWindow),
      displayLabel: null,
      categoryAmounts: catVec,
    });

    cursor = addYM(cursor.year, cursor.month, 1);
  }

  const endSelected = lastDay(year, month);
  const categoryTotals = await Promise.all(
    investmentCats.map(async (cat) => {
      const agg = await prisma.transactions.aggregate({
        _sum: { amount: true },
        where: {
          user_id: uid,
          flow: 'investment',
          category_id: cat.id,
          date: { lte: endSelected },
        },
      });
      const contrib = toNum(agg._sum.amount);
      return {
        categoryId: Number(cat.id),
        name: cat.name,
        totalThroughMonthEnd: round2(toNum(cat.opening_balance_amount) + contrib),
      };
    })
  );

  return {
    summary: {
      monthTotal: round2(monthTotal),
      accumulatedBeforeMonth: round2(accumulatedBeforeMonth),
      totalThroughMonthEnd: round2(totalThroughMonthEnd),
      openingBalanceTotal: round2(openingBalanceTotal),
      positionBeforeMonth: round2(positionBeforeMonth),
      positionThroughMonthEnd: round2(positionThroughMonthEnd),
    },
    transactions: monthTransactions,
    monthlySeries,
    stackCategories,
    categoryTotalsThroughSelectedMonth: categoryTotals,
  };
}

module.exports = { monthView };
