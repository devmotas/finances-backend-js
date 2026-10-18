const { hashPassword, passwordMatches, signUserToken } = require('../security/tokens');
const { toUserDto } = require('./userService');
const {
  ACCOUNT_ROLE,
  DEFAULT_RECURRENCE_MONTHS,
  DEFAULT_EMERGENCY_FUND_TARGET_MONTHS,
} = require('../domain/constants');
const prisma = require('../db/prisma');
const { ConflictError, UnauthorizedError } = require('../errors/AppError');

const SEED_INVESTMENT_ACCOUNTS = [
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

  await prisma.investment_accounts.createMany({
    data: SEED_INVESTMENT_ACCOUNTS.map((accountName) => ({
      user_id: user.id,
      name: accountName,
      role: ACCOUNT_ROLE.INVESTMENT,
      initial_balance: 0,
      initial_balance_date: user.created_at,
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
