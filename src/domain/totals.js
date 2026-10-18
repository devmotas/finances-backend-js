const { Decimal } = require('@prisma/client/runtime/library');
const { FLOW, EXPENSE_GROUP, INVESTMENT_DIRECTION } = require('./constants');

const AMOUNT_FIELDS = Object.freeze([
  'income',
  'essential',
  'nonEssential',
  'expenses',
  'contributions',
  'withdrawals',
  'transfersIn',
  'transfersOut',
  'walletIncome',
  'walletExpenses',
]);

function emptyTotals() {
  const zero = new Decimal(0);
  return { ...Object.fromEntries(AMOUNT_FIELDS.map((field) => [field, zero])), count: 0, walletCount: 0 };
}

function movementField(row) {
  const isWithdrawal = row.direction === INVESTMENT_DIRECTION.WITHDRAWAL;
  if (row.to_wallet) return isWithdrawal ? 'transfersOut' : 'transfersIn';
  return isWithdrawal ? 'withdrawals' : 'contributions';
}

function fieldOf(row) {
  if (row.flow === FLOW.INCOME) return 'income';
  if (row.flow === FLOW.EXPENSE) return row.expense_group === EXPENSE_GROUP.ESSENTIAL ? 'essential' : 'nonEssential';
  return movementField(row);
}

function walletFieldOf(row) {
  if (!row.from_wallet) return null;
  return row.flow === FLOW.INCOME ? 'walletIncome' : 'walletExpenses';
}

function plus(totals, field, amount) {
  return field ? { ...totals, [field]: totals[field].plus(amount) } : totals;
}

function addRow(totals, row) {
  const withField = plus(totals, fieldOf(row), row.total);
  const next = plus(withField, walletFieldOf(row), row.total);
  return {
    ...next,
    expenses: next.essential.plus(next.nonEssential),
    count: next.count + row.count,
    walletCount: next.walletCount + (row.from_wallet ? row.count : 0),
  };
}

module.exports = { emptyTotals, addRow };
