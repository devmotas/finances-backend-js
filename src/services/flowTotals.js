const { Decimal } = require('@prisma/client/runtime/library');
const prisma = require('../db/prisma');
const { FLOW, EXPENSE_GROUP, INVESTMENT_DIRECTION } = require('../domain/constants');
const { formatMonth, firstDay, lastDay } = require('../domain/months');

const EARLIEST_DATE = new Date(Date.UTC(1900, 0, 1));

function emptyTotals() {
  const zero = new Decimal(0);
  return { income: zero, essential: zero, nonEssential: zero, expenses: zero, contributions: zero, withdrawals: zero, count: 0 };
}

function fieldOf(row) {
  if (row.flow === FLOW.INCOME) return 'income';
  if (row.flow === FLOW.EXPENSE) return row.expense_group === EXPENSE_GROUP.ESSENTIAL ? 'essential' : 'nonEssential';
  return row.direction === INVESTMENT_DIRECTION.WITHDRAWAL ? 'withdrawals' : 'contributions';
}

function addRow(totals, row) {
  const field = fieldOf(row);
  const next = { ...totals, [field]: totals[field].plus(row.total), count: totals.count + row.count };
  return { ...next, expenses: next.essential.plus(next.nonEssential) };
}

function groupedRows(userId, from, to) {
  return prisma.$queryRaw`
    SELECT to_char(t.date, 'YYYY-MM') AS month, t.flow, c.expense_group, t.direction,
           SUM(t.amount) AS total, COUNT(*)::int AS count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ${BigInt(userId)} AND t.date >= ${from} AND t.date <= ${to}
    GROUP BY 1, 2, 3, 4`;
}

async function totalsBetween(userId, from, to) {
  const rows = await groupedRows(userId, from ?? EARLIEST_DATE, to);
  return rows.reduce(addRow, emptyTotals());
}

async function monthlyTotals(userId, months) {
  const keys = months.map(formatMonth);
  const rows = await groupedRows(userId, firstDay(months[0]), lastDay(months[months.length - 1]));
  const byMonth = new Map(keys.map((key) => [key, emptyTotals()]));
  rows.forEach((row) => byMonth.set(row.month, addRow(byMonth.get(row.month), row)));
  return keys.map((key) => byMonth.get(key));
}

module.exports = { totalsBetween, monthlyTotals };
