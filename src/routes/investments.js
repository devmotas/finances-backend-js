const { Router } = require('express');
const auth = require('../middleware/auth');
const investmentService = require('../services/investmentService');

const router = Router();
router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!year || !month) {
      return res.status(400).json({ message: 'Informe year e month.' });
    }
    const data = await investmentService.monthView(req.userId, year, month);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
