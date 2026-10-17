const PREFIX = /^Parcela \d+ de \d+(: )?/;

// Descrição de um lançamento de série. Em parcelamentos, prefixa "Parcela X de N";
// um prefixo já presente na descrição recebida (vindo da edição de uma parcela) é descartado.
function seriesDescription(description, installmentIndex, installmentTotal) {
  const base = (description ?? '').trim().replace(PREFIX, '').trim();
  if (installmentTotal == null) return base || null;
  const label = `Parcela ${installmentIndex} de ${installmentTotal}`;
  return base === '' ? label : `${label}: ${base}`;
}

module.exports = { seriesDescription };
