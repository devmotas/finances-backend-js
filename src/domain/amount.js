const { Decimal } = require('@prisma/client/runtime/library');
const { BadRequestError } = require('../errors/AppError');

// Valor zero nunca é aceito; negativo só em investimento (resgate).
function validateAmount(amount, flow) {
  const d = new Decimal(amount);
  if (d.isZero()) throw new BadRequestError('Informe um valor diferente de zero.');
  if (flow !== 'investment' && d.isNegative()) {
    throw new BadRequestError(
      'Apenas lançamentos de investimento podem ter valor negativo (resgate).'
    );
  }
}

module.exports = { validateAmount };
