const { Decimal } = require('@prisma/client/runtime/library');
const { REFERENCE_EXPENSE_WINDOW_MONTHS } = require('./constants');
const { addMonths } = require('./months');

const COVERAGE_DECIMALS = 2;

function referenceWindow(selected) {
  return {
    from: addMonths(selected, -REFERENCE_EXPENSE_WINDOW_MONTHS),
    to: addMonths(selected, -1),
  };
}

function referenceExpense(windowMonths) {
  const active = windowMonths.filter((m) => m.hasActivity);
  if (active.length === 0) return null;
  const total = active.reduce((acc, m) => acc.plus(m.essential), new Decimal(0));
  return total.dividedBy(active.length);
}

function coverageMonths(reserveAmount, reference) {
  if (reference == null || reference.isZero()) return null;
  return new Decimal(reserveAmount).dividedBy(reference).toDecimalPlaces(COVERAGE_DECIMALS).toNumber();
}

module.exports = { referenceWindow, referenceExpense, coverageMonths };
