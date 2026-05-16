const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const transactionService = require('../services/transactionService');

const router = Router();
router.use(auth);

const SCHEDULES = ['fixed', 'variable'];

const txSchema = z.object({
  categoryId: z.number().int().positive(),
  description: z.string().max(500).nullable().optional(),
  amount: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  schedule: z.enum(SCHEDULES),
});

router.get('/', async (req, res, next) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!year || !month) return res.status(400).json({ message: 'Informe year e month.' });
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
    const tx = await transactionService.update(req.userId, BigInt(req.params.id), body, applyToFutureSeries);
    res.json(tx);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const applyToFutureSeries = req.query.applyToFutureSeries === 'true';
    await transactionService.remove(req.userId, BigInt(req.params.id), applyToFutureSeries);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
