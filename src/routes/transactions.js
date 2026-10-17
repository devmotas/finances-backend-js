const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const { parseId, parseYearMonth, DESCRIPTION_MAX, ISO_DATE } = require('../validation/common');
const { SCHEDULE } = require('../domain/constants');
const transactionService = require('../services/transactionService');

const router = Router();
router.use(auth);

const txSchema = z.object({
  categoryId: z.number().int().positive(),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  amount: z.number(),
  date: z.string().regex(ISO_DATE),
  schedule: z.nativeEnum(SCHEDULE),
});

router.get('/', async (req, res, next) => {
  try {
    const { year, month } = parseYearMonth(req.query);
    const txs = await transactionService.listByMonth(req.userId, year, month);
    res.json(txs);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = txSchema.parse(req.body);
    const tx = await transactionService.create(req.userId, body);
    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = txSchema.parse(req.body);
    const applyToFutureSeries = req.query.applyToFutureSeries === 'true';
    const tx = await transactionService.update(req.userId, parseId(req.params), body, applyToFutureSeries);
    res.json(tx);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const applyToFutureSeries = req.query.applyToFutureSeries === 'true';
    await transactionService.remove(req.userId, parseId(req.params), applyToFutureSeries);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
