const { BadRequestError } = require('../errors/AppError');
const { FLOW, SERIES_KIND, SERIES_HORIZON_MONTHS, INVESTMENT_DIRECTION } = require('./constants');
const { addMonthsToDate } = require('../utils/dates');
const { monthOf, addMonths, monthsDiff, minMonth, maxMonth } = require('./months');
const { isWallet } = require('./wallet');

const CENTS_PER_UNIT = 100;
const FIRST_INDEX = 1;
const TRANSFER_FLOW = FLOW.INVESTMENT;
const DESTINATION_MESSAGE = 'Só uma entrada fixa pode ir direto para uma conta de investimento.';
const TRANSFER_DESTINATION_MESSAGE = 'Série sem categoria é uma transferência fixa: informe a Carteira como destino.';
const SERIES_TARGET_MESSAGE = 'Informe a categoria ou a Carteira de destino da série.';
const TRANSFER_AMOUNT_MESSAGE = 'O valor da transferência deve ser maior que zero.';

function horizonMonth(today) {
  return addMonths(monthOf(today), SERIES_HORIZON_MONTHS);
}

function installmentEndMonth(startDate, firstIndex, installmentTotal) {
  return addMonths(monthOf(new Date(startDate)), installmentTotal - firstIndex);
}

function occurrenceDate(series, index) {
  return addMonthsToDate(series.startDate, index - series.firstIndex);
}

function materializationLimit(series, today) {
  const startMonth = monthOf(new Date(series.startDate));
  if (series.kind === SERIES_KIND.INSTALLMENT) return series.endMonth;
  const reachable = maxMonth(horizonMonth(today), startMonth);
  return series.endMonth ? minMonth(series.endMonth, reachable) : reachable;
}

function pendingOccurrences(series, today) {
  const startMonth = monthOf(new Date(series.startDate));
  const limit = materializationLimit(series, today);
  const fromOffset = series.materializedUntil ? monthsDiff(startMonth, series.materializedUntil) + 1 : 0;
  const toOffset = monthsDiff(startMonth, limit);
  const occurrences = [];
  for (let offset = Math.max(fromOffset, 0); offset <= toOffset; offset++) {
    const index = series.firstIndex + offset;
    occurrences.push({ index, date: occurrenceDate(series, index) });
  }
  return occurrences;
}

function splitInstallments(totalAmount, count) {
  const totalCents = Math.round(totalAmount * CENTS_PER_UNIT);
  const baseCents = Math.floor(totalCents / count);
  if (baseCents <= 0) {
    throw new BadRequestError('O valor total é pequeno demais para o número de parcelas.');
  }
  const firstCents = totalCents - baseCents * (count - 1);
  return [firstCents, ...Array(count - 1).fill(baseCents)].map((cents) => cents / CENTS_PER_UNIT);
}

function normalizeSeriesRequest({ kind, amount, totalAmount, installments, installmentTotal }) {
  const resolvedKind = kind ?? (installmentTotal != null ? SERIES_KIND.INSTALLMENT : SERIES_KIND.FIXED);
  if (resolvedKind === SERIES_KIND.FIXED) {
    if (amount == null) throw new BadRequestError('Informe o valor da série.');
    return { kind: resolvedKind, amount, installmentTotal: null, installmentAmounts: null };
  }

  const count = installments ?? installmentTotal;
  if (count == null) throw new BadRequestError('Informe o número de parcelas.');
  if (totalAmount != null) {
    const installmentAmounts = splitInstallments(totalAmount, count);
    return { kind: resolvedKind, amount: installmentAmounts[count - 1], installmentTotal: count, installmentAmounts };
  }
  if (amount == null) throw new BadRequestError('Informe o valor da parcela ou o valor total.');
  return { kind: resolvedKind, amount, installmentTotal: count, installmentAmounts: null };
}

function closingMonthBefore(date) {
  return addMonths(monthOf(date), -1);
}

function endMonthAfterClosing(currentEndMonth, closingMonth) {
  if (currentEndMonth && monthsDiff(currentEndMonth, closingMonth) >= 0) return currentEndMonth;
  return closingMonth;
}

function isTransferFlow(flow) {
  return flow === TRANSFER_FLOW;
}

function seriesFlow(category) {
  return category?.flow ?? TRANSFER_FLOW;
}

function assertTransferAllowed({ kind, amount }, account) {
  if (kind !== SERIES_KIND.FIXED || !account || !isWallet(account)) {
    throw new BadRequestError(TRANSFER_DESTINATION_MESSAGE);
  }
  if (!(amount > 0)) throw new BadRequestError(TRANSFER_AMOUNT_MESSAGE);
}

function assertDestinationAllowed({ kind, flow, amount }, account) {
  if (isTransferFlow(flow)) {
    assertTransferAllowed({ kind, amount }, account);
    return;
  }
  if (kind !== SERIES_KIND.FIXED || flow !== FLOW.INCOME) throw new BadRequestError(DESTINATION_MESSAGE);
}

function pairedContribution(incomeRow, account) {
  return {
    ...incomeRow,
    category_id: account.legacy_category_id,
    investment_account_id: account.id,
    direction: INVESTMENT_DIRECTION.CONTRIBUTION,
    flow: FLOW.INVESTMENT,
  };
}

function withPairedContributions(incomeRows, account) {
  if (!account) return incomeRows;
  return incomeRows.flatMap((row) => [row, pairedContribution(row, account)]);
}

function seriesRows(rows, flow, account) {
  if (isTransferFlow(flow)) return rows.map((row) => pairedContribution(row, account));
  return withPairedContributions(rows, account);
}

module.exports = {
  FIRST_INDEX,
  SERIES_TARGET_MESSAGE,
  horizonMonth,
  installmentEndMonth,
  occurrenceDate,
  materializationLimit,
  pendingOccurrences,
  splitInstallments,
  normalizeSeriesRequest,
  closingMonthBefore,
  endMonthAfterClosing,
  isTransferFlow,
  seriesFlow,
  assertDestinationAllowed,
  withPairedContributions,
  seriesRows,
};
