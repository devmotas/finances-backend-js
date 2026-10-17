// Soma meses a uma data 'YYYY-MM-DD' limitando o dia ao último dia do mês alvo
// (31/01 + 1 mês = 28/02), para que uma série nunca pule nem repita meses.
function addMonthsToDate(dateStr, monthDelta) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const lastDayOfTarget = new Date(Date.UTC(year, month - 1 + monthDelta + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + monthDelta, Math.min(day, lastDayOfTarget)));
}

module.exports = { addMonthsToDate };
