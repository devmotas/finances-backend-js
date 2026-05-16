const { Router } = require('express');
const auth = require('../middleware/auth');
const reportService = require('../services/reportService');

const router = Router();
router.use(auth);

router.get('/export', async (req, res, next) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const format = req.query.format ?? 'csv';
    const period = req.query.period ?? 'month';

    if (!year || !month) {
      return res.status(400).json({ message: 'Informe year e month.' });
    }

    const { from, to } = reportService.resolveRange(year, month, period);

    if (format === 'pdf') {
      const buf = await reportService.buildPdf(req.userId, from, to);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="transacoes-${year}-${String(month).padStart(2,'0')}.pdf"`);
      return res.send(buf);
    }

    const buf = await reportService.buildCsv(req.userId, from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transacoes-${year}-${String(month).padStart(2,'0')}.csv"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
