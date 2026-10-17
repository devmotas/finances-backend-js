function addMonthsToDate(dateStr, monthDelta) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const lastDayOfTarget = new Date(Date.UTC(year, month - 1 + monthDelta + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + monthDelta, Math.min(day, lastDayOfTarget)));
}

module.exports = { addMonthsToDate };
