const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const {
  parseId,
  parseYearMonth,
  DESCRIPTION_MAX,
  ISO_DATE,
  SERIES_MONTHS_MAX,
  MONTH_TEXT,
} = require('../validation/common');
const { SCHEDULE, INVESTMENT_DIRECTION } = require('../domain/constants');
const transactionService = require('../services/transactionService');

const router = Router();
router.use(auth);

const hasTarget = (body) => body.categoryId != null || body.investmentAccountId != null;
const TARGET_MESSAGE = 'Informe a categoria ou a conta de investimento.';

const targetFields = {
  categoryId: z.number().int().positive().nullable().optional(),
  investmentAccountId: z.number().int().positive().nullable().optional(),
  direction: z.nativeEnum(INVESTMENT_DIRECTION).nullable().optional(),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  amount: z.number(),
  date: z.string().regex(ISO_DATE),
};

const txSchema = z
  .object({ ...targetFields, schedule: z.nativeEnum(SCHEDULE).optional() })
  .refine(hasTarget, { path: ['categoryId'], message: TARGET_MESSAGE });

const restoreSchema = z.object({
  transactions: z
    .array(
      z
        .object({
          ...targetFields,
          recurrenceId: z.number().int().positive().nullable().optional(),
          recurrenceIndex: z.number().int().positive().nullable().optional(),
        })
        .refine(hasTarget, { path: ['categoryId'], message: TARGET_MESSAGE })
    )
    .min(1)
    .max(SERIES_MONTHS_MAX),
  reopenSeries: z
    .array(
      z.object({
        recurrenceId: z.number().int().positive(),
        endMonth: z.string().regex(MONTH_TEXT).nullable(),
      })
    )
    .optional(),
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

router.post('/restore', async (req, res, next) => {
  try {
    const { transactions, reopenSeries } = restoreSchema.parse(req.body);
    const restored = await transactionService.restore(req.userId, transactions, reopenSeries);
    res.status(201).json({ restored });
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
    const result = await transactionService.remove(req.userId, parseId(req.params), applyToFutureSeries);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
