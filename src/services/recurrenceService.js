const prisma = require('../db/prisma');
const { NotFoundError, BadRequestError } = require('../errors/AppError');
const { addMonthsToDate } = require('../utils/dates');
const { validateAmount } = require('../domain/amount');
const { seriesDescription } = require('../domain/installment');
const { FLOW, SCHEDULE } = require('../domain/constants');

async function create(userId, { categoryId, description, amount, startDate, months, installmentTotal }) {
  const user = await prisma.users.findUnique({ where: { id: BigInt(userId) } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');

  const category = await prisma.categories.findFirst({
    where: { id: BigInt(categoryId), user_id: BigInt(userId) },
  });
  if (!category) throw new NotFoundError('Categoria não encontrada.');

  if (category.flow === FLOW.INVESTMENT) {
    throw new BadRequestError(
      'Não é possível criar recorrência para categorias de investimento. Use a tela de investimentos e registre cada mês (aportes e resgates são pontuais).'
    );
  }

  validateAmount(amount, category.flow);

  if (installmentTotal != null && installmentTotal !== months) {
    throw new BadRequestError('Para parcelamento, o número de meses deve ser igual ao total de parcelas.');
  }

  const recurrence = await prisma.recurrences.create({
    data: {
      user_id: BigInt(userId),
      category_id: BigInt(categoryId),
      description: description?.trim() || null,
      amount,
      start_date: new Date(startDate),
      months,
      installment_total: installmentTotal ?? null,
      created_at: new Date(),
    },
  });

  const txData = [];
  for (let i = 0; i < months; i++) {
    const occurrenceDate = addMonthsToDate(startDate, i);
    const txDescription = seriesDescription(description, i + 1, installmentTotal);

    txData.push({
      user_id: BigInt(userId),
      category_id: BigInt(categoryId),
      description: txDescription,
      amount,
      date: occurrenceDate,
      schedule: SCHEDULE.FIXED,
      flow: category.flow,
      recurrence_id: recurrence.id,
      recurrence_index: i + 1,
      created_at: new Date(),
    });
  }

  await prisma.transactions.createMany({ data: txData });

  return {
    recurrenceId: Number(recurrence.id),
    createdCount: txData.length,
  };
}

module.exports = { create };
