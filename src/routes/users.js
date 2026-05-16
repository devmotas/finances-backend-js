const { Router } = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const userService = require('../services/userService');

const router = Router();
router.use(auth);

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  defaultRecurrenceMonths: z.number().int().min(1).max(120).optional(),
  emergencyFundTargetMonths: z.number().int().min(1).max(120).optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

router.get('/me', async (req, res, next) => {
  try {
    const user = await userService.findById(req.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.patch('/me', async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body);
    const user = await userService.patchMe(req.userId, body);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.post('/me/password', async (req, res, next) => {
  try {
    const body = passwordSchema.parse(req.body);
    await userService.changePassword(req.userId, body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = await userService.findById(BigInt(req.params.id));
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
