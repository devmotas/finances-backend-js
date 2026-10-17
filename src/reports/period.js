const REPORT_PERIOD = Object.freeze({
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year',
});

const MONTHS_IN_QUARTER = 3;
const LAST_MONTH_INDEX = 11;
const FILE_PREFIX = 'transacoes';

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function lastDayOf(year, monthIndex) {
  return utcDate(year, monthIndex + 1, 0);
}

function quarterOf(month) {
  return Math.ceil(month / MONTHS_IN_QUARTER);
}

function resolveRange(year, month, period) {
  if (period === REPORT_PERIOD.YEAR) {
    return { from: utcDate(year, 0, 1), to: lastDayOf(year, LAST_MONTH_INDEX) };
  }
  if (period === REPORT_PERIOD.QUARTER) {
    const firstMonthIndex = (quarterOf(month) - 1) * MONTHS_IN_QUARTER;
    return {
      from: utcDate(year, firstMonthIndex, 1),
      to: lastDayOf(year, firstMonthIndex + MONTHS_IN_QUARTER - 1),
    };
  }
  return { from: utcDate(year, month - 1, 1), to: lastDayOf(year, month - 1) };
}

function reportFileBaseName(year, month, period) {
  if (period === REPORT_PERIOD.YEAR) return `${FILE_PREFIX}-${year}`;
  if (period === REPORT_PERIOD.QUARTER) return `${FILE_PREFIX}-${year}-T${quarterOf(month)}`;
  return `${FILE_PREFIX}-${year}-${String(month).padStart(2, '0')}`;
}

module.exports = { REPORT_PERIOD, resolveRange, reportFileBaseName };
