const MONTHS_IN_YEAR = 12;
const MONTH_DIGITS = 2;

function monthOf(date) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function addMonths({ year, month }, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function firstDay({ year, month }) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function lastDay({ year, month }) {
  return new Date(Date.UTC(year, month, 0));
}

function monthsDiff(from, to) {
  return (to.year - from.year) * MONTHS_IN_YEAR + (to.month - from.month);
}

function monthsBetween(start, end) {
  const months = [];
  for (let cursor = start; monthsDiff(cursor, end) >= 0; cursor = addMonths(cursor, 1)) {
    months.push(cursor);
  }
  return months;
}

function minMonth(a, b) {
  return monthsDiff(a, b) >= 0 ? a : b;
}

function maxMonth(a, b) {
  return monthsDiff(a, b) >= 0 ? b : a;
}

function formatMonth({ year, month }) {
  return `${year}-${String(month).padStart(MONTH_DIGITS, '0')}`;
}

function parseMonth(text) {
  const [year, month] = text.split('-').map(Number);
  return { year, month };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = {
  monthOf,
  addMonths,
  firstDay,
  lastDay,
  monthsDiff,
  monthsBetween,
  minMonth,
  maxMonth,
  formatMonth,
  parseMonth,
  formatDate,
};
