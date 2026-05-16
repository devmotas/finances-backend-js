const prisma = require('../db/prisma');
const { NotFoundError, BadRequestError } = require('../errors/AppError');

function addMonthsToDate(dateStr, monthDelta) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + monthDelta, day));
}

function todayFirstDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function create(userId, { categoryId, description, amount, startDate, months, installmentTotal }) {
  const user = await prisma.users.findUnique({ where: { id: BigInt(userId) } });
  if (!user) throw new NotFoundError('Usuário não encontrado.');

  const category = await prisma.categories.findFirst({
    where: { id: BigInt(categoryId), user_id: BigInt(userId) },
  });
  if (!category) throw new NotFoundError('Categoria não encontrada.');

  if (category.flow === 'investment') {
    throw new BadRequestError(
      'Não é possível criar recorrência para categorias de investimento. Use a tela de investimentos e registre cada mês (aportes e resgates são pontuais).'
    );
  }

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
    },
  });

  const txData = [];
  for (let i = 0; i < months; i++) {
    const occurrenceDate = addMonthsToDate(startDate, i);
    const baseDesc = (description ?? '').trim();
    let txDescription;

    if (installmentTotal != null) {
      const x = i + 1;
      txDescription =
        baseDesc === ''
          ? `Parcela ${x} de ${installmentTotal}`
          : `Parcela ${x} de ${installmentTotal}: ${baseDesc}`;
    } else {
      txDescription = baseDesc || null;
    }

    txData.push({
      user_id: BigInt(userId),
      category_id: BigInt(categoryId),
      description: txDescription,
      amount,
      date: occurrenceDate,
      schedule: 'fixed',
      flow: category.flow,
      recurrence_id: recurrence.id,
      recurrence_index: i + 1,
    });
  }

  await prisma.transactions.createMany({ data: txData });

  return {
    recurrenceId: Number(recurrence.id),
    createdCount: txData.length,
  };
}

async function update(userId, recurrenceId, { categoryId, description, amount }) {
  const recurrence = await prisma.recurrences.findFirst({
    where: { id: BigInt(recurrenceId), user_id: BigInt(userId) },
  });
  if (!recurrence) throw new NotFoundError('Recorrência não encontrada.');

  const category = await prisma.categories.findFirst({
    where: { id: BigInt(categoryId), user_id: BigInt(userId) },
  });
  if (!category) throw new NotFoundError('Categoria não encontrada.');

  const cutoff = todayFirstDay();
  const futureTxs = await prisma.transactions.findMany({
    where: {
      recurrence_id: BigInt(recurrenceId),
      user_id: BigInt(userId),
      date: { gte: cutoff },
    },
  });

  await prisma.recurrences.update({
    where: { id: BigInt(recurrenceId) },
    data: {
      category_id: BigInt(categoryId),
      description: description?.trim() || null,
      amount,
    },
  });

  const installmentTotal = recurrence.installment_total;

  await prisma.$transaction(
    futureTxs.map((t) => {
      let txDescription;
      if (installmentTotal != null) {
        const idx = t.recurrence_index ?? 1;
        const baseDesc = (description ?? '').trim();
        txDescription =
          baseDesc === ''
            ? `Parcela ${idx} de ${installmentTotal}`
            : `Parcela ${idx} de ${installmentTotal}: ${baseDesc}`;
      } else {
        txDescription = (description ?? '').trim() || null;
      }

      return prisma.transactions.update({
        where: { id: t.id },
        data: {
          category_id: BigInt(categoryId),
          description: txDescription,
          amount,
          flow: category.flow,
        },
      });
    })
  );
}

async function deleteFuture(userId, recurrenceId) {
  const recurrence = await prisma.recurrences.findFirst({
    where: { id: BigInt(recurrenceId), user_id: BigInt(userId) },
  });
  if (!recurrence) throw new NotFoundError('Recorrência não encontrada.');

  const cutoff = todayFirstDay();
  await prisma.transactions.deleteMany({
    where: {
      recurrence_id: BigInt(recurrenceId),
      user_id: BigInt(userId),
      date: { gte: cutoff },
    },
  });
}

module.exports = { create, update, deleteFuture };
