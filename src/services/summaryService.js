const { Decimal } = require('@prisma/client/runtime/library');
const prisma = require('../db/prisma');
const { NotFoundError } = require('../errors/AppError');
const { netCash, ledgerCash, cashBalanceOf, projectedBalance } = require('../domain/balances');
const { ACCOUNT_ROLE } = require('../domain/constants');
const { addMonths, firstDay, lastDay, monthsBetween } = require('../domain/months');
const { missingToTarget } = require('../domain/investmentPosition');
const { referenceWindow, referenceExpense, coverageMonths } = require('../domain/reserve');
const { isWallet, walletSpendingWindow, averageWalletSpending, remainingWalletSpending } = require('../domain/wallet');
const { totalsBetween, monthlyTotals } = require('./flowTotals');
const { topUpSeries } = require('./seriesService');
const { loadPortfolio, positionOf, money } = require('./investmentAccountService');

const RESERVE_ROLES = Object.freeze([ACCOUNT_ROLE.RESERVE, ACCOUNT_ROLE.SHORT_TERM_RESERVE]);
const ZERO = new Decimal(0);

function sum(values) {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}

function accountPositions(portfolio, until) {
  return portfolio.map((entry) => ({ account: entry.account, ...positionOf(entry, until) }));
}

function shortTermReserve(positions) {
  const shortTerm = positions.filter((p) => p.account.role === ACCOUNT_ROLE.SHORT_TERM_RESERVE);
  const withTarget = shortTerm.filter((p) => p.account.target_balance != null);
  const hasTarget = withTarget.length > 0;
  return {
    balance: sum(shortTerm.map((p) => p.position)),
    target: hasTarget ? sum(withTarget.map((p) => p.account.target_balance)) : null,
    missing: hasTarget ? sum(withTarget.map((p) => missingToTarget(p.account.target_balance, p.position))) : null,
  };
}

function buildReserve(positions, windowTotals, targetMonths) {
  const amount = sum(positions.filter((p) => RESERVE_ROLES.includes(p.account.role)).map((p) => p.position));
  const reference = referenceExpense(
    windowTotals.map((t) => ({ essential: t.essential, hasActivity: t.count > 0 }))
  );
  const shortTerm = shortTermReserve(positions);
  return {
    amount: money(amount),
    referenceExpense: money(reference),
    coverageMonths: coverageMonths(amount, reference),
    targetMonths,
    shortTermBalance: money(shortTerm.balance),
    shortTermTarget: money(shortTerm.target),
    shortTermMissing: money(shortTerm.missing),
  };
}

function buildNextMonth(next, nextTotals, cashBalance, walletSpendingTotals) {
  const committedInvestment = nextTotals.contributions.minus(nextTotals.withdrawals);
  const expectedWalletSpending = remainingWalletSpending(averageWalletSpending(walletSpendingTotals), nextTotals);
  return {
    year: next.year,
    month: next.month,
    committedIncome: money(nextTotals.income),
    committedEssential: money(nextTotals.essential),
    committedNonEssential: money(nextTotals.nonEssential),
    committedInvestment: money(committedInvestment),
    expectedWalletSpending: money(expectedWalletSpending),
    projectedBalance: money(projectedBalance(cashBalance, nextTotals, expectedWalletSpending)),
  };
}

async function summary(userId, year, month) {
  const uid = BigInt(userId);
  const user = await prisma.users.findUnique({ where: { id: uid } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');
  await topUpSeries(uid);

  const selected = { year, month };
  const next = addMonths(selected, 1);
  const window = referenceWindow(selected);
  const walletWindow = walletSpendingWindow(selected);
  const end = lastDay(selected);

  const cumulative = await totalsBetween(uid, null, end);
  const monthTotals = await totalsBetween(uid, firstDay(selected), end);
  const nextTotals = await totalsBetween(uid, firstDay(next), lastDay(next));
  const windowTotals = await monthlyTotals(uid, monthsBetween(window.from, window.to));
  const walletSpendingTotals = await monthlyTotals(uid, monthsBetween(walletWindow.from, walletWindow.to));
  const portfolio = await loadPortfolio(uid, end);

  const allPositions = accountPositions(portfolio, end);
  const positions = allPositions.filter((p) => !isWallet(p.account));
  const walletBalances = allPositions.filter((p) => isWallet(p.account)).map((p) => p.position);
  const ledgerBalance = ledgerCash(cumulative);
  const cashBalance = cashBalanceOf(ledgerBalance, walletBalances);
  const investedPosition = sum(positions.map((p) => p.position));
  const reserve = buildReserve(positions, windowTotals, user.emergency_fund_target_months);

  return {
    year,
    month,
    totalIncome: money(monthTotals.income),
    totalEssential: money(monthTotals.essential),
    totalNonEssential: money(monthTotals.nonEssential),
    totalExpenses: money(monthTotals.expenses),
    totalContributions: money(monthTotals.contributions),
    totalWithdrawals: money(monthTotals.withdrawals),
    netInvested: money(monthTotals.contributions.minus(monthTotals.withdrawals)),
    monthBalance: money(netCash(monthTotals)),
    cashBalance: money(cashBalance),
    ledgerBalance: money(ledgerBalance),
    walletBalance: money(sum(walletBalances)),
    investedPosition: money(investedPosition),
    investedYield: money(sum(positions.map((p) => p.yield))),
    investedBookValue: money(sum(positions.map((p) => p.book))),
    reserve,
    nextMonth: buildNextMonth(next, nextTotals, cashBalance, walletSpendingTotals),
    accumulatedBalance: money(cashBalance),
    openingBalanceAmount: money(sum(positions.map((p) => p.account.initial_balance))),
    monthExpenseTotal: money(monthTotals.expenses),
    cumulativeInvestmentContributions: money(cumulative.contributions.minus(cumulative.withdrawals)),
    totalEmergencyReserve: reserve.amount,
    emergencyFundTargetMonths: user.emergency_fund_target_months,
    monthsOfReserveCovered: reserve.coverageMonths,
  };
}

module.exports = { summary };
