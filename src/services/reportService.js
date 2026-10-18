const prisma = require('../db/prisma');
const { resolveRange, reportFileBaseName } = require('../reports/period');
const { buildCsv } = require('../reports/csv');
const { buildPdf } = require('../reports/pdf');
const { formatDateBr } = require('../reports/rows');

const REPORT_FORMAT = Object.freeze({ CSV: 'csv', PDF: 'pdf' });

const CONTENT_TYPE = Object.freeze({
  [REPORT_FORMAT.CSV]: 'text/csv; charset=utf-8',
  [REPORT_FORMAT.PDF]: 'application/pdf',
});

function findTransactions(userId, from, to) {
  return prisma.transactions.findMany({
    where: { user_id: BigInt(userId), date: { gte: from, lte: to } },
    include: { categories: true, investment_accounts: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
}

async function exportTransactions(userId, { year, month, period, format }) {
  const { from, to } = resolveRange(year, month, period);
  const transactions = await findTransactions(userId, from, to);
  const content =
    format === REPORT_FORMAT.PDF
      ? await buildPdf(transactions, `${formatDateBr(from)} a ${formatDateBr(to)}`)
      : buildCsv(transactions);
  return {
    content,
    contentType: CONTENT_TYPE[format],
    fileName: `${reportFileBaseName(year, month, period)}.${format}`,
  };
}

module.exports = { REPORT_FORMAT, exportTransactions };
