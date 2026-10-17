const { Router } = require('express');
const { z } = require('zod');
const authService = require('../services/authService');
const { PASSWORD_MIN, NAME_MIN, NAME_MAX } = require('../validation/common');

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(NAME_MIN).max(NAME_MAX),
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
