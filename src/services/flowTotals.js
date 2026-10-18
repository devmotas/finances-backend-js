const prisma = require('../db/prisma');
const { ACCOUNT_ROLE } = require('../domain/constants');
const { emptyTotals, addRow } = require('../domain/totals');
const { formatMonth, firstDay, lastDay } = require('../domain/months');

const EARLIEST_DATE = new Date(Date.UTC(1900, 0, 1));

function groupedRows(userId, from, to) {
  return prisma.$queryRaw`
    SELECT to_char(t.date, 'YYYY-MM') AS month, t.flow, c.expense_group, t.direction,
           COALESCE(a.role = ${ACCOUNT_ROLE.WALLET}, false) AS to_wallet,
           t.balance_update_id IS NOT NULL AS from_wallet,
           SUM(t.amount) AS total, COUNT(*)::int AS count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN investment_accounts a ON a.id = t.investment_account_id
    WHERE t.user_id = ${BigInt(userId)} AND t.date >= ${from} AND t.date <= ${to}
    GROUP BY 1, 2, 3, 4, 5, 6`;
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
