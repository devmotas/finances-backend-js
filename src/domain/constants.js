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

const SERIES_KIND = Object.freeze({
  FIXED: 'fixed',
  INSTALLMENT: 'installment',
});

const INVESTMENT_DIRECTION = Object.freeze({
  CONTRIBUTION: 'contribution',
  WITHDRAWAL: 'withdrawal',
});

const ACCOUNT_ROLE = Object.freeze({
  INVESTMENT: 'investment',
  RESERVE: 'reserve',
  SHORT_TERM_RESERVE: 'short_term_reserve',
  WALLET: 'wallet',
});

const DEFAULT_RECURRENCE_MONTHS = 12;
const DEFAULT_EMERGENCY_FUND_TARGET_MONTHS = 6;
const INVESTMENT_CHART_WINDOW_MONTHS = 12;
const SERIES_HORIZON_MONTHS = 12;
const REFERENCE_EXPENSE_WINDOW_MONTHS = 6;
const WALLET_SPENDING_WINDOW_MONTHS = 3;

module.exports = {
  FLOW,
  EXPENSE_GROUP,
  SCHEDULE,
  SERIES_KIND,
  INVESTMENT_DIRECTION,
  ACCOUNT_ROLE,
  DEFAULT_RECURRENCE_MONTHS,
  DEFAULT_EMERGENCY_FUND_TARGET_MONTHS,
  INVESTMENT_CHART_WINDOW_MONTHS,
  SERIES_HORIZON_MONTHS,
  REFERENCE_EXPENSE_WINDOW_MONTHS,
  WALLET_SPENDING_WINDOW_MONTHS,
};
