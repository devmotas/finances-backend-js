const { Router } = require('express');
const auth = require('../middleware/auth');
const { parseYearMonth } = require('../validation/common');
const investmentService = require('../services/investmentService');

const router = Router();
router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { year, month } = parseYearMonth(req.query);
    const data = await investmentService.monthView(req.userId, year, month);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
