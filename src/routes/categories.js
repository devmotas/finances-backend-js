const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const categoryService = require('../services/categoryService');

const router = Router();
router.use(auth);

const FLOWS = ['income', 'expense', 'investment'];
const EXPENSE_GROUPS = ['essential', 'nonEssential'];

const categorySchema = z.object({
  name: z.string().min(1).max(120),
  flow: z.enum(FLOWS),
  expenseGroup: z.enum(EXPENSE_GROUPS).nullable().optional(),
  openingBalanceAmount: z.number().optional().nullable(),
});

router.get('/', async (req, res, next) => {
  try {
    const cats = await categoryService.listAll(req.userId);
    res.json(cats);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = categorySchema.parse(req.body);
    const cat = await categoryService.create(req.userId, body);
    res.status(201).json(cat);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = categorySchema.parse(req.body);
    const cat = await categoryService.update(req.userId, BigInt(req.params.id), body);
    res.json(cat);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await categoryService.remove(req.userId, BigInt(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
