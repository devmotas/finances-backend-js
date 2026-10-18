const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const seriesService = require('../services/seriesService');
const { SERIES_KIND } = require('../domain/constants');
const { SERIES_TARGET_MESSAGE } = require('../domain/series');
const { DESCRIPTION_MAX, ISO_DATE, SERIES_MONTHS_MAX } = require('../validation/common');

const router = Router();
router.use(auth);

const hasTarget = (body) => body.categoryId != null || body.destinationAccountId != null;

const createSchema = z.object({
  categoryId: z.number().int().positive().nullable().optional(),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  amount: z.number().optional(),
  totalAmount: z.number().positive().optional(),
  startDate: z.string().regex(ISO_DATE),
  kind: z.nativeEnum(SERIES_KIND).optional(),
  installments: z.number().int().min(1).max(SERIES_MONTHS_MAX).optional(),
  months: z.number().int().min(1).max(SERIES_MONTHS_MAX).optional(),
  installmentTotal: z.number().int().min(1).max(SERIES_MONTHS_MAX).nullable().optional(),
  destinationAccountId: z.number().int().positive().nullable().optional(),
}).refine(hasTarget, { path: ['categoryId'], message: SERIES_TARGET_MESSAGE });

router.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const result = await seriesService.create(req.userId, body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
