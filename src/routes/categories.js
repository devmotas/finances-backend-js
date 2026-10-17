const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const { parseId, CATEGORY_NAME_MAX } = require('../validation/common');
const { FLOW, EXPENSE_GROUP } = require('../domain/constants');
const categoryService = require('../services/categoryService');

const router = Router();
router.use(auth);

const onlyExpensesHaveGroup = (category) =>
  (category.flow === FLOW.EXPENSE) === (category.expenseGroup != null);

const categorySchema = z
  .object({
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
    flow: z.nativeEnum(FLOW),
    expenseGroup: z.nativeEnum(EXPENSE_GROUP).nullable().optional(),
    openingBalanceAmount: z.number().optional().nullable(),
  })
  .refine(onlyExpensesHaveGroup, {
    path: ['expenseGroup'],
    message: 'Informe essencial ou não essencial apenas para categorias de saída.',
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
    const cat = await categoryService.update(req.userId, parseId(req.params), body);
    res.json(cat);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await categoryService.remove(req.userId, parseId(req.params));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
