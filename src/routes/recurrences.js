const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const recurrenceService = require('../services/recurrenceService');

const router = Router();
router.use(auth);

const createSchema = z.object({
  categoryId: z.number().int().positive(),
  description: z.string().max(500).nullable().optional(),
  amount: z.number(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  months: z.number().int().min(1).max(600),
  installmentTotal: z.number().int().min(1).nullable().optional(),
});

const updateSchema = z.object({
  categoryId: z.number().int().positive(),
  description: z.string().max(500).nullable().optional(),
  amount: z.number(),
});

router.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const result = await recurrenceService.create(req.userId, body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    await recurrenceService.update(req.userId, BigInt(req.params.id), body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await recurrenceService.deleteFuture(req.userId, BigInt(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
