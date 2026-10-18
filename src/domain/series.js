const { BadRequestError } = require('../errors/AppError');
const { SERIES_KIND, SERIES_HORIZON_MONTHS } = require('./constants');
const { addMonthsToDate } = require('../utils/dates');
const { monthOf, addMonths, monthsDiff, minMonth, maxMonth } = require('./months');

const CENTS_PER_UNIT = 100;
const FIRST_INDEX = 1;

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

module.exports = {
  FIRST_INDEX,
  horizonMonth,
  installmentEndMonth,
  occurrenceDate,
  materializationLimit,
  pendingOccurrences,
  splitInstallments,
  normalizeSeriesRequest,
  closingMonthBefore,
  endMonthAfterClosing,
};
