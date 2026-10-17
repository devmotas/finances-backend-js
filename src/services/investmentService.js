const prisma = require('../db/prisma');
const { listByMonth } = require('./transactionService');
const { FLOW, INVESTMENT_CHART_WINDOW_MONTHS } = require('../domain/constants');

const OPENING_BALANCE_LABEL = 'Saldo inicial';
const OPENING_POINT_PERIOD = 0;
const CENTS_DIGITS = 2;

function addMonths({ year, month }, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function firstDay({ year, month }) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function lastDay({ year, month }) {
  return new Date(Date.UTC(year, month, 0));
}

function monthKey({ year, month }) {
  return `${year}-${month}`;
}

function monthsBetween(start, end) {
  const months = [];
  for (let cursor = start; firstDay(cursor) <= firstDay(end); cursor = addMonths(cursor, 1)) {
    months.push(cursor);
  }
  return months;
}

function toNumber(value) {
  return value == null ? 0 : Number(value);
}

function round2(n) {
  return Number(n.toFixed(CENTS_DIGITS));
}

function sumOf(values) {
  return values.reduce((acc, v) => acc + v, 0);
}

async function sumInvestments(userId, dateFilter) {
  const agg = await prisma.transactions.aggregate({
    _sum: { amount: true },
    where: { user_id: userId, flow: FLOW.INVESTMENT, date: dateFilter },
  });
  return toNumber(agg._sum.amount);
}

async function monthlyTotalsByCategory(userId, from, to) {
  const rows = await prisma.$queryRaw`
    SELECT category_id, EXTRACT(YEAR FROM date)::int AS year, EXTRACT(MONTH FROM date)::int AS month,
           SUM(amount) AS total
    FROM transactions
    WHERE user_id = ${userId} AND flow = ${FLOW.INVESTMENT} AND date >= ${from} AND date <= ${to}
    GROUP BY category_id, year, month`;
  return new Map(rows.map((r) => [`${r.category_id}:${monthKey(r)}`, toNumber(r.total)]));
}

async function totalsByCategoryUntil(userId, end) {
  const groups = await prisma.transactions.groupBy({
    by: ['category_id'],
    _sum: { amount: true },
    where: { user_id: userId, flow: FLOW.INVESTMENT, date: { lte: end } },
  });
  return new Map(groups.map((g) => [g.category_id, toNumber(g._sum.amount)]));
}

function buildMonthlySeries({ categories, months, monthlyTotals, openingTotal, investedBeforeWindow }) {
  const openingAmounts = categories.map((c) => toNumber(c.opening_balance_amount));
  const series = [
    {
      year: OPENING_POINT_PERIOD,
      month: OPENING_POINT_PERIOD,
      invested: round2(sumOf(openingAmounts)),
      cumulativeWealth: round2(openingTotal),
      displayLabel: OPENING_BALANCE_LABEL,
      categoryAmounts: openingAmounts.map(round2),
    },
  ];

  let investedInWindow = 0;
  for (const period of months) {
    const categoryAmounts = categories.map((c) =>
      round2(monthlyTotals.get(`${c.id}:${monthKey(period)}`) ?? 0)
    );
    const invested = sumOf(categoryAmounts);
    investedInWindow += invested;
    series.push({
      year: period.year,
      month: period.month,
      invested: round2(invested),
      cumulativeWealth: round2(openingTotal + investedBeforeWindow + investedInWindow),
      displayLabel: null,
      categoryAmounts,
    });
  }
  return series;
}

async function monthView(userId, year, month) {
  const uid = BigInt(userId);
  const selected = { year, month };
  const windowStart = addMonths(selected, 1 - INVESTMENT_CHART_WINDOW_MONTHS);

  const [allMonthTxs, categories, openingAgg, investedBeforeMonth, investedBeforeWindow, monthlyTotals, categoryContributions] =
    await Promise.all([
      listByMonth(userId, year, month),
      prisma.categories.findMany({
        where: { user_id: uid, flow: FLOW.INVESTMENT },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.categories.aggregate({
        _sum: { opening_balance_amount: true },
        where: { user_id: uid, flow: FLOW.INVESTMENT },
      }),
      sumInvestments(uid, { lt: firstDay(selected) }),
      sumInvestments(uid, { lt: firstDay(windowStart) }),
      monthlyTotalsByCategory(uid, firstDay(windowStart), lastDay(selected)),
      totalsByCategoryUntil(uid, lastDay(selected)),
    ]);

  const monthTransactions = allMonthTxs.filter((t) => t.flow === FLOW.INVESTMENT);
  const monthTotal = sumOf(monthTransactions.map((t) => t.amount));
  const openingTotal = toNumber(openingAgg._sum.opening_balance_amount);
  const totalThroughMonthEnd = investedBeforeMonth + monthTotal;

  return {
    summary: {
      monthTotal: round2(monthTotal),
      accumulatedBeforeMonth: round2(investedBeforeMonth),
      totalThroughMonthEnd: round2(totalThroughMonthEnd),
      openingBalanceTotal: round2(openingTotal),
      positionBeforeMonth: round2(openingTotal + investedBeforeMonth),
      positionThroughMonthEnd: round2(openingTotal + totalThroughMonthEnd),
    },
    transactions: monthTransactions,
    monthlySeries: buildMonthlySeries({
      categories,
      months: monthsBetween(windowStart, selected),
      monthlyTotals,
      openingTotal,
      investedBeforeWindow,
    }),
    stackCategories: categories.map((c) => ({ id: Number(c.id), name: c.name })),
    categoryTotalsThroughSelectedMonth: categories.map((c) => ({
      categoryId: Number(c.id),
      name: c.name,
      totalThroughMonthEnd: round2(toNumber(c.opening_balance_amount) + (categoryContributions.get(c.id) ?? 0)),
    })),
  };
}

module.exports = { monthView };
