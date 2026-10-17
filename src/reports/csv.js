const { COLUMNS, toReportRow, totalsByFlow } = require('./rows');

const SEPARATOR = ';';
const LINE_BREAK = '\n';
const UTF8_BOM = '﻿';
const NEEDS_QUOTES = /[;"\r\n]/;

function escapeCell(value) {
  const text = String(value ?? '');
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toLine(cells) {
  return cells.map(escapeCell).join(SEPARATOR);
}

function buildCsv(transactions) {
  const lines = [
    toLine(COLUMNS),
    ...transactions.map((t) => toLine(toReportRow(t))),
    '',
    ...totalsByFlow(transactions).map(toLine),
  ];
  return Buffer.from(UTF8_BOM + lines.join(LINE_BREAK), 'utf8');
}

module.exports = { buildCsv };
