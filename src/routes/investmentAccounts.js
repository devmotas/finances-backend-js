const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const { ACCOUNT_ROLE } = require('../domain/constants');
const { parseId, CATEGORY_NAME_MAX, ISO_DATE, BIGINT_ID } = require('../validation/common');
const investmentAccountService = require('../services/investmentAccountService');

const router = Router();
router.use(auth);

const accountSchema = z.object({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
  role: z.nativeEnum(ACCOUNT_ROLE).optional(),
  initialBalance: z.number().min(0).optional(),
  initialBalanceDate: z.string().regex(ISO_DATE).optional(),
  targetBalance: z.number().min(0).nullable().optional(),
});

const balanceUpdateSchema = z.object({
  date: z.string().regex(ISO_DATE),
  balance: z.number().min(0),
});

const updateIdSchema = z.object({ updateId: z.string().regex(BIGINT_ID, 'Id inválido.') });

function handle(action, status = 200) {
  return async (req, res, next) => {
    try {
      const result = await action(req);
      if (result === undefined) return res.status(204).send();
      res.status(status).json(result);
    } catch (err) {
      next(err);
    }
  };
}

router.get('/', handle((req) => investmentAccountService.list(req.userId)));

router.post('/', handle((req) => investmentAccountService.create(req.userId, accountSchema.parse(req.body)), 201));

router.put('/:id', handle((req) =>
  investmentAccountService.update(req.userId, parseId(req.params), accountSchema.parse(req.body))
));

router.delete('/:id', handle((req) => investmentAccountService.remove(req.userId, parseId(req.params))));

router.get('/:id/balance-updates', handle((req) =>
  investmentAccountService.listBalanceUpdates(req.userId, parseId(req.params))
));

router.post('/:id/balance-updates', handle((req) =>
  investmentAccountService.addBalanceUpdate(req.userId, parseId(req.params), balanceUpdateSchema.parse(req.body)), 201
));

router.delete('/:id/balance-updates/:updateId', handle((req) =>
  investmentAccountService.removeBalanceUpdate(
    req.userId,
    parseId(req.params),
    BigInt(updateIdSchema.parse(req.params).updateId)
  )
));

module.exports = router;
