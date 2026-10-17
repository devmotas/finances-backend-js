const { hashPassword, passwordMatches, signUserToken } = require('../security/tokens');
const { toUserDto } = require('./userService');
const {
  FLOW,
  DEFAULT_RECURRENCE_MONTHS,
  DEFAULT_EMERGENCY_FUND_TARGET_MONTHS,
} = require('../domain/constants');
const prisma = require('../db/prisma');
const { ConflictError, UnauthorizedError } = require('../errors/AppError');

const SEED_INVESTMENT_CATEGORIES = [
  'Renda Fixa (Tesouro, CDB, LCI/LCA)',
  'Renda Variável (Ações, ETFs)',
  'Fundos Imobiliários (FIIs)',
  'Criptomoedas',
  'Poupança',
];

async function register({ name, email, password }) {
  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing) throw new ConflictError(`O e-mail ${email} já está em uso.`);

  const user = await prisma.users.create({
    data: {
      name,
      email,
      password: await hashPassword(password),
      default_recurrence_months: DEFAULT_RECURRENCE_MONTHS,
      emergency_fund_target_months: DEFAULT_EMERGENCY_FUND_TARGET_MONTHS,
    },
  });

  await prisma.categories.createMany({
    data: SEED_INVESTMENT_CATEGORIES.map((catName) => ({
      user_id: user.id,
      name: catName,
      flow: FLOW.INVESTMENT,
      expense_group: null,
      opening_balance_amount: 0,
    })),
  });

  return buildResponse(user);
}

async function login({ email, password }) {
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('E-mail ou senha inválidos.');

  const match = await passwordMatches(password, user.password);
  if (!match) throw new UnauthorizedError('E-mail ou senha inválidos.');

  return buildResponse(user);
}

function buildResponse(user) {
  return { token: signUserToken(user.id), user: toUserDto(user) };
}

module.exports = { register, login };
