const bcrypt = require('bcryptjs');
const prisma = require('../db/prisma');
const { NotFoundError, BadRequestError } = require('../errors/AppError');

async function findById(id) {
  const user = await prisma.users.findUnique({ where: { id: BigInt(id) } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');
  return toDto(user);
}

async function patchMe(id, { name, defaultRecurrenceMonths, emergencyFundTargetMonths }) {
  if (name == null && defaultRecurrenceMonths == null && emergencyFundTargetMonths == null) {
    throw new BadRequestError('Informe ao menos um campo para atualizar.');
  }

  const user = await prisma.users.findUnique({ where: { id: BigInt(id) } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');

  const data = {};

  if (name != null) {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      throw new BadRequestError('O nome deve ter entre 2 e 120 caracteres.');
    }
    data.name = trimmed;
  }
  if (defaultRecurrenceMonths != null) data.default_recurrence_months = defaultRecurrenceMonths;
  if (emergencyFundTargetMonths != null) data.emergency_fund_target_months = emergencyFundTargetMonths;

  const updated = await prisma.users.update({ where: { id: BigInt(id) }, data });
  return toDto(updated);
}

async function changePassword(id, { currentPassword, newPassword }) {
  const user = await prisma.users.findUnique({ where: { id: BigInt(id) } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) throw new BadRequestError('Senha atual incorreta.');

  const sameAsOld = await bcrypt.compare(newPassword, user.password);
  if (sameAsOld) throw new BadRequestError('A nova senha deve ser diferente da atual.');

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.users.update({ where: { id: BigInt(id) }, data: { password: hashed } });
}

function toDto(user) {
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

module.exports = { findById, patchMe, changePassword };
