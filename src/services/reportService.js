const PDFDocument = require('pdfkit');
const prisma = require('../db/prisma');

function resolveRange(year, month, period) {
  if (period === 'quarter') {
    const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return {
      from: new Date(Date.UTC(year, startMonth - 1, 1)),
      to: new Date(Date.UTC(year, startMonth + 1, 0)),
    };
  }
  if (period === 'year') {
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year, 11, 31)),
    };
  }
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 0)),
  };
}

async function getRows(userId, from, to) {
  return prisma.transactions.findMany({
    where: { user_id: BigInt(userId), date: { gte: from, lte: to } },
    include: { categories: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function escapeCsv(s) {
  if (!s) return '';
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function buildCsv(userId, from, to) {
  const rows = await getRows(userId, from, to);
  const BOM = '﻿';
  const header = 'Data;Fluxo;Categoria;Valor;Descrição;Agenda\n';
  const lines = rows
    .map((t) =>
      [
        formatDate(t.date),
        t.flow,
        escapeCsv(t.categories.name),
        parseFloat(t.amount.toString()).toFixed(2),
        escapeCsv(t.description ?? ''),
        t.schedule,
      ].join(';')
    )
    .join('\n');
  return Buffer.from(BOM + header + lines, 'utf8');
}

async function buildPdf(userId, from, to) {
  const rows = await getRows(userId, from, to);
  const label = `${formatDate(from)} a ${formatDate(to)}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(14).font('Helvetica-Bold').text(`Transações — ${label}`);
    doc.fontSize(10).font('Helvetica').text('Gerado pelo Finances');
    doc.moveDown();

    const colWidths = [90, 80, 140, 80, 270, 80];
    const headers = ['Data', 'Fluxo', 'Categoria', 'Valor', 'Descrição', 'Agenda'];
    const startX = doc.page.margins.left;
    let y = doc.y;

    doc.font('Helvetica-Bold').fontSize(9);
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colWidths[i], lineBreak: false });
      x += colWidths[i];
    });
    y += 16;
    doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
    y += 4;

    doc.font('Helvetica').fontSize(8);
    for (const t of rows) {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const cells = [
        formatDate(t.date),
        t.flow,
        t.categories.name,
        parseFloat(t.amount.toString()).toFixed(2),
        t.description ?? '',
        t.schedule,
      ];
      x = startX;
      cells.forEach((cell, i) => {
        doc.text(cell, x, y, { width: colWidths[i], lineBreak: false });
        x += colWidths[i];
      });
      y += 14;
    }

    doc.end();
  });
}

module.exports = { resolveRange, buildCsv, buildPdf };
