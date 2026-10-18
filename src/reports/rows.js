const { FLOW, SCHEDULE } = require('../domain/constants');
const { signedAmount } = require('../domain/investmentPosition');

const FLOW_LABEL = Object.freeze({
  [FLOW.INCOME]: 'Entrada',
  [FLOW.EXPENSE]: 'Saída',
  [FLOW.INVESTMENT]: 'Investimento',
});

const SCHEDULE_LABEL = Object.freeze({
  [SCHEDULE.FIXED]: 'Fixo',
  [SCHEDULE.VARIABLE]: 'Do mês',
});

const COLUMNS = Object.freeze(['Data', 'Tipo', 'Categoria', 'Valor', 'Descrição', 'Agenda']);
const CENTS_DIGITS = 2;

function formatDateBr(date) {
  const [year, month, day] = date.toISOString().slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function formatAmountBr(amount) {
  return Number(amount).toFixed(CENTS_DIGITS).replace('.', ',');
}

function reportAmount(transaction) {
  return signedAmount(transaction.direction, transaction.amount);
}

function scheduleOf(transaction) {
  return transaction.recurrence_id != null ? SCHEDULE.FIXED : SCHEDULE.VARIABLE;
}

function toReportRow(transaction) {
  return [
    formatDateBr(transaction.date),
    FLOW_LABEL[transaction.flow],
    transaction.investment_accounts?.name ?? transaction.categories?.name ?? '',
    formatAmountBr(reportAmount(transaction)),
    transaction.description ?? '',
    SCHEDULE_LABEL[scheduleOf(transaction)],
  ];
}

function totalsByFlow(transactions) {
  return Object.values(FLOW).map((flow) => {
    const total = transactions
      .filter((t) => t.flow === flow)
      .reduce((sum, t) => sum + Number(reportAmount(t)), 0);
    return [`Total ${FLOW_LABEL[flow].toLowerCase()}`, formatAmountBr(total)];
  });
}

module.exports = { COLUMNS, formatDateBr, toReportRow, totalsByFlow };
