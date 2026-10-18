const { Decimal } = require('@prisma/client/runtime/library');
const { listByMonth } = require('./transactionService');
const { loadPortfolio, positionOf, toAccountWithPositionDto, money } = require('./investmentAccountService');
const { FLOW, INVESTMENT_CHART_WINDOW_MONTHS } = require('../domain/constants');
const { addMonths, lastDay, monthsBetween } = require('../domain/months');

const OPENING_BALANCE_LABEL = 'Saldo inicial';
const OPENING_POINT_PERIOD = 0;
const ZERO = new Decimal(0);

function sum(values) {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}

function portfolioAt(portfolio, until) {
  const positions = portfolio.map((entry) => positionOf(entry, until));
  return {
    perAccount: positions,
    contributions: sum(positions.map((p) => p.contributions)),
    withdrawals: sum(positions.map((p) => p.withdrawals)),
    net: sum(positions.map((p) => p.contributions.minus(p.withdrawals))),
    yield: sum(positions.map((p) => p.yield)),
    position: sum(positions.map((p) => p.position)),
  };
}

function netOf(position) {
  return position.contributions.minus(position.withdrawals);
}

function openingPoint(portfolio) {
  const openingAmounts = portfolio.map((e) => money(e.account.initial_balance));
  const openingTotal = money(sum(portfolio.map((e) => e.account.initial_balance)));
  return {
    year: OPENING_POINT_PERIOD,
    month: OPENING_POINT_PERIOD,
    invested: openingTotal,
    cumulativeWealth: openingTotal,
    yield: 0,
    displayLabel: OPENING_BALANCE_LABEL,
    categoryAmounts: openingAmounts,
    accountPositions: openingAmounts,
  };
}

function monthPoint(portfolio, period) {
  const atEnd = portfolioAt(portfolio, lastDay(period));
  const atPreviousEnd = portfolioAt(portfolio, lastDay(addMonths(period, -1)));
  const accountAmounts = atEnd.perAccount.map((p, i) => money(netOf(p).minus(netOf(atPreviousEnd.perAccount[i]))));
  return {
    year: period.year,
    month: period.month,
    invested: money(atEnd.net.minus(atPreviousEnd.net)),
    cumulativeWealth: money(atEnd.position),
    yield: money(atEnd.yield),
    displayLabel: null,
    categoryAmounts: accountAmounts,
    accountPositions: atEnd.perAccount.map((p) => money(p.position)),
  };
}

function accountView(entry, end, previousEnd) {
  const atEnd = positionOf(entry, end);
  const atPreviousEnd = positionOf(entry, previousEnd);
  return {
    ...toAccountWithPositionDto(entry, end),
    monthContributions: money(atEnd.contributions.minus(atPreviousEnd.contributions)),
    monthWithdrawals: money(atEnd.withdrawals.minus(atPreviousEnd.withdrawals)),
  };
}

function legacyIdOf(account) {
  return Number(account.legacy_category_id ?? account.id);
}

async function monthView(userId, year, month) {
  const selected = { year, month };
  const end = lastDay(selected);
  const previousEnd = lastDay(addMonths(selected, -1));
  const windowStart = addMonths(selected, 1 - INVESTMENT_CHART_WINDOW_MONTHS);

  const allMonthTxs = await listByMonth(userId, year, month);
  const portfolio = await loadPortfolio(userId, end);
  const atEnd = portfolioAt(portfolio, end);
  const atPreviousEnd = portfolioAt(portfolio, previousEnd);
  const accounts = portfolio.map((entry) => accountView(entry, end, previousEnd));

  return {
    summary: {
      monthTotal: money(atEnd.net.minus(atPreviousEnd.net)),
      monthContributions: money(atEnd.contributions.minus(atPreviousEnd.contributions)),
      monthWithdrawals: money(atEnd.withdrawals.minus(atPreviousEnd.withdrawals)),
      accumulatedBeforeMonth: money(atPreviousEnd.net),
      totalThroughMonthEnd: money(atEnd.net),
      openingBalanceTotal: money(sum(portfolio.map((e) => e.account.initial_balance))),
      positionBeforeMonth: money(atPreviousEnd.position),
      positionThroughMonthEnd: money(atEnd.position),
      yieldThroughMonthEnd: money(atEnd.yield),
    },
    accounts,
    transactions: allMonthTxs.filter((t) => t.flow === FLOW.INVESTMENT),
    monthlySeries: [
      openingPoint(portfolio),
      ...monthsBetween(windowStart, selected).map((period) => monthPoint(portfolio, period)),
    ],
    stackAccounts: accounts.map((a) => ({ id: a.id, name: a.name, role: a.role })),
    stackCategories: portfolio.map((e) => ({ id: legacyIdOf(e.account), name: e.account.name })),
    categoryTotalsThroughSelectedMonth: portfolio.map((e, i) => ({
      categoryId: legacyIdOf(e.account),
      accountId: Number(e.account.id),
      name: e.account.name,
      totalThroughMonthEnd: accounts[i].balance,
    })),
  };
}

module.exports = { monthView };
