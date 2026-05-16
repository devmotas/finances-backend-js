const { Router } = require('express');
const auth = require('../middleware/auth');
const summaryService = require('../services/summaryService');

const router = Router();
router.use(auth);

router.get('/summary', async (req, res, next) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!year || !month) {
      return res.status(400).json({ message: 'Informe year e month.' });
    }
    const data = await summaryService.summary(req.userId, year, month);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
