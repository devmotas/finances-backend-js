const { Decimal } = require('@prisma/client/runtime/library');
const { BadRequestError } = require('../errors/AppError');
const { FLOW } = require('./constants');

function validateAmount(amount, flow) {
  const d = new Decimal(amount);
  if (d.isZero()) throw new BadRequestError('Informe um valor diferente de zero.');
  if (flow !== FLOW.INVESTMENT && d.isNegative()) {
    throw new BadRequestError(
      'Apenas lançamentos de investimento podem ter valor negativo (resgate).'
    );
  }
}

module.exports = { validateAmount };
