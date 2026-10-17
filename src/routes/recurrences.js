const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const recurrenceService = require('../services/recurrenceService');
const { DESCRIPTION_MAX, ISO_DATE, SERIES_MONTHS_MAX } = require('../validation/common');

const router = Router();
router.use(auth);

const createSchema = z.object({
  categoryId: z.number().int().positive(),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  amount: z.number(),
  startDate: z.string().regex(ISO_DATE),
  months: z.number().int().min(1).max(SERIES_MONTHS_MAX),
  installmentTotal: z.number().int().min(1).nullable().optional(),
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

module.exports = router;
