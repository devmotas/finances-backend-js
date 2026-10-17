const INSTALLMENT_PREFIX = /^Parcela \d+ de \d+(: )?/;

function seriesDescription(description, installmentIndex, installmentTotal) {
  const base = (description ?? '').trim().replace(INSTALLMENT_PREFIX, '').trim();
  if (installmentTotal == null) return base || null;
  const label = `Parcela ${installmentIndex} de ${installmentTotal}`;
  return base === '' ? label : `${label}: ${base}`;
}

module.exports = { seriesDescription };
