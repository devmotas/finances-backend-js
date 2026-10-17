const { Router } = require('express');
const auth = require('../middleware/auth');
const { parseYearMonth } = require('../validation/common');
const summaryService = require('../services/summaryService');

const router = Router();
router.use(auth);

router.get('/summary', async (req, res, next) => {
  try {
    const { year, month } = parseYearMonth(req.query);
    const data = await summaryService.summary(req.userId, year, month);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
