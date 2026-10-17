const PDFDocument = require('pdfkit');
const { COLUMNS, toReportRow, totalsByFlow } = require('./rows');

const PAGE = Object.freeze({ size: 'A4', layout: 'landscape', margin: 36 });
const FONT = Object.freeze({ regular: 'Helvetica', bold: 'Helvetica-Bold' });
const FONT_SIZE = Object.freeze({ title: 14, subtitle: 10, header: 9, row: 8 });
const COLUMN_WIDTHS = Object.freeze([70, 80, 150, 80, 290, 70]);
const HEADER_HEIGHT = 16;
const HEADER_GAP = 4;
const ROW_HEIGHT = 14;
const BOTTOM_SAFETY = 20;
const TOTALS_LABEL_WIDTH = 150;
const SUBTITLE = 'Gerado pelo Minhas Finanças';

function drawCells(doc, cells, y) {
  let x = doc.page.margins.left;
  cells.forEach((cell, i) => {
    doc.text(cell, x, y, { width: COLUMN_WIDTHS[i], lineBreak: false });
    x += COLUMN_WIDTHS[i];
  });
}

function drawHeader(doc, y) {
  doc.font(FONT.bold).fontSize(FONT_SIZE.header);
  drawCells(doc, COLUMNS, y);
  const lineY = y + HEADER_HEIGHT;
  const left = doc.page.margins.left;
  const tableWidth = COLUMN_WIDTHS.reduce((a, b) => a + b, 0);
  doc.moveTo(left, lineY).lineTo(left + tableWidth, lineY).stroke();
  doc.font(FONT.regular).fontSize(FONT_SIZE.row);
  return lineY + HEADER_GAP;
}

function ensureRoom(doc, y) {
  if (y <= doc.page.height - doc.page.margins.bottom - BOTTOM_SAFETY) return y;
  doc.addPage();
  return drawHeader(doc, doc.page.margins.top);
}

function drawTotals(doc, transactions, y) {
  doc.font(FONT.bold).fontSize(FONT_SIZE.header);
  let cursor = y + ROW_HEIGHT;
  for (const [label, amount] of totalsByFlow(transactions)) {
    cursor = ensureRoom(doc, cursor);
    doc.text(label, doc.page.margins.left, cursor, { width: TOTALS_LABEL_WIDTH, lineBreak: false });
    doc.text(amount, doc.page.margins.left + TOTALS_LABEL_WIDTH, cursor, { lineBreak: false });
    cursor += ROW_HEIGHT;
  }
}

function buildPdf(transactions, periodLabel) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument(PAGE);
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font(FONT.bold).fontSize(FONT_SIZE.title).text(`Transações — ${periodLabel}`);
    doc.font(FONT.regular).fontSize(FONT_SIZE.subtitle).text(SUBTITLE);
    doc.moveDown();

    let y = drawHeader(doc, doc.y);
    for (const transaction of transactions) {
      y = ensureRoom(doc, y);
      drawCells(doc, toReportRow(transaction), y);
      y += ROW_HEIGHT;
    }
    drawTotals(doc, transactions, y);
    doc.end();
  });
}

module.exports = { buildPdf };
