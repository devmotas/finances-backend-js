const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const { parseYearMonth } = require('../validation/common');
const { REPORT_FORMAT, exportTransactions } = require('../services/reportService');
const { REPORT_PERIOD } = require('../reports/period');

const router = Router();
router.use(auth);

const exportOptionsSchema = z.object({
  format: z.nativeEnum(REPORT_FORMAT).default(REPORT_FORMAT.CSV),
  period: z.nativeEnum(REPORT_PERIOD).default(REPORT_PERIOD.MONTH),
});

router.get('/export', async (req, res, next) => {
  try {
    const { year, month } = parseYearMonth(req.query);
    const { format, period } = exportOptionsSchema.parse(req.query);
    const report = await exportTransactions(req.userId, { year, month, period, format });
    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    res.send(report.content);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
