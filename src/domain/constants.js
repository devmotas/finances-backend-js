const FLOW = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
  INVESTMENT: 'investment',
});

const EXPENSE_GROUP = Object.freeze({
  ESSENTIAL: 'essential',
  NON_ESSENTIAL: 'nonEssential',
});

const SCHEDULE = Object.freeze({
  FIXED: 'fixed',
  VARIABLE: 'variable',
});

const DEFAULT_RECURRENCE_MONTHS = 12;
const DEFAULT_EMERGENCY_FUND_TARGET_MONTHS = 6;
const INVESTMENT_CHART_WINDOW_MONTHS = 12;

module.exports = {
  FLOW,
  EXPENSE_GROUP,
  SCHEDULE,
  DEFAULT_RECURRENCE_MONTHS,
  DEFAULT_EMERGENCY_FUND_TARGET_MONTHS,
  INVESTMENT_CHART_WINDOW_MONTHS,
};
