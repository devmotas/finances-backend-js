const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.users.create({
    data: {
      name,
      email,
      password: hashed,
      default_recurrence_months: 12,
      emergency_fund_target_months: 6,
      created_at: new Date(),
    },
  });

  await prisma.categories.createMany({
    data: SEED_INVESTMENT_CATEGORIES.map((catName) => ({
      user_id: user.id,
      name: catName,
      flow: 'investment',
      expense_group: null,
      opening_balance_amount: 0,
      created_at: new Date(),
    })),
  });

  return buildResponse(user);
}

async function login({ email, password }) {
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('E-mail ou senha inválidos.');

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new UnauthorizedError('E-mail ou senha inválidos.');

  return buildResponse(user);
}

function buildResponse(user) {
  const expiresIn = Math.floor((Number(process.env.JWT_EXPIRATION_MS) || 86400000) / 1000);
  // BigInt não serializa em JSON — armazenamos como string no sub
  const token = jwt.sign({ sub: user.id.toString() }, process.env.JWT_SECRET, { expiresIn });
  return { token, user: toUserDto(user) };
}

function toUserDto(user) {
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    defaultRecurrenceMonths: user.default_recurrence_months,
    emergencyFundTargetMonths: user.emergency_fund_target_months,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

module.exports = { register, login };
